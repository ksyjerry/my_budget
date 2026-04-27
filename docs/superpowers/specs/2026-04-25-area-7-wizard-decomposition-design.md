# 영역 7 — Wizard 분해 (Area 7 Spec — Refactor Sprint)

**작성일**: 2026-04-25 (S7 완료 직후)
**메타 프레임워크**: [2026-04-25-feedback-0425-systematic-framework-design.md](2026-04-25-feedback-0425-systematic-framework-design.md) — S7 사이클의 P1 backlog
**의존**: S7 (Areas 1-6) main merge 완료 — Area 7 은 main 에서 시작
**의존 POL**: 없음 (구조 변경만, 도메인 정책 무관)

---

## 1. 목적

S7 사이클 중 가장 큰 위험 요소였던 `frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx` (2966 LOC) 를 ~5개 컴포넌트 + ~3개 hooks 로 분해. S7 회고에서 P1 백로그로 명시된 Area 7.

**왜 별도 sprint 인가**:
- S7 결함 fix와 분해를 동시에 하면 회귀 위험 폭증 (페이즈 C 분리 정책)
- 분해 자체가 새 결함 도입 위험 — 충분한 회귀 가드 위에서 안전하게 진행 필요
- S7 결함이 모두 fix 된 안정 상태에서 시작하는 것이 정합

### 1.1 비목표
- 신규 기능 추가 / 결함 fix (refactor만)
- backend 분해 (`backend/app/api/v1/budget_input.py` 1140 LOC도 큰 파일이지만 별도 sprint)
- Step 1/2/3 wizard 의 사용자 가시 동작 변경 (UI/UX 동일 유지)
- POL 결정 의존 변경 (POL provisional 결정도 그대로 유지)

---

## 2. 현재 상태 진단

### 2.1 Hotspot

`frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx`:
- LOC: ~3000+ (S7 후 약간 증가)
- 단일 파일에 다음 모든 기능:
  - 메인 wizard state management (project, client, members, templateRows, step navigation)
  - Step1Form (~500 LOC) — 클라이언트정보 + 프로젝트정보 + 시간 배분 (POL-06 (a) 후 단순화됨)
  - Step2Members (~400 LOC) — FLDT/지원 구성원, EmployeeSearch, placeholder member, role enum (Area 4)
  - Step3Template (~1200 LOC) — 가장 큼. 카테고리 패널 + 월 그리드 + 합계 행 + toolbar (V 토글, 초기화, 빈 Template, 종료월, AI 추천/검증)
  - ClientSearchModal (~200 LOC)
  - ProjectSearchModal (~200 LOC)
  - 워크플로우 버튼 (Area 2 — submit/approve/unlock)
  - NumberField inline removed (Area 1 에서 추출됨)

### 2.2 핫스팟이 만든 위험 (S7 사이클 중 발견)

- Area 1: NumberField inline 정의가 re-render focus 상실 → 추출로 fix
- Area 3: ClientSearchModal `base.X || info.X` stale-client merge 패턴 — ProjectSearchModal에도 동일 패턴 (bonus fix)
- Area 5: 22 결함 중 다수가 single page.tsx 안에서 fix → Area 7 (wizard 분해) deferred 결정
- 모든 영역에서 동일 파일 수정 → stacked PR rebase 시 가장 큰 충돌 위험

### 2.3 분해의 가치 (예상)
- 다음 라운드 결함 fix 시 LOC 감소로 작업 정확도 ↑
- 컴포넌트 단위 testing 가능 (currently page-level E2E만)
- 각 step 컴포넌트 독립 변경 → cross-step 회귀 위험 ↓
- 재사용 가능 hooks (예: useEmployeeSearch, useExcelTemplate)

---

## 3. 분해 설계

### 3.1 목표 파일 구조

```
frontend/src/app/(dashboard)/budget-input/[project_code]/
├── page.tsx                       # 200-300 LOC — wizard shell (state coordinator + step routing)
├── components/
│   ├── Step1Form.tsx              # ~500 LOC — 클라이언트정보 + 프로젝트정보 + 시간 배분
│   ├── Step2Members.tsx           # ~400 LOC — FLDT 구성원 + 지원 멤버 enum
│   ├── Step3Grid/
│   │   ├── index.tsx              # ~150 LOC — Step3 컨테이너 + state coordinator
│   │   ├── CategoryPanel.tsx      # ~200 LOC — 왼쪽 대분류/관리단위 트리 + V 토글
│   │   ├── MonthGrid.tsx          # ~400 LOC — 12개월 입력 그리드 + 합계 행
│   │   ├── Toolbar.tsx            # ~250 LOC — Excel I/O + 초기화 + 종료월 + AI 추천/검증
│   │   └── SummaryRow.tsx         # ~80 LOC — 합계 + 검증 메시지
│   ├── modals/
│   │   ├── ClientSearchModal.tsx  # ~200 LOC
│   │   └── ProjectSearchModal.tsx # ~200 LOC
│   └── WorkflowButtons.tsx        # ~100 LOC — POL-04 submit/approve/unlock
├── hooks/
│   ├── useWizardState.ts          # ~150 LOC — project / client / members / templateRows + step
│   ├── useStep3Roundtrip.ts       # ~150 LOC — Excel export/upload + reset 일관성
│   └── useAiAssist.ts             # ~100 LOC — suggest/validate + abort handling
├── lib/
│   └── wizard-validators.ts       # ~80 LOC — 필수 입력 검증 + 배부 검증
└── types.ts                        # ~80 LOC — ProjectInfo, ClientInfo, MemberRow, TemplateRow 등
```

**총 ~3000 LOC를 12+ 파일에 분산** — 각 파일 평균 200 LOC 이하.

### 3.2 분해 원칙
1. **Single Responsibility**: 각 파일은 하나의 명확한 책임
2. **State는 hook에 격리**: 컴포넌트는 props 받고 render. state mutation은 hook
3. **Modal은 별도 file**: Search modal들은 자체 state + onSelect callback
4. **Step별 독립**: Step1/2/3 은 서로 직접 import 안 함 — wizard shell 이 조율
5. **API 호출은 hook에**: 컴포넌트는 fetch 직접 안 함

### 3.3 마이그레이션 패턴

분해 시 다음 패턴 반복:
1. 기존 page.tsx에서 분해 대상 영역 식별 (예: Step1Form)
2. 신규 file 생성 + 기존 코드 그대로 복사
3. props interface 정의 + 의존성 명시
4. page.tsx에서 신규 컴포넌트로 교체 (props 전달)
5. type-check + 시각 회귀 baseline 비교 (영역 1 인프라)
6. commit (1 분해당 1 commit)

---

## 4. 페이즈 A — 진단 (Area 7 시작 시 정식 작성)

### 4.1 의존 POL
없음. 모든 POL provisional 그대로 유지.

### 4.2 단계 구분
Area 7 은 분해 단위로 페이즈 D 를 분할:
- Phase A: 진단 + 의존 그래프 그리기
- Phase B: 시각 회귀 baseline 갱신 (S7 후 모든 화면 baseline 재캡처)
- Phase C: ★ 핵심 단계 ★ — 분해 12+ commits
- Phase D: (생략 — Phase C 자체가 fix가 아니므로 별도 fix 없음. 단, 분해 중 발견되는 critical bug는 별도 commit)
- Phase E: 시각 회귀 + E2E + manual QA — 모든 wizard 동작이 분해 전과 동일 검증
- Phase F: 회고 + Area 8 (backend 분해) 백로그 평가

---

## 5. 페이즈 B — 안전망 강화 (사전)

분해 전 reinforce:
- **시각 회귀 baseline 8개 화면 재캡처** (Step 1 감사/비감사, Step 2 0명/5명, Step 3 비활성/활성, Workflow 버튼 상태별)
- **E2E full flow tests** (신규 프로젝트 → Step 1 → Step 2 → Step 3 → 작성완료 → 승인) — 영역 1-6 회귀 테스트가 충분한지 점검
- **컴포넌트 unit tests** — 분해 후 각 컴포넌트가 독립 testing 가능 검증

---

## 6. 페이즈 C — 분해 단계 (~12 commits)

순서:
1. Type extraction → `types.ts`
2. Validators extraction → `lib/wizard-validators.ts`
3. ClientSearchModal 분리
4. ProjectSearchModal 분리
5. WorkflowButtons 분리 (POL-04 submit/approve/unlock)
6. useWizardState hook 분리
7. Step1Form 분리
8. Step2Members 분리
9. Step3 분해 (가장 큼):
   - CategoryPanel
   - MonthGrid
   - Toolbar
   - SummaryRow
   - useStep3Roundtrip + useAiAssist hooks
   - Step3Grid index
10. page.tsx 정리 — wizard shell 만 남김
11. 최종 type-check + lint
12. 누적 회귀 가드 모두 GREEN 확인

각 단계 commit message: `refactor(s8-area7): N. <분해 대상>`

---

## 7. 페이즈 E — 검증
- Layer 1 (자동): 모든 영역 1-6 안전망 + 신규 컴포넌트 unit tests + 시각 회귀 diff 0
- Layer 2 (수동): 사용자가 wizard 전체 흐름 직접 시도 — 분해 전과 동일 동작 확인
- Layer 3 (사용자 컨펌): staging 검증

---

## 8. 페이즈 F — 회고 + 후속

회고 항목:
- 분해 LOC 감소 비율 (3000 → 12 files × 200 = 2400)
- 분해 중 발견된 잠재 bug 수 (현재는 작동하지만 개선 권장)
- 다음 라운드 결함 fix 효율 비교 (분해 전 vs 후)
- **Area 8 (backend 분해) 우선순위 평가** — `backend/app/api/v1/budget_input.py` (1140 LOC) 동일 분해 가치

---

## 9. 리스크

| 리스크 | 완화 |
|---|---|
| 분해 중 회귀 도입 (functional bug) | (a) 영역 1-6 안전망 가드 상시 GREEN 유지 (b) 매 commit type-check (c) 시각 회귀 diff 0 |
| props drilling (state 너무 깊은 곳까지 전달) | useWizardState hook 으로 격리. context 사용 신중 (성능) |
| 분해 PR 충돌 (사용자가 main에서 hotfix 진행 중) | Area 7 시작 시점 user notify. 분해 sprint 진행 중 같은 파일 hotfix 금지 |
| 분해 spec 자체가 너무 큼 (12+ commits) | 분해 단위로 commit 분리, 각 commit 검증 후 다음 진행. 중단 가능 |
| 시각 회귀 baseline 갱신 시 false positive | 영역 1 시각 회귀 인프라 그대로 활용 (Linux Docker baseline) |

---

## 10. 진입 조건

Area 7 시작 전 다음 모두 충족:
- [ ] S7 모든 PR (#1-#6) main merge 완료
- [ ] Branch protection 적용
- [ ] 사용자가 wizard 안정성 staging 검증 완료
- [ ] POL provisional 결정 모두 외부 컨펌 완료 (또는 Area 7 진행 중 변경 없음 보장)
- [ ] 사용자가 Area 7 sprint 진행 동의 (분해 = 즉시 사용자 가시 가치 없음. 다음 라운드 효율 향상 목적)

---

## 11. 다음 단계

1. **본 spec 사용자 검토** → 승인 후
2. Area 7 worktree 생성 (`s7/area-7-wizard-decomp` from main)
3. writing-plans skill 로 구체 task list 작성 (예: 12+ commits 별 step)
4. subagent-driven-development 로 실행 (각 분해 단계 commit + 시각 회귀 verify)
5. 페이즈 F 회고 → Area 8 (backend 분해) 평가

---

**Note**: 본 spec 은 S7 종료 직후 작성된 backlog 항목. Area 7 시작 시점에 spec 갱신 (S7 main merge 후 코드 상태, S8 신규 결함 등 반영) 권장.

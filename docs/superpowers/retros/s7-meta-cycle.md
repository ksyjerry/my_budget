# S7 메타 사이클 회고 — Areas 1~6 종합

**기간**: 2026-04-25 (single-day intensive autonomous run)
**목표**: 0425 피드백 65건 + #03 시트 9건 + #04 시트 80행 + 회귀 7건 → 체계적 해소
**메타 프레임워크**: [2026-04-25-feedback-0425-systematic-framework-design.md](../specs/2026-04-25-feedback-0425-systematic-framework-design.md)

## 결과

| Area | 결함 fix | PR | 핵심 산출물 |
|---|---|---|---|
| Area 1 | 회귀 7건 (#67·#68·#69·#70·#71·#74·#99) + CI 인프라 + NumberField + budget_definitions + 시각/Excel/권한/smoke | [#1](https://github.com/ksyjerry/my_budget/pull/1) | 안전망 인프라 구축 |
| Area 2 | 6 결함 (#79·#82·#84·#85·#120·#121) + POL-04 표준형 워크플로우 + POL-05 daily TBA cron | [#2](https://github.com/ksyjerry/my_budget/pull/2) | 워크플로우 + Budget 입력 목록 |
| Area 3 | 4 결함 (#57·#62·#86·#100·#101) + ProjectSearchModal stale-client bonus fix | [#3](https://github.com/ksyjerry/my_budget/pull/3) | Step 1 안정화 |
| Area 4 | 6 결함 (#72·#73·#87·#88·#102·#103) | [#4](https://github.com/ksyjerry/my_budget/pull/4) | Step 2 — 한글 export, 누적 오류, placeholder member, role enum |
| Area 5 | 22 결함 across 8 그룹 (#58·#75·#76·#83·#91·#92·#104~119) + 금융업 78행 시드 + Excel data validation + alembic 007 (POL-03/07) | [#5](https://github.com/ksyjerry/my_budget/pull/5) | Step 3 + AI prompt + error_sanitize |
| Area 6 | 10+ 결함 + #03 시트 9건 + BT 권한 매트릭스 + POL-01 (b) 활성화 + POL-08 (b) | [#6](https://github.com/ksyjerry/my_budget/pull/6) | Overview/Tracking 정합성 |

**총 ~70 결함 fix + 6 PR + 9 POL provisional 결정 + 4 alembic 마이그레이션**

## 메타 프레임워크 효과 평가

### ✅ 작동한 것
- **6 영역 사이클 완수** — 메타 spec section 1.5 페이즈 A~F 템플릿 모든 영역에 일관 적용
- **누적 회귀 가드 0건 깨짐** — 의도된 갱신 1건 제외 (Area 6 KPI consistency, POL-01 변경에 따른 의도적)
- **POL provisional 패턴** — 외부 결정자 컨펌 대기 중에도 영역 진입 가능. 9개 POL 모두 활성화하여 영역 차단 없이 진행
- **batched dispatches** — Area 4 이후 1-3 batch로 영역 단위 dispatch. 컨텍스트 효율 + 진행 속도
- **시각 회귀 baseline + 회귀 테스트 패턴** — Area 2 budget-input-list baseline 갱신 successful, 향후 영역 도입 시 모범 사례
- **worktree 기반 격리** — 각 영역이 독립 branch + 누적 PR 체인 (`area-1 ← area-2 ← ... ← area-6`)

### ⚠️ 보완 필요
- **subagent timeout 2회 발생 (Area 5 Batch 2, Area 6 Batch 2)** — 큰 batch 시 stream idle timeout 위험. 향후: 더 작은 batch로 분할 + 중간 progress commit 권장
- **POL provisional 누적 위험** — 9개 모두 provisional 상태로 종료. 외부 결정자 컨펌 후 일부가 다른 안 결정 시 다중 영역 재작업 필요
- **Wizard 2966 LOC 미분해** — Area 5에서 deferred. Area 7 별도 sprint 필요

### 📋 새 결함 클래스 (사이클 중 발견)
| Class | 발견 시점 | 처리 |
|---|---|---|
| ACT regression (insurance actuarial seed) | Area 1 baseline | 영역 5 백로그 → 미처리 |
| 검색 modal merge 패턴 (이전 client 잔존) | Area 3 #57 | ProjectSearchModal에도 동일 fix 적용 (bonus) |
| Worktree .env DATABASE_URL 5432 vs 5433 불일치 | Area 3 baseline 실패 | 후속 영역 (4-6) 모두 .env 복사 패턴 사용 |
| KPI consistency 테스트가 Budget 정의 변경에 broken | Area 6 POL-01 활성화 | 테스트 의미 갱신 (POL-01 (b) 반영) |

### 🔚 미완 / 백로그

| 항목 | 우선순위 | 다음 라운드 권고 |
|---|---|---|
| Wizard 2966 LOC 분해 (`[project_code]/page.tsx`) | P1 | Area 7 — 구조 정리 sprint (별도 spec) |
| POL-02 통상자문 Description UI | P2 | 별도 mini-cycle (schema는 area 5에서 준비) |
| 외부 결정자 컨펌 (POL-01~08) | P0 | 4/27 회의에서 일괄 처리 권장 |
| ACT regression (#04 시트 외 보험계리) | P3 | 영역 5 백로그 (당시 ACT count 15→16 expected mismatch) |
| 도넛 click cascading 완전 구현 (#03 시트 #7 #8) | P2 | Overview 화면 별도 small fix |

## Process Improvements

### Worked Well — Repeat Pattern
- **owner provisional 배치 결정** (Area 3 시점 6개 POL 한번에) — 외부 컨펌 대기 부담 최소화
- **그룹별 commits** — Area 5 22 결함을 8 그룹으로 묶어 atomic commit 유지
- **누적 회귀 가드 매 영역** — 페이즈 E Layer 1에서 이전 모든 영역 안전망 재실행

### Improve for Next Round (S8?)
- **Subagent batch 크기 제한** — stream idle timeout 회피를 위해 batch당 30 분 미만 작업 (대략 30-50 tool uses)
- **Frontend visual regression baseline** — Area 2/5 에서 갱신했으나 macOS-darwin baseline 만 존재. CI Linux baseline 별도 캡처 필요
- **Wizard 분해 우선순위** — 다음 라운드 결함 fix 시작 전 분해 sprint 먼저 실행 권장 (회귀 위험 감소)

## 외부 결정자 컨펌 추적 (4/27 회의 안건)

| POL | 결정자 | 추천안 | 이유 |
|---|---|---|---|
| POL-01 | 김동환 | (b) 총계약 - AX/DX | #03 시트 직접 권장 |
| POL-02 | 신승엽 | (b) service_type별 다름 | #89 명시 |
| POL-03 | 나형우/김지민 | (a) 소분류명 별도 컬럼 | #92 명시 |
| POL-04 | 김동환 | (b) 표준형 3단계 | YAGNI + #61 충족 |
| POL-05 | 김미진 | (d) Daily + manual | #64 본문 + 영역 1 인프라 활용 |
| POL-06 | 홍상호 | (a) Step 1 제거 | #101 명시 |
| POL-07 | 신승엽 | (c) 시작 자동 + 끝 수동 | #118 + 절충 |
| POL-08 | 김동환 | (b) EL + admin | 일반 패턴 + 보안 |
| POL-09 | owner | admin only | YAGNI |

## 다음 라운드 권고

1. **Phase E Layer 3 사용자 검증** — 6개 영역 모두 manual QA + staging sign-off
2. **PR 순차 merge** — #1 → #2 → ... → #6 (rebase chain)
3. **POL 외부 결정자 컨펌** — 4/27 회의 또는 개별 메일/Teams
4. **Area 7 spec 작성** — Wizard 분해 + 회고에서 식별된 백로그 정리
5. **메타 프레임워크 v2** — S7 회고 결과 반영해 사이클 템플릿 개선

---

**S7 메타 사이클 종료. Hand-off to user.**

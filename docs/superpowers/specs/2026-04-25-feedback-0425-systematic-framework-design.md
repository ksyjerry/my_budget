# Feedback 0425 — 체계적 결함 해소 프레임워크 (메타 설계)

**작성일**: 2026-04-25
**입력**: `files/Budget+ 2.0 Feedback_0425.xlsx` (4/22~4/23 신규 피드백 약 65건 + #03 Overview 9건 + #04 금융업 80행 + #02 테스트 항목 다수 미완료)
**목적**: 회귀 7건이 한 라운드에 발생한 구조적 원인을 차단하고, 같은 종류 결함이 재발하지 않도록 영역별 사이클·다층 검증·정책 트랙을 정의하는 메타 프레임워크.
**비목표**: 본 문서는 6개 영역을 모두 정의하지만, **영역별 상세 구현 계획은 각 영역 사이클 진입 시점에 별도 spec → plan으로 작성**한다. 본 문서는 portfolio plan.

---

## 1. 프레임워크

### 1.1 목표
- **회귀 0건**: 같은 결함이 재발하지 않도록 PR 게이트화
- **근본원인 기반 처리**: 표면 증상이 아닌 원인 단위로 묶어 같은 종류 결함 일괄 해소
- **변경 신뢰성**: 모든 fix는 영구적 안전망(자동 + 수동 + 사용자 컨펌) 통과 의무
- **각 영역 단계적 완결성**: 영역 N이 안전망·구조·fix·검증을 모두 통과해야 영역 N+1 진입

(일정 시점 5/06·5/15·5/22는 정보 참고용으로만 보유. 결정 드라이버 아님.)

### 1.2 비목표
- Backlog 항목 (#14 직급별 단가, 협업 코드 — `_backlog.md`에 기록)
- 신규 도메인/메뉴 추가
- Azure AD SSO 전환 (S0 사이클로 이미 완료)
- 새 기능보다 안정화 우선 — 사용자 nice-to-have는 영역 사이클에 포함되되 P3 처리

### 1.3 6 영역 정의 (의존도 순)

| # | 영역 | 핵심 결함 | 의존도 |
|---|---|---|---|
| 1 | 공통 안전망 + 배포 위생 | 회귀 7건, CI/테스트 인프라, NumberField 일관성, Budget 정의 단일화, dev tool 노출 | — (시작점) |
| 2 | Budget 입력 목록 | #79, #82, #84, #85, #120, #121 | 영역 1 |
| 3 | Step 1 (기본정보) | #57, #62, #86, #98, #100, #101 | 영역 1 |
| 4 | Step 2 (구성원) | #72, #73, #87, #88, #102, #103 | 영역 1 |
| 5 | Step 3 (Time Budget) | #58, #75, #76, #91, #92, #105~119, 금융업 80행 시드 | 영역 1 + 4 |
| 6 | Overview / Tracking | #93~96, #03 시트 9건, BT-001~016 | 영역 1 |

### 1.4 정책 결정 트랙 (병렬)

산출물: `docs/superpowers/specs/policy-decisions.md` (별도 파일, 영역 1 페이즈 B 시작 시 신규 작성).

| ID | 항목 | 결정자 | 차단 영역 | 메모 |
|---|---|---|---|---|
| POL-01 | "Budget 정의" 공식 (총계약 vs 총계약−AX/DX vs Staff 시간) | 김동환 | 6 | 4/27 회의에서 결정 권장 |
| POL-02 | 통상자문 — Budget 단위 vs Description 입력 (#89) | 신승엽 | 5 | 4/27 회의 |
| POL-03 | 비감사 관리단위 — Budget단위 vs 소분류명 (#92, #04 시트) | 나형우/김지민 | 5 | 4/27 회의 |
| POL-04 | EL 승인/취소 워크플로우 (#61, #98) | 김동환 | 2, 3 | — |
| POL-05 | TBA → Budget 입력 가능 시점, batch 주기 (#64) | 김미진 | 2 | — |
| POL-06 | RA 주관 시 FLDT 입력 방식 (#66, #101) | 홍상호 | 3, 5 | — |
| POL-07 | 프로젝트 기간 — 자동 12개월 vs 수동 설정 (#118) | 신승엽 | 5 | — |
| POL-08 | Budget Tracking 화면 권한 범위 (BT-001~016) | 김동환 | 6 | 영역 6 진단에서 정식 등록 |

각 영역 사이클 진입 전 해당 POL 미결정 시 사이클 중단 → 사용자 컨펌 요청.

**POL 결정 완료의 정의** (3가지 모두 충족):
1. 결정자가 명확한 답변 제공 (구두만으로 부족, 메일/Teams 등 텍스트 형태로 확보)
2. `policy-decisions.md`에 결정 사항 + 결정자 + 결정 일자 + 출처(메일·회의록 등) 기록
3. 본 시스템 owner가 기록을 확인·승인

3가지 중 하나라도 빠지면 미결정 상태로 간주, 영역 진입 차단.

### 1.5 영역 사이클 템플릿

각 영역은 동일한 페이즈 A~F를 거친다. 시간박스 없음. 각 페이즈의 Definition of Done 통과 시에만 다음 페이즈 진입.

**페이즈 A: 진단 (Diagnose)**
- 활동:
  - 해당 영역 모든 피드백을 분류표로 정리
    (ID | 표면 증상 | 근본 원인 카테고리 | 영향 범위 | 의존 POL | 우선순위 | 인접 영역 회귀 가드 필요 여부)
  - 핫스팟 파일 식별 (LOC + 결함 밀도)
  - 의존 POL 미결정 식별
- DoD:
  - [ ] 모든 결함 분류표 완성, 누락 0
  - [ ] 사용자가 진단표 검토·확정
  - [ ] 의존 POL 모두 결정 완료 (미결정 있으면 차단)

**페이즈 B: 안전망 작성 (Safety Net Authoring)**
- 활동:
  - 영역 내 모든 결함에 대해 회귀 재발 차단 테스트 작성 — 실패 상태로 시작
  - 인접 영역(이미 처리한 영역 포함) 핵심 회귀 가드 추가
  - "이 결함이 다시 발생할 수 있는 변종 시나리오" 포함 (예: 음수 차단 → 0.24/0.26 입력도 가드)
  - 자동화 카테고리:
    - 단위 테스트 (pytest)
    - E2E (Playwright)
    - 시각 회귀 (Playwright screenshot)
    - Excel round-trip property test (필요 영역만)
    - 권한 매트릭스 (필요 영역만)
- DoD:
  - [ ] 모든 새 테스트가 빨간색이고, 실행 가능
  - [ ] CI에서 자동 실행됨 (영역 1 완료 후부터 적용)
  - [ ] 사용자가 테스트 목록 검토·확정 (커버리지 누락 0)

**페이즈 C: 구조 정리 (Restructure) — 선택적**
- 진입 조건: 핫스팟이 영역 내 결함의 30% 이상에 관여 또는 인접 영역에 영향
- 활동:
  - 핫스팟 분해
  - 공통 추상화 도입
- DoD:
  - [ ] 분해 후 모든 기존 테스트(페이즈 B 외) 녹색 — 회귀 없음
  - [ ] 사용자가 구조 변경 검토·확정

**페이즈 D: Fix**
- 활동:
  - 분류된 결함 일괄 처리 — 페이즈 B 안전망 녹색까지
  - 각 fix 분리 commit, 결함 ID 명시
  - 인접 영역 회귀 가드 통과 유지
- DoD:
  - [ ] 페이즈 B 안전망 100% 녹색
  - [ ] 코드 리뷰 통과 (self-review 또는 superpowers:code-reviewer agent)
  - [ ] 의도하지 않은 변경 0 (diff 점검)

**페이즈 E: 검증 (Verification) — 다층 게이트**
- Layer 1 (자동):
  - [ ] 영역 내 모든 새 테스트 통과
  - [ ] 누적 회귀 가드 통과 — 영역 1~(N-1) 모든 안전망 재실행 녹색
  - [ ] CI 통과 (lint, build, test)
  - [ ] 시각 회귀 baseline 갱신 + diff 0
- Layer 2 (수동):
  - [ ] 영역 내 결함 전체 manual QA 체크리스트 (`docs/superpowers/qa-checklists/area-N.md`)
  - [ ] 회귀 7건 재확인
  - [ ] 인접 영역 핵심 5건 sanity check
  - [ ] prod-like 환경 (Docker build) smoke test — dev tool 노출 0, console error 0
- Layer 3 (사용자 컨펌):
  - [ ] 사용자가 스테이징 환경에서 직접 검증
  - [ ] 사용자가 영역 종료 승인

**페이즈 F: 회고 + 환류 (Retrospective)**
- 활동:
  - 이 영역에서 발견된 새 결함 클래스 식별
  - 클래스가 다른 영역에서도 발생 가능한지 점검
  - 안전망 미흡 항목을 영역 1 (공통 안전망)에 영구 반영
  - 정책 트랙 신규 항목 발생 시 등록
  - 영역 사이클 자체의 개선 사항 기록
- DoD:
  - [ ] 회고 노트 작성 (`docs/superpowers/retros/area-N.md`)
  - [ ] 환류 작업 영역 1 안전망에 commit
  - [ ] 다음 영역 진단 페이즈 진입 가능 상태

### 1.6 누적 회귀 가드 정책

영역 N 사이클의 페이즈 E Layer 1에서 **영역 1~(N−1) 모든 안전망 재실행 의무**. 한 건이라도 실패 시 N 사이클 종료 차단.

→ 결과: 영역 6 종료 시점 6개 영역 + 회귀 7건 + 인접 가드 모든 자동 테스트가 한 번에 녹색이어야 사용자에게 최종 인계.

### 1.7 명시적 트레이드오프 정책

본 프레임워크는 신중함·체계성·검증 우선. 외부 압박이 발생해도 단축 제안 자동 금지.
- 압박 발생 시: 사용자에게 명시적 옵션 제시
  - (a) 일정 연기
  - (b) 영역 범위 축소(특정 결함을 다음 라운드로)
  - (c) 안전망 일부 생략(비추천, 명시적 비추천 표시)
- 의사결정 권한은 사용자에게만 있음

---

## 2. 영역 1 (공통 안전망 + 배포 위생) 상세 설계

### 2.1 페이즈 A 진단

**회귀 7건과 근본원인 카테고리**:

| ID | 표면 증상 | 근본 원인 카테고리 | 인접 가드 |
|---|---|---|---|
| #67 | dev tool overlay가 prod에 노출 | RC-DEPLOY: docker-compose 명령 / NODE_ENV 검증 부재 | smoke test |
| #68 | QRP empno 수정 불가 | RC-COMP-NESTING: 자식 컴포넌트 부모 내 정의 → re-render focus 상실 | NumberField 사용 enforcement |
| #69 | 클라이언트 없이 프로젝트 검색 시 non-project만 | RC-SEARCH-DEPENDENCY: 프로젝트 검색이 클라이언트 선택 의존 | E2E flow |
| #70 | 천단위 양식 미적용 | RC-NUMBER-DISPLAY: NumberField 옵션 일관 적용 안 됨 | NumberField 기본값 + grep CI |
| #71 | 퇴사/휴직 에러메시지 없음 | RC-EMPSTATUS-FILTER: emp_status='재직' 필터 회귀 | 단위 테스트 |
| #74 | 음수/0.25 비배수 입력됨 | RC-NUMBER-CONSTRAINT: NumberField 제약(min/max/step) 미적용 | NumberField 기본값 |
| #99 | Step1 버튼 겹침 | RC-LAYOUT-OVERLAP: flex 컨테이너 + z-index 검증 부재 | 시각 회귀 baseline |

**메타원인** (회귀의 회귀를 만드는 원인):
- **RC-CI**: CI 워크플로우 부재 → 작성된 22개 테스트가 PR에 강제되지 않음. 모든 회귀의 1차 원인.
- **RC-NUMBERFIELD-DRIFT**: NumberField가 존재하지만 `<input type="number">` 직접 사용 코드와 공존
- **RC-BUDGET-DRIFT**: "Budget 정의"가 코드 곳곳에 흩어져 있어 한 곳 바뀌면 다른 곳 안 바뀜 — 영역 6에서 본격 발현되지만 추상화는 영역 1에서 도입

**인프라 부재**:
- CI 워크플로우 (`.github/workflows/`)
- frontend `npm test` script
- 시각 회귀 (Playwright `toMatchSnapshot`)
- Excel round-trip property test
- 권한 매트릭스 테스트
- prod-like Docker smoke test

**의존 POL**: 없음. 즉시 진입 가능.

### 2.2 페이즈 B 안전망

**B.1 CI 인프라**
- `.github/workflows/ci.yml` 신규 (backend / frontend / smoke / visual 4개 잡)
- frontend `package.json` "test" script
- backend `pyproject.toml` pytest 설정
- branch protection (사용자가 GitHub UI에서 수동 설정)

**B.2 회귀 7건 가드**
신규 디렉토리: `frontend/tests/regression/` + `backend/tests/regression/`. 각 회귀에 대응하는 spec 파일 생성, 페이즈 B 시작 시 모두 빨간색 상태.

**B.3 시각 회귀 baseline**
Playwright `toMatchSnapshot`. Docker 환경 고정. 핵심 화면 7개 baseline.

**B.4 Excel round-trip property test**
`backend/tests/regression/test_excel_roundtrip_*.py`. seed → export → upload → assert equal. 다양한 service_type / 한글 / 빈 셀 / edge case fixture.

**B.5 권한 매트릭스**
`backend/tests/regression/test_permission_matrix.py`. 18 endpoint × 7 페르소나 = 126 케이스, expected status fixture.

**B.6 Prod-like smoke**
기존 `frontend/tests/task-auth-prod-overlay.spec.ts` 확장 + 신규 smoke 디렉토리 `frontend/tests/smoke/` 생성. CI에서 docker compose up → playwright `--project=smoke` 실행.

### 2.3 페이즈 C 구조 정리

**C.1 NumberField 일관 강제**
- NumberField 기본 props 강화 (min=0, allowNegative=false, 천단위 표시)
- CI grep 게이트로 `<input type="number">` 직접 사용 차단
- 기존 직접 사용 코드 마이그레이션

**C.2 "Budget 정의" Single Source of Truth**
- `backend/app/services/budget_definitions.py` 신규
  - `total_contract_hours(project)`
  - `axdx_excluded_budget(project)`
  - `staff_controllable_budget(project)`
  - `staff_actual_budget(project_code)`
  - `display_budget(project, *, view)` — POL-01 결정 후 라우팅. 미결정 동안 NotImplementedError
- 단위 테스트 + 호출자 마이그레이션 + grep 게이트

**C.3 ProductionOverlay 가드**
- docker-compose.yml `command` 검증
- `next.config.js` NODE_ENV=production 시 dev overlay 강제 비활성화
- smoke test 확장

**C.4 22개 기존 Playwright 테스트 통과 상태 확보**
- 페이즈 B 첫 작업으로 현재 통과 여부 확인
- 깨진 테스트는 root cause 진단 → fix or 삭제 (사용자 컨펌)
- 진짜 회귀면 회귀 목록에 추가

### 2.4 페이즈 D Fix
- 회귀 7건 (B.2 가드 녹색까지)
- C.1 NumberField 마이그레이션
- C.2 budget_definitions.py 호출자 교체
- C.3 ProductionOverlay 가드
- C.4 깨진 기존 테스트 fix

각 fix 분리 commit, 결함 ID commit message 명시.

### 2.5 페이즈 E 검증

**Layer 1 (자동)**:
- B.2 회귀 7건 모두 녹색
- B.3 시각 회귀 diff 0
- B.4 Excel round-trip 녹색
- B.5 권한 매트릭스 126/126 expected
- B.6 smoke test 녹색
- 기존 22개 Playwright 모두 녹색
- 기존 backend pytest 모두 녹색
- CI 워크플로우 첫 PR에서 녹색

**Layer 2 (수동)**:
- 회귀 7건 manual 재현 시도 — 모두 차단 확인
- Docker prod 빌드 후 모든 메뉴 — dev overlay 0
- DevTools console — 0 error
- CI workflow 의도적 깨뜨린 PR → merge 차단 확인 (negative test)

**Layer 3 (사용자)**:
- 사용자가 스테이징/prod 빌드에서 회귀 7건 재현 시도
- 사용자 영역 1 종료 승인 → 영역 2 진입

### 2.6 페이즈 F 회고
산출물: `docs/superpowers/retros/area-1.md`

---

## 3. 영역 2~6 윤곽

각 영역 사이클 진입 시점에 별도 spec(`YYYY-MM-DD-area-N-design.md`)으로 페이즈 A 결과를 정식화한다. 본 섹션은 사이클 진입 전 윤곽.

### 3.1 영역 2: Budget 입력 목록
- 결함: #79, #82, #84, #85, #120, #121
- 의존 POL: POL-04, POL-05
- 핫스팟: `backend/app/api/v1/budget_input.py` (1140 LOC, 분해 검토)
- 핵심 가설:
  - #79·#82 동일 원인 가능성 (status 필터)
  - #121 ILIKE 미사용
  - #84 빈 template 메뉴 자체 불필요
- 핵심 가드:
  - 5개 상태(작성중/완료/임시/아카이브/없음) × 4 권한 = 20 케이스 E2E
  - 검색 대소문자 무관 단위 + E2E
  - POL-04 워크플로우 E2E

### 3.2 영역 3: Step 1
- 결함: #57, #62, #86, #98, #100, #101
- 의존 POL: POL-06
- 핫스팟: 2966-LOC wizard 파일 (분해는 영역 5에서)
- 핵심 가설:
  - #57 클라이언트 변경 effect 의존성
  - #86·#100 "이전 프로젝트 가져오기" 미구현/미작동
  - #98 작성완료 상태 워크플로우 (POL-04)
  - #101 입력 위치 정책 (POL-06)
- 핵심 가드:
  - 클라이언트 A→B→C 시퀀스 → 의존 필드 clear E2E
  - 이전 프로젝트 가져오기 E2E (8개 필드 자동 채움)
  - Step 1 + Step 3 입력 영역 비중복 단위
  - 작성완료 → 수정 시 POL-04 적용 E2E

### 3.3 영역 4: Step 2
- 결함: #72, #73, #87, #88, #102, #103 (#71은 영역 1 회귀로 처리)
- 의존 POL: 없음 (다만 #102 NS/TBD/associate 도입은 정책 컨펌 필요할 수 있음)
- 핵심 가설:
  - #72 Excel export 컬럼명 표준화 누락
  - #73 업로드 검증 정책
  - #87 검증 행 단위 누적 결과 반환
  - #88 검색 결과 team 컬럼 추가
  - #102~103 신규 enum + dropdown
- 핵심 가드:
  - 다양한 결함 행 → 행 번호별 메시지 응답 E2E
  - 동명이인 검색 시 팀명 표시 단위 + E2E
  - TBD/NS empno 시드 → 정상 등록 + 시간 입력 E2E

### 3.4 영역 5: Step 3 (가장 큰 영역, 핫스팟 분해 포함)
- 결함: #58, #75, #76, #91, #92, #105~119 (15건), 금융업 시드 (#81 + #04 시트). #74는 영역 1.
- 의존 POL: POL-02, POL-03, POL-06, POL-07
- **핫스팟 분해**: 2966-LOC `[project_code]/page.tsx` →
  - `wizard/Step1Form.tsx`
  - `wizard/Step2Members.tsx`
  - `wizard/Step3Grid/CategoryPanel.tsx`
  - `wizard/Step3Grid/MonthGrid.tsx`
  - `wizard/Step3Grid/Toolbar.tsx`
  - `wizard/Step3Grid/SummaryRow.tsx`
  - `wizard/hooks/useWizardState.ts`
  - `wizard/hooks/useStep3Roundtrip.ts`
- 분해 전 페이즈 B 가드 100% 작성, 분해 자체는 별도 commit (fix와 분리)
- 핵심 가설:
  - #58 grid template column 정렬
  - #75 저장 ↔ export 데이터 모델 불일치
  - #76 비감사 service_type 관리단위 시드 누락
  - #91 중복 허용 규칙 부재
  - #92 매핑 데이터의 잘못된 컬럼 사용
  - #105~107·#114·#117 Excel ↔ 화면 모델 차이 (round-trip)
  - #108 AI 추천 prompt에 service_type/초도·계속 컨텍스트 미반영
  - #110 AI 호출 cancel 핸들링
  - #111 에러 메시지 host/IP 노출 (보안)
  - #118 프로젝트 기간 (POL-07)
- 핵심 가드:
  - Step 3 round-trip 시나리오 확장 (영역 1 B.4 활용)
  - 화면 ↔ 엑셀 관리단위 순서 일치 E2E
  - 초기화 후 step 이동 → 재진입 시 깨끗한 상태 E2E
  - 금융업 80행 시드 후 Step 3 표시 E2E
  - AI 추천 service_type-aware 단위 + E2E
  - 에러 메시지 host/IP sanitize 단위
  - V 토글 전체/해제 E2E

### 3.5 영역 6: Overview / Tracking
- 결함: #93, #94, #95, #96, #03 시트 9건, BT-001~016
- 의존 POL: POL-01, POL-08
- 핫스팟: `budget_service.py`, `overview.py`, `tracking.py`
- 핵심 가설:
  - #93 QRP empno로 TMS 조회 누락
  - #94 staff_empnos 확장이 모든 view에 미적용
  - #95 연월 필터 enum 한정
  - #96 프로젝트→EL cascading 미구현
  - #03 시트 1~3 budget_definitions.py 적용
  - #03 시트 5 Staff time 분리 컬럼
  - #03 시트 7~8 도넛 click cascading
  - BT-001~016 권한 정의 + 화면 노출 정책 (POL-08)
- 핵심 가드:
  - POL-01 결정값 budget_definitions.py 단위 테스트
  - QRP TMS 조회 단위 + E2E
  - 연월 월별 cascading E2E
  - 프로젝트→EL cascading E2E
  - 도넛 click → 상단 KPI + Staff Time 동시 필터 E2E
  - BT 권한 매트릭스 (영역 1 B.5 확장)

---

## 4. 검증 게이트 (PR 단위)

```
[PR 게이트 — 영역 1 종료 후 활성화]
  1. lint:
     - frontend: ESLint (next lint)
     - backend: ruff (영역 1 페이즈 B에서 도입 결정 후 적용)
  2. build:
     - frontend: next build
     - backend: python -m compileall app
  3. backend pytest (단위 + integration + permission matrix + roundtrip)
  4. frontend playwright (E2E + visual regression + smoke)
  5. 누적 회귀 가드 — 영역 1~(현재 영역-1)의 모든 안전망 재실행
  6. CI grep 게이트 (NumberField, Budget 직접 산술, dev mode)
  7. screenshot diff 0 또는 명시적 baseline 갱신 commit
```

**ruff 도입 결정**: 영역 1 페이즈 B에서 backend lint 도구 도입 여부를 정식 결정. 도입 시 모든 잡 5에 추가, 미도입 시 PR 게이트 항목 1.backend는 생략.

**Branch protection** (사용자 수동 설정):
- main 브랜치: 위 게이트 통과 PR만 merge 허용
- direct push to main 차단

---

## 5. 리스크 + 완화책

| 리스크 | 영향 | 완화 |
|---|---|---|
| 누적 회귀 가드 시간 증가 | 영역 6에서 매번 5개 영역 안전망 재실행 → CI 시간 증가 | (a) 잡 병렬화, (b) 핵심 path 우선 + nightly full run, (c) Playwright shard |
| 정책 결정(POL) 지연 | 영역 사이클 차단 | 영역 진입 전 POL 미결정 시 사용자 컨펌 강제. 1.7 트레이드오프 정책 적용 — 일정 단축 절대 금지 |
| 영역 5 핫스팟 분해가 새 결함 도입 | wizard 분해 자체가 새 회귀 위험 | (a) 분해 전 페이즈 B 가드 100% 작성, (b) 분해를 별도 commit, (c) 분해 후 fix 시작 전 모든 가드 녹색 확인 |
| 시각 회귀 false positive | 폰트 렌더링/OS 차이로 매번 깨짐 | Playwright Docker image 고정 + linux baseline만 유효 |
| 22개 기존 Playwright 일부 깨진 상태일 가능성 | 영역 1 페이즈 B 차단 | 페이즈 B 첫 작업으로 통과 상태 확보. 깨진 테스트는 진단 후 fix or 삭제 (사용자 컨펌) |
| Excel round-trip property test가 너무 느림 | CI 시간 폭증 | 빠른 케이스 N개만 PR 게이트, 전체는 nightly |
| CI secrets 부족 (Azure SQL 등) | smoke test 실패 | 외부 의존 mock — Azure SQL 등은 영역 1 smoke에서 mock |
| 사용자 컨펌 게이트가 영역 진행 차단 | Layer 3 검증에 사용자 시간 필요 | 페이즈 E 진입 전 사용자 일정 확보. 컨펌 패스 요청은 절대 금지 |

---

## 6. 산출물 매핑

영역별로 다음 파일들이 생성된다.

| 영역 | spec | retro | qa-checklist |
|---|---|---|---|
| 메타 (본 문서) | `2026-04-25-feedback-0425-systematic-framework-design.md` | — | — |
| 정책 트랙 | `policy-decisions.md` | — | — |
| 영역 1 | `<date>-area-1-safety-net-design.md` | `retros/area-1.md` | `qa-checklists/area-1.md` |
| 영역 2 | `<date>-area-2-budget-list-design.md` | `retros/area-2.md` | `qa-checklists/area-2.md` |
| 영역 3 | `<date>-area-3-step1-design.md` | `retros/area-3.md` | `qa-checklists/area-3.md` |
| 영역 4 | `<date>-area-4-step2-design.md` | `retros/area-4.md` | `qa-checklists/area-4.md` |
| 영역 5 | `<date>-area-5-step3-design.md` | `retros/area-5.md` | `qa-checklists/area-5.md` |
| 영역 6 | `<date>-area-6-overview-tracking-design.md` | `retros/area-6.md` | `qa-checklists/area-6.md` |

각 영역 spec → plan 사이클은 본 문서가 사용자 검토 통과 후, 영역 1부터 순차적으로 brainstorming → writing-plans → executing-plans 사이클로 진행한다.

---

## 7. 롤백 정책

배포된 영역에서 사용자 컨펌 후 결함이 발견된 경우:

1. **즉시 롤백 불가 시점이 있는지 점검**: DB 마이그레이션이 포함되었으면 마이그레이션 reversibility 우선 확인
2. **롤백 트리거**:
   - P0 결함 (시스템 사용 불가, 데이터 손실 위험): 즉시 직전 commit으로 revert + main 재배포
   - P1 결함 (특정 기능 사용 불가): 24시간 내 hotfix 또는 revert 결정 (사용자 판단)
   - P2~P3: 다음 영역 사이클 또는 본 영역 보강 commit
3. **롤백 실행 후 의무**:
   - 안전망에서 해당 결함이 왜 차단되지 않았는지 회고 (페이즈 F)
   - 새 회귀 가드 추가 → 영역 1 안전망에 환류
   - 같은 결함 재발 시 즉시 자동 차단되는 상태로 만든 후 재배포
4. **DB 마이그레이션 롤백**:
   - 모든 마이그레이션은 `downgrade()` 함수가 작동해야 함 (alembic)
   - 영역 1 안전망에 마이그레이션 round-trip 테스트 (upgrade → downgrade → upgrade equal) 추가

## 8. 다음 단계

1. 사용자가 본 문서 검토 → 승인
2. `policy-decisions.md` 작성 + POL-01~08 추적 시작 (영역 진입 전 결정 필요한 항목 우선)
3. 영역 1 brainstorming → writing-plans → executing-plans
4. 영역 1 페이즈 F 회고 후 영역 2 진입
5. … 영역 6 종료까지 반복

본 문서는 portfolio plan으로서 영역 사이클 진행 중에도 변경될 수 있다. 변경은 별도 commit으로 추적.

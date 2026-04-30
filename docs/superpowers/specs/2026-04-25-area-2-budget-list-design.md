# 영역 2 — Budget 입력 목록 (Area 2 Spec)

**작성일**: 2026-04-25
**메타 프레임워크**: [2026-04-25-feedback-0425-systematic-framework-design.md](2026-04-25-feedback-0425-systematic-framework-design.md)
**의존 영역**: 영역 1 (안전망 + 횡단 추상화 — `s7/area-2-budget-list` 브랜치는 `s7/area-1-safety-net`에서 분기)
**의존 POL**: POL-04 (provisional: (b) 표준형 3단계), POL-05 (provisional: (d) 하이브리드)

본 문서는 영역 2의 단일 spec으로, 페이즈 A~F 산출물의 What·Why를 정의한다. How(구현 단계 세부)는 본 spec을 입력으로 한 writing-plans 산출물에서 다룬다.

---

## 1. 목적과 결과물

### 1.1 목적

피드백 #79가 사용자 입장에서 가장 차단력이 큰 결함이다 — "작성중/완료 항목 리스트 조회되지 않습니다". Budget 입력 메뉴 자체가 사실상 못 쓰는 상태. 영역 2의 핵심은 이 목록 화면을 PM/EL/관리자 모두가 의도대로 사용할 수 있는 상태로 만드는 것이다.

이와 함께 워크플로우(POL-04)·검색·필터·UX 개선을 일괄 처리하여 영역 3/5에서 Step 1/3 작업이 시작될 때 "목록에서 프로젝트를 찾아 진입한다"는 기본 흐름이 안정적으로 작동하도록 한다.

### 1.2 결과물 (Deliverables)

본 영역 종료 시점에 다음이 main 브랜치에 반영된 상태:

**워크플로우 (POL-04)**:
- `template_status` enum 표준화: `작성중` / `작성완료` / `승인완료` (DB 마이그레이션 + 기존 데이터 호환)
- API 엔드포인트:
  - `POST /api/v1/budget/projects/{code}/submit` — PM이 작성완료 상태로 제출 (작성중 → 작성완료)
  - `POST /api/v1/budget/projects/{code}/approve` — EL이 승인 (작성완료 → 승인완료, EL 권한 체크)
  - `POST /api/v1/budget/projects/{code}/unlock` — EL이 락 해제 (승인완료 → 작성완료, EL 권한 체크)
- 권한 가드: PM은 본인 프로젝트만 submit, EL은 본인 프로젝트만 approve/unlock, admin은 전체

**목록 화면**:
- `/projects/list` 권한 확장: EL 또는 PM인 프로젝트 모두 노출 (현재는 EL만). admin은 전체
- 상태 필터 드롭다운: (전체) / 작성중 / 작성완료 / 승인완료
- 검색: 클라이언트 사이드 case-insensitive 필터 (#121)
- 진행 표시: template_status 배지 + 프로젝트별 마지막 수정일 표시 (#85)
- "+ 신규 프로젝트" + 작성여부 필터 + 검색 input 한 줄 정렬

**제거**:
- "빈 Budget Template 다운로드" 버튼 (#84) — 메뉴 자체 제거. blank-export endpoint는 유지 (Step 3 화면에서만 사용)

**TBA 동기화 (POL-05)**:
- `apscheduler` 활용 daily cron 추가 (새벽 4시 권장 — TMS 데이터가 매일 새벽 갱신되는 점 고려): `sync_service.sync_tba_projects()`
- 기존 admin sync endpoint(`POST /api/v1/sync/clients`) 권한 확장 검토 — Area 2 페이즈 A에서 결정. 단, 이는 메타 spec 1.4의 신규 POL이 될 수 있어 사용자 컨펌 필요

**테스트 (Area 2 안전망)**:
- 신규 회귀 테스트:
  - `frontend/tests/regression/test_budget_list_states_visibility.spec.ts` — 5 상태 × 4 페르소나 = 20 케이스 (시드 필요)
  - `frontend/tests/regression/test_budget_list_search_case_insensitive.spec.ts` — #121 가드
  - `frontend/tests/regression/test_workflow_pm_submit_el_approve.spec.ts` — POL-04 워크플로우 E2E
- 신규 단위 테스트:
  - `backend/tests/regression/test_workflow_endpoints.py` — submit/approve/unlock 권한 + 상태 전이 검증
  - `backend/tests/regression/test_list_endpoint_pm_visibility.py` — PM이 본인 프로젝트 보이는지

**문서**:
- `docs/superpowers/qa-checklists/area-2.md` — 페이즈 E Layer 2 manual 체크리스트
- `docs/superpowers/retros/area-2.md` — 페이즈 F 회고 노트
- `docs/superpowers/runbooks/area-2-baseline-report.md` (필요 시) — 페이즈 A 산출물

### 1.3 비목표

- Step 1 (기본정보) UI 개선 — 영역 3
- Step 2 (구성원) 개선 — 영역 4
- Step 3 (Time Budget) 개선 — 영역 5
- Overview/Tracking 데이터 정합성 — 영역 6
- backend/app/api/v1/budget_input.py 분해 (1140 LOC, 분해는 영역 5에서 wizard 분해와 함께 검토)
- 기존 프로젝트의 EL/PM empno 데이터 정확성 — 데이터 품질 이슈는 별도 트랙
- 신규 도메인 (예: 결재선, 다중 승인자 — 표준형은 단일 EL 승인 가정)

---

## 2. 페이즈 A — 진단

### 2.1 결함 분류표

| ID | 표면 증상 (피드백 원문) | 근본 원인 카테고리 | 추정 위치 | 의존 POL | 인접 가드 |
|---|---|---|---|---|---|
| #79 | Budget 입력 중인 항목, 완료항목의 리스트가 조회되지 않습니다 | RC-LIST-OVER-RESTRICT: `/projects/list` 가 EL만 필터, PM 본인 프로젝트는 0건 | `backend/app/api/v1/budget_input.py:184-215` | POL-04 (필터 옵션 결정) | E2E 5상태×4페르소나 |
| #82 | 임시저장한 프로젝트의 경우, 등록완료를 위해서는 조회가 필요한데 찾을수가 없습니다 | RC-LIST-OVER-RESTRICT: 동일 (#79) | 동일 | POL-04 | 동일 (#79과 통합) |
| #84 | 빈 Budget Template 다운로드 받으면 ... 최초화면에 적합한 Template 아니라면 삭제하는 것이 좋을 것 같습니다 | RC-UI-UNNECESSARY-MENU | `frontend/src/app/(dashboard)/budget-input/page.tsx:82-104` | 없음 | 시각 회귀 |
| #85 | Budget 입력 임시저장 후 돌아오면 작성중인 항목들이 아래 화면에 표시되면 좋을 것 같습니다 | RC-LIST-MISSING-PROGRESS-INFO: 마지막 수정일 / 진행 % 미표시 | 동일 frontend page | POL-04 (작성중 표시 정책) | E2E 진행 표시 |
| #120 | 작성중, 작성완료 조회되는 작성여부 필터 추가하면 좋을 것 같습니다 | RC-FILTER-MISSING | 동일 frontend page | POL-04 (상태 enum) | 단위 + E2E |
| #121 | 프로젝트리스트에 SK텔레콤 있는데도 SK텔레콤 입력 시, 빈 리스트가 뜹니다 | RC-CASE-SENSITIVE-CLIENT-FILTER: `frontend page.tsx:62-67`의 `.includes()` 가 대소문자 구분. (백엔드 ilike는 정상 — 그러나 페이지가 q를 보내지 않고 전체 fetch 후 클라이언트 필터) | `frontend page.tsx:62-67` | 없음 | 단위 + E2E |

### 2.2 메타원인

- **RC-WORKFLOW-ENUM-INCOMPLETE**: `template_status`가 free-form string. 워크플로우 상태가 불명확. POL-04 결정으로 enum 명확화 필요
- **RC-LIST-FILTER-EL-ONLY**: 목록 가시성을 EL로만 제한하는 정책 — PM도 봐야 한다는 사용자 기대와 불일치
- **RC-CLIENT-SIDE-FILTER-CASE-INSENSITIVE**: 다른 화면(Step 1 client search)도 같은 패턴이 있을 수 있음 — 영역 3에서 같이 점검

### 2.3 의존 POL 상태 점검

| POL | 상태 | 차단 여부 |
|---|---|---|
| POL-04 (워크플로우) | provisional (b) 표준형 | ✅ 영역 2 진입 가능 |
| POL-05 (TBA batch) | provisional (d) 하이브리드 | ✅ 영역 2 진입 가능 |

**provisional 리스크**: 외부 결정자(김동환·김미진)가 다른 안 선택 시 fix 필요. 가장 큰 위험은 POL-04가 (a) 단순형으로 결정되는 경우 — `승인완료` 상태와 submit/approve API가 불필요해진다. 이 경우 영역 2 종료 후 재작업 필요. 본 spec은 (b)를 전제로 진행하되 POL-04 (a) 결정 시 롤백 절차를 5장 리스크에서 명시.

### 2.4 신규 POL 후보 (페이즈 A 결과로 surfaced)

본 영역 진단 중 발견된 정책 결정 사항:

| ID | 항목 | 결정자 | 의견 |
|---|---|---|---|
| POL-09 (신규 후보) | TBA daily sync 권한 — admin only vs EL/PM도 manual trigger? | 김동환 또는 김미진 | POL-05 (d)에서 manual trigger 언급. admin only로 시작하고 사용자 요청 시 확장 권장 (YAGNI) |

**결정**: POL-09는 영역 2 페이즈 A 종료 시점에 사용자에게 명시적으로 컨펌 받아 정식 등록. 결정 전까지는 admin only 진행 (영역 1과 동일 패턴 유지 = no-op for area 2 endpoint changes).

### 2.5 사용자 컨펌 게이트 (페이즈 A DoD)

- [ ] 본 분류표가 누락 0인지 사용자 확인
- [ ] POL-04 provisional (b) 의 함의(승인 워크플로우 + 락/언락)가 사용자 의도와 일치하는지 재확인
- [ ] POL-09 (TBA sync 권한 범위) admin-only 진행 동의

---

## 3. 페이즈 B — 안전망 작성

### 3.1 회귀 테스트 (RED state)

**B.1 목록 5 상태 × 4 페르소나 가시성 (#79, #82)**

`frontend/tests/regression/test_budget_list_states_visibility.spec.ts`

시나리오:
- 시드: 4개 프로젝트, 각각 다른 EL/PM/template_status 조합
  - P1: EL=170661, PM=170661, status=작성중 (자기자신이 EL+PM)
  - P2: EL=170661, PM=999998 (다른 PM), status=작성완료
  - P3: EL=999997 (다른 EL), PM=170661, status=승인완료
  - P4: EL=999996, PM=999995 (둘 다 다른 사람), status=작성중 — 본인 무관
- 페르소나: admin / EL(170661) / PM(170661) / Staff
- Expected (4×4 = 16 cases):
  - admin: 모든 프로젝트 (P1, P2, P3, P4) 보임 — 4건
  - EL(170661 = P1·P2 EL이자 P3 PM): P1·P2(EL) + P3(PM) = 3건
  - PM(170661 = P1·P3 PM이자 P1·P2 EL): 동일 페르소나 — 같은 결과 (사용자가 EL이자 PM인 경우)
  - Staff: 0건 (목록 자체 노출 안 됨 또는 빈 리스트)
- ★ 4번째 페르소나는 별도 staff empno로 시드 — 위 케이스에서는 admin/EL/PM/staff만 4 페르소나로 잡음

**B.2 검색 case-insensitive (#121)**

`frontend/tests/regression/test_budget_list_search_case_insensitive.spec.ts`

- 시드: project_name="SK텔레콤", project_code="HF101010-01-001"
- 검색 쿼리: "sk텔레콤", "Sk텔레콤", "SK텔레콤", "Sk텔레", "텔레콤" — 모두 결과에 표시되어야
- 검색 쿼리: "tk텔레콤" — 결과 0건 (일치 안 함)

**B.3 워크플로우 E2E — PM submit → EL approve (POL-04)**

`frontend/tests/regression/test_workflow_pm_submit_el_approve.spec.ts`

- PM 페르소나로 로그인 → 작성중 프로젝트 → "작성완료 제출" 버튼 → 상태 작성완료 변경
- EL 페르소나로 로그인 → 동일 프로젝트 → "승인" 버튼 → 상태 승인완료 변경
- EL 페르소나 → "락 해제" 버튼 → 상태 작성완료로 복귀
- 잘못된 페르소나(staff)로 직접 API 호출 → 403

**B.4 단위 — 워크플로우 endpoint**

`backend/tests/regression/test_workflow_endpoints.py`

- POST /submit: status가 작성중 → 작성완료. PM 본인만, 그 외 403. 잘못된 상태 전이는 409
- POST /approve: status가 작성완료 → 승인완료. EL 본인 또는 admin만
- POST /unlock: status가 승인완료 → 작성완료. EL 본인 또는 admin만
- 동시성: 같은 프로젝트에 동시 submit + approve 호출 시 race condition 없는지 (DB row lock)

**B.5 단위 — list endpoint PM visibility**

`backend/tests/regression/test_list_endpoint_pm_visibility.py`

- PM 페르소나로 GET /projects/list → 본인이 PM인 프로젝트 모두 반환
- EL 페르소나 → 본인이 EL인 프로젝트
- admin → 전체
- staff → 빈 리스트 또는 403 (이번 영역에서 결정)

**B.6 누락 가드 (시각)**

영역 1의 시각 회귀 baseline에 budget-input-list 화면이 이미 있음. POL-04 도입으로 UI가 변경(상태 필터·승인 버튼 추가)되므로 baseline 갱신 필요. 페이즈 D 종료 후 baseline 재캡처.

### 3.2 페이즈 B DoD

- [ ] B.1~B.5 테스트 5개 모두 빨간색으로 작성 + commit (fix 전)
- [ ] CI에서 자동 실행 (영역 1 ci.yml에 신규 시드 추가)
- [ ] 사용자가 테스트 목록 검토·확정 — 누락 케이스 없는지

---

## 4. 페이즈 C — 구조 정리 (선택적)

### 4.1 진단

핫스팟: `backend/app/api/v1/budget_input.py` (1140 LOC). 영역 2 결함의 ~50%가 여기 (#79/#82/#85/#120 list 관련 + 신규 workflow endpoints). 분해 기준 30% 충족.

**결정**: 분해는 **영역 5에서 wizard 분해와 함께** 진행. 이유:
- 영역 5 페이즈 C에서 frontend wizard도 분해 — 두 분해를 한 번에 하면 영향 범위 한 번에 평가 가능
- 영역 2가 분해까지 시도하면 회귀 위험이 영역 2 자체에 누적
- 영역 2는 "list + workflow" 추가 작업이 본질. 분해는 본질 외

**대안**: 신규 workflow endpoints는 별도 파일에 만든다.

### 4.2 신규 파일

- `backend/app/api/v1/budget_workflow.py` (신규, 영역 2 추가분만):
  - `POST /api/v1/budget/projects/{code}/submit`
  - `POST /api/v1/budget/projects/{code}/approve`
  - `POST /api/v1/budget/projects/{code}/unlock`
  - `app/main.py`에 라우터 등록
- `backend/app/services/workflow.py` (신규):
  - `transition_status(project, *, target_status, actor_role, actor_empno)` — 상태 전이 + 권한 체크 + 변경 로그 기록
  - 단일 진입점으로 향후 워크플로우 변경 (예: 외부 결정자 (a) 단순형 결정) 시 영향 범위 최소화

### 4.3 DB 마이그레이션

신규 alembic 마이그레이션:
- `template_status` enum 표준화: 기존 free-form string → CHECK 제약 (`작성중` / `작성완료` / `승인완료` 외 거부). 또는 별도 lookup 테이블. 단순 CHECK constraint가 가벼움
- 기존 데이터 호환:
  - `작성중` / `작성완료` → 그대로 유지
  - 다른 값 (NULL 포함) → `작성중`으로 백필
- downgrade: CHECK 제약 제거만, 데이터 변경 없음

### 4.4 페이즈 C DoD

- [ ] `budget_workflow.py` 신규 + 라우터 등록
- [ ] `workflow.py` 서비스 신규 + 단위 테스트
- [ ] 마이그레이션 작성 + 영역 1의 round-trip 테스트(`upgrade → downgrade → upgrade`)에서 통과
- [ ] 기존 backend pytest 회귀 0
- [ ] 사용자가 신규 파일 구조 검토·확정

---

## 5. 페이즈 D — Fix

### 5.1 Fix 매핑

| 결함 ID | Fix 위치 | 종류 |
|---|---|---|
| #79 / #82 | `budget_input.py:184-215` `/projects/list` — 필터를 `(el_empno OR pm_empno) == user.empno OR user.role == admin` 로 변경 | 백엔드 |
| #84 | `frontend page.tsx:82-104` — "빈 Budget Template" 버튼 제거 | 프론트엔드 |
| #85 | `frontend page.tsx` — `template_status` 배지 옆 `last_updated` 표시 + (선택) 진행률 % | 프론트엔드 |
| #120 | `frontend page.tsx` — 검색 input 옆에 select dropdown 추가 (전체 / 작성중 / 작성완료 / 승인완료) | 프론트엔드 |
| #121 | `frontend page.tsx:62-67` — `.includes()` → `.toLowerCase().includes(search.toLowerCase())` | 프론트엔드 |
| 신규 워크플로우 (POL-04) | 페이즈 C 신규 파일 + 프로젝트 wizard 화면에 "작성완료 제출"·"승인"·"락 해제" 버튼 | 양쪽 |
| 신규 daily sync (POL-05) | `backend/app/services/sync_service.py` daily cron 추가 | 백엔드 |

### 5.2 Frontend 변경 — 화면 정렬

목록 페이지 새 레이아웃:
```
┌─────────────────────────────────────────────────────────────┐
│ Budget 입력                              [+ 신규 프로젝트]    │
├─────────────────────────────────────────────────────────────┤
│ [검색 input] [상태 ▼] (※ 빈 Template 버튼 제거)              │
├─────────────────────────────────────────────────────────────┤
│ Project Code | 프로젝트명 | EL | PM | 계약시간 | 상태 | 마지막수정 | 액션 │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 페이즈 D DoD

- [ ] 페이즈 B 안전망 5개 모두 녹색
- [ ] 영역 1 누적 가드 모두 녹색 (회귀 7건 + 시각 baseline + Excel round-trip + 권한 매트릭스)
- [ ] 코드 리뷰 통과
- [ ] 의도하지 않은 변경 0

---

## 6. 페이즈 E — 검증

### 6.1 Layer 1 (자동)
- 페이즈 D DoD 항목 모두 녹색
- CI 5 jobs 모두 녹색 (영역 1 ci.yml 활용)
- 시각 회귀: budget-input-list baseline 갱신된 상태에서 diff 0
- 누적 회귀 가드: **영역 1 모든 안전망 + 영역 2 신규 5개 합산 통과**

### 6.2 Layer 2 (수동 QA)
체크리스트: `docs/superpowers/qa-checklists/area-2.md`

핵심 항목:
- [ ] PM 계정으로 로그인 → 본인 PM 프로젝트가 목록에 보임
- [ ] PM이 작성완료 제출 → 상태 작성완료 변경 + EL에게 표시
- [ ] EL 계정으로 로그인 → 작성완료 프로젝트의 "승인" 버튼 보임
- [ ] EL 승인 → 상태 승인완료 + 편집 락 (수정 불가)
- [ ] EL이 락 해제 → 작성중으로 복귀, 편집 가능
- [ ] 검색 "sk텔레콤" / "SK텔레콤" 모두 SK텔레콤 표시
- [ ] 상태 필터 "작성완료" 선택 → 작성완료만 노출
- [ ] "빈 Budget Template" 버튼 사라짐
- [ ] daily cron 작동 확인 (다음 새벽 시간 후 또는 수동 trigger 후 새 TBA 등록 프로젝트가 목록에 추가됨)

### 6.3 Layer 3 (사용자 컨펌)
- 사용자가 스테이징에서 PM 계정 / EL 계정 각각으로 워크플로우 직접 시도
- 사용자가 영역 2 종료 승인

---

## 7. 페이즈 F — 회고

산출물: `docs/superpowers/retros/area-2.md`

회고 항목:
- POL-04 provisional 결정의 적합성 — 외부 결정자 컨펌 진행 상황 기록
- POL-09 신규 등록 여부
- 새 결함 클래스 발견 시 영역 1 안전망에 환류
- 영역 5에서 budget_input.py 분해할 때 영역 2 추가분(workflow.py)도 같이 정리 가능 여부 평가

---

## 8. 리스크 + 완화책

| 리스크 | 영향 | 완화 |
|---|---|---|
| POL-04 외부 결정자가 (a) 단순형 결정 | 승인완료 상태 + submit/approve API 불필요 → 영역 2 종료 후 재작업 | (a) 영역 2 페이즈 A 종료 전에 김동환 컨펌 받도록 사용자에게 명시 요청. (b) 재작업 발생 시 workflow.py / budget_workflow.py 파일을 통째 제거하면 영향 최소화 (단일 진입점) |
| POL-04 (c) 확장형 결정 | 승인대기·수정요청·재제출 추가 → 영역 2 결과 부족 | provisional (b) 진행 결과를 base로 (c)는 추가 작업으로 영역 2의 후속 라운드로 처리 (영역 2가 일부 부족해도 (b)→(c)는 추가, 회귀는 아님) |
| daily cron이 production에서 실행 안 됨 (apscheduler in-process) | TBA 동기화 안 되어 재발 | docker compose 환경에서 backend container 재시작 시 cron 자동 시작되도록 보증. 영역 2 페이즈 B에 cron startup smoke test 추가 |
| `template_status` 마이그레이션이 기존 데이터 손상 | 운영 데이터 손실 | (a) 마이그레이션 dry-run 우선, (b) downgrade 함수 작성 + Area 1 round-trip 테스트, (c) 백업 절차 retro에 기록 |
| 영역 1 누적 회귀 가드 실패 (영역 2 변경이 영역 1 안전망 깸) | 영역 2 종료 차단 | 페이즈 D 작업 시작 전 영역 1 가드 baseline 확인. 페이즈 E Layer 1에서 누적 재실행. 한 건이라도 깨지면 종료 차단 |
| backend/app/api/v1/budget_input.py 가 더 커짐 (workflow는 별도 파일이지만 list endpoint는 기존 파일 수정) | 영역 5 분해 부담 증가 | 분해 부담 측정값을 영역 2 페이즈 F 회고에 기록. 영역 5 진입 시 활용 |

---

## 9. 다음 단계

1. 사용자가 본 spec 검토 → 승인
2. POL-04 provisional 위험 인정 (외부 결정자 컨펌 미접수 상태로 진행)
3. POL-09 (TBA sync 권한) 결정 — admin only 권장
4. writing-plans skill로 영역 2 implementation plan 작성
5. subagent-driven-development로 plan 실행
6. 페이즈 F 회고 후 영역 3 spec 작성 시작

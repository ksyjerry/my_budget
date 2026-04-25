# 영역 1 — 공통 안전망 + 배포 위생 (Area 1 Spec)

**작성일**: 2026-04-25
**메타 프레임워크**: [2026-04-25-feedback-0425-systematic-framework-design.md](2026-04-25-feedback-0425-systematic-framework-design.md)
**정책 트래커**: [policy-decisions.md](policy-decisions.md)
**의존 POL**: 없음 (영역 1은 인프라 + 횡단 추상화만, 도메인 정책 무관)

본 문서는 영역 1의 단일 spec으로, 페이즈 A~F 산출물의 What·Why를 정의한다. How(구현 단계 세부)는 본 spec을 입력으로 한 writing-plans 산출물에서 다룬다.

---

## 1. 목적과 결과물

### 1.1 목적

회귀 7건이 한 라운드에 발생한 근본원인은 다음 3가지로 진단된다:
1. **CI 게이트 부재**: 작성된 22 Playwright + 18 pytest 파일이 PR merge 전 강제 실행되지 않음
2. **횡단 추상화 누락**: NumberField·"Budget 정의" 같은 공통 패턴이 코드 곳곳에 산재 → 한 곳 수정 시 다른 곳 재발
3. **배포 위생 미검증**: dev 환경에서 작동하는 코드가 prod 환경에서도 동일하게 작동하는지 확인 메커니즘 없음

본 영역은 위 3가지를 모두 차단하는 영구 인프라를 구축하고, 이미 발생한 회귀 7건을 영구 차단 가드 위에서 fix 한다.

### 1.2 결과물 (Deliverables)

본 영역 종료 시점에 다음이 main 브랜치에 반영된 상태:

**자동 검증 인프라**:
- `.github/workflows/ci.yml` — backend/frontend/smoke/visual 4개 잡, 모든 PR + main push 시 자동 실행
- `frontend/package.json`에 `"test"` script
- `backend/pyproject.toml`에 pytest 설정
- branch protection 규칙 문서화 (`docs/superpowers/runbooks/branch-protection.md`) — 사용자 GitHub UI 수동 적용

**회귀 가드 7개**:
- 회귀 #67·#68·#69·#70·#71·#74·#99 각각의 회귀 재발 차단 테스트가 녹색 상태로 main에 존재

**시각 회귀 baseline 7개**:
- 로그인·Overview·Budget 입력 목록·Step 1 (감사·비감사)·Step 2·Step 3·Appendix

**횡단 추상화**:
- `backend/app/services/budget_definitions.py` — Budget 의미 single source (POL-01 미결정 동안 `display_budget`은 NotImplementedError)
- `frontend/src/components/ui/NumberField.tsx` 강화 — 기본 props로 안전 옵션 적용
- CI grep 게이트 — `<input type="number">` 직접 사용 + Budget 직접 산술 차단

**배포 위생**:
- `frontend/tests/smoke/` 디렉토리 + smoke spec 확장
- docker-compose.yml `command` 검증 (CI step)
- prod 빌드 후 dev overlay·console error 0 자동 검증

**문서**:
- `docs/superpowers/qa-checklists/area-1.md` — 페이즈 E Layer 2 manual 체크리스트
- `docs/superpowers/retros/area-1.md` — 페이즈 F 회고 노트

### 1.3 비목표

- 영역 2~6의 결함 fix (영역 1은 기존 회귀 7건만)
- 새 기능 추가
- POL-01~08 결정 (정책 트래커는 영역 1 진입 시 빈 상태로 작성, 결정은 별도 트랙)
- DB 스키마 변경 (영역 1은 마이그레이션 round-trip 테스트 인프라만 추가, 실제 스키마 변경 없음)

---

## 2. 페이즈 A — 진단

### 2.1 회귀 7건 분류표

| ID | 표면 증상 (피드백) | 근본 원인 카테고리 | 추정 위치 | 인접 가드 |
|---|---|---|---|---|
| #67 | dev tool overlay가 prod에 노출 | RC-DEPLOY: docker-compose `command` / NODE_ENV 검증 부재 | `docker-compose.yml` frontend service | smoke test |
| #68 | QRP empno 수정 불가 | RC-COMP-NESTING: 자식 컴포넌트 부모 내 정의 → re-render focus 상실 (이전 #9 fix와 동형 회귀) | `[project_code]/page.tsx` Step 1 QRP 필드 | NumberField enforcement |
| #69 | 클라이언트 미선택 상태 프로젝트 검색 시 non-project만 | RC-SEARCH-DEPENDENCY: 프로젝트 검색이 클라이언트 선택 의존 (이전 #37 fix 회귀) | `ProjectSearchModal` API 호출 | E2E flow |
| #70 | 천단위 양식 미적용 | RC-NUMBER-DISPLAY: NumberField 옵션 일관 적용 안 됨 (이전 #38 fix 회귀) | Step 1 시간 배분 readOnly 필드 | NumberField default + grep CI |
| #71 | 퇴사/휴직 에러메시지 없음 | RC-EMPSTATUS-FILTER: emp_status 검증 회귀 (이전 #39 fix 회귀) | `EmployeeSearch` onSelect | 단위 + E2E |
| #74 | 음수/0.25 비배수 입력됨 | RC-NUMBER-CONSTRAINT: NumberField 제약 미적용 (이전 #41 fix 회귀) | Step 3 월 cell + Step 1 시간 배분 | NumberField default |
| #99 | Step1 버튼 겹침 | RC-LAYOUT-OVERLAP: flex 컨테이너 + z-index 검증 부재 (이전 #15 fix 회귀) | Step 1 하단 네비게이션 | 시각 회귀 |

### 2.2 메타원인

회귀의 회귀를 만드는 구조적 원인:
- **RC-CI**: GitHub Actions 워크플로우 부재 → 모든 회귀의 1차 원인
- **RC-NUMBERFIELD-DRIFT**: `<input type="number">` 직접 사용과 `<NumberField>` 사용이 코드에 공존 → 일관성 깨질 때 #70/#74 재발
- **RC-BUDGET-DRIFT**: "Budget 정의"가 backend 여러 파일에 흩어져 있어 한 곳 수정해도 다른 곳 안 바뀜 — 영역 6에서 본격 발현되지만 추상화는 영역 1에서 도입

### 2.3 의존 POL

**없음**. 즉시 페이즈 B 진입 가능.

### 2.4 사용자 컨펌 게이트 (페이즈 A DoD)

- [ ] 본 분류표가 누락 0인지 사용자 확인 — 회귀 7건 외에 다른 회귀가 빠지지 않았는지
- [ ] 메타원인 3개가 정확한지 확인
- [ ] 영역 1에서 기타 횡단 추상화를 추가로 다룰 항목이 있는지 확인 (예: 에러 메시지 sanitize는 영역 5의 #111로 미루는 게 맞는지)

---

## 3. 페이즈 B — 안전망 작성

### 3.1 B.1 CI 인프라

**B.1.1 `.github/workflows/ci.yml` 신규**:
```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]

jobs:
  backend:
    services:
      postgres: <test DB>
    steps:
      - checkout
      - setup-python 3.11
      - pip install -r backend/requirements.txt
      - cd backend && alembic upgrade head
      - cd backend && pytest

  frontend:
    steps:
      - checkout
      - setup-node 18
      - cd frontend && npm ci
      - cd frontend && npm run lint
      - cd frontend && npm run build
      - cd frontend && npx playwright install --with-deps
      - cd frontend && npm test

  grep-guards:
    steps:
      - checkout
      - bash scripts/ci/check-no-direct-number-input.sh
      - bash scripts/ci/check-no-direct-budget-arithmetic.sh
      - bash scripts/ci/check-docker-compose-no-dev.sh

  smoke:
    needs: [backend, frontend]
    steps:
      - docker compose -f docker-compose.yml build
      - docker compose up -d
      - cd frontend && npx playwright test --project=smoke
      - assert dev overlay 0, console error 0

  visual:
    needs: [frontend]
    steps:
      - docker run playwright image (고정 버전)
      - cd frontend && npx playwright test --project=visual
      - upload diff artifacts on failure
```

**B.1.2 `frontend/package.json`** — `"test": "playwright test"` 추가

**B.1.3 `backend/pyproject.toml`** — pytest 설정 (testpaths, asyncio_mode 등)

**B.1.4 `scripts/ci/`** — 신규 디렉토리, grep 게이트 스크립트 3개

**B.1.5 `docs/superpowers/runbooks/branch-protection.md`** — 사용자가 GitHub UI에서 수행할 단계

### 3.2 B.2 회귀 7건 가드 테스트

신규 디렉토리:
- `frontend/tests/regression/`
- `backend/tests/regression/`

| 회귀 ID | 파일 | 테스트 종류 | 핵심 assertion |
|---|---|---|---|
| #67 | `frontend/tests/regression/test_no_dev_overlay_prod.spec.ts` | Playwright + smoke | prod 빌드 페이지에 `[data-nextjs-toast]`·`[data-nextjs-dialog-root]` count = 0 |
| #68 | `frontend/tests/regression/test_qrp_field_editable.spec.ts` | Playwright | Step 1 QRP empno 입력 → 다른 필드 클릭 → 다시 QRP로 돌아가도 값 유지, 입력 가능 |
| #69 | `frontend/tests/regression/test_project_search_independent.spec.ts` | Playwright | 클라이언트 미선택 상태에서 프로젝트 검색 → 모든 service_type project 반환 (예: 비감사 통상자문 프로젝트도 결과에 포함) |
| #70 | `frontend/tests/regression/test_thousand_separator.spec.ts` | Playwright + screenshot | "12345" 입력 → "12,345" 표시 확인. ET 잔여시간·총 계약시간 영역 screenshot |
| #71 | `frontend/tests/regression/test_inactive_employee_warning.spec.ts` | Playwright | 휴직(emp_status≠'재직') 사번 검색 결과 선택 → alert 띄우고 등록 차단 |
| #74 | `frontend/tests/regression/test_number_field_constraints.spec.ts` | Playwright | Step 1 시간 배분 / Step 3 월 cell 모두 `min=0`, `max=300`, `step=0.25` 적용. -1·301·0.24 거부 |
| #99 | `frontend/tests/regression/test_step1_buttons_no_overlap.spec.ts` | Playwright screenshot | Step 1 하단 nav 영역 screenshot diff 0 |

**전제**: 페이즈 B 시작 시 모든 7건 테스트 빨간색 상태로 commit. 페이즈 D fix 후 모두 녹색.

### 3.3 B.3 시각 회귀 baseline

**Playwright 설정**: `frontend/playwright.config.ts`에 `visual` 프로젝트 추가
- 환경 고정: Playwright Docker image (예: `mcr.microsoft.com/playwright:v1.40.0-focal`)
- linux 환경 baseline만 유효, macOS/Windows 로컬 실행 시 baseline diff 무시 옵션

**Baseline 화면 7개** (`frontend/tests/__screenshots__/`):
1. 로그인 화면 (빈 폼 / 사번 입력 / 에러)
2. Overview 대시보드 (필터 0개)
3. Budget 입력 목록 (작성중·완료 모두 있는 시드 상태)
4. Step 1 — 감사 (모든 필드 표시)
5. Step 1 — 비감사 (3 필드만 표시)
6. Step 2 — 구성원 5명 등록 후
7. Step 3 — 관리단위 비활성·활성 혼재 + 합계 행
8. Appendix

**Test seed**: `backend/tests/fixtures/visual_baseline_seed.sql` — 결정론적 데이터

### 3.4 B.4 Excel round-trip property test

**파일**:
- `backend/tests/regression/test_excel_roundtrip_template.py`
- `backend/tests/regression/test_excel_roundtrip_members.py`

**시나리오 fixture** (`backend/tests/fixtures/roundtrip/`):
- `audit_minimal.json` — 감사 최소 case
- `audit_full.json` — 감사 모든 필드
- `non_audit_ac.json` — 비감사 회계자문
- `non_audit_trade.json` — 통상자문 (POL-02 미결정 시 일부 케이스 skip)
- `with_korean.json` — 한글 클라이언트명·관리단위
- `with_blank_cells.json` — 빈 셀 다수
- `edge_case_negative.json` — 음수 (업로드 시 거부 expected)
- `edge_case_step_violation.json` — 0.24/0.26 (업로드 시 거부 expected)

**property test 패턴**:
```python
@pytest.mark.parametrize("fixture", ALL_FIXTURES)
def test_template_roundtrip(fixture):
    seed_db_from_fixture(fixture)
    blob = export_template(project_code=fixture.project_code)
    assert is_valid_xlsx(blob)
    upload_template(project_code=fixture.project_code, blob=blob)
    assert db_state_equals(fixture)
```

### 3.5 B.5 권한 매트릭스

**파일**: `backend/tests/regression/test_permission_matrix.py`

**Endpoint 식별** (페이즈 B 첫 작업으로 grep):
```bash
grep -rE '@router\.(post|put|delete|patch)' backend/app/api/v1/
```
→ 정확한 endpoint 수와 가드 데코레이터 (`require_login` / `require_elpm` / `require_admin`) 매핑.

**Persona 7개**:
- `admin` — `users.role = 'admin'` (또는 동등)
- `el_self` — 해당 프로젝트의 EL
- `el_other` — 다른 프로젝트의 EL
- `pm_self` — 해당 프로젝트의 PM
- `pm_other` — 다른 프로젝트의 PM
- `staff` — 일반 직원
- `anon` — 비로그인

**Expected status fixture**: `backend/tests/fixtures/permission_matrix.yaml`
```yaml
- endpoint: POST /api/v1/budget-input/projects
  guards: [require_elpm]
  expected:
    admin: 200
    el_self: 200
    el_other: 200
    pm_self: 200
    pm_other: 200
    staff: 403
    anon: 401
```

**Test 구조**: pytest parameterize로 (endpoint, persona) 곱집합 → expected status 검증

### 3.6 B.6 Prod-like smoke test

**기존 파일**: `frontend/tests/task-auth-prod-overlay.spec.ts` 확장

**신규 디렉토리**: `frontend/tests/smoke/`
- `test_no_dev_overlay_all_pages.spec.ts` — 로그인 → 모든 메뉴 navigate, 각 페이지 dev overlay 0
- `test_no_console_error_all_pages.spec.ts` — 동일 navigation, console.error 0
- `test_docker_compose_command_no_dev.spec.ts` — `docker-compose.yml` 정적 파싱, frontend service `command`에 `npm run dev` 없음

**playwright.config.ts**: `smoke` project 추가 — `frontend/tests/smoke/` 디렉토리만 실행

### 3.7 22개 기존 Playwright 통과 상태 확보

**페이즈 B 첫 작업**:
1. `cd frontend && npx playwright test` 로컬 실행
2. 깨진 spec 식별
3. 깨진 spec별 분류:
   - **회귀**: 회귀 목록(2.1)에 추가, B.2 회귀 가드와 통합 처리
   - **stale**: 명세 변경에 따라 더 이상 유효하지 않음 → fix or 삭제 (사용자 컨펌 후)
   - **인프라**: 환경 의존(Docker DB·Azure SQL mock 등) → 영역 1 페이즈 D에서 인프라 보강
4. 모든 깨진 spec이 위 3개 분류 중 하나로 처리되어 영역 1 종료 시점 22개 모두 녹색 상태

### 3.8 페이즈 B DoD

- [ ] B.1~B.6 모든 인프라 파일 생성됨, CI ci.yml이 PR 시 4개 잡 모두 트리거
- [ ] B.2 회귀 7건 테스트 모두 빨간색으로 작성 + commit (fix 전)
- [ ] B.3 시각 회귀 baseline 7개 commit (현 상태 기준 — fix 후 baseline 갱신)
- [ ] B.4 fixture 8개 작성, property test 빨간색 (구현 미완 상태)
- [ ] B.5 endpoint 매트릭스 fixture + parameterize test 빨간색
- [ ] B.6 smoke 디렉토리 spec 3개 빨간색
- [ ] 사용자가 테스트 목록 검토·확정

---

## 4. 페이즈 C — 구조 정리

### 4.1 C.1 NumberField 일관 강제

**현 상태 진단 (페이즈 C 첫 작업)**:
```bash
grep -rE '<input[^>]*type="number"' frontend/src/app frontend/src/components | grep -v '/ui/NumberField'
```
→ 직접 사용된 위치 N건 식별.

**`frontend/src/components/ui/NumberField.tsx` 강화**:
- 기본 props:
  - `min={0}`
  - `allowNegative={false}`
  - `displayThousandSeparator={true}` (readOnly 표시 시 적용)
  - `step` 미명시 시 정수만 허용
- 명시적으로 `allowNegative={true}` 또는 `min={음수}` 설정한 경우만 음수 허용

**마이그레이션**: 직접 사용 위치 N건 모두 NumberField로 교체

**CI grep 게이트** (`scripts/ci/check-no-direct-number-input.sh`):
```bash
#!/usr/bin/env bash
hits=$(grep -rE '<input[^>]*type="number"' frontend/src/app frontend/src/components 2>/dev/null | grep -v '/ui/NumberField' || true)
if [ -n "$hits" ]; then
  echo "ERROR: <input type=number> 직접 사용 금지. NumberField 사용 필수"
  echo "$hits"
  exit 1
fi
```

### 4.2 C.2 "Budget 정의" Single Source of Truth

**파일**: `backend/app/services/budget_definitions.py` 신규

**함수 시그니처**:
```python
from typing import Literal
from app.models.project import Project

def total_contract_hours(project: Project) -> float:
    """B시트 C15: 총 계약시간"""
    ...

def axdx_excluded_budget(project: Project) -> float:
    """총 계약시간 − AX/DX (= '중계약시간-AX/DX')"""
    ...

def staff_controllable_budget(project: Project) -> float:
    """ET Controllable Budget — Step 3에서 분배 가능한 시간"""
    ...

def staff_actual_budget(project_code: str) -> float:
    """budget_details 합계 (실제 분배된 시간)"""
    ...

BudgetView = Literal[
    "overview_kpi_total_contract",
    "overview_project_table_budget",
    "tracking_budget_hour",
    "summary_project_budget",
]

def display_budget(project: Project, *, view: BudgetView) -> float:
    """View별 표시 Budget — POL-01 결정 후 routing.
    POL-01 미결정 동안 raise NotImplementedError."""
    raise NotImplementedError("POL-01 결정 후 활성화")
```

**단위 테스트**: `backend/tests/test_budget_definitions.py`
- 각 함수 × 시나리오 (감사·비감사·금융업·AX/DX 0인 경우)
- `display_budget` 호출 시 NotImplementedError 발생 확인

**호출자 마이그레이션**: `budget_service.py`, `overview.py`, `tracking.py`에서 직접 산술 → 위 함수 호출로 교체. 단, `display_budget`은 호출만 placeholder로 두고 영역 6에서 활성화.

**CI grep 게이트** (`scripts/ci/check-no-direct-budget-arithmetic.sh`):
```bash
#!/usr/bin/env bash
hits=$(grep -rE 'contract_hours\s*-\s*axdx|total_budget_hours\s*-' backend/app 2>/dev/null | grep -v 'budget_definitions.py' || true)
if [ -n "$hits" ]; then
  echo "ERROR: Budget 직접 산술 금지. budget_definitions.py 함수 사용"
  echo "$hits"
  exit 1
fi
```

### 4.3 C.3 ProductionOverlay 가드

**docker-compose.yml 검증** (`scripts/ci/check-docker-compose-no-dev.sh`):
```bash
#!/usr/bin/env bash
if grep -E '^\s*command:.*npm\s+run\s+dev' docker-compose.yml docker-compose.prod.yml 2>/dev/null; then
  echo "ERROR: docker-compose에서 'npm run dev' 사용 금지"
  exit 1
fi
```

**`frontend/next.config.js`**: NODE_ENV=production 시 dev overlay 강제 비활성화 + production source map 정책 결정

**smoke test 확장**: B.6에서 처리

### 4.4 C.4 22개 기존 테스트 정상화

페이즈 B의 3.7 작업 완료 상태 기준. 모든 깨진 테스트 fix 또는 사용자 컨펌 후 삭제.

### 4.5 페이즈 C DoD

- [ ] NumberField 강화 완료, 직접 사용 0건 (grep 게이트 녹색)
- [ ] budget_definitions.py 4개 함수 구현 + 호출자 마이그레이션, 직접 산술 0건 (grep 게이트 녹색)
- [ ] docker-compose 검증 grep 게이트 녹색
- [ ] 22개 기존 Playwright 모두 녹색
- [ ] 사용자가 구조 변경 검토·확정

---

## 5. 페이즈 D — Fix

페이즈 B 안전망 가드 7건이 빨간색으로 존재. 페이즈 C 추상화가 도입됨. 페이즈 D는 안전망을 녹색으로 만드는 fix.

### 5.1 Fix 매핑

| 회귀 ID | Fix 위치 | 종류 |
|---|---|---|
| #67 | `docker-compose.yml` frontend service `command` 수정 (`sh -c "npm run build && npm run start"` 유지) + smoke test 통과 확인 | 배포 |
| #68 | `[project_code]/page.tsx`에서 QRP NumberField가 부모 함수 안에 정의된 경우 외부로 분리 또는 NumberField 컴포넌트 사용으로 통일 | UI |
| #69 | `ProjectSearchModal` API 호출에서 클라이언트 의존 파라미터 제거 또는 optional 처리 | API |
| #70 | NumberField default `displayThousandSeparator=true` 도입 (C.1) → 자동 해결. 잔여 영역 별도 fix | UI |
| #71 | `EmployeeSearch.onSelect`에서 `emp_status !== '재직'` 가드 복원 + alert 메시지 | UI |
| #74 | NumberField default `min=0`, `step=0.25`, `max=300` (Step 3 월 cell) 적용 (C.1) → 자동 해결 | UI |
| #99 | Step 1 하단 nav `flex-wrap` + `mb-3` + `z-10` 재적용 (이전 #15 fix 복원) | CSS |

각 fix는 별도 commit, 메시지에 `fix(s7-area1): #N — <간략 설명>` 형식.

### 5.2 페이즈 D DoD

- [ ] B.2 회귀 7건 테스트 모두 녹색
- [ ] B.3 시각 회귀 baseline 갱신 (#99·#70 fix 후 새 baseline) + commit
- [ ] B.4 Excel round-trip 모두 녹색
- [ ] B.5 권한 매트릭스 expected 모두 통과
- [ ] B.6 smoke test 모두 녹색
- [ ] 22개 기존 Playwright 모두 녹색
- [ ] 기존 18개 backend pytest 모두 녹색
- [ ] CI ci.yml 첫 PR에서 모든 잡 통과
- [ ] 코드 리뷰 통과 (self-review 또는 superpowers:code-reviewer agent)
- [ ] 의도하지 않은 변경 0 (git diff main..HEAD 점검)

---

## 6. 페이즈 E — 검증

### 6.1 Layer 1 (자동)

페이즈 D DoD 8개 항목이 모두 녹색이면 Layer 1 통과.

추가:
- [ ] `git push` 시 GitHub Actions 자동 실행 → 모든 잡 녹색
- [ ] 의도적으로 회귀 7건 중 하나를 재도입하는 PR 생성 → 해당 회귀 테스트 빨간색으로 merge 차단 확인 (negative test, 후 revert)

### 6.2 Layer 2 (수동 QA)

체크리스트 파일: `docs/superpowers/qa-checklists/area-1.md` (페이즈 B에서 작성)

체크리스트 항목:
- [ ] **#67**: prod build 환경에서 dev overlay 시각적 확인 — 0
- [ ] **#67 추가**: 모든 메뉴 클릭 시 console DevTools error 0
- [ ] **#68**: Step 1 QRP empno 입력 → 다른 필드 → 다시 QRP 클릭 → 입력 가능, 값 유지
- [ ] **#69**: 신규 프로젝트 → 클라이언트 검색 skip → 프로젝트 검색 — 비감사 service_type 프로젝트 (예: 통상자문) 결과에 표시
- [ ] **#70**: 총 계약시간 12345 입력 → "12,345" 표시
- [ ] **#71**: 휴직 사번 입력 시 alert + 등록 차단
- [ ] **#74**: Step 1 음수(-1) 입력 거부, Step 3 월 cell 0.24 입력 거부, 301 입력 거부
- [ ] **#99**: Step 1 하단에서 "AI Assistant"·"이전"·"다음" 버튼 비겹침 (시각 확인)
- [ ] **CI 게이트 negative test**: 의도적 dev mode 재도입 PR이 grep 게이트로 차단됨
- [ ] **22개 기존 Playwright 회귀**: 무작위 5개 spec 수동 실행 — 통과

### 6.3 Layer 3 (사용자 컨펌)

사용자가 다음을 직접 확인:
- [ ] 스테이징(또는 prod docker build 로컬)에서 회귀 7건 manual 재현 시도 → 모두 차단됨
- [ ] CI 워크플로우가 본인 PR에서 4개 잡 모두 트리거되고 결과가 GitHub UI에 표시됨
- [ ] branch protection이 설정되어 통과 안 한 PR이 merge 안 됨
- [ ] 영역 1 종료 승인 → 영역 2 진입

---

## 7. 페이즈 F — 회고

산출물: `docs/superpowers/retros/area-1.md`

회고 항목:
1. **회귀 7건의 진짜 근본 원인** — 페이즈 D fix 후 식별된 원인이 페이즈 A 가설과 일치했는가? 다르면 왜?
2. **새 결함 클래스** — 페이즈 B/C/D 진행 중 새로 발견된 결함 클래스 (예: 22개 기존 테스트 중 stale 케이스의 패턴) → 영역 1 안전망에 환류
3. **사이클 자체 개선** — 페이즈 시퀀스에서 비효율적인 부분 → 메타 spec 1.5 사이클 템플릿 업데이트
4. **인접 영역 영향** — 영역 1 도입 추상화가 영역 2~6에 어떤 영향?
5. **POL 식별 추가** — 영역 1 진행 중 새로 발견된 정책 결정 사항이 있다면 policy-decisions.md에 추가

---

## 8. 리스크 (영역 1 한정)

본 영역에 한정된 리스크. 메타 spec 5장 일반 리스크와 별도.

| 리스크 | 영향 | 완화 |
|---|---|---|
| GitHub Actions secrets 부족 (postgres·Azure SQL 등) | CI 첫 PR 빨간색 | 영역 1 페이즈 B 첫 작업으로 secrets 확보 + Azure SQL은 mock 처리 |
| 22개 기존 Playwright 중 3개 이상이 깨진 상태 | 페이즈 B 진입 차단 | 페이즈 B 0번째 작업으로 깨진 spec 진단 — 영역 1 결과물에 포함하거나 영역 2로 일부 이연 (사용자 컨펌) |
| Playwright Docker image 버전과 로컬 macOS Playwright 버전 차이로 시각 baseline 불일치 | 시각 회귀 false positive 빈발 | 로컬에서는 시각 회귀 skip, CI Linux Docker만 유효. 명문화 |
| NumberField 기본 props 강화가 기존 정상 동작에 회귀 도입 | 영역 1 자체에서 새 회귀 발생 | C.1 마이그레이션 시 모든 사용처 기존 props를 명시적으로 기록하고, 기본값 변경이 영향을 주는 모든 위치를 재테스트. 기존 22개 Playwright + 신규 7건 회귀 가드가 안전망 |
| budget_definitions.py 마이그레이션이 영역 6 작업과 충돌 | 영역 6에서 또 수정 | C.2에서 함수 시그니처만 확정 + `display_budget`은 NotImplementedError 유지. 영역 6에서 채우기만 함 |
| docker-compose 검증 스크립트가 prod-only 파일과 dev-only 파일 구분 안 함 | dev에서도 npm run dev 차단되면 곤란 | dev compose 파일 (예: docker-compose.dev.yml)은 검증 제외 — `scripts/ci/check-docker-compose-no-dev.sh`가 `prod` 명시된 파일만 검증 |

---

## 9. 다음 단계

1. 본 spec 사용자 검토 → 승인
2. writing-plans skill로 영역 1 implementation plan 작성
3. 영역 1 implementation plan을 executing-plans로 진행
4. 페이즈 F 회고 후 영역 2 spec 작성 시작

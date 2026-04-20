# S1 — 비감사(非監査) 업무 지원

**Date:** 2026-04-21
**Status:** Approved (brainstorm)
**Sub-project:** S1 (of 7) — 2026-04-20 사용자 피드백 45건 분할안의 두 번째 단계
**Addresses feedback items:** #12, #13, #16, #27, #28, #47, #55

## Context

My Budget+ 는 원래 감사(Assurance Audit) 프로젝트 Budget 관리를 위해 설계됐고, 비감사(회계자문·내부통제·ESG·Valuation·통상자문·보험계리·기타비감사) 서비스는 `service_type` 컬럼에 코드만 존재할 뿐 실제 로직(클라이언트 필드·Activity 매핑·Budget 관리단위) 은 감사 전용으로 하드코딩돼 있다. S1 은 이 격차를 메워 비감사 PM/EL 도 Budget 입력 Wizard 를 실사용할 수 있게 한다.

참조 파일: `files/비감사 Activity 표준화_260420.xlsx` (7개 비감사 서비스 × 약 388개 activity row).

## Goals

1. 비감사 Activity/Budget unit 마스터 데이터를 DB 에 반영 (ServiceTaskMaster 확장 + Excel import 서비스)
2. Step 1 클라이언트 기본정보를 service_type 기준으로 조건부 렌더링 (비감사는 3 필드)
3. Step 2 구성원 Activity 매핑 드롭다운을 service_type 기준 동적 로딩 + 비감사는 선택사항
4. 서비스 분류 리셋 버그(#27, #28) 를 근본 원인 위치에서 수정
5. Step 3 "+ 행 추가" 의 empty-dropdown 상태(#47) 를 데이터 시드로 해소 + UX 가드
6. 클라이언트 정보 자동 입력 엔드포인트 추가 (#55)

## Non-Goals

- 비감사 전용 UI 페이지 신설 (기존 Wizard 재사용)
- 비감사의 D / D+1 회계연도(4월~3월 외) — 별도 S5 에서 처리
- 비감사 전용 AI 추천/검증 엔진 튜닝 — 현재 로직을 그대로 쓰되 empty state 만 방어
- 감사(AUDIT) 플로우 동작 변경 (backward-compatible 유지)
- 7개 비감사 서비스의 업무 프로세스 자체 변경

## Feedback → 설계 매핑

| No | 사용자 | 위치 | 원문 요지 | 대응 섹션 |
|---|---|---|---|---|
| #12 | 신재익 | Step1 | 비감사는 산업분류·자산규모·상장여부 3개만 유지 | §2 |
| #13 | 나형우 | Step2 | 비감사 activity 가 드롭다운에 없음 | §1 + §3 |
| #16 | 홍상호 | Step2 | 구성원별 Activity 는 비감사엔 없어도 될 듯 | §3 |
| #27 | 김지민 | Step1 | ESG 로 바꿔도 프로젝트 검색 후 감사로 리셋 | §4 |
| #28 | 신승엽 | Step1 | 통상자문 도 동일 리셋 | §4 |
| #47 | 신승엽 | Step3 | 통상자문 "+ 행 추가" 동작 안 됨 | §5 |
| #55 | 김미진 | Step1 | 비감사에 초도/계속 감사 필수? 고객정보 자동입력? | §2 + §6 |

## Design

### 1. 데이터 레이어 — ServiceTaskMaster 확장 + 비감사 Activity import

**1-1. 스키마 변경** — `ServiceTaskMaster` 에 컬럼 5개 추가 (Alembic `004`).

기존:
```
service_task_master (id, service_type, task_category, task_name,
                     budget_unit_type, sort_order, description)
```

추가 컬럼:
```
activity_subcategory VARCHAR(200)    -- 중분류 명
activity_detail      VARCHAR(300)    -- 소분류 명
budget_unit          VARCHAR(200)    -- "Budget 관리단위" (Step3 dropdown source)
role                 VARCHAR(100)    -- ET / AC / Fulcrum / ET,AC / ...
source_file          VARCHAR(200)    -- "비감사 Activity 표준화_260420.xlsx" 등 tracking
```

`task_category` 는 Excel 의 **대분류 명** 을 담는다. `task_name` 은 기존 컬럼이지만 의미가 중복되므로 이 스프린트에선 **소분류 명 원문** 을 `task_name` 에 저장 (기존 감사 데이터가 있으면 보존). 장기적으론 `task_name` 을 deprecate 하고 `activity_detail` 로 수렴. 지금은 안전을 위해 둘 다 채운다.

**1-2. Excel parser 서비스** — `backend/app/services/non_audit_activity_import.py`.

```
parse_non_audit_activities(path: str) -> list[ServiceTaskMasterRow]
    각 시트를 돌면서 (`Activity 표준화_<name>`):
      시트명 → service_type code 변환 (매핑 테이블)
      각 row 에서 대분류/중분류/소분류/Budget 관리단위/비고(role) 추출
      None/whitespace-only row 스킵
    반환: service_type 별로 파싱된 dict 목록

import_non_audit_activities(db, path, truncate=True) -> dict:
    비감사 7개 service_type 에 대해 기존 row truncate (truncate=True 인 경우)
    parsed row 일괄 insert
    return {"inserted": n, "by_service_type": {...}}
```

**시트명 → service_type 매핑**:
| Excel 시트명 | service_type |
|---|---|
| `Activity 표준화_회계자문` | AC |
| `Activity 표준화_내부통제` | IC |
| `Activity 표준화_ESG` | ESG |
| `Activity 표준화_Valuation` | VAL |
| `Activity 표준화_통상자문` | TRADE |
| `Activity 표준화_보험계리` | ACT |
| `Activity 표준화_기타비감사` | ETC |

각 시트의 row-parsing 규칙은 **공통 템플릿**:
- 열 2: 대분류, 열 3: 중분류, 열 4: 소분류, Budget 관리단위 컬럼(열 6 또는 7), 비고(역할) 마지막 데이터 열
- 실제 열 위치는 sheet 별로 0~1칸 오프셋 차이 있음 → header row 를 읽어 컬럼명(`대분류`/`중분류`/`소분류`/`Budget 관리단위`/`비고`) 으로 매칭 (hard-coded index 아님)

**1-3. 재동기화 admin 엔드포인트**

```
POST /api/v1/admin/sync-non-audit-activities
  require_admin
  body: { path?: str, truncate?: bool = True }
  response: {"inserted": n, "by_service_type": {AC: 80, IC: 57, ESG: 35, VAL: 80, TRADE: 38, ACT: 18, ETC: 80}}
  기본 path = settings.NON_AUDIT_ACTIVITY_FILE (기본값: "files/비감사 Activity 표준화_260420.xlsx")
```

배포 후 1회 수동 실행. 마스터 파일이 업데이트되면 관리자가 재호출.

**1-4. 조회 엔드포인트 재설계**

기존 `/master/tasks?service_type=...` 는 유지하되:
- 반환 형태에 `activity_subcategory`, `activity_detail`, `budget_unit`, `role` 포함
- `service_type=AUDIT` 인 경우는 기존 `DEFAULT_BUDGET_UNITS` 하드코딩 유지 (변경 없음, YAGNI)

신규 엔드포인트 (Step 2 활용):
```
GET /api/v1/master/activity-mapping?service_type={code}
  return: [{"category": "A_별도 결산PA", "subcategory": "#01_PM/Sub PM",
            "detail": "업무 계획 수립, 관리", "role": "ET"}, ...]
```

**1-5. Step 2 기존 호환**

`project_members.activity_mapping` 은 String 컬럼으로 남김. 비감사의 경우 값이 NULL/empty 여도 허용. Step 2 UI 에서 `service_type=AUDIT` 일 때만 필수.

### 2. Step 1 — 조건부 클라이언트 정보 필드 (#12, #55)

**2-1. 필드 분류**

| 필드 | AUDIT | 비감사 (AC/IC/ESG/VAL/TRADE/ACT/ETC) |
|---|---|---|
| 표준산업분류 | ✅ 필수 | ✅ 필수 |
| 자산규모 | ✅ 필수 | ✅ 필수 |
| 상장여부 | ✅ 필수 | ✅ 필수 |
| 사업보고서 제출 | ✅ 필수 | ❌ 숨김 |
| GAAP | ✅ 필수 | ❌ 숨김 |
| 연결재무제표 | ✅ 필수 | ❌ 숨김 |
| 연결자회사수 | ✅ 필수 | ❌ 숨김 |
| 내부회계관리제도 | ✅ 필수 | ❌ 숨김 |
| 초도/계속감사 | ✅ 필수 | ❌ 숨김 |

비감사에서 숨겨진 6개 필드는 **UI 에서 보이지 않지만 DB 컬럼은 NULL/기존값 보존**. 서비스 타입을 AUDIT 로 되돌리면 이전 값 복원.

**2-2. 프론트 구현 전략**

`frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx` 의 Step 1 JSX 에서:

```tsx
const isAudit = project.service_type === "AUDIT";
// 각 SelectField 를 { !isAudit && "숨김" } 또는 { isAudit || isAlways일때 } 로 감쌈
```

필수 validation 도 같은 조건으로 완화. 기존 validator 함수(있다면) 에 audit-only 필드 리스트 매칭.

**2-3. 백엔드 validation 연동**

`POST /budget/projects` 생성 시 pydantic 모델에서 비감사 필드는 Optional 로 풀어준다. 기존 AUDIT 전용 검증은 `service_type == "AUDIT"` 분기에만 적용.

### 3. Step 2 — Activity 매핑 (#13, #16)

**3-1. 현재 구조**

`project_members.activity_mapping` 에 하드코딩 4개 중 하나 저장 (재무제표기말감사/분반기검토/내부통제감사/IT감사). 모든 service_type 에서 동일 드롭다운.

**3-2. 변경**

드롭다운 소스를 service_type 별로 분기:
- `AUDIT` → 기존 4개 하드코딩 유지
- 비감사 → `GET /master/activity-mapping?service_type={code}` 결과의 `category` 고유값 리스트 (Excel의 **대분류 명**)

예 (ESG):
- `ESG 컨설팅` (단일 대분류)
- 드롭다운에 이것 하나만 → 선택 강제성 낮음

(통상자문):
- 대분류 목록이 여러 개(Excel 기준 확인). 예: `통상자문-기업자문`, `통상자문-규제자문` 등
- 실제 값은 Excel import 결과로 자동 채워짐

**3-3. 선택사항 완화 (#16)**

`service_type !== "AUDIT"` 일 때 UI 상 optional 필드. 저장 시 empty string 허용. 나중에 Step 3 에서 "행 추가" 할 때 activity 정보로 부가 필터링이 가능하면 좋지만, S1 scope 에선 단순화.

### 4. 서비스 분류 리셋 버그 (#27, #28)

**4-1. 재현 경로**

사용자가 Step 1 에서:
1. service_type 을 `ESG` 로 변경
2. 프로젝트 검색 버튼 클릭
3. Azure 에서 찾은 프로젝트 row 클릭
4. → `setProject` 의 spread 가 업데이트하지만 Azure 응답에 `service_type` 없으므로 기존값이 보존되어야 정상

**4-2. 실제 버그 위치**

`budget-input/[project_code]/page.tsx`:

`ProjectSearchModal` 의 onSelect 핸들러에 다음 로직이 있음 (라인 ~1229-1261, 실제 확인 필요):

```tsx
setProject({
  ...project,  // 기존 state (service_type="ESG" 포함)
  project_code: p.project_code,
  project_name: p.project_name,
  ...
  // 여기서 service_type 키를 직접 할당하지 않음
})
```

근데 `p` 객체에 `service_type=undefined` 가 포함된 경우, spread 가 `undefined` 로 덮어쓸 수 있음. 또는 상위 컴포넌트에서 useEffect 가 "프로젝트 정보 변경 시 default 값 재설정" 로직을 수행할 가능성.

**4-3. 수정 방안**

- `ProjectSearchModal` onSelect 핸들러에서 명시적으로:
  ```tsx
  setProject((prev) => ({
    ...prev,
    ...p,
    service_type: prev.service_type || p.service_type || "AUDIT",  // 보존 우선
  }))
  ```
- 관련 useEffect 가 service_type 을 덮어쓰지 않는지 전수 검토
- 초기 프로젝트 로드(기존 Budget 편집) 시에는 DB 값 사용 — 그 경로는 영향 없음

**4-4. E2E 회귀 테스트**

Playwright 시나리오:
1. /budget-input/new 접속
2. service_type 을 `ESG` 로 변경
3. 클라이언트 → 프로젝트 검색 → 아무 프로젝트 선택
4. service_type 이 여전히 `ESG` 인지 assertEqual

### 5. Step 3 "+ 행 추가" 버그 (#47)

**5-1. 근본 원인**

`service_type=TRADE` 로 프로젝트 생성 후 Step3 진입 → `/master/tasks?service_type=TRADE` 호출 → 현재 DB 에 row 없음 → `categories` 배열 empty → "+ 행 추가" 모달 열려도 대분류 드롭다운이 비어서 저장 불가.

**5-2. 수정**

§1 의 데이터 시드로 자동 해결. 통상자문은 Excel 에서 38 activity → 대분류 약 4~5개 추출 → dropdown 정상 표시.

**5-3. 추가 방어**

`categories` empty 일 때 "+ 행 추가" 버튼 자체를 disabled + 툴팁 "해당 서비스의 관리단위가 아직 설정되지 않았습니다. 관리자에게 문의하세요." 표시. 데이터 시드가 유실된 경우 사용자에게 명확한 안내.

### 6. 클라이언트 정보 자동입력 (#55)

**6-1. 신규 백엔드 엔드포인트**

```
GET /api/v1/budget/clients/{client_code}/info
  require_login
  response:
    {
      "client_code": "...", "client_name": "...",
      "industry": "...", "asset_size": "...", "listing_status": "...",
      "business_report": "...", "gaap": "...", "consolidated": "...",
      "subsidiary_count": "...", "internal_control": "...",
      "initial_audit": "..."
    }
  404 if not found
```

기존 `/search_clients` 검색 결과에 이미 모든 필드가 있지만, 클라이언트 선택 이후 재조회가 필요한 경우 (예: 서비스 타입 변경 후) 를 위한 단건 조회.

**6-2. 프론트 자동 채움**

클라이언트 선택 modal 의 onSelect 에서 `client_code` 기반으로 서비스 호출:
```tsx
const info = await fetchAPI(`/api/v1/budget/clients/${code}/info`);
setClient((prev) => ({
  ...prev,
  ...info,
  // 사용자가 직접 수정한 필드는 보존 (optional: key 별로 prev 우선)
}));
```

기본 전략: **빈 필드만 채우고 이미 값이 있으면 그대로**. 사용자가 수동 입력한 내용이 자동입력으로 덮어써지지 않도록.

**6-3. 초도/계속 감사 필드 (#55 전반)**

비감사에선 §2 에서 완전히 숨김. DB 에는 기존값 보존. UI 필수 제거로 #55 일차 해결.

### 7. 마이그레이션 전략

1. Alembic `004` — `service_task_master` 에 컬럼 5개 추가 (`activity_subcategory`, `activity_detail`, `budget_unit`, `role`, `source_file`)
2. 백엔드 배포
3. 관리자 1회 호출: `POST /api/v1/admin/sync-non-audit-activities` — 388 rows insert
4. 프론트 배포
5. 비감사 PM 에게 알림 — Step1 UI 가 축소되었음

기존 감사(AUDIT) 플로우는 변경 없음 — 모든 변경은 `if service_type === "AUDIT"` 분기의 "else" 브랜치 확장.

### 8. 테스트 플랜

**백엔드 pytest** (`backend/tests/`):

- `test_non_audit_activity_parser.py`
  - `parse_non_audit_activities(path)` — fixture xlsx 파일로 7 sheets × row 수 검증
  - 시트명 매핑 정확성
  - 빈 row 스킵
  - 컬럼 오프셋이 다른 시트(ESG 35 rows × 8 cols vs 회계자문 80 × 17 cols) 둘 다 처리

- `test_non_audit_activity_import.py`
  - `import_non_audit_activities(db, fixture_path, truncate=True)` — 실제 DB insert
  - truncate=True 시 기존 row 가 지워지는지
  - service_type 별 row 수 검증
  - `GET /master/activity-mapping?service_type=ESG` 반환 확인

- `test_admin_sync_non_audit.py`
  - Admin 세션 → POST → 200, 반환 by_service_type
  - Non-admin → 403

- `test_clients_info_endpoint.py`
  - `GET /clients/{code}/info` — 존재/부재 케이스

**Playwright E2E** (`frontend/tests/`):

- `task-s1-nonaudit-step1.spec.ts`
  - service_type=ESG 설정 → Step1 에 필드 3개만 보임
  - service_type=AUDIT 로 되돌리면 9개 필드 다시 표시
  - 비감사일 때 필수 validation 통과 (3개만 채워도 다음 단계 가능)

- `task-s1-service-type-reset.spec.ts`
  - /budget-input/new → service_type = ESG 변경 → 클라이언트 검색 → 프로젝트 검색 → 임의 프로젝트 선택 → service_type 이 여전히 ESG

- `task-s1-nonaudit-step2.spec.ts`
  - service_type=ESG 로 Step 2 → activity_mapping 드롭다운이 비어있지 않고 "ESG 컨설팅" 을 포함
  - 비어두고 다음 단계로 이동해도 경고 없음

- `task-s1-nonaudit-step3.spec.ts`
  - service_type=TRADE → Step 3 → "+ 행 추가" 클릭 → 모달의 대분류 드롭다운에 통상자문 카테고리 표시
  - 행 추가 후 저장 가능

- `task-s1-client-autofill.spec.ts`
  - 클라이언트 선택 → Step1 의 `industry`, `asset_size`, `listing_status` 가 자동 채워지는지
  - 이미 사용자가 값 입력한 필드는 덮어써지지 않는지

### 9. 성공 기준

- 비감사 PM 3명 (정원석/신승엽/윤여현 등) 수기 검증: Step1~3 전 구간 오류 없이 프로젝트 생성 가능
- 7개 비감사 service_type 별로 `/master/activity-mapping` 이 각각 다른 목록 반환
- Playwright 시나리오 5개 전부 통과
- 감사(AUDIT) 플로우 regression 없음 — 기존 Playwright 테스트 11개 + 백엔드 pytest 54개 동일하게 green

## Open Questions

- ESG 시트(35 rows × 8 cols) 와 회계자문 시트(80 rows × 17 cols) 처럼 컬럼 오프셋이 다름 — parser 가 header row 를 동적으로 읽으면 충분한지 구현 중 재검증
- "감사업무 Activity 표준화" 시트(311 rows) 와 " - " 시트(311 rows 중복) 의 감사 activity 데이터는 이번 범위에 넣지 않음 — 기존 `DEFAULT_BUDGET_UNITS` 와 다른 체계이므로 별도 논의 필요 (S5 혹은 그 이후)
- `ServiceTaskMaster` 의 기존 `task_name` 과 새 `activity_detail` 중복 이슈 — 장기적으로 `task_name` 은 legacy 로 두고 `activity_detail` 로 수렴 (S1 에선 둘 다 채움)

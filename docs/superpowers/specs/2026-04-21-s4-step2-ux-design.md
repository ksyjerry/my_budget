# S4 — Step 2 구성원 입력 UX 개선

**Date:** 2026-04-21
**Status:** Approved (brainstorm)
**Sub-project:** S4 (of 7) — 2026-04-20 사용자 피드백 45건 분할안의 다섯 번째 단계
**Addresses feedback items:** #39, #40, #46, #54

## Context

Budget 입력 Step 2(구성원) 의 사용성 문제 4건을 처리한다. 범위가 작지만 그 중 하나(#40 Excel import/export) 는 신규 기능이라 설계에서 scope 를 좁혀야 한다.

## Goals

1. `/employees/search` 에 퇴사/휴직 필터 + Step 2 에서 비정상 사번 입력 시 즉시 에러 (#39)
2. Step 2 구성원 목록 Excel export + import (#40) — 최소 4 컬럼 (`empno`, `name`, `role`, `grade`)
3. Step 2 → Step 1 "이전" 이동 시 상태 보존 (#46) — 실제 reset 원인 조사 후 제거
4. EmployeeSearch 자동완성에서 Enter 로 첫 결과 선택 (#54)

## Non-Goals

- Excel import 에서 지원 구성원(Fulcrum/RA/Specialist) 시간 편집 — 구성원 목록만
- 퇴사/휴직 인원의 역사적 Budget 레코드 삭제 — 신규 추가만 차단
- Step 2 에서 Step 3 이동 시 reset 로직 변경 (#46 은 "이전" 방향만)
- 다른 UI 필드 자동완성 (#54 는 EmployeeSearch 만)

## Feedback → 설계 매핑

| No | 사용자 | 요지 | 대응 |
|---|---|---|---|
| #39 | 서보경 | 퇴사/휴직 인원 입력 시 에러 | §1 |
| #40 | 서보경 | Step 2 Excel import/export | §2 |
| #46 | 신승엽 | 이전 단계 이동 시 reset | §3 |
| #54 | 김지민 | Enter 로 첫 결과 선택 | §4 |

## Design

### 1. 퇴사/휴직 인원 검증 (#39)

**백엔드 — `/employees/search`**

`backend/app/api/v1/budget_input.py:149` 의 `search_employees` 함수에서:
- `emp_status == '재직'` 행만 기본 반환
- 응답에 `emp_status` 필드 포함 (프론트에서 상태 표시용)

**프론트엔드 — Step 2 추가 행 로직**

`frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx` 의 Step 2 구성원 추가 로직:
- 새 구성원 empno 입력 시 `/employees/search?q={empno}` 정확 일치 호출
- 결과 없거나 `emp_status` 가 재직 아니면 **alert** 표시: `"사번 ${empno} 은(는) 현재 재직 중인 직원이 아닙니다. 퇴사/휴직 상태이거나 사번이 존재하지 않습니다."`
- 추가 거부

### 2. Excel import/export (#40)

**Export 엔드포인트**

```
GET /api/v1/budget/projects/{project_code}/members/export
  require_login + 본인 프로젝트 접근 권한
  → openpyxl 로 4컬럼 Excel 생성
  컬럼: empno | name | role | grade
  기존 project_members 행을 그대로 export
```

**Import 엔드포인트**

```
POST /api/v1/budget/projects/{project_code}/members/upload
  require_elpm + assert_can_modify_project
  multipart file upload (Excel)
  → openpyxl parse → empno 별로 validate (재직 중) → upsert project_members
  응답: {"imported": n, "skipped": [{"empno": "...", "reason": "inactive"}, ...]}
```

**Template**: 첫 행은 header, 2행부터 데이터. 기존 구성원 전체 replace (truncate + insert) 또는 upsert 중 — **truncate + insert** 로 단순화 (사용자가 "일괄 수정" 원한 의도).

**프론트엔드 UI**:
- Step 2 상단에 `[Excel 다운로드]` + `[Excel 업로드]` 버튼 2 개
- 다운로드: 현재 구성원 Excel 다운로드
- 업로드: 파일 선택 → 업로드 → 결과 alert + 목록 재로드

### 3. 이전 단계 이동 시 상태 보존 (#46)

**조사 필요**: 현재 코드(`setStep(step - 1)`) 만으로는 reset 이 일어나지 않아야 한다. 실제 재현 후 원인 특정:

가능한 원인:
- `useEffect` dependency 가 `step` 이라 state 가 초기화됨
- `Step2Members` 같은 sub-component 가 `step` 에 따라 unmount → 내부 state 손실
- 부모에서 key={step} 사용으로 리렌더 시 재초기화

**수정 방향**: 재현 후 해당 로직 찾아 수정. 실제 state 는 `BudgetWizardPage` 의 `members`, `templateRows` 등 top-level state 이므로 그걸 참조한다면 서브컴포넌트 unmount 와 무관하게 보존되어야 함.

### 4. Enter 로 첫 자동완성 결과 선택 (#54)

**파일**: `frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx:1717` 의 `EmployeeSearch` 컴포넌트

**변경**:
```tsx
<input
  onChange={...}
  onFocus={...}
  onKeyDown={(e) => {
    if (e.key === "Enter" && results.length > 0) {
      e.preventDefault();
      onSelect(results[0]);
    }
  }}
/>
```

검색 결과 첫 번째 인원이 바로 선택됨. 선택 후 드롭다운 닫힘.

### 5. 테스트 플랜

**백엔드 pytest:**

- `test_employees_search_filter.py`
  - 퇴사 직원 (emp_status != '재직') 은 기본 검색에서 제외
  - 응답에 `emp_status` 필드 포함
- `test_members_upload_export.py`
  - Export → 생성된 Excel 의 헤더 검증 + 기존 구성원 수 일치
  - Upload → 4컬럼 샘플 파일 parse → DB 에 반영
  - 비재직 empno 는 skipped 로 분리

**Playwright E2E (API-level):**

- `task-s4-members-upload.spec.ts` — export → 파일 반환 content-type xlsx
- `task-s4-employees-search-active.spec.ts` — 검색 결과 모두 재직자
- `task-s4-employees-search-inactive-empno.spec.ts` — 검증 거부

### 6. 성공 기준

- 퇴사/휴직 empno 입력 시 alert 노출 (#39)
- Step 2 Excel 다운로드/업로드 동작 (#40)
- 이전 단계 클릭 시 Step 1 입력값 그대로 (#46)
- EmployeeSearch 검색 후 Enter 로 첫 결과 바로 선택 (#54)
- S0~S3 회귀 없음

## Open Questions

- #46 실제 재현 방법 구체화 필요 (브라우저 환경, 특정 조건) — 구현 시 탐색
- Excel import 시 기존 FLDT 구성원 외 지원 구성원(Fulcrum, RA, Specialist) 까지 교체할지 — **이번 범위는 FLDT 만 truncate/insert**. 지원 구성원은 별도 유지.
- `project_members.role` 필드에 저장될 값의 카테고리화 — "FLDT" 혹은 빈 문자열 기본값

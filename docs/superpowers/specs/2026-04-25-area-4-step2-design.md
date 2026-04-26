# 영역 4 — Step 2 (구성원) (Area 4 Spec)

**작성일**: 2026-04-25
**메타 프레임워크**: [2026-04-25-feedback-0425-systematic-framework-design.md](2026-04-25-feedback-0425-systematic-framework-design.md)
**의존 영역**: 영역 1 + 2 + 3 (`s7/area-4-step2` 분기 from `s7/area-3-step1`)
**의존 POL**: 없음 (단 #102 NS/TBD/associate 도입은 본 영역 페이즈 A에서 사용자 컨펌)

---

## 1. 목적과 결과물

### 1.1 목적
Step 2 (구성원) 화면의 6개 결함 fix:
- **#72** Step 2 Excel export 화면과 상이 + "Empno" → "사번" 컬럼명
- **#73** Excel upload 시 사번/이름만으로도 업로드 가능 (직급/팀은 employees 마스터에서 자동 채움)
- **#87** Excel upload 검증을 행 단위 누적 → 사용자에게 명확 표시
- **#88** EmployeeSearch 결과에 team_name (또는 department) 추가 (동명이인 구분)
- **#102** TBD / NS / Associate 등 placeholder empno 지원
- **#103** Fulcrum / RA / Specialist 자유 입력 → enum dropdown 변경

### 1.2 Deliverables
- `backend/app/api/v1/budget_input.py`:
  - `members/export` — 컬럼명 표준화 (사번/이름/역할/직급/팀)
  - `members/upload` — 행 단위 누적 errors[] 응답 + partial column 지원 (사번+이름만 필수, 나머지는 employees에서 자동 채움)
  - `employees/search` — `team_name` 응답 필드 추가 (employees JOIN teams)
- `frontend/[project_code]/page.tsx`:
  - Step2Members EmployeeSearch — 검색 결과에 팀명 column 표시
  - Step2Members 지원 구성원 (Fulcrum/RA/Specialist) — 자유 입력 → `<select>` enum
  - Step2Members 추가 옵션: TBD / NS / Associate placeholder (별도 button)
  - Excel upload 결과 모달 — errors[] 표시
- 신규 회귀 테스트: 5건
- docs: qa-checklist + retro

### 1.3 비목표
- Step 1/3 변경
- AX/DX Transition 목표치 입력 화면 (별도 backlog)
- TBD/NS placeholder 의 사번 형식 정책 (사용자 컨펌만)

---

## 2. 페이즈 A — 진단

### 2.1 결함 분류표

| ID | 표면 증상 | 근본 원인 카테고리 | 위치 | 가드 |
|---|---|---|---|---|
| #72 | Export 화면과 상이 + "Empno" 컬럼명 | RC-EXPORT-COLUMN-DRIFT: 백엔드 export header가 화면 표시명과 다름 | `budget_input.py:622-` `members/export` | E2E + 단위 |
| #73 | Excel 업로드 시 직급/팀 누락하면 reject | RC-UPLOAD-STRICT: 모든 컬럼 필수 | `budget_input.py:1136-` `members/upload` | E2E (사번+이름만 업로드 → 성공) |
| #87 | 업로드 실패 시 어디가 문제인지 모름 | RC-UPLOAD-FIRST-FAIL: 첫 실패에서 멈춤 | 동일 위치 | E2E (다양한 결함 행 → 행 번호별 에러) |
| #88 | 동명이인 검색 결과 구분 어려움 | RC-SEARCH-MISSING-TEAM: 응답에 team 없음 | `employees/search:152-` | 단위 |
| #102 | 신입사원 정보 입력 시 사번 없음 | RC-NEW-EMPNO-NOT-SUPPORTED: TBD/NS placeholder 직원 부재 | EmployeeSearch + members 처리 | 단위 + E2E |
| #103 | Fulcrum/RA/Specialist 자유 입력 | RC-ROLE-FREE-TEXT: enum 강제 없음 | Step2Members 지원 구성원 영역 | 단위 + E2E |

### 2.2 메타원인
- **RC-EXPORT-IMPORT-DRIFT**: export 가 import 라운드트립 보장 안 함 — 영역 1 round-trip property test (Excel template 만 적용) 가 members 까지 확장되어야 함. 영역 4 페이즈 B에 추가.
- **RC-PLACEHOLDER-EMPNO**: TBD/NS 같은 비-실제-직원 데이터 모델이 부재 — 신규 enum도입 (foreign key가 nullable 하면 대안)

### 2.3 의존 POL: 없음
페이즈 A 사용자 컨펌만 필요:
- TBD/NS/Associate placeholder 구현 방식 (placeholder employee 시드 vs ProjectMember.empno nullable + role 분기)

### 2.4 신규 POL 후보: 없음 (단 #102 구현 방식 결정은 페이즈 A 사용자 컨펌)

### 2.5 페이즈 A DoD
- [ ] 분류표 누락 0
- [ ] #102 구현 방식 컨펌 (제 추천: ProjectMember.empno=NULL 허용 + role="TBD"|"NS"|"Associate")

---

## 3. 페이즈 B — 안전망 (RED tests)

5개 신규 테스트:
1. `frontend/tests/regression/test_step2_member_search_team_column.spec.ts` — #88 가드
2. `frontend/tests/regression/test_step2_excel_upload_partial_columns.spec.ts` — #73 가드
3. `frontend/tests/regression/test_step2_excel_upload_error_aggregation.spec.ts` — #87 가드
4. `frontend/tests/regression/test_step2_placeholder_member.spec.ts` — #102 가드 (TBD/NS/Associate)
5. `backend/tests/regression/test_members_export_columns.py` — #72 가드 (export 헤더 = 사번/이름/역할/직급/팀)

---

## 4. 페이즈 C — 구조 정리 (skip — 신규 추상화 불필요)

---

## 5. 페이즈 D — Fix

| ID | Fix |
|---|---|
| #72 | `members/export` 헤더: ["사번", "이름", "역할", "직급", "팀"] 로 표준화 |
| #73 | `members/upload` 행 처리: 사번+이름만 필수. 직급/팀 누락 시 employees 마스터 lookup |
| #87 | `members/upload` 응답: `{imported: [], skipped: [{row, reason}], errors: [{row, col, error}]}` |
| #88 | `employees/search` 응답에 `team_name` (또는 `department`) 추가. 프론트 검색 결과 column 추가 |
| #102 | (페이즈 A 컨펌 후) ProjectMember 에 placeholder role 지원. 프론트에 "TBD/NS/Associate 추가" 버튼 |
| #103 | Step 2 지원 구성원 영역 — Fulcrum/RA-Staff/Specialist `<select>` 로 변경 (POL-06 (a) 의 영역 5 컴포넌트와 분리) |

---

## 6. 페이즈 E — 검증
3 layers (영역 1~3과 동일 패턴)

---

## 7. 페이즈 F — 회고
산출물: `docs/superpowers/retros/area-4.md`

---

## 8. 리스크
| 리스크 | 완화 |
|---|---|
| TBD/NS placeholder 도입이 다른 화면(Overview 등) 에 부작용 | placeholder empno (예: TBD-001) 가 employees 마스터에 존재하지 않아 다른 화면 join 시 NULL — 그 자체로 대안 동작 가능. 영역 6 진입 전 점검 |
| Excel upload 응답 schema 변경 (errors[] 신규) | frontend 가 새 응답 처리 필요 — Task에 포함. 기존 호출자 (CLI 등) 없으므로 호환성 우려 낮음 |
| 누적 회귀 가드 깨짐 | 페이즈 E Layer 1에서 영역 1+2+3 안전망 재실행 |

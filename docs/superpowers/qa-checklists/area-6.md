# Area 6 — Manual QA Checklist

**Tester:** ___ **Date:** ___

## Group A — POL-01 display_budget 활성화
- [ ] Overview KPI "Staff 총 Budget time" — AX/DX 제외 Budget 표시 확인
- [ ] Overview 프로젝트 테이블 Budget 컬럼 — axdx_excluded_budget() 값과 일치
- [ ] Budget Tracking 테이블 Budget 컬럼 — display_budget(view=TRACKING) 적용
- [ ] Project별 Details Budget 컬럼 — display_budget(view=PROJECT) 적용

## Group B — POL-08 Budget Tracking 권한
- [ ] EL 로그인 → /projects/tracking 페이지 접근 가능
- [ ] admin 로그인 → /projects/tracking 페이지 접근 가능
- [ ] PM 로그인 → /projects/tracking 403 반환 확인 (EL 아닌 경우)
- [ ] 비인증 → /api/v1/tracking GET 403 반환

## Group C — #93 QRP TMS Actual 포함
- [ ] QRP 배정된 프로젝트에서 QRP 인원의 TMS actual이 EL/PM/QRP Time 테이블에 표시
- [ ] qrp_hours=0 이더라도 qrp_empno 있으면 TMS actual 조회됨
- [ ] Overview EL/PM/QRP 합계 이전과 동일 (회귀 없음)

## Group D — #94 Budget 없는 인원 Actual
- [ ] Staff Time 테이블 — Budget 배정 없이 TMS actual 있는 인원 표시
- [ ] budgeted_empnos ∪ tms_empnos - role_empnos = staff_empnos 범위

## Group E — #65 인원 이름 fallback
- [ ] 사번은 있으나 이름 미등록 인원 → "이름 미등록 ({사번})" 형식으로 표시
- [ ] 인별 목록 (assignments) + 상세 (assignments/{empno}) 모두 적용

## Group F — #78 Content-Disposition UTF-8
- [ ] Budget Template Excel 다운로드 → 브라우저 파일명 정상 표시 (한글 포함)
- [ ] 구성원 Excel 다운로드 (members_{project_code}.xlsx) 브라우저 파일명 정상
- [ ] Blank Template 다운로드 → 파일 저장 시 정상 파일명

## Group G — #77 service_type 분류
- [ ] Filter bar "감사구분" 드롭다운 → [감사] 감사, [비감사] 회계자문, [비감사] ESG 등 표시
- [ ] AUDIT → "감사", 나머지 → "비감사" display_category 정상 표시
- [ ] 서비스 타입 필터 적용 → 해당 서비스타입 프로젝트만 조회

## Group H — #95 연월 동적 생성
- [ ] Overview 연월 드롭다운 → 2025-04 ~ 2026-03 12개 옵션 표시
- [ ] 2025년 4월 ~ 12월, 2026년 1월 ~ 3월 순서 정상
- [ ] 연월 선택 시 데이터 필터 적용

## Group I — #96 프로젝트 cascading
- [ ] 프로젝트 선택 → EL/PM 필터 값 유지 (기존 선택 보존)
- [ ] 프로젝트 해제 → EL/PM 필터 초기화

## Group J — 누적 회귀 (Areas 1~5)
- [ ] 모든 이전 영역 결함 fix 유지
- [ ] backend pytest 234+ passed 0 failed
- [ ] Playwright 74+ passed 0 failed
- [ ] CI 5 jobs 녹색 (check-no-direct-number-input, check-no-direct-budget-arithmetic, check-docker-compose-no-dev)

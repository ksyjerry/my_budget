# Area 5 — Manual QA Checklist

**Tester:** ___ **Date:** ___

## Group A — Excel I/O
- [ ] 저장 후 다운로드 시 입력 내용 모두 표시
- [ ] 초기화 후 저장 → 다운로드 시 빈 상태
- [ ] 12개월 모두 컬럼 표시 (값 0 인 월도)
- [ ] 업로드 후 비활성 행 유지
- [ ] 일부 단위 삭제 후 업로드 → 삭제된 단위는 비활성, 다른 단위 유지
- [ ] 화면-Excel 관리단위 순서 일치

## Group B — 초기화
- [ ] 초기화 후 step 이동 → 재진입 시 깨끗
- [ ] 초기화 버튼 → backend POST /template/reset 호출 확인 (네트워크 탭)

## Group C — V 토글
- [ ] "전체 V 체크" 버튼 클릭 → 모든 row 체크
- [ ] 다시 클릭 ("전체 V 해제") → 모두 해제

## Group D — Layout
- [ ] 합계 행 하단 "합계" 라벨 열이 직급 열까지 포함하여 정렬 정상
- [ ] 합계 숫자가 합계 열(6번째 컬럼)에 정확히 표시

## Group E — AI Assist
- [ ] 비감사 service_type → AI 추천 결과 표시 (관리단위 매핑)
- [ ] 계속감사 → 초도감사 0 추천
- [ ] 추천 결과 천단위 표시
- [ ] AI 검증 중 step 이동 → confirm 모달
- [ ] 등록오류 alert 에 IP 미노출 (예: "10.137" 미노출)
- [ ] alert 에 "localhost" 미노출

## Group F — 금융업 시드 + 데이터 모델
- [ ] 감사 service_type 프로젝트 → Step 3 에 금융업 관련 budget_unit 노출 (대출채권, 보험계약부채 등 70+ 행)
- [ ] subcategory_name 별도 표시 (POL-03)

## Group G — 정책
- [ ] 중복 인원 추가 시 일관 처리
- [ ] Step 3 toolbar 에 종료월 입력 → 저장 → 재로드 시 유지

## Group H — Template
- [ ] Step 3 "빈 Template" 버튼 → 빈 Excel 파일 다운로드
- [ ] 빈 Template Excel budget_unit 열 클릭 시 드롭다운 목록 표시 (#119)
- [ ] Template 업로드 에러 시 IP 미노출

## 누적 회귀 (Areas 1+2+3+4)
- [ ] 모든 이전 영역 결함 fix 유지
- [ ] CI 5 jobs 녹색

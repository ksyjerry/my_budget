# Area 4 — Manual QA Checklist (Phase E Layer 2)

**Tester:** ___ **Date:** ___

## #72 Export 컬럼명
- [ ] Step 2 Excel export 다운 → 헤더가 사번/이름/역할/직급/팀 (한글)
- [ ] "Empno" 영어 컬럼명 사라짐

## #73 #87 Excel upload
- [ ] Excel 에 사번+이름만 입력 → 업로드 성공 (직급/팀 자동 채움)
- [ ] Excel 에 잘못된 행 다수 → 업로드 응답에 모든 오류 행 표시 (첫 오류에서 멈추지 않음)

## #88 동명이인 팀 표시
- [ ] EmployeeSearch 결과에 팀명 표시 — 동명이인 구분 가능

## #102 Placeholder member
- [ ] "+ TBD" / "+ NS" / "+ Associate" 버튼 노출
- [ ] 클릭 시 placeholder 행 추가

## #103 지원 구성원 enum
- [ ] Fulcrum/RA-Staff/Specialist 입력이 `<select>` dropdown
- [ ] 자유 텍스트 입력 불가

## 누적 회귀 (영역 1+2+3)
- [ ] 회귀 7건 + 영역 2 결함 + 영역 3 결함 모두 fix 유지
- [ ] CI 5 jobs 녹색

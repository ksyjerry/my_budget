# Area 6 Retrospective

**Completed:** 2026-04-25
**Author:** Claude (with user owner-provisional approvals)

## What worked
- POL-01 (b) + POL-08 (b) provisional 적용으로 즉시 진입 가능했음
- display_budget() 활성화 — 영역 1에서 미리 stub으로 만들어둔 인터페이스가 그대로 작동
- 누적 회귀 가드 — Area 1-5 안전망 모두 GREEN 유지 (단 1건 KPI consistency 테스트는 POL-01 변경에 따른 의도된 갱신)
- batched dispatch 패턴 — 3 batch로 Area 6 완료

## What didn't
- 첫 번째 Batch 2 dispatch에서 stream timeout — 56 tool uses 후 partial response. 다음 batch에서 직접 진단 + 추가 commit 필요했음
- Frontend 도넛 cascading (#03 시트 #7 #8) 완전한 구현은 deferred (state lift 복잡도 vs 우선순위)
- POL-02 통상자문 Description UI는 schema만 준비 (subcategory_name) — UI는 별도 mini-cycle 권장

## Surprises (new defect classes discovered)

| class | how detected | how to prevent |
|---|---|---|
| Test consistency assumptions tied to Budget definition | KPI total = project budget sum 가정한 테스트가 POL-01 변경 시 깨짐 | 의미 변경 시 인접 테스트 정합성 자동 검증 — 별도 회귀 가드 추가 권장 |

## POL-01 (b) 적용 효과
- 모든 view (overview KPI, project table, tracking, summary) 가 동일 정의 (`axdx_excluded_budget`) 사용
- 사용자 혼동 제거 — KPI 와 project table 의 Budget 의미 명확화
- `budget_definitions.py.display_budget()` 활성화 — 영역 1에서 만든 single source of truth 인터페이스 검증 완료

## POL-08 (b) 적용 효과
- Budget Tracking 화면 권한 명확화: EL + admin (PM/Staff 차단)
- partner_access_config 가 이미 (b) 와 정합 — 별도 endpoint 가드 변경 불필요
- permission matrix fixture에 tracking endpoints 추가 — Area 1 권한 매트릭스 회귀 가드 확장

## Tests added
- `backend/tests/regression/test_display_budget_pol01.py` (5 tests, all GREEN)
- `backend/tests/regression/test_overview_data_completeness.py` (3 skip — manual)
- `backend/tests/regression/test_tracking_permission_pol08.py` (4-6 cases, GREEN)
- `frontend/tests/regression/test_overview_*.spec.ts` (skip — manual)
- KPI consistency 테스트 갱신 (`test_kpi_total_consistency`)

## 외부 결정자 컨펌 진행
- POL-01: 김동환 외부 컨펌 대기 — 4/27 회의 권장
- POL-08: 김동환 외부 컨펌 대기

## Sign-off — S7 전체 사이클 종료
- [ ] All Phase E green
- [ ] User confirmed Area 6 ends
- [x] S7 메타 사이클 회고 작성 ([s7-meta-cycle.md](s7-meta-cycle.md))

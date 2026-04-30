# Area 2 Retrospective

**Completed:** ___
**Author:** ___

## What worked
- ...

## What didn't
- ...

## Surprises (new defect classes discovered)

| class | how detected | how to prevent in future areas |
|---|---|---|
| ... | ... | ... |

## Tests / scripts added — and what they protect against

- `frontend/tests/regression/test_budget_list_states_visibility.spec.ts` — protects against #79/#82 list filter regression
- `frontend/tests/regression/test_budget_list_search_case_insensitive.spec.ts` — protects against #121 case-sensitive search
- `frontend/tests/regression/test_workflow_pm_submit_el_approve.spec.ts` — POL-04 workflow E2E
- `backend/tests/regression/test_list_endpoint_pm_visibility.py` — list visibility unit
- `backend/tests/regression/test_workflow_endpoints.py` — submit/approve/unlock integration
- `backend/tests/test_workflow_service.py` — transition_status unit

## POL items added during Area 2

- POL-09 (TBA sync 권한 범위) — admin only로 시작했음. 사용자 컨펌 후 정식 등록 여부 결정

## POL-04 / POL-05 외부 결정자 컨펌 진행 상황

- POL-04: ___ (김동환 답변 / 미접수)
- POL-05: ___ (김미진 답변 / 미접수)

## budget_input.py 분해 부담

- 추가된 LOC: ___
- 영역 5에서 wizard 분해 시 같이 해야 할 작업: ___

## Sign-off — Area 3 진입 가능 여부

- [ ] All Phase E Layer 1/2/3 green
- [ ] User confirmed Area 2 ends

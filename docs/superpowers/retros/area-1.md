# Area 1 Retrospective

**Completed:** _________________
**Author:** _________________

## What worked
- ...

## What didn't
- ...

## Surprises (new defect classes discovered)

| class | how detected | how to prevent in future areas |
|---|---|---|
| ... | ... | ... |

## Tests / scripts / runbooks added — and what they protect against

- `scripts/ci/check-no-direct-number-input.sh` — protects against #70/#74 NumberField drift
- `scripts/ci/check-no-direct-budget-arithmetic.sh` — protects against #03 sheet Budget definition drift (영역 6)
- `scripts/ci/check-docker-compose-no-dev.sh` — protects against #67 dev mode in prod
- `frontend/tests/regression/*.spec.ts` (×7) — protects against the 7 known regressions
- `backend/tests/regression/test_permission_matrix.py` — protects against role-based access drift
- `backend/tests/regression/test_excel_roundtrip_template.py` — protects against #75/#105/#107/#114/#117 (영역 5)

## Migrations to feed back into Area 1 net (from later areas)

(Filled in by Areas 2~6 retros — Area 1 doesn't get this section initially.)

## POL items added during Area 1 (if any)

- ...

## Process improvements for next area cycle

- ...

## Sign-off — Area 2 진입 가능 여부

- [ ] All Phase E Layer 1/2/3 green
- [ ] Branch protection applied
- [ ] User confirmed Area 1 ends

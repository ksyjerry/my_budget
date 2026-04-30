# CI Grep Guards

Static checks that run in CI to prevent classes of regression.

## Scripts
- `check-no-direct-number-input.sh` — block `<input type="number">` in favor of NumberField
- `check-no-direct-budget-arithmetic.sh` — block ad-hoc Budget calc, force budget_definitions.py
- `check-docker-compose-no-dev.sh` — block `npm run dev` in production-targeted compose files

Each script exits 0 on pass, 1 on fail with offending lines printed.

Add a new script: write `check-X.sh`, chmod +x, register in `.github/workflows/ci.yml` under the `grep-guards` job.

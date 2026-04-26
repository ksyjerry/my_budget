# Area 2 — Final Verification (Task 19)

**Date:** 2026-04-25
**Final commit:** e3eb947
**Commits ahead of Area 1 (s7/area-1-safety-net):** 22

### Local results

#### Backend pytest
**203 passed / 10 skipped / 0 failed** (12.75s)

Breakdown (cumulative from Area 1 + Area 2):
- 190 Area 1 tests
- 6 workflow service tests (workflow.py unit)
- 4 list visibility tests (test_list_endpoint_pm_visibility.py)
- 3 workflow endpoint tests (test_workflow_endpoints.py)
= 203 total passing

#### Frontend Playwright (default + regression)
**77 passed / 6 failed (all known infra) / 8 skipped**

| Project    | Passed | Failed | Skipped | Notes |
|------------|--------|--------|---------|-------|
| default    | ~57    | 4      | ~5      | 4 known infra failures (prod-overlay, azure-sync ×2, ACT task count) |
| regression | ~20    | 2      | ~3      | 2 known infra failures (prod-overlay — requires production build) |

**Area 2 new regression tests** (all GREEN):
- `test_list_pm_visibility.spec.ts` — #79/#82 visibility PASS
- `test_budget_list_search_case_insensitive.spec.ts` — #121 search PASS (self-seeding via API)
- `test_workflow_pm_submit_el_approve.spec.ts` — #61/#98 POL-04 workflow PASS

**Known infra failures (not Area 2 regressions):**
- `[default] task-auth-prod-overlay` — requires production build
- `[default] task-azure-client-sync` — Azure SQL not reachable in local dev
- `[default] task-azure-employee-sync` — Azure SQL not reachable in local dev
- `[default] task-insurance-actuarial` — ACT task count mismatch (Area 1 known issue)
- `[regression] test_no_dev_overlay_prod` ×2 — requires production build (`npm run build`)

#### Grep guards
All 3/3 PASS:
- `check-no-direct-number-input.sh` — OK
- `check-no-direct-budget-arithmetic.sh` — OK
- `check-docker-compose-no-dev.sh` — OK

### Push & PR
- Push: SUCCESS — `origin/s7/area-2-budget-list` (new branch)
- Draft PR: https://github.com/ksyjerry/my_budget/pull/2 (base: s7/area-1-safety-net)

### Test fixes applied in Task 19
Two regression tests required fixes during final verification:

1. **test_workflow_pm_submit_el_approve.spec.ts** — Added `page.on('dialog', d => d.accept())` to auto-accept native `confirm()` dialogs on approve/unlock button clicks. The confirm was blocking the workflow from completing.

2. **test_budget_list_search_case_insensitive.spec.ts** — Added `beforeAll`/`afterAll` to self-seed/cleanup `SK텔레콤` project via backend API, so the test no longer relies on pre-existing DB data.

### Outstanding (Area 2 specific)
- POL-04 외부 결정자 컨펌 대기 (김동환)
- POL-05 외부 결정자 컨펌 대기 (김미진)
- POL-09 (TBA sync 권한) 사용자 컨펌 필요 (영역 2 페이즈 F 회고에서 결정)
- `test_no_dev_overlay_prod` (regression #67) — passes only against production build; deferred to CI/staging

### Hand-off to user
- Phase E Layer 2 manual QA: `docs/superpowers/qa-checklists/area-2.md`
- Phase E Layer 3: 사용자가 staging에서 PM submit / EL approve / unlock 직접 검증
- Sign-off → Area 2 closes → Area 3 진입 가능 (POL-04 의존 — provisional 유지 OK)

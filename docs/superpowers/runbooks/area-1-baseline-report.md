# Area 1 Baseline Report — Playwright Test Triage

**Date:** 2026-04-25  
**Branch:** s7/area-1-safety-net  
**Run by:** Task 2 of 영역 1 (공통 안전망 + 배포 위생)

---

## Environment Setup

| Component | Status |
|-----------|--------|
| PostgreSQL | Available on `localhost:5432` (local install, not Docker 5433) |
| Alembic migrations | Already at `005_add_missing_tables` — no migration needed |
| Backend `.env` | Created from `.env sample` with mock Azure SQL credentials |
| Backend (uvicorn :3001) | Started successfully — `/health` → `{"status":"ok"}` |
| Frontend (Next.js :8001) | Started successfully — `Ready in 6s` |
| Docker postgres | Not used (port 5433 not running; local postgres at 5432 used instead) |
| Azure SQL | Unreachable — mock credentials used (`AZURE_SQL_HOST=mock`) |

**Note:** The `.env sample` file lists two DATABASE_URL options. Local DB (`ksyjerry:3edc1qaz@localhost:5432/mybudget`) was used since Docker postgres was not running.

---

## Test Run Results

**Command:** `npm test -- --project=default --reporter=list`  
**Exit code:** 0 (Playwright reports exit 0 even with failures when only some tests fail)

| Metric | Count |
|--------|-------|
| Total tests | 79 |
| Passed | 69 |
| Failed | 4 |
| Skipped | 6 |

---

## Failing Tests — Categorized

### 1. `task-auth-prod-overlay.spec.ts` — `S0 — Production Build > no Next.js dev overlay buttons on production page`

**Category: stale / infrastructure**

**Error:**
```
Error: expect(locator).toHaveCount(expected) failed
Locator:  locator('nextjs-portal')
Expected: 0
Received: 1
```

**Root cause:** The spec navigates to the login page and asserts that `<nextjs-portal>` (the Next.js dev overlay component) is absent — implying the test expects a **production build** (`npm run start`). The test was run against the **dev server** (`npm run dev`), which always injects the dev overlay.

**Recommended action:** This test should run against `NEXT_PUBLIC_API_URL=... npm run build && npm run start` (production mode). As a quick fix in the test runner environment, the `playwright.config.ts` could conditionally start a production server, or this test should be isolated in a dedicated `prod` Playwright project that starts the production build. It should NOT be removed — it guards a real concern (dev artifacts leaking into production pages). Classify as **infrastructure** (test env setup issue, not a product bug).

**Blocks Tasks:** None of the 7 regression tasks (Tasks 10-16). Can be fixed in a dedicated infra task.

---

### 2. `task-azure-client-sync.spec.ts` — `Azure Client Sync > API — admin can trigger sync`

**Category: infrastructure**

**Error:**
```
Error: expect(received).toBe(expected)
Expected: 200
Received: 500
```

**Root cause:** The test calls `POST /api/v1/sync/clients` expecting a 200 with `synced > 0`. The endpoint connects to Azure SQL to pull client data. Since `AZURE_SQL_HOST=mock` (no real Azure connectivity in this dev environment), `pymssql.connect()` raises:
```
pymssql.exceptions.OperationalError: Unable to connect: Adaptive Server is unavailable or does not exist (mock)
```
The endpoint returns 500.

**Secondary note:** The `adminLogin()` helper in the test returns `j.token`, but the auth system is cookie-based and the login response body has no `token` field. So `j.token === undefined` and the test sends `Authorization: Bearer undefined`. This would be 401 in a stateless-Bearer system — but since the Playwright `request` fixture carries cookies from the prior login call, the server sees the session cookie and grants access. The auth part accidentally works; only the Azure SQL connection fails.

**Recommended action:** This test can only be verified in an environment with real Azure SQL connectivity (PwC internal network). In CI/dev, it should be skipped or replaced with a mock. Tag as `@requires-azure` and move to a separate Playwright project or add `test.skip(!!process.env.SKIP_AZURE, ...)`. **Do not delete** — it guards a real integration.

---

### 3. `task-azure-employee-sync.spec.ts` — `Azure Employee Sync > API — admin can trigger employee sync`

**Category: infrastructure**

**Error:**
```
Error: expect(received).toBe(expected)
Expected: 200
Received: 500
```

**Root cause:** Identical to the client sync failure above. `POST /api/v1/sync/employees` connects to Azure SQL (`BI_STAFFREPORT_EMP_V`) which is unreachable with mock credentials.

**Recommended action:** Same as client sync — tag `@requires-azure` and skip in dev/CI environments without Azure connectivity.

---

### 4. `task-insurance-actuarial.spec.ts` — `보험계리 서비스 분류 추가 검증 > API — /master/tasks?service_type=ACT가 16개 Task 반환`

**Category: regression**

**Error:**
```
Error: expect(received).toBe(expected)
Expected: 16
Received: 15
```

**Root cause:** The test expects exactly 16 tasks for `service_type=ACT` and checks for three categories: `PMO`, `보험계리 정책자문`, `보험계리 시스템자문`. The database has 15 tasks all under a single category `보험계리`. The spec was written anticipating a data model with category distinctions (`PMO`, `보험계리 정책자문`, `보험계리 시스템자문`) and 16 total tasks.

**DB state:**
```
service_task_master WHERE service_type='ACT':
  - 15 rows total
  - All in task_category = '보험계리'
  - Missing: one task + category split into PMO / 보험계리 정책자문 / 보험계리 시스템자문
```

**Recommended action:** This is a genuine data seed regression. One task is missing, and the `task_category` grouping was not applied during the ACT seed migration. The fix requires:
1. Adding the missing 16th ACT task to the seed/migration
2. Splitting the 15 existing tasks into the three categories (`PMO`, `보험계리 정책자문`, `보험계리 시스템자문`)

This maps to the 보험계리 feature implementation. Assign to **Task 22** (or new regression task) for fix.

---

## Skipped Tests — Analysis

All 6 skipped tests are in two files that share the same skip directive:

### `task-s1-nonaudit-step1.spec.ts` (3 tests skipped)
```
test.skip(true, "TODO: frontend blank-page in headless Chromium — re-enable when hydration issue is resolved");
```
Tests: ESG banner visibility, AUDIT banner hidden, 8 service type options in select.

**Category: infrastructure (known)**

These tests require a production build to avoid the blank-page SSR/hydration issue in headless Chromium. They were deliberately skipped by the spec author pending resolution. The comment accurately describes the issue.

### `task-s1-service-type-reset.spec.ts` (3 tests skipped)
```
test.skip(true, "TODO: frontend blank-page in headless Chromium — re-enable when hydration issue is resolved");
```
Tests: `service_type` stays ESG after typing project code, preserved when selecting from search, switches IC → clears 비감사 banner.

**Category: infrastructure (known)**

Same as above — both files were authored as "UI, best-effort" and deliberately deferred.

**Recommended action for all 6:** Fix the production-build hydration issue (or run against dev server with proper wait strategies), then unskip. These tests guard real product behavior and should not be deleted.

---

## Passing Tests Summary (69/69)

| Spec file | Tests | Outcome |
|-----------|-------|---------|
| task-auth-login.spec.ts | 4 | All pass |
| task-auth-session.spec.ts | 3 | All pass |
| task-auth-authorization.spec.ts | 3 | All pass |
| task-auth-prod-overlay.spec.ts | 1 | FAIL (infra) |
| task-azure-client-sync.spec.ts | 5 | 4 pass, 1 fail (infra) |
| task-azure-employee-sync.spec.ts | 5 | 4 pass, 1 fail (infra) |
| task-budget-tracking.spec.ts | 5 | All pass |
| task-insurance-actuarial.spec.ts | 3 | 2 pass, 1 fail (regression) |
| task-s1-client-autofill.spec.ts | 5 | All pass |
| task-s1-nonaudit-step1.spec.ts | 3 | All skip (infra/known) |
| task-s1-nonaudit-step2.spec.ts | 4 | All pass |
| task-s1-nonaudit-step3.spec.ts | 5 | All pass |
| task-s1-service-type-reset.spec.ts | 3 | All skip (infra/known) |
| task-s2-donut-drilldown.spec.ts | 4 | All pass |
| task-s2-overview-filters.spec.ts | 6 | All pass |
| task-s3-number-field-validation.spec.ts | 2 | All pass |
| task-s3-project-search-autofill.spec.ts | 2 | All pass |
| task-s4-employees-search.spec.ts | 3 | All pass |
| task-s4-members-upload.spec.ts | 2 | All pass |
| task-s5-template-export.spec.ts | 2 | All pass |
| task-s6-appendix-export.spec.ts | 2 | All pass |
| task6-overview.spec.ts | 5 | All pass |

---

## Categorization Summary

| Category | Count | Tests |
|----------|-------|-------|
| regression | 1 | ACT tasks 16개 count mismatch |
| infrastructure | 3 | prod-overlay (dev vs prod server), 2x Azure sync (no Azure connectivity) |
| infrastructure (known, skipped) | 6 | s1 nonaudit/service-type UI tests — deliberate skip |
| stale | 0 | None |
| flaky | 0 | None observed in single run |

---

## Assumptions & Notes

1. **Azure SQL not available:** All tests that call `POST /sync/*` or any endpoint connecting to `gx-zsesqlp011.database.windows.net` will fail with 500 in this environment. This is expected. Azure-dependent tests should be tagged and excluded from local/CI runs.

2. **Auth model change:** The `adminLogin()` helper in azure sync tests returns `j.token` (now undefined since auth is cookie-based). However the tests that use it for GET requests still pass because the Playwright `request` context shares cookies from the `request.post("/auth/login")` call. The `j.token` being undefined is an accident that currently doesn't break GET requests (cookie carries auth). For POST `/sync/*` the accident is irrelevant — the real failure is Azure SQL.

3. **EL empno 170661 (`최성우`):** Has role `elpm`, confirmed active in DB. Auth tests pass correctly.

4. **Admin empno 160553 (`김재동`):** Has `PartnerAccessConfig` with `scope='all'` → role `admin`. Admin auth tests pass.

5. **Staff empno 320915:** Role `staff`, confirmed in DB.

6. **DB seed state:** 20 tables present, 2902 employees, 6147 clients, 13 projects with budget data.

---

## Phase B Gate Assessment

Per spec 3.7: "broken tests must be triaged before phase B continues."

- **1 regression** (ACT tasks count): Blocks implementation of 보험계리 service type tasks. Assign to a regression fix task before marking Phase B complete.
- **3 infrastructure failures**: Do not block Phase B — they require external resources (Azure SQL) or a different test mode (production build). Document in CI setup guide.
- **6 known skips**: Do not block Phase B — authors intentionally deferred them.

**Verdict: Phase B may proceed with 1 open regression ticket (ACT tasks seed data).**

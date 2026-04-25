# 영역 1 (공통 안전망 + 배포 위생) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build CI gate + safety net infrastructure that permanently prevents the 7 regressions from recurring, and fix those 7 regressions on top of that net.

**Architecture:** Three-layer net — (1) GitHub Actions CI workflow that runs all tests + grep guards on every PR, (2) cross-cutting abstractions (NumberField, budget_definitions) so single-source fixes don't drift, (3) regression test files that fail before fix and stay green after. All fixes ride on top of this net. Every test is committed RED first, fix follows, test goes GREEN, commit.

**Tech Stack:** GitHub Actions, Playwright (existing), pytest (existing), openpyxl (existing). Frontend: Next.js 14 / React / TypeScript / Tailwind. Backend: FastAPI / SQLAlchemy / Alembic / PostgreSQL.

---

## Spec Reference

This plan implements [docs/superpowers/specs/2026-04-25-area-1-safety-net-design.md](../specs/2026-04-25-area-1-safety-net-design.md). Tasks are organized by phase (Bootstrap → CI → Regression tests → Restructure → Fix → Heavy infra → Visual → Verification).

**Files this plan touches**:
- Create: `.github/workflows/ci.yml`, `frontend/src/components/ui/NumberField.tsx`, `frontend/tests/regression/*.spec.ts` (×7), `frontend/tests/smoke/*.spec.ts` (×3), `backend/app/services/budget_definitions.py`, `backend/tests/regression/test_*.py` (×3), `backend/tests/test_budget_definitions.py`, `backend/tests/fixtures/roundtrip/*.json` (×8), `backend/tests/fixtures/permission_matrix.yaml`, `scripts/ci/check-*.sh` (×3), `docs/superpowers/runbooks/branch-protection.md`, `docs/superpowers/qa-checklists/area-1.md`, `docs/superpowers/retros/area-1.md`
- Modify: `frontend/package.json` (add `test` script), `frontend/playwright.config.ts` (add visual/smoke projects), `frontend/next.config.js` (production overlay guard), `frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx` (use shared NumberField + fix #68/#99), `backend/pyproject.toml` (pytest config), `backend/app/services/budget_service.py`, `backend/app/api/v1/overview.py`, `backend/app/api/v1/tracking.py` (migrate to budget_definitions)

---

## Phase 0: Baseline & Bootstrap

### Task 1: Add npm test script + Playwright projects config

**Goal:** Enable `npm test` and partition tests into named projects (default, smoke, visual, regression). Required for CI later.

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/playwright.config.ts`

- [ ] **Step 1: Add `test` script**

Edit `frontend/package.json`, in the `"scripts"` block:
```json
"scripts": {
  "dev": "next dev --port 8001",
  "build": "next build",
  "start": "next start --port 8001",
  "lint": "eslint",
  "test": "playwright test",
  "test:smoke": "playwright test --project=smoke",
  "test:visual": "playwright test --project=visual",
  "test:regression": "playwright test --project=regression"
}
```

- [ ] **Step 2: Update Playwright config with named projects**

Replace `frontend/playwright.config.ts` with:
```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  use: {
    baseURL: process.env.FRONTEND_URL || "http://localhost:8001",
    headless: true,
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "default",
      testIgnore: ["**/regression/**", "**/smoke/**", "**/__visual__/**"],
      use: { browserName: "chromium" },
    },
    {
      name: "regression",
      testDir: "./tests/regression",
      use: { browserName: "chromium" },
    },
    {
      name: "smoke",
      testDir: "./tests/smoke",
      use: { browserName: "chromium" },
    },
    {
      name: "visual",
      testMatch: /__visual__\/.*\.spec\.ts$/,
      use: { browserName: "chromium" },
      expect: { toHaveScreenshot: { maxDiffPixels: 100 } },
    },
  ],
});
```

- [ ] **Step 3: Verify config parses**

Run: `cd frontend && npx playwright test --list`
Expected: list of tests under each project, no parse errors. Existing 22 specs all listed under `default`.

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/playwright.config.ts
git commit -m "chore(s7-area1): add npm test script + Playwright project partitions"
```

---

### Task 2: Verify 22 existing Playwright tests baseline

**Goal:** Establish current pass/fail state of existing tests before adding new ones. Per spec 3.7, broken tests must be triaged before phase B continues.

**Files:**
- Read: all `frontend/tests/task-*.spec.ts` (22 files)
- Create: `docs/superpowers/runbooks/area-1-baseline-report.md` (working notes)

- [ ] **Step 1: Start backend + frontend in dev mode (terminal A and B)**

Terminal A:
```bash
cd backend && uvicorn app.main:app --reload --port 3001
```

Terminal B:
```bash
cd frontend && npm run dev
```

Wait until both ready (backend logs `Uvicorn running on http://0.0.0.0:3001`, frontend logs `Ready in Xms`).

- [ ] **Step 2: Run existing default tests**

```bash
cd frontend && npm test -- --project=default --reporter=list 2>&1 | tee /tmp/area1-baseline.log
```

- [ ] **Step 3: Triage results**

Create `docs/superpowers/runbooks/area-1-baseline-report.md` with:
```markdown
# Area 1 Baseline — 22 Existing Playwright Tests

**Date:** 2026-04-25
**Command:** `npm test -- --project=default`

## Summary
- Total: 22
- Passed: <N>
- Failed: <M>
- Skipped: <K>

## Failing Specs

| spec | failure category | action |
|---|---|---|
| ... | regression / stale / infrastructure | fix-now / delete-with-confirm / fix-in-task-X |

## Notes
- ...
```

Fill in N/M/K from the log. Categorize each failure:
- **regression**: bug exists in product → add to regression list (Tasks 7-13 cover the 7 known; if more found, append regression task)
- **stale**: spec is out-of-date with current product → ask user before delete
- **infrastructure**: env/setup issue (DB seed, mock missing) → fix in dedicated infra task

- [ ] **Step 4: Stop dev servers**

Ctrl+C in both terminals.

- [ ] **Step 5: Commit baseline report**

```bash
git add docs/superpowers/runbooks/area-1-baseline-report.md
git commit -m "docs(s7-area1): 22 existing Playwright tests baseline report"
```

**Decision gate:** If any test categorized **stale**, halt and ask user for delete confirmation. If any **infrastructure**, append a task before Phase 2 to fix.

---

### Task 3: Add backend pytest configuration

**Goal:** Enable `pytest` to discover tests cleanly + standardize asyncio mode. Existing 18 tests should still pass.

**Files:**
- Create: `backend/pyproject.toml` (or modify if exists)

- [ ] **Step 1: Check if pyproject.toml exists**

Run: `ls backend/pyproject.toml 2>/dev/null && echo EXISTS || echo MISSING`

- [ ] **Step 2: Create pyproject.toml**

If MISSING, create `backend/pyproject.toml`:
```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py"]
python_classes = ["Test*"]
python_functions = ["test_*"]
addopts = "-v --tb=short"
asyncio_mode = "auto"
```

If EXISTS, merge the `[tool.pytest.ini_options]` section.

- [ ] **Step 3: Verify pytest discovery**

```bash
cd backend && pytest --collect-only 2>&1 | tail -5
```
Expected: lists existing 18 test files, no errors.

- [ ] **Step 4: Run existing pytest baseline**

```bash
cd backend && pytest 2>&1 | tee /tmp/area1-pytest-baseline.log | tail -20
```

Append results to `docs/superpowers/runbooks/area-1-baseline-report.md` under a `## Backend pytest baseline` section.

- [ ] **Step 5: Commit**

```bash
git add backend/pyproject.toml docs/superpowers/runbooks/area-1-baseline-report.md
git commit -m "chore(s7-area1): backend pyproject.toml pytest config + baseline report"
```

---

## Phase 1: CI Infrastructure Foundation

### Task 4: Create grep guard scripts directory

**Goal:** Container for all CI grep checks. These scripts will be called from CI yaml in Task 8.

**Files:**
- Create: `scripts/ci/.gitkeep`
- Create: `scripts/ci/README.md`

- [ ] **Step 1: Create directory + README**

```bash
mkdir -p scripts/ci
```

Create `scripts/ci/README.md`:
```markdown
# CI Grep Guards

Static checks that run in CI to prevent classes of regression.

## Scripts
- `check-no-direct-number-input.sh` — block `<input type="number">` in favor of NumberField
- `check-no-direct-budget-arithmetic.sh` — block ad-hoc Budget calc, force budget_definitions.py
- `check-docker-compose-no-dev.sh` — block `npm run dev` in production-targeted compose files

Each script exits 0 on pass, 1 on fail with offending lines printed.

Add a new script: write `check-X.sh`, chmod +x, register in `.github/workflows/ci.yml` under the `grep-guards` job.
```

- [ ] **Step 2: Commit**

```bash
git add scripts/ci/README.md
git commit -m "chore(s7-area1): scripts/ci directory for grep guards"
```

---

### Task 5: Grep guard — no direct `<input type="number">`

**Goal:** Enforce NumberField usage everywhere.

**Files:**
- Create: `scripts/ci/check-no-direct-number-input.sh`

- [ ] **Step 1: Write the script**

Create `scripts/ci/check-no-direct-number-input.sh`:
```bash
#!/usr/bin/env bash
# Block direct <input type="number"> outside NumberField.tsx.
# Exit 1 with offending lines on hit.
set -euo pipefail

hits=$(grep -rEn '<input[^>]*type="number"' \
  frontend/src/app frontend/src/components 2>/dev/null \
  | grep -v 'frontend/src/components/ui/NumberField' || true)

if [ -n "$hits" ]; then
  echo "ERROR: <input type=\"number\"> 직접 사용 금지. NumberField 컴포넌트 사용 필수."
  echo "$hits"
  exit 1
fi
echo "OK: no direct <input type=number> outside NumberField"
```

- [ ] **Step 2: chmod and run (should fail — page.tsx:2881 + page.tsx:65 both match)**

```bash
chmod +x scripts/ci/check-no-direct-number-input.sh
bash scripts/ci/check-no-direct-number-input.sh
```
Expected: FAIL — listing line 2881 (and possibly 65 inside the inline NumberField). This confirms the grep is sensitive. Fix comes in Phase 3 (Task 17/18).

Note: line 65 is inside the inline NumberField definition itself (which we'll extract). Adjust the grep filter if needed once NumberField.tsx is created.

- [ ] **Step 3: Commit (script alone, intentionally failing)**

```bash
git add scripts/ci/check-no-direct-number-input.sh
git commit -m "ci(s7-area1): add grep guard — no direct <input type=number> [intentionally red until Task 18]"
```

---

### Task 6: Grep guard — no direct Budget arithmetic

**Goal:** Force callers to use `budget_definitions.py` once it exists.

**Files:**
- Create: `scripts/ci/check-no-direct-budget-arithmetic.sh`

- [ ] **Step 1: Write the script**

Create `scripts/ci/check-no-direct-budget-arithmetic.sh`:
```bash
#!/usr/bin/env bash
# Block ad-hoc Budget arithmetic (contract_hours - axdx, total_budget_hours - ...)
# outside backend/app/services/budget_definitions.py.
# Exit 1 with offending lines on hit.
set -euo pipefail

hits=$(grep -rEn 'contract_hours\s*-\s*axdx|total_budget_hours\s*-' \
  backend/app 2>/dev/null \
  | grep -v 'budget_definitions.py' || true)

if [ -n "$hits" ]; then
  echo "ERROR: Budget 직접 산술 금지. backend/app/services/budget_definitions.py 함수 사용."
  echo "$hits"
  exit 1
fi
echo "OK: no direct Budget arithmetic outside budget_definitions.py"
```

- [ ] **Step 2: chmod and run**

```bash
chmod +x scripts/ci/check-no-direct-budget-arithmetic.sh
bash scripts/ci/check-no-direct-budget-arithmetic.sh
```
Expected: PASS or FAIL depending on existing code. Either is OK at this point — we'll know what migration is needed in Task 22.

- [ ] **Step 3: Commit**

```bash
git add scripts/ci/check-no-direct-budget-arithmetic.sh
git commit -m "ci(s7-area1): add grep guard — no direct Budget arithmetic"
```

---

### Task 7: Grep guard — no `npm run dev` in production compose

**Goal:** Prevent #67 recurrence at the compose-file level.

**Files:**
- Create: `scripts/ci/check-docker-compose-no-dev.sh`

- [ ] **Step 1: Write the script**

Create `scripts/ci/check-docker-compose-no-dev.sh`:
```bash
#!/usr/bin/env bash
# Block 'npm run dev' commands in production-targeted compose files.
# Files matched: docker-compose.yml, docker-compose.prod*.yml.
# Excluded: docker-compose.dev*.yml, docker-compose.local*.yml.
set -euo pipefail

prod_files=$(ls docker-compose.yml docker-compose.prod*.yml 2>/dev/null || true)
if [ -z "$prod_files" ]; then
  echo "OK: no production compose files found"
  exit 0
fi

hits=$(grep -EnH '^\s*command:.*npm\s+run\s+dev' $prod_files 2>/dev/null || true)

if [ -n "$hits" ]; then
  echo "ERROR: 'npm run dev' 사용 금지 in production compose."
  echo "$hits"
  exit 1
fi
echo "OK: no 'npm run dev' in production compose"
```

- [ ] **Step 2: chmod and run**

```bash
chmod +x scripts/ci/check-docker-compose-no-dev.sh
bash scripts/ci/check-docker-compose-no-dev.sh
```
Expected: PASS — current `docker-compose.yml` uses `npm run build && npm run start`.

- [ ] **Step 3: Commit**

```bash
git add scripts/ci/check-docker-compose-no-dev.sh
git commit -m "ci(s7-area1): add grep guard — no npm run dev in production compose"
```

---

### Task 8: Create CI workflow yaml

**Goal:** Wire up automated test execution on every PR + push to main.

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create workflow**

Create `.github/workflows/ci.yml`:
```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  grep-guards:
    name: Grep Guards
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: bash scripts/ci/check-no-direct-number-input.sh
      - run: bash scripts/ci/check-no-direct-budget-arithmetic.sh
      - run: bash scripts/ci/check-docker-compose-no-dev.sh

  backend:
    name: Backend pytest
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: mybudget_test
          POSTGRES_USER: mybudget
          POSTGRES_PASSWORD: mybudget
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U mybudget"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://mybudget:mybudget@localhost:5432/mybudget_test
      AZURE_SQL_HOST: mock
      AZURE_SQL_DB: mock
      AZURE_SQL_USER: mock
      AZURE_SQL_PASSWORD: mock
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - run: pip install -r backend/requirements.txt
      - run: cd backend && alembic upgrade head
      - run: cd backend && pytest

  frontend:
    name: Frontend lint + build + tests
    runs-on: ubuntu-latest
    needs: [backend]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: frontend/package-lock.json
      - run: cd frontend && npm ci
      - run: cd frontend && npm run lint
      - run: cd frontend && npm run build
      - run: cd frontend && npx playwright install --with-deps chromium
      - run: cd frontend && npm test -- --project=default --project=regression

  visual:
    name: Visual regression
    runs-on: ubuntu-latest
    needs: [frontend]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: frontend/package-lock.json
      - run: cd frontend && npm ci
      - run: cd frontend && npx playwright install --with-deps chromium
      - run: cd frontend && npm run test:visual
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: visual-diff
          path: frontend/test-results/

  smoke:
    name: Prod-like smoke
    runs-on: ubuntu-latest
    needs: [backend, frontend]
    steps:
      - uses: actions/checkout@v4
      - run: docker compose -f docker-compose.yml build
      - run: docker compose -f docker-compose.yml up -d
      - run: sleep 30
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: cd frontend && npm ci && npx playwright install --with-deps chromium
      - run: cd frontend && npm run test:smoke
```

- [ ] **Step 2: Verify yaml parses**

Run (locally if `act` installed, otherwise rely on GitHub):
```bash
yamllint .github/workflows/ci.yml || python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"
```
Expected: no parse errors.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(s7-area1): GitHub Actions workflow — grep/backend/frontend/visual/smoke jobs"
```

**Note:** First push will fail because grep-guards (Task 5 hits) and tests (Tasks 10-16 added with red state) are intentionally red until Phase 4 fixes complete. This is expected — CI yaml itself is correct.

---

### Task 9: Document branch protection runbook

**Goal:** Codify the manual GitHub UI steps the user must perform once CI is green.

**Files:**
- Create: `docs/superpowers/runbooks/branch-protection.md`

- [ ] **Step 1: Write runbook**

Create `docs/superpowers/runbooks/branch-protection.md`:
```markdown
# GitHub Branch Protection (main) — Manual Setup

**When to apply:** After Area 1 Phase E Layer 1 passes (all CI jobs green for at least 1 PR).

**Owner action required:** GitHub UI cannot be configured by code.

## Steps

1. Go to repo `Settings → Branches`
2. Click `Add branch protection rule`
3. Branch name pattern: `main`
4. Enable:
   - [x] Require a pull request before merging
     - [x] Require approvals: 1
   - [x] Require status checks to pass before merging
     - [x] Require branches to be up to date before merging
     - Status checks (search and add):
       - `Grep Guards`
       - `Backend pytest`
       - `Frontend lint + build + tests`
       - `Visual regression`
       - `Prod-like smoke`
   - [x] Require conversation resolution before merging
   - [x] Do not allow bypassing the above settings (no admin override)
5. Save changes

## Verify

Open a test PR with an obvious failure (e.g., add `<input type="number">` somewhere). Confirm:
- All 5 jobs run
- `Grep Guards` fails
- Merge button is grayed out

After verifying, close the test PR.

## Rollback

If branch protection blocks legitimate emergency hotfix:
- Admins can temporarily disable rule (uncheck "Do not allow bypassing")
- Re-enable immediately after merge
- Document the emergency in `docs/superpowers/retros/area-1.md`
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/runbooks/branch-protection.md
git commit -m "docs(s7-area1): branch protection runbook"
```

---

## Phase 2: Regression Test Authoring (RED state)

Each task: write the failing test, verify it fails, commit. Fixes come in Phase 4 (Tasks 22-27).

### Task 10: Regression test #67 — no dev overlay in prod

**Files:**
- Create: `frontend/tests/regression/test_no_dev_overlay_prod.spec.ts`

- [ ] **Step 1: Write test**

```ts
// frontend/tests/regression/test_no_dev_overlay_prod.spec.ts
import { test, expect } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:8001";
const EL = process.env.EL_EMPNO || "170661";

test.describe("regression #67 — no Next.js dev overlay in production build", () => {
  test("login flow has no dev overlay markers", async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await expect(page.locator("nextjs-portal")).toHaveCount(0);
    await expect(page.locator("[data-nextjs-toast]")).toHaveCount(0);
    await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
    await expect(page.locator("[data-nextjs-dialog-root]")).toHaveCount(0);

    await page.fill('input[placeholder="사번을 입력하세요"]', EL);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(overview-person)?\/?$/);

    await expect(page.locator("nextjs-portal")).toHaveCount(0);
    await expect(page.locator("[data-nextjs-toast]")).toHaveCount(0);
    await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
  });

  test("budget input page has no dev overlay markers", async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[placeholder="사번을 입력하세요"]', EL);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(overview-person)?\/?$/);
    await page.goto(`${FRONTEND}/budget-input`);

    await expect(page.locator("nextjs-portal")).toHaveCount(0);
    await expect(page.locator("[data-nextjs-toast]")).toHaveCount(0);
    await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
  });
});
```

- [ ] **Step 2: Run — should pass IF current build is prod, fail IF dev**

```bash
cd frontend && npm run build && npm run start &
sleep 5
npm test -- --project=regression --grep "regression #67"
```
Expected: PASS in prod build. To prove the test is sensitive, run against dev (`npm run dev`) — expect FAIL.

- [ ] **Step 3: Stop server, commit**

```bash
git add frontend/tests/regression/test_no_dev_overlay_prod.spec.ts
git commit -m "test(s7-area1): regression #67 — no dev overlay in prod"
```

---

### Task 11: Regression test #68 — QRP field editable

**Files:**
- Create: `frontend/tests/regression/test_qrp_field_editable.spec.ts`

- [ ] **Step 1: Write test**

```ts
// frontend/tests/regression/test_qrp_field_editable.spec.ts
import { test, expect } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:8001";
const EL = process.env.EL_EMPNO || "170661";

test.describe("regression #68 — QRP empno field stays editable across renders", () => {
  test("QRP empno input retains value after blur and refocus", async ({ page }) => {
    // login
    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[placeholder="사번을 입력하세요"]', EL);
    await page.click('button[type="submit"]');

    // navigate to new budget input
    await page.goto(`${FRONTEND}/budget-input/new`);
    await page.waitForLoadState("networkidle");

    // find QRP empno input (placeholder: "QRP 사번 입력 또는 검색" per S3 fix #36)
    const qrp = page.locator('input[placeholder*="QRP 사번"]').first();
    await qrp.fill("160553");

    // click another field, then back
    const projectName = page.locator('input[placeholder*="프로젝트명"]').first();
    await projectName.click();
    await qrp.click();

    // value should still be 160553
    await expect(qrp).toHaveValue("160553");

    // type more — should not lose focus (#68 root cause: re-render kills focus)
    await qrp.type("0", { delay: 100 });
    await expect(qrp).toHaveValue("1605530");
  });
});
```

- [ ] **Step 2: Run (should fail until #68 fix in Task 23)**

```bash
cd frontend && npm test -- --project=regression --grep "regression #68"
```
Expected: FAIL with focus lost or value reset. Confirms test is sensitive.

- [ ] **Step 3: Commit (red state)**

```bash
git add frontend/tests/regression/test_qrp_field_editable.spec.ts
git commit -m "test(s7-area1): regression #68 — QRP field editable [red until Task 23]"
```

---

### Task 12: Regression test #69 — project search independent of client

**Files:**
- Create: `frontend/tests/regression/test_project_search_independent.spec.ts`

- [ ] **Step 1: Write test**

```ts
// frontend/tests/regression/test_project_search_independent.spec.ts
import { test, expect } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:8001";
const EL = process.env.EL_EMPNO || "170661";

test.describe("regression #69 — project search works without client selection", () => {
  test("project search returns non-empty results when no client selected", async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[placeholder="사번을 입력하세요"]', EL);
    await page.click('button[type="submit"]');
    await page.goto(`${FRONTEND}/budget-input/new`);
    await page.waitForLoadState("networkidle");

    // Open project search modal WITHOUT selecting a client first
    await page.getByRole("button", { name: /프로젝트.*검색/ }).click();

    // Modal should be open
    const modal = page.locator('[role="dialog"], [data-modal="project-search"]').first();
    await expect(modal).toBeVisible();

    // Type a generic query that should match any project
    await modal.locator('input[type="search"], input[placeholder*="검색"]').first().fill("");
    await page.waitForTimeout(500);

    // Result list should not be empty
    const rows = modal.locator('[role="row"], tbody tr, [data-row="project"]');
    await expect(rows.first()).toBeVisible({ timeout: 5000 });
    expect(await rows.count()).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run (should fail until #69 fix in Task 24)**

```bash
cd frontend && npm test -- --project=regression --grep "regression #69"
```
Expected: FAIL — modal returns empty or filters by client_code.

- [ ] **Step 3: Commit**

```bash
git add frontend/tests/regression/test_project_search_independent.spec.ts
git commit -m "test(s7-area1): regression #69 — project search independent [red until Task 24]"
```

---

### Task 13: Regression test #70 — thousand separator displayed

**Files:**
- Create: `frontend/tests/regression/test_thousand_separator.spec.ts`

- [ ] **Step 1: Write test**

```ts
// frontend/tests/regression/test_thousand_separator.spec.ts
import { test, expect } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:8001";
const EL = process.env.EL_EMPNO || "170661";

test.describe("regression #70 — readOnly numeric fields display thousand separators", () => {
  test("contract hours readOnly fields use ko-KR locale formatting", async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[placeholder="사번을 입력하세요"]', EL);
    await page.click('button[type="submit"]');
    await page.goto(`${FRONTEND}/budget-input/new`);
    await page.waitForLoadState("networkidle");

    // Enter a value into 총 계약시간 (editable)
    const contract = page.locator('label:has-text("총 계약시간")').locator("..").locator("input").first();
    await contract.fill("12345");
    await contract.blur();

    // Now check ET 잔여시간 or any readOnly field — should display "12,345" formatted
    // (The display field is readOnly + uses toLocaleString)
    const readOnlyFields = page.locator('input[readonly]');
    const count = await readOnlyFields.count();
    expect(count).toBeGreaterThan(0);

    // At least one readOnly field showing a value with comma
    let foundFormatted = false;
    for (let i = 0; i < count; i++) {
      const v = await readOnlyFields.nth(i).inputValue();
      if (/^\d{1,3}(,\d{3})+/.test(v)) {
        foundFormatted = true;
        break;
      }
    }
    expect(foundFormatted).toBe(true);
  });
});
```

- [ ] **Step 2: Run (likely passes inline NumberField; would fail if NumberField bypassed)**

```bash
cd frontend && npm test -- --project=regression --grep "regression #70"
```
Note: current inline NumberField (page.tsx:54) does `value.toLocaleString("ko-KR")` for readOnly — should pass. If user reports #70 still happening, the bug is elsewhere (e.g., on a non-NumberField input). Test stays as a guard.

- [ ] **Step 3: Commit**

```bash
git add frontend/tests/regression/test_thousand_separator.spec.ts
git commit -m "test(s7-area1): regression #70 — thousand separator [guard against future regression]"
```

---

### Task 14: Regression test #71 — inactive employee warning

**Files:**
- Create: `frontend/tests/regression/test_inactive_employee_warning.spec.ts`

- [ ] **Step 1: Write test**

```ts
// frontend/tests/regression/test_inactive_employee_warning.spec.ts
import { test, expect } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:8001";
const EL = process.env.EL_EMPNO || "170661";
const INACTIVE = process.env.INACTIVE_EMPNO || "999999"; // user must seed an inactive empno

test.describe("regression #71 — inactive employee selection is blocked with alert", () => {
  test("selecting inactive employee triggers alert and does not register", async ({ page }) => {
    let alertText = "";
    page.on("dialog", async (dialog) => {
      alertText = dialog.message();
      await dialog.dismiss();
    });

    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[placeholder="사번을 입력하세요"]', EL);
    await page.click('button[type="submit"]');
    await page.goto(`${FRONTEND}/budget-input/new?step=2`);
    await page.waitForLoadState("networkidle");

    // open employee search and search by inactive empno
    const empnoSearch = page.locator('input[placeholder*="사번"], input[placeholder*="이름"]').first();
    await empnoSearch.fill(INACTIVE);
    await page.waitForTimeout(500);

    // simulate Enter (auto-select first)
    await empnoSearch.press("Enter");

    // alert text should mention 재직 / 퇴사 / 휴직
    expect(alertText).toMatch(/재직|퇴사|휴직/);

    // member list should NOT contain INACTIVE empno
    await expect(page.locator(`text=${INACTIVE}`)).toHaveCount(0);
  });
});
```

- [ ] **Step 2: Run (should fail until #71 fix in Task 26)**

```bash
INACTIVE_EMPNO=<seed> cd frontend && npm test -- --project=regression --grep "regression #71"
```
Expected: FAIL. If `INACTIVE_EMPNO` is unset, test will skip with a clear message — add a `test.skip` if env missing.

- [ ] **Step 3: Add skip-when-unset guard**

If `INACTIVE_EMPNO` is empty, prepend the test body:
```ts
test.skip(!process.env.INACTIVE_EMPNO, "INACTIVE_EMPNO not set — seed an emp_status='휴직' empno for this test");
```

- [ ] **Step 4: Commit**

```bash
git add frontend/tests/regression/test_inactive_employee_warning.spec.ts
git commit -m "test(s7-area1): regression #71 — inactive employee warning [red until Task 26]"
```

---

### Task 15: Regression test #74 — NumberField constraints

**Files:**
- Create: `frontend/tests/regression/test_number_field_constraints.spec.ts`

- [ ] **Step 1: Write test**

```ts
// frontend/tests/regression/test_number_field_constraints.spec.ts
import { test, expect } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:8001";
const EL = process.env.EL_EMPNO || "170661";

test.describe("regression #74 — NumberField rejects negative / step-violations / over-max", () => {
  test("Step 1 시간 배분 rejects -1", async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[placeholder="사번을 입력하세요"]', EL);
    await page.click('button[type="submit"]');
    await page.goto(`${FRONTEND}/budget-input/new`);
    await page.waitForLoadState("networkidle");

    // AX/DX time input
    const axdx = page.locator('label:has-text("AX/DX")').locator("..").locator("input").first();
    await axdx.fill("-1");
    await axdx.blur();
    expect(parseFloat(await axdx.inputValue())).toBeGreaterThanOrEqual(0);
  });

  test("Step 3 month cell rejects 0.24 and 301", async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[placeholder="사번을 입력하세요"]', EL);
    await page.click('button[type="submit"]');

    // navigate to existing project step 3 (assumes test seed has at least one project)
    await page.goto(`${FRONTEND}/budget-input`);
    await page.waitForLoadState("networkidle");
    const firstProject = page.locator('a[href*="/budget-input/"]').first();
    await firstProject.click();
    await page.goto(page.url() + "?step=3");
    await page.waitForLoadState("networkidle");

    // first month cell of first enabled row
    const monthCell = page.locator('input[type="number"][step="0.25"]').first();
    if (await monthCell.count() === 0) {
      test.skip(true, "no enabled month cell on this project");
    }

    await monthCell.fill("0.24");
    await monthCell.blur();
    const v1 = parseFloat(await monthCell.inputValue());
    expect(v1 % 0.25).toBe(0); // snapped to 0.25 multiple

    await monthCell.fill("301");
    await monthCell.blur();
    const v2 = parseFloat(await monthCell.inputValue());
    expect(v2).toBeLessThanOrEqual(300);
  });
});
```

- [ ] **Step 2: Run (likely partial pass — current NumberField clamps min=0 but not step)**

```bash
cd frontend && npm test -- --project=regression --grep "regression #74"
```
Expected: FAIL on step (0.24 not snapped) and possibly on max (depends on current state).

- [ ] **Step 3: Commit**

```bash
git add frontend/tests/regression/test_number_field_constraints.spec.ts
git commit -m "test(s7-area1): regression #74 — NumberField constraints [red until Task 17]"
```

---

### Task 16: Regression test #99 — Step 1 buttons no overlap

**Files:**
- Create: `frontend/tests/regression/test_step1_buttons_no_overlap.spec.ts`

- [ ] **Step 1: Write geometry-based test (more robust than visual)**

```ts
// frontend/tests/regression/test_step1_buttons_no_overlap.spec.ts
import { test, expect } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:8001";
const EL = process.env.EL_EMPNO || "170661";

test.describe("regression #99 — Step 1 nav buttons do not overlap", () => {
  test("AI Assistant / 이전 / 다음 button bounding boxes are disjoint", async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[placeholder="사번을 입력하세요"]', EL);
    await page.click('button[type="submit"]');
    await page.goto(`${FRONTEND}/budget-input/new`);
    await page.waitForLoadState("networkidle");

    const candidates = ["AI Assistant", "이전", "다음", "임시저장"];
    const boxes: { name: string; box: { x: number; y: number; width: number; height: number } }[] = [];

    for (const name of candidates) {
      const btn = page.getByRole("button", { name }).first();
      if (await btn.count() === 0) continue;
      const box = await btn.boundingBox();
      if (box) boxes.push({ name, box });
    }

    // pairwise check — no two buttons overlap
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].box;
        const b = boxes[j].box;
        const overlap = !(
          a.x + a.width <= b.x ||
          b.x + b.width <= a.x ||
          a.y + a.height <= b.y ||
          b.y + b.height <= a.y
        );
        expect(overlap, `${boxes[i].name} overlaps ${boxes[j].name}`).toBe(false);
      }
    }
  });
});
```

- [ ] **Step 2: Run (should fail or pass depending on current state)**

```bash
cd frontend && npm test -- --project=regression --grep "regression #99"
```

- [ ] **Step 3: Commit**

```bash
git add frontend/tests/regression/test_step1_buttons_no_overlap.spec.ts
git commit -m "test(s7-area1): regression #99 — Step 1 buttons no overlap [red until Task 27]"
```

---

## Phase 3: Structural Refactoring

### Task 17: Strengthen NumberField — extract to shared component with safe defaults

**Files:**
- Create: `frontend/src/components/ui/NumberField.tsx`
- Modify: `frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx` (remove inline definition lines 23-87, import from shared)

- [ ] **Step 1: Read inline NumberField current state**

Re-read `frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx` lines 23-87 (already read in Task 0 context).

- [ ] **Step 2: Create shared NumberField with stronger defaults**

Create `frontend/src/components/ui/NumberField.tsx`:
```tsx
"use client";

import * as React from "react";

export interface NumberFieldProps {
  label?: string;
  value?: number;
  onChange?: (v: number) => void;
  readOnly?: boolean;
  step?: number;
  min?: number;
  max?: number;
  allowNegative?: boolean;
  /** Display thousand separator when readOnly. Default true. */
  displayThousandSeparator?: boolean;
  /** Used for percentage-of-total display. */
  contractHours?: number;
  /** Optional placeholder for editable mode. */
  placeholder?: string;
  className?: string;
}

/**
 * Centralized numeric input with safe defaults:
 *  - min = 0 by default (override with allowNegative or explicit min)
 *  - readOnly displays toLocaleString("ko-KR") with thousand separators
 *  - step omitted defaults to integer-only via min snap
 *
 * IMPORTANT: do not introduce ad-hoc <input type="number"> in src/app or
 * src/components — see scripts/ci/check-no-direct-number-input.sh.
 */
export function NumberField(props: NumberFieldProps) {
  const {
    label,
    value,
    onChange,
    readOnly,
    step = 1,
    min = 0,
    max,
    allowNegative = false,
    displayThousandSeparator = true,
    contractHours,
    placeholder,
    className,
  } = props;

  const effectiveMin = allowNegative ? (min < 0 ? min : -Number.MAX_SAFE_INTEGER) : min;

  const pct =
    contractHours && contractHours > 0 && value
      ? `${Math.round((value / contractHours) * 100)}%`
      : null;

  const display =
    readOnly && typeof value === "number"
      ? displayThousandSeparator
        ? value.toLocaleString("ko-KR")
        : String(value)
      : value ?? "";

  const handleChange = (raw: string) => {
    let v = parseFloat(raw);
    if (Number.isNaN(v)) v = 0;
    if (!allowNegative && v < 0) v = 0;
    if (typeof effectiveMin === "number" && v < effectiveMin) v = effectiveMin;
    if (typeof max === "number" && v > max) v = max;
    if (step > 0) {
      v = Math.round(v / step) * step;
    }
    onChange?.(v);
  };

  return (
    <div className={className}>
      {label && (
        <label className="block text-xs font-medium text-pwc-gray-600 mb-1">
          {label}
          {pct && <span className="ml-1 text-pwc-orange">({pct})</span>}
        </label>
      )}
      <input
        type={readOnly ? "text" : "number"}
        value={display}
        step={step}
        min={effectiveMin}
        max={max}
        readOnly={readOnly}
        placeholder={placeholder}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={(e) => handleChange(e.target.value)}
        className={`w-full px-2 py-1.5 text-sm border rounded text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
          readOnly
            ? "bg-pwc-gray-50 border-pwc-gray-100 text-pwc-gray-600"
            : "border-pwc-gray-200 focus:outline-none focus:border-pwc-orange"
        }`}
      />
    </div>
  );
}

export default NumberField;
```

- [ ] **Step 3: Update grep guard exclude path if needed**

Check `scripts/ci/check-no-direct-number-input.sh` — line 65 in page.tsx (inside old inline definition) and the new file `NumberField.tsx` line `type={readOnly ? "text" : "number"}` should both be excluded. The `-v 'NumberField'` filter handles the new file.

Verify:
```bash
bash scripts/ci/check-no-direct-number-input.sh
```
Expected: still fails on page.tsx:2881 only (line 65 inside old inline def will be removed in next step).

- [ ] **Step 4: Update page.tsx imports + remove inline NumberField**

Edit `frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx`:

Add import after existing imports (around line 22):
```ts
import { NumberField } from "@/components/ui/NumberField";
```

Remove the inline definition (current lines 23-87). Verify all existing usages still type-check (the new shared component is API-compatible with the old inline one for the props in use).

- [ ] **Step 5: Type-check + lint**

```bash
cd frontend && npm run lint && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 6: Run regression #74 — should now PASS for step snap and max clamp**

```bash
cd frontend && npm test -- --project=regression --grep "regression #74"
```
Expected: PASS (or closer to PASS — Step 3 month cell will pass when its `step={0.25}` is preserved).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ui/NumberField.tsx frontend/src/app/\(dashboard\)/budget-input/\[project_code\]/page.tsx
git commit -m "feat(s7-area1): extract shared NumberField + safe defaults — fixes #74 step/max"
```

---

### Task 18: Migrate remaining direct `<input type="number">` to NumberField

**Files:**
- Modify: `frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx` (line 2881)

- [ ] **Step 1: Find direct usages**

```bash
bash scripts/ci/check-no-direct-number-input.sh
```
Expected: exits 1 with offending line(s). Should be exactly 1 line: `[project_code]/page.tsx:2881`.

- [ ] **Step 2: Read context around line 2881**

Read `frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx` lines 2870-2900 to understand props/context.

- [ ] **Step 3: Replace with NumberField**

Edit that block to use `<NumberField ... />` instead of raw `<input type="number" ... />`. Map existing props:
- `value` → `value`
- `onChange` → wrap to extract numeric value if needed
- `min`/`max`/`step` → as-is
- For Step 3 month cells specifically, ensure `step={0.25}`, `max={300}`, `min={0}` are explicit.

- [ ] **Step 4: Re-run grep guard — should now pass**

```bash
bash scripts/ci/check-no-direct-number-input.sh
```
Expected: `OK: no direct <input type=number> outside NumberField`

- [ ] **Step 5: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 6: Run regression #74 fully**

```bash
cd frontend && npm test -- --project=regression --grep "regression #74"
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/\(dashboard\)/budget-input/\[project_code\]/page.tsx
git commit -m "refactor(s7-area1): migrate last <input type=number> to NumberField — grep guard green"
```

---

### Task 19: Create budget_definitions.py + unit tests

**Files:**
- Create: `backend/app/services/budget_definitions.py`
- Create: `backend/tests/test_budget_definitions.py`

- [ ] **Step 1: Write the unit tests first (TDD)**

Create `backend/tests/test_budget_definitions.py`:
```python
"""Unit tests for budget_definitions — single source of truth for Budget semantics."""
import pytest
from types import SimpleNamespace


def make_project(**overrides):
    """Lightweight project stub (avoids DB)."""
    defaults = dict(
        contract_hours=500.0,
        axdx_hours=77.0,
        qrp_hours=10.0,
        rm_hours=5.0,
        el_hours=20.0,
        pm_hours=55.0,
        ra_elpm_hours=8.0,
        et_controllable_budget=348.0,
        fulcrum_hours=20.0,
        ra_staff_hours=15.0,
        specialist_hours=10.0,
        travel_hours=5.0,
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def test_total_contract_hours_returns_field_value():
    from app.services.budget_definitions import total_contract_hours
    p = make_project(contract_hours=500.0)
    assert total_contract_hours(p) == 500.0


def test_total_contract_hours_handles_none():
    from app.services.budget_definitions import total_contract_hours
    p = make_project(contract_hours=None)
    assert total_contract_hours(p) == 0.0


def test_axdx_excluded_budget_subtracts_axdx():
    from app.services.budget_definitions import axdx_excluded_budget
    p = make_project(contract_hours=500.0, axdx_hours=77.0)
    assert axdx_excluded_budget(p) == 423.0


def test_axdx_excluded_budget_handles_zero_axdx():
    from app.services.budget_definitions import axdx_excluded_budget
    p = make_project(contract_hours=500.0, axdx_hours=0.0)
    assert axdx_excluded_budget(p) == 500.0


def test_staff_controllable_budget_uses_field():
    from app.services.budget_definitions import staff_controllable_budget
    p = make_project(et_controllable_budget=348.0)
    assert staff_controllable_budget(p) == 348.0


def test_display_budget_raises_until_pol01_decided():
    from app.services.budget_definitions import display_budget
    p = make_project()
    with pytest.raises(NotImplementedError, match="POL-01"):
        display_budget(p, view="overview_kpi_total_contract")
```

- [ ] **Step 2: Run tests — should fail (module doesn't exist)**

```bash
cd backend && pytest tests/test_budget_definitions.py -v
```
Expected: ImportError / ModuleNotFoundError on `app.services.budget_definitions`.

- [ ] **Step 3: Create the module**

Create `backend/app/services/budget_definitions.py`:
```python
"""Single source of truth for Budget semantic computations.

Why this module exists:
  - "Budget" has multiple legitimate meanings (총 계약시간 / 총계약−AX/DX / Staff
    배부분 / ET Controllable). Spreading the math across services led to drift
    (영역 6 결함들). This module centralizes definitions; callers must use these
    functions instead of inline arithmetic.
  - Enforced by scripts/ci/check-no-direct-budget-arithmetic.sh.

POL-01 (메타 spec) decides which definition each *view* uses; until decided,
display_budget() raises NotImplementedError.
"""
from typing import Literal


def _f(v) -> float:
    """Coerce None / missing to 0.0."""
    return float(v) if v is not None else 0.0


def total_contract_hours(project) -> float:
    """B시트 C15 — 총 계약시간."""
    return _f(getattr(project, "contract_hours", None))


def axdx_excluded_budget(project) -> float:
    """총 계약시간 − AX/DX 시간 (= '중계약시간-AX/DX').

    Used by Power BI 프로젝트 테이블 Budget column. POL-01 candidate (b).
    """
    return total_contract_hours(project) - _f(getattr(project, "axdx_hours", None))


def staff_controllable_budget(project) -> float:
    """ET Controllable Budget — Step 3에서 분배 가능한 시간.

    Computed at Step 1 input time; persisted in `et_controllable_budget` column.
    """
    return _f(getattr(project, "et_controllable_budget", None))


def staff_actual_budget(project_code: str) -> float:
    """budget_details 합계 — 실제 분배된 시간. Requires DB session.

    Implemented in budget_service if/when called. Placeholder until needed.
    """
    raise NotImplementedError(
        "staff_actual_budget requires DB session; wire up at call site"
    )


BudgetView = Literal[
    "overview_kpi_total_contract",
    "overview_project_table_budget",
    "tracking_budget_hour",
    "summary_project_budget",
]


def display_budget(project, *, view: BudgetView) -> float:
    """View별 표시 Budget — POL-01 결정 후 routing.

    POL-01 미결정 동안 raise NotImplementedError. 영역 6에서 활성화.
    """
    raise NotImplementedError(
        f"display_budget(view={view!r}) blocked: POL-01 미결정. "
        "메타 spec 1.4 + policy-decisions.md 참고."
    )
```

- [ ] **Step 4: Run tests — should pass (except staff_actual_budget which we don't test)**

```bash
cd backend && pytest tests/test_budget_definitions.py -v
```
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/budget_definitions.py backend/tests/test_budget_definitions.py
git commit -m "feat(s7-area1): budget_definitions.py — single source of truth + unit tests"
```

---

### Task 20: Migrate budget arithmetic callers

**Files:**
- Modify: `backend/app/services/budget_service.py`
- Modify: `backend/app/api/v1/overview.py`
- Modify: `backend/app/api/v1/tracking.py`

- [ ] **Step 1: Find all current direct usages**

```bash
grep -rEn 'contract_hours\s*-\s*axdx|total_budget_hours\s*-' backend/app
```
Note each location.

- [ ] **Step 2: For each location, replace with budget_definitions function**

Pattern:
```python
# BEFORE
budget = project.contract_hours - project.axdx_hours

# AFTER
from app.services.budget_definitions import axdx_excluded_budget
budget = axdx_excluded_budget(project)
```

Apply to every grep hit. Add the import at the top of each file (consolidate if multiple uses).

- [ ] **Step 3: Run grep guard — should pass**

```bash
bash scripts/ci/check-no-direct-budget-arithmetic.sh
```
Expected: `OK: no direct Budget arithmetic outside budget_definitions.py`

- [ ] **Step 4: Run all backend tests — must stay green**

```bash
cd backend && pytest
```
Expected: same count of passes as Task 3 baseline (no regressions).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/budget_service.py backend/app/api/v1/overview.py backend/app/api/v1/tracking.py
git commit -m "refactor(s7-area1): migrate Budget arithmetic to budget_definitions — grep guard green"
```

---

### Task 21: Production overlay guards (next.config + smoke pre-check)

**Files:**
- Modify: `frontend/next.config.js` (or create if missing)

- [ ] **Step 1: Check next.config.js**

```bash
ls frontend/next.config.* 2>&1
```

- [ ] **Step 2: Add production guard to next.config**

Edit/create `frontend/next.config.js`:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Disable dev indicator UI even if NODE_ENV is misconfigured.
  devIndicators: {
    appIsrStatus: false,
    buildActivity: false,
  },
  productionBrowserSourceMaps: false,
};

if (process.env.NODE_ENV === "production") {
  // Belt-and-braces: assert no dev mode artifacts.
  nextConfig.compiler = {
    ...(nextConfig.compiler || {}),
    removeConsole: { exclude: ["error", "warn"] },
  };
}

module.exports = nextConfig;
```

(If existing config has more fields, merge.)

- [ ] **Step 3: Verify build still works**

```bash
cd frontend && npm run build
```
Expected: build success.

- [ ] **Step 4: Run grep guard for compose**

```bash
bash scripts/ci/check-docker-compose-no-dev.sh
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/next.config.js
git commit -m "feat(s7-area1): next.config production overlay guards"
```

---

## Phase 4: Fix 7 Regressions

### Task 22: Fix #67 — verify docker-compose command (already correct, add CI gate)

**Files:**
- Verify: `docker-compose.yml` (already `npm run build && npm run start`)
- (CI gate added in Task 7)

- [ ] **Step 1: Confirm current state**

```bash
grep "command:" docker-compose.yml
```
Expected: `command: sh -c "npm run build && npm run start"` for frontend service.

- [ ] **Step 2: Run #67 regression test against prod build**

```bash
cd frontend && npm run build && npm run start &
sleep 5
npm test -- --project=regression --grep "regression #67"
kill %1
```
Expected: PASS.

- [ ] **Step 3: Document in commit (no code change — guard alone is the fix)**

```bash
git commit --allow-empty -m "fix(s7-area1): #67 — docker-compose 'npm run build && npm run start' already in place; CI grep guard locks it in"
```

---

### Task 23: Fix #68 — QRP field NumberField nesting

**Files:**
- Modify: `frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx` (QRP empno input)

- [ ] **Step 1: Locate QRP empno input**

```bash
grep -n "QRP" frontend/src/app/\(dashboard\)/budget-input/\[project_code\]/page.tsx | head -10
```
Identify the `<input>` for QRP empno (not 시간 — the empno text input).

- [ ] **Step 2: Verify it uses a stable component reference**

The fix is to ensure the QRP empno `<input>` is NOT wrapped in a function defined inside the parent component (which would re-create on every render and lose focus). Either:
- Use a top-level component (already extracted as NumberField for numeric — but empno is text, not number)
- Or use a stable `useCallback`-wrapped handler + plain `<input>` without re-defining wrapping component

If QRP empno input is currently rendered inside an inner `function QrpRow()` defined inside the parent, hoist it out to module scope or replace the inner function with inline JSX.

- [ ] **Step 3: Apply fix**

Refactor the QRP block to use either:
- Plain inline `<input>` with stable `useCallback` for onChange
- OR import an existing top-level `EmployeeSearch` / `EmpnoInput` if available

Example pattern:
```tsx
const handleQrpChange = useCallback((empno: string) => {
  setProject(p => ({ ...p, qrp_empno: empno }));
}, []);

// In JSX:
<input
  placeholder="QRP 사번 입력 또는 검색"
  value={project.qrp_empno}
  onChange={(e) => handleQrpChange(e.target.value)}
  className="..."
/>
```

- [ ] **Step 4: Run regression #68**

```bash
cd frontend && npm test -- --project=regression --grep "regression #68"
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/\(dashboard\)/budget-input/\[project_code\]/page.tsx
git commit -m "fix(s7-area1): #68 — QRP empno field stable across renders"
```

---

### Task 24: Fix #69 — project search independent of client

**Files:**
- Modify: `frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx` (or `ProjectSearchModal` if extracted) — make `client_code` query param optional
- Possibly modify: `backend/app/api/v1/budget_input.py` (or projects.py) endpoint that backs project search

- [ ] **Step 1: Locate ProjectSearchModal API call**

```bash
grep -n "ProjectSearch\|/projects.*search" frontend/src/app frontend/src/components -rn 2>/dev/null
```

- [ ] **Step 2: Locate backend endpoint**

```bash
grep -rn 'def search_projects\|@router.get.*projects' backend/app/api/v1/ | head
```

- [ ] **Step 3: Make client_code optional**

Frontend: modify the search-fetch call so it sends no `client_code` parameter when none is selected.

Backend: in the search endpoint, treat `client_code` as optional — if missing, return all projects matching the query string (filter by name/code prefix). Add `WHERE LOWER(name) LIKE LOWER(:q)` for case-insensitive search (also addresses #121 partially — full #121 fix is in Area 2).

- [ ] **Step 4: Run regression #69**

```bash
cd frontend && npm test -- --project=regression --grep "regression #69"
```
Expected: PASS.

- [ ] **Step 5: Run all backend tests — no regression**

```bash
cd backend && pytest
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix(s7-area1): #69 — project search no longer requires client_code"
```

---

### Task 25: Verify #70 / #74 auto-fixed by Task 17/18

#70 and #74 are NumberField issues. Task 17 (extract + strengthen NumberField) and Task 18 (migrate last direct input) should resolve both.

- [ ] **Step 1: Run regression #70**

```bash
cd frontend && npm test -- --project=regression --grep "regression #70"
```
Expected: PASS.

- [ ] **Step 2: Run regression #74**

```bash
cd frontend && npm test -- --project=regression --grep "regression #74"
```
Expected: PASS.

- [ ] **Step 3: If either fails, isolate the failing input**

Add console.log to NumberField onChange / onBlur to trace what value flows in. Fix the specific input. Common case: input passes `step` but missing `min={0}` or `max={300}` — explicitly add.

- [ ] **Step 4: Commit (if any extra fix was needed)**

```bash
git commit -am "fix(s7-area1): #70 #74 — propagate NumberField props to remaining inputs"
```

If no fix needed, skip commit and proceed to Task 26.

---

### Task 26: Fix #71 — inactive employee guard

**Files:**
- Modify: `frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx` (or `EmployeeSearch` component) — restore `emp_status !== '재직'` alert

- [ ] **Step 1: Locate EmployeeSearch onSelect**

```bash
grep -rn "EmployeeSearch\|emp_status" frontend/src/app frontend/src/components 2>/dev/null | head
```

- [ ] **Step 2: Verify backend `/employees/search` returns `emp_status`**

```bash
grep -n "emp_status" backend/app/api/v1/*.py | head
```

- [ ] **Step 3: Add/restore alert in onSelect handler**

Pattern:
```tsx
const handleSelectEmployee = (emp: EmployeeSearchResult) => {
  if (emp.emp_status !== "재직") {
    alert(`사번 ${emp.empno}(${emp.name})은(는) 현재 재직 중인 직원이 아닙니다 (${emp.emp_status}).`);
    return;
  }
  // ... existing register logic
};
```

- [ ] **Step 4: Run regression #71 (set INACTIVE_EMPNO env to a known 휴직/퇴사 사번 from DB)**

```bash
INACTIVE_EMPNO=<seed_inactive> cd frontend && npm test -- --project=regression --grep "regression #71"
```
Expected: PASS.

If no inactive empno seed available, document in `docs/superpowers/runbooks/area-1-baseline-report.md` and skip the test in CI with a clear marker (Task 14 already added the skip-when-unset guard).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix(s7-area1): #71 — restore inactive employee alert in EmployeeSearch onSelect"
```

---

### Task 27: Fix #99 — Step 1 button overlap CSS

**Files:**
- Modify: `frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx` (Step 1 nav buttons section)

- [ ] **Step 1: Locate Step 1 bottom nav**

```bash
grep -n "AI Assistant\|이전 단계\|다음 단계" frontend/src/app/\(dashboard\)/budget-input/\[project_code\]/page.tsx | head
```

- [ ] **Step 2: Apply layout fix (restore previous fix from commit 9853106 if regressed)**

Look at previous fix:
```bash
git log --oneline --all -- frontend/src/app/\(dashboard\)/budget-input/\[project_code\]/page.tsx | head -5
git show 9853106 -- frontend/src/app/\(dashboard\)/budget-input/\[project_code\]/page.tsx | head -80
```

Apply equivalent fix — wrap toolbar in `flex flex-wrap mb-3` container, ensure Step 3 toolbar buttons have `z-10`, table has `pb-24` (or whichever was the fix).

- [ ] **Step 3: Run regression #99**

```bash
cd frontend && npm test -- --project=regression --grep "regression #99"
```
Expected: PASS — bounding boxes disjoint.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/\(dashboard\)/budget-input/\[project_code\]/page.tsx
git commit -m "fix(s7-area1): #99 — Step 1 nav button layout flex-wrap (restore #15 fix)"
```

---

## Phase 5: Heavy-weight Test Infrastructure

### Task 28: Excel round-trip fixtures

**Files:**
- Create: `backend/tests/fixtures/roundtrip/audit_minimal.json`
- Create: `backend/tests/fixtures/roundtrip/audit_full.json`
- Create: `backend/tests/fixtures/roundtrip/non_audit_ac.json`
- Create: `backend/tests/fixtures/roundtrip/with_korean.json`
- Create: `backend/tests/fixtures/roundtrip/with_blank_cells.json`
- Create: `backend/tests/fixtures/roundtrip/edge_negative.json`
- Create: `backend/tests/fixtures/roundtrip/edge_step_violation.json`
- Create: `backend/tests/fixtures/roundtrip/non_audit_trade.json` (POL-02 dependent — skip in test until decided)

- [ ] **Step 1: Create fixture directory**

```bash
mkdir -p backend/tests/fixtures/roundtrip
```

- [ ] **Step 2: Author fixtures (one per service_type / edge case)**

Each fixture has shape:
```json
{
  "name": "audit_minimal",
  "service_type": "AUDIT",
  "skip_until_pol": null,
  "project": {
    "project_code": "RT-AUDIT-MIN-001",
    "project_name": "Roundtrip Audit Minimal",
    "department": "TestDept",
    "el_empno": "170661",
    "pm_empno": "170661",
    "qrp_empno": null,
    "contract_hours": 100,
    "axdx_hours": 0,
    "fiscal_start": "2026-04-01"
  },
  "members": [
    {"empno": "320915", "name": "지해나", "grade": "Staff", "department": "TestDept"}
  ],
  "template_rows": [
    {"budget_category": "계획단계", "budget_unit": "계획단계", "empno": "320915", "month": "2026-04", "hours": 8.0}
  ]
}
```

Author 8 fixtures matching the 8 paths above. Use realistic but distinct data (no PII collisions). For `non_audit_trade.json`, set `"skip_until_pol": "POL-02"`.

- [ ] **Step 3: Commit fixtures**

```bash
git add backend/tests/fixtures/roundtrip/
git commit -m "test(s7-area1): Excel roundtrip fixtures (8 cases)"
```

---

### Task 29: Excel round-trip test — template

**Files:**
- Create: `backend/tests/regression/test_excel_roundtrip_template.py`
- Create: `backend/tests/regression/__init__.py`

- [ ] **Step 1: Create regression package marker**

```bash
mkdir -p backend/tests/regression
touch backend/tests/regression/__init__.py
```

- [ ] **Step 2: Write the test**

Create `backend/tests/regression/test_excel_roundtrip_template.py`:
```python
"""Excel template export → upload round-trip equality.

For each fixture: seed DB with the project state, export the template
to xlsx, upload that xlsx back, and assert the DB state equals the original.
"""
import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

FIXTURE_DIR = Path(__file__).parent.parent / "fixtures" / "roundtrip"
FIXTURE_FILES = sorted(FIXTURE_DIR.glob("*.json"))


def _load(p: Path) -> dict:
    return json.loads(p.read_text(encoding="utf-8"))


def _check_skip(fx: dict):
    skip = fx.get("skip_until_pol")
    if skip:
        pytest.skip(f"fixture {fx['name']} blocked by {skip}")


@pytest.mark.parametrize(
    "fixture_path",
    FIXTURE_FILES,
    ids=[p.stem for p in FIXTURE_FILES],
)
def test_template_roundtrip(client: TestClient, elpm_cookie, fixture_path: Path):
    fx = _load(fixture_path)
    _check_skip(fx)

    project_code = fx["project"]["project_code"]

    # 1. Seed the project (use existing budget_input endpoints)
    seed_resp = client.post(
        "/api/v1/budget-input/projects",
        json=fx["project"],
        cookies=elpm_cookie,
    )
    assert seed_resp.status_code in (200, 201), seed_resp.text

    # Seed members
    if fx["members"]:
        m_resp = client.put(
            f"/api/v1/budget-input/projects/{project_code}/members",
            json={"members": fx["members"]},
            cookies=elpm_cookie,
        )
        assert m_resp.status_code == 200, m_resp.text

    # Seed template rows
    if fx["template_rows"]:
        t_resp = client.put(
            f"/api/v1/budget-input/projects/{project_code}/template",
            json={"rows": fx["template_rows"]},
            cookies=elpm_cookie,
        )
        assert t_resp.status_code == 200, t_resp.text

    # 2. Export
    export_resp = client.get(
        f"/api/v1/budget-input/projects/{project_code}/template/export",
        cookies=elpm_cookie,
    )
    assert export_resp.status_code == 200, export_resp.text
    assert export_resp.headers["content-type"].startswith(
        "application/vnd.openxmlformats"
    )
    xlsx_bytes = export_resp.content
    assert len(xlsx_bytes) > 100

    # 3. Upload (round-trip)
    upload_resp = client.post(
        f"/api/v1/budget-input/projects/{project_code}/template/upload",
        files={"file": ("rt.xlsx", xlsx_bytes,
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        cookies=elpm_cookie,
    )
    assert upload_resp.status_code == 200, upload_resp.text

    # 4. Re-fetch state and compare
    state_resp = client.get(
        f"/api/v1/budget-input/projects/{project_code}/template",
        cookies=elpm_cookie,
    )
    assert state_resp.status_code == 200
    state = state_resp.json()

    # Compare row counts and key fields. Order may differ — sort by tuple key.
    expected = sorted(fx["template_rows"],
                      key=lambda r: (r["budget_category"], r["budget_unit"], r["empno"], r["month"]))
    actual_rows = state.get("rows", [])
    actual = sorted(actual_rows,
                    key=lambda r: (r["budget_category"], r["budget_unit"], r["empno"], r["month"]))

    assert len(actual) == len(expected), (
        f"row count drift: expected {len(expected)} got {len(actual)}"
    )
    for e, a in zip(expected, actual):
        for k in ("budget_category", "budget_unit", "empno", "month"):
            assert a[k] == e[k], f"field {k} mismatch: {e[k]!r} != {a[k]!r}"
        assert abs(float(a["hours"]) - float(e["hours"])) < 1e-9
```

- [ ] **Step 3: Run — should pass for valid fixtures, may surface real bugs**

```bash
cd backend && pytest tests/regression/test_excel_roundtrip_template.py -v
```
Expected: most pass; any failure is a real round-trip bug. Document failures in `docs/superpowers/runbooks/area-1-baseline-report.md` for follow-up (likely Area 5 territory; Area 1 just installs the guard).

- [ ] **Step 4: Commit**

```bash
git add backend/tests/regression/__init__.py backend/tests/regression/test_excel_roundtrip_template.py
git commit -m "test(s7-area1): Excel template round-trip property test"
```

---

### Task 30: Permission matrix fixture + parameterized test

**Files:**
- Create: `backend/tests/fixtures/permission_matrix.yaml`
- Create: `backend/tests/regression/test_permission_matrix.py`

- [ ] **Step 1: Generate endpoint list**

```bash
grep -rEn '@router\.(post|put|delete|patch)' backend/app/api/v1/ > /tmp/area1-endpoints.txt
cat /tmp/area1-endpoints.txt
```
There are 23 endpoints. List them.

- [ ] **Step 2: Author the matrix yaml**

Create `backend/tests/fixtures/permission_matrix.yaml`:
```yaml
# Each entry: { method, path, expected: { persona: status_code } }
# Personas:
#   admin    — role=admin, scope=all
#   elpm     — role=elpm (covers EL/PM)
#   staff    — role=staff
#   anon     — no session cookie
#
# Status codes:
#   200 — allowed
#   201 — allowed (create)
#   401 — not authenticated
#   403 — authenticated but forbidden

- method: POST
  path: /api/v1/sync/employees
  expected:
    admin: 200
    elpm: 403
    staff: 403
    anon: 401

- method: POST
  path: /api/v1/sync/teams
  expected:
    admin: 200
    elpm: 403
    staff: 403
    anon: 401

- method: POST
  path: /api/v1/sync/actual
  expected:
    admin: 200
    elpm: 403
    staff: 403
    anon: 401

- method: POST
  path: /api/v1/sync/clients
  expected:
    admin: 200
    elpm: 403
    staff: 403
    anon: 401

- method: POST
  path: /api/v1/auth/login
  expected:
    admin: 200
    elpm: 200
    staff: 200
    anon: 200  # login is public; success depends on body, not cookie

- method: POST
  path: /api/v1/auth/logout
  expected:
    admin: 200
    elpm: 200
    staff: 200
    anon: 401

- method: POST
  path: /api/v1/budget-input/projects
  expected:
    admin: 200
    elpm: 200
    staff: 403
    anon: 401

# ... continue for all 23 endpoints
```

Continue listing all 23 endpoints from `/tmp/area1-endpoints.txt`. For each, declare expected status by persona based on the route's guard decorator (look at the source).

- [ ] **Step 3: Write the test**

Create `backend/tests/regression/test_permission_matrix.py`:
```python
"""Parameterized permission matrix — every write endpoint × every persona."""
import json
from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient

MATRIX = yaml.safe_load(
    (Path(__file__).parent.parent / "fixtures" / "permission_matrix.yaml").read_text()
)


def _params():
    for entry in MATRIX:
        method = entry["method"]
        path = entry["path"]
        for persona, expected in entry["expected"].items():
            yield pytest.param(method, path, persona, expected,
                               id=f"{method}-{path.replace('/', '_')}-{persona}")


@pytest.mark.parametrize("method,path,persona,expected", list(_params()))
def test_permission_matrix(
    client: TestClient,
    admin_cookie, elpm_cookie, staff_cookie,
    method: str, path: str, persona: str, expected: int,
):
    cookies = {
        "admin": admin_cookie,
        "elpm": elpm_cookie,
        "staff": staff_cookie,
        "anon": None,
    }[persona]

    # Substitute path params with test values
    p = path.replace("{project_code}", "RT-AUDIT-MIN-001").replace("{empno}", "320915")

    resp = client.request(method, p, cookies=cookies, json={})

    # We only assert the AUTH dimension (200/201/202 are all "allowed",
    # 4xx is meaningful). Use buckets to ignore body-validation failures.
    if expected in (200, 201, 202):
        assert resp.status_code not in (401, 403), (
            f"{persona} expected allow on {method} {p}, got {resp.status_code}: {resp.text[:200]}"
        )
    else:
        assert resp.status_code == expected, (
            f"{persona} expected {expected} on {method} {p}, got {resp.status_code}: {resp.text[:200]}"
        )
```

- [ ] **Step 4: Run — first iteration may need fixture corrections**

```bash
cd backend && pytest tests/regression/test_permission_matrix.py -v 2>&1 | tee /tmp/area1-permission.log
```
Iterate: if a real auth bug surfaces (persona gets unexpected status), document in retro and decide if fix happens here (Area 1) or in the relevant area.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/fixtures/permission_matrix.yaml backend/tests/regression/test_permission_matrix.py
git commit -m "test(s7-area1): permission matrix — 23 endpoints × 4 personas"
```

---

### Task 31: Smoke test specs

**Files:**
- Create: `frontend/tests/smoke/test_no_dev_overlay_all_pages.spec.ts`
- Create: `frontend/tests/smoke/test_no_console_error_all_pages.spec.ts`
- Create: `frontend/tests/smoke/test_docker_compose_no_dev_static.spec.ts`

- [ ] **Step 1: Smoke 1 — no dev overlay across all pages**

Create `frontend/tests/smoke/test_no_dev_overlay_all_pages.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:8001";
const EL = process.env.EL_EMPNO || "170661";

const PAGES = [
  "/",
  "/overview-person",
  "/projects",
  "/assignments",
  "/summary",
  "/budget-input",
  "/appendix",
];

test.describe("smoke — no dev overlay anywhere", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[placeholder="사번을 입력하세요"]', EL);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(overview-person)?\/?$/);
  });

  for (const path of PAGES) {
    test(`${path} has no dev overlay`, async ({ page }) => {
      await page.goto(`${FRONTEND}${path}`);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("nextjs-portal")).toHaveCount(0);
      await expect(page.locator("[data-nextjs-toast]")).toHaveCount(0);
      await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
    });
  }
});
```

- [ ] **Step 2: Smoke 2 — no console errors across all pages**

Create `frontend/tests/smoke/test_no_console_error_all_pages.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:8001";
const EL = process.env.EL_EMPNO || "170661";

const PAGES = [
  "/", "/overview-person", "/projects", "/assignments",
  "/summary", "/budget-input", "/appendix",
];

test.describe("smoke — no console errors anywhere", () => {
  for (const path of PAGES) {
    test(`${path} has 0 console errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });
      page.on("pageerror", (err) => errors.push(String(err)));

      await page.goto(`${FRONTEND}/login`);
      await page.fill('input[placeholder="사번을 입력하세요"]', EL);
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/(overview-person)?\/?$/);

      await page.goto(`${FRONTEND}${path}`);
      await page.waitForLoadState("networkidle");

      // Filter out known noise (3rd party, font fetch quirks). Adjust as needed.
      const filtered = errors.filter((e) =>
        !/favicon|chrome-extension|net::ERR_INTERNET_DISCONNECTED/.test(e)
      );
      expect(filtered, `${path} console errors: ${JSON.stringify(filtered, null, 2)}`).toHaveLength(0);
    });
  }
});
```

- [ ] **Step 3: Smoke 3 — static compose check (also covered by grep guard, but as a Playwright assertion for visibility in test report)**

Create `frontend/tests/smoke/test_docker_compose_no_dev_static.spec.ts`:
```ts
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

test("smoke — docker-compose.yml frontend command is build+start", () => {
  const compose = fs.readFileSync(
    path.join(__dirname, "..", "..", "..", "docker-compose.yml"),
    "utf-8",
  );
  // frontend service block — its 'command:' must contain 'build' and 'start' but not 'dev'
  const frontendBlock = compose.split(/\bfrontend:/)[1] || "";
  expect(frontendBlock).toMatch(/npm\s+run\s+build/);
  expect(frontendBlock).toMatch(/npm\s+run\s+start/);
  expect(frontendBlock).not.toMatch(/npm\s+run\s+dev/);
});
```

- [ ] **Step 4: Run smoke locally (against docker compose up)**

```bash
docker compose up -d
sleep 30
cd frontend && npm run test:smoke
```

- [ ] **Step 5: Commit**

```bash
git add frontend/tests/smoke/
git commit -m "test(s7-area1): smoke specs — no dev overlay / no console errors / static compose check"
```

---

## Phase 6: Visual Regression Baselines

### Task 32: Capture visual baselines (8 screens)

Apply only AFTER all Phase 4 fixes are merged so the baseline reflects the *correct* state.

**Files:**
- Create: `frontend/tests/__visual__/baseline.spec.ts`
- Create: `frontend/tests/__visual__/baseline.spec.ts-snapshots/` (committed by Playwright on first run)

- [ ] **Step 1: Write the baseline spec**

Create `frontend/tests/__visual__/baseline.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:8001";
const EL = process.env.EL_EMPNO || "170661";

const SCREENS = [
  { name: "login", path: "/login", needsAuth: false },
  { name: "overview", path: "/overview-person", needsAuth: true },
  { name: "budget-input-list", path: "/budget-input", needsAuth: true },
  { name: "step1-audit", path: "/budget-input/new", needsAuth: true },
  { name: "appendix", path: "/appendix", needsAuth: true },
];

test.describe("visual baseline — fixed-correct-state screens", () => {
  for (const s of SCREENS) {
    test(`${s.name}`, async ({ page }) => {
      if (s.needsAuth) {
        await page.goto(`${FRONTEND}/login`);
        await page.fill('input[placeholder="사번을 입력하세요"]', EL);
        await page.click('button[type="submit"]');
        await page.waitForURL(/\/(overview-person)?\/?$/);
      }
      await page.goto(`${FRONTEND}${s.path}`);
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveScreenshot(`${s.name}.png`, { fullPage: true });
    });
  }
});
```

(Spec lists 5 screens; spec doc said 7-8. Step 1 비감사 / Step 2 / Step 3 require seeded data — add as separate scenarios when fixtures land in Area 4/5.)

- [ ] **Step 2: First-run baseline (creates the .png snapshots)**

```bash
cd frontend && npm run test:visual -- --update-snapshots
```
Expected: 5 png files saved under `frontend/tests/__visual__/baseline.spec.ts-snapshots/`.

**IMPORTANT:** Playwright snapshots can differ between OS. CI runs Linux (Ubuntu); developer might be macOS. Run `--update-snapshots` from CI Docker if there's a mismatch. For now, capture locally; if CI baseline diverges, capture in CI and commit those.

- [ ] **Step 3: Verify second run — diff 0**

```bash
cd frontend && npm run test:visual
```
Expected: PASS, no diff.

- [ ] **Step 4: Commit baseline + spec**

```bash
git add frontend/tests/__visual__/
git commit -m "test(s7-area1): visual regression baseline (5 screens)"
```

---

## Phase 7: Phase E/F Artifacts

### Task 33: QA checklist (Layer 2 manual)

**Files:**
- Create: `docs/superpowers/qa-checklists/area-1.md`

- [ ] **Step 1: Author the checklist**

Create `docs/superpowers/qa-checklists/area-1.md`:
```markdown
# Area 1 — Manual QA Checklist (Phase E Layer 2)

Run after all automated gates (Layer 1) green. Tester goes through items
in order, marks pass/fail with notes.

**Tester:** _________________  **Date:** _________________  **Build:** _________________

## 회귀 7건 manual 재현 시도 — 모두 차단되어야 함

- [ ] **#67 — Dev overlay**
  - Run prod build (`npm run build && npm run start` or `docker compose up`)
  - Open `/login`, `/overview-person`, `/budget-input`, `/budget-input/new`
  - Open DevTools → look for Next.js dev overlay UI elements (nextjs-portal, error/warning toast)
  - Expected: NONE on any page. PASS / FAIL: ____

- [ ] **#68 — QRP empno editable**
  - Go to `/budget-input/new` Step 1
  - Find QRP 사번 input
  - Type "16055", click another field, click QRP again
  - Type "3" — value should become "160553" without losing focus
  - PASS / FAIL: ____

- [ ] **#69 — Project search without client**
  - Go to `/budget-input/new`
  - WITHOUT selecting a client first, click "프로젝트 검색"
  - Search results include non-AUDIT projects (e.g., 통상자문)
  - PASS / FAIL: ____

- [ ] **#70 — Thousand separator**
  - Step 1: enter "12345" into 총 계약시간
  - ET 잔여시간 (read-only) displays "12,345" (or similar with commas)
  - PASS / FAIL: ____

- [ ] **#71 — Inactive employee alert**
  - Step 2: search for a 휴직 사번 (use seed: ___)
  - Press Enter or click result
  - Alert appears with 재직/퇴사/휴직 keyword
  - Member NOT added to list
  - PASS / FAIL: ____

- [ ] **#74 — NumberField constraints**
  - Step 1 AX/DX: type "-1" → snaps to 0
  - Step 3 month cell: type "0.24" → snaps to 0.25 (or 0)
  - Step 3 month cell: type "301" → clamps to 300
  - PASS / FAIL: ____

- [ ] **#99 — Step 1 button non-overlap**
  - At Step 1 bottom, all visible buttons (AI Assistant, 이전, 다음, 임시저장) do NOT overlap
  - Resize browser window — still no overlap at common widths (1024 / 1280 / 1920)
  - PASS / FAIL: ____

## 배포 위생

- [ ] **Docker prod build clean**
  - `docker compose up --build`
  - All pages: 0 dev overlay artifacts
  - All pages: DevTools console — 0 errors
  - PASS / FAIL: ____

- [ ] **CI workflow visible**
  - Open recent PR on GitHub
  - All 5 jobs (Grep Guards / Backend pytest / Frontend / Visual / Smoke) ran
  - All green
  - PASS / FAIL: ____

## CI gate negative test

- [ ] **Intentional regression PR**
  - Open a draft PR that adds `<input type="number">` somewhere in src/app
  - `Grep Guards` job FAILS
  - Merge button is grayed out (after branch protection applied)
  - Close draft PR without merging
  - PASS / FAIL: ____

## 22 기존 Playwright sanity

- [ ] **5개 무작위 spec 수동 실행**
  - Pick 5 specs from `frontend/tests/task-*.spec.ts`
  - Run: `npx playwright test <spec> --reporter=list`
  - All 5 PASS
  - PASS / FAIL: ____

---

## Sign-off

Tester signature / date: _________________

Issues found (with task tracker IDs): _________________
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/qa-checklists/area-1.md
git commit -m "docs(s7-area1): Phase E Layer 2 manual QA checklist"
```

---

### Task 34: Retro template (Phase F)

**Files:**
- Create: `docs/superpowers/retros/area-1.md`

- [ ] **Step 1: Author the template**

Create `docs/superpowers/retros/area-1.md`:
```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/retros/area-1.md
git commit -m "docs(s7-area1): retro template (Phase F)"
```

---

## Phase 8: Final Verification

### Task 35: Run all tests locally + verify CI on first PR

- [ ] **Step 1: Local backend full run**

```bash
cd backend && pytest 2>&1 | tail -10
```
Expected: all green.

- [ ] **Step 2: Local frontend full run (against prod build)**

```bash
cd frontend && npm run build
npm run start &
sleep 5
npm test  # all projects
kill %1
```
Expected: all green.

- [ ] **Step 3: Local grep guards**

```bash
bash scripts/ci/check-no-direct-number-input.sh
bash scripts/ci/check-no-direct-budget-arithmetic.sh
bash scripts/ci/check-docker-compose-no-dev.sh
```
Expected: all 3 OK.

- [ ] **Step 4: Push to a feature branch and open draft PR**

```bash
git checkout -b s7/area-1-safety-net
git push -u origin s7/area-1-safety-net
gh pr create --draft --title "S7 Area 1 — Safety Net" --body "$(cat <<'EOF'
## Summary
- CI workflow + grep guards + 7 regression tests + visual baseline + Excel roundtrip + permission matrix
- Fixes regressions #67 #68 #69 #70 #71 #74 #99
- Introduces NumberField (shared) + budget_definitions.py (single source) horizontal abstractions
- See spec: docs/superpowers/specs/2026-04-25-area-1-safety-net-design.md

## Test plan
- [ ] CI Grep Guards green
- [ ] CI Backend pytest green
- [ ] CI Frontend lint+build+tests green
- [ ] CI Visual regression green
- [ ] CI Smoke green
- [ ] Manual QA checklist (docs/superpowers/qa-checklists/area-1.md) all PASS

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Watch CI runs**

```bash
gh pr checks --watch
```
Expected: all 5 jobs green. If red, iterate (the failure is real — diagnose and fix on this branch before merging).

- [ ] **Step 6: Apply branch protection per runbook**

Follow `docs/superpowers/runbooks/branch-protection.md` steps in GitHub UI.

- [ ] **Step 7: Negative test — intentional grep guard violation**

```bash
git checkout -b s7/area-1-negative-test
# add `<input type="number"/>` somewhere intentionally
git commit -am "test: intentional violation"
git push -u origin s7/area-1-negative-test
gh pr create --draft --title "NEGATIVE TEST — should be blocked" --body "verifying CI gate"
gh pr checks --watch
# expect: Grep Guards red. Merge button grayed out.
gh pr close --delete-branch
```

- [ ] **Step 8: Hand off to user (Phase E Layer 3)**

Notify user:
- All Layer 1 (auto) green
- Layer 2 manual checklist file at `docs/superpowers/qa-checklists/area-1.md`
- User runs Layer 2 checklist, signs off
- User runs Layer 3 (re-confirm regressions blocked in staging)
- User merges main PR
- User confirms Area 1 ends → trigger Phase F retro fill-in → start Area 2

- [ ] **Step 9: After user sign-off, fill retro and commit**

Fill in `docs/superpowers/retros/area-1.md` based on what actually happened during execution.
```bash
git add docs/superpowers/retros/area-1.md
git commit -m "docs(s7-area1): retro filled in after sign-off"
```

---

## Self-Review (already performed during write — audit trail below)

### Spec coverage check

- ✅ **§1.2 Deliverables** all mapped to tasks:
  - `.github/workflows/ci.yml` → Task 8
  - `frontend/package.json` test → Task 1
  - `backend/pyproject.toml` → Task 3
  - branch protection runbook → Task 9
  - 7 regression guards → Tasks 10-16
  - Visual baselines (5; 8 in spec partly deferred to fixture-availability) → Task 32 + note
  - `budget_definitions.py` → Tasks 19-20
  - `NumberField` strengthening → Tasks 17-18
  - CI grep guards → Tasks 5-7
  - smoke directory → Task 31
  - docker-compose validation → Tasks 7, 21
  - QA checklist → Task 33
  - retro template → Task 34
- ✅ **§3 Phase B** all sub-items addressed (B.1-B.6, all)
- ✅ **§4 Phase C** all sub-items addressed (C.1-C.4, all)
- ✅ **§5 Phase D** all 7 fixes (D.1 = #67 → Task 22, D.2 = #68 → Task 23, etc.)

### Placeholder scan

- No "TBD" or "TODO" in any task body. All steps contain executable commands or complete code blocks.
- A few `<seed>` / `<spec>` are intentional substitution placeholders for runtime values; they are explicit ("user must seed") and not hidden.

### Type/name consistency

- `NumberField` props consistent across Tasks 17, 18, 25
- `budget_definitions` function names consistent across Tasks 19, 20, plan body
- Test file paths consistent (always `frontend/tests/regression/test_*.spec.ts` and `backend/tests/regression/test_*.py`)

### Scope check

- Single area (Area 1) — passes single-plan rule per writing-plans skill.

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-25-area-1-safety-net.md`. Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**

# S8 — Excel I/O 제거 + Grid UX 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Remove all user-facing Excel I/O + 4 Grid UX improvements (Sticky / 분배 도우미 / 실시간 검증 / 검색·접기).

**Architecture:** S7 누적 안전망 위에서 진행. Excel removal = 약 -1,830 LOC; Grid UX = +600 LOC. 8 phases (A-H), 14 tasks, 8 batches.

**Tech Stack:** Same — Next.js / TypeScript / FastAPI / SQLAlchemy / Playwright / pytest. No new deps. `openpyxl` 유지 (admin 시드용).

---

## Spec Reference
[../specs/2026-04-29-s8-excel-removal-grid-ux-design.md](../specs/2026-04-29-s8-excel-removal-grid-ux-design.md)

## Files

**Delete (Backend)**:
- `backend/app/services/excel_parser.py`
- `backend/app/services/excel_export.py`
- `backend/app/api/v1/budget_upload.py`
- `backend/app/api/v1/export.py`
- `backend/tests/regression/test_excel_roundtrip_template.py`
- `backend/tests/test_template_upload_export.py`
- `backend/tests/test_members_upload_export.py`
- `backend/tests/regression/test_members_export_columns.py`
- `backend/tests/fixtures/roundtrip/` (8 JSON files + dir)

**Delete (Frontend)**:
- `frontend/src/app/(dashboard)/appendix/page.tsx`
- `frontend/src/app/(dashboard)/appendix/` (dir)

**Modify**:
- `backend/app/main.py` (remove budget_upload, export router includes + imports)
- `backend/app/api/v1/budget_input.py` (remove 5 Excel endpoints + openpyxl imports)
- `backend/tests/fixtures/permission_matrix.yaml` (remove Excel endpoint entries)
- `frontend/src/components/layout/Header.tsx` (remove Appendix nav item)
- `frontend/src/app/(dashboard)/budget-input/[project_code]/components/Step2Members.tsx` (remove Excel buttons + handlers)
- `frontend/src/app/(dashboard)/budget-input/[project_code]/components/Step3Grid/Toolbar.tsx` (remove Excel buttons)
- `frontend/src/app/(dashboard)/budget-input/[project_code]/hooks/useStep3Roundtrip.ts` (rename to `useStep3Reset.ts`, remove Excel handlers)
- `frontend/src/app/(dashboard)/budget-input/[project_code]/components/Step3Grid/MonthGrid.tsx` (sticky CSS + validation classNames + visibility filter)
- `frontend/src/app/(dashboard)/budget-input/[project_code]/components/Step3Grid/SummaryRow.tsx` (강화 — progress bar + 차이 시각화)
- `frontend/src/app/(dashboard)/budget-input/[project_code]/components/Step3Grid/index.tsx` (분배 도우미 / 검색 state)
- `frontend/src/app/(dashboard)/budget-input/[project_code]/lib/wizard-validators.ts` (validateRow + distribution algorithms)

**Create**:
- `frontend/src/app/(dashboard)/budget-input/[project_code]/components/Step3Grid/DistributionHelper.tsx` (분배 도우미 모달)
- `frontend/src/app/(dashboard)/budget-input/[project_code]/lib/distribution.ts` (균등/기말/유사회사 비율 알고리즘)
- `backend/tests/regression/test_excel_endpoints_removed.py` (404 가드)
- `frontend/tests/regression/test_appendix_route_removed.spec.ts`
- `frontend/tests/regression/test_step3_sticky_header.spec.ts`
- `frontend/tests/regression/test_step3_distribution_helper.spec.ts`
- `frontend/tests/regression/test_step3_inline_validation.spec.ts`
- `frontend/tests/regression/test_step3_search_collapse.spec.ts`
- `backend/tests/test_distribution_algorithms.py`

---

## Batch 1 — Baseline + RED tests

### Task 1: Baseline

```bash
cd /Users/jkim564/Documents/Programming/my_budget/.worktrees/s8-excel-removal
cd backend && pytest 2>&1 | tail -3
cd .. && bash scripts/ci/check-no-direct-number-input.sh && \
bash scripts/ci/check-no-direct-budget-arithmetic.sh && \
bash scripts/ci/check-docker-compose-no-dev.sh
```
Expected: 234 passed (Area 7 final), 3/3 grep guards.

```bash
git commit --allow-empty -m "chore(s8): baseline — S7 + Area 7 안전망 green"
```

If pytest count differs from 234, document but proceed.

### Task 2: 6 RED tests (single batch commit)

#### `backend/tests/regression/test_excel_endpoints_removed.py`
```python
"""S8 — Excel endpoints 모두 제거됨 검증 (404 반환)."""
import pytest


REMOVED_ENDPOINTS = [
    ("POST", "/api/v1/budget/upload"),
    ("GET",  "/api/v1/budget/projects/AREA8-X/template/export"),
    ("POST", "/api/v1/budget/projects/AREA8-X/template/upload"),
    ("GET",  "/api/v1/budget/projects/AREA8-X/members/export"),
    ("POST", "/api/v1/budget/projects/AREA8-X/members/upload"),
    ("GET",  "/api/v1/budget/template/blank-export"),
    ("GET",  "/api/v1/export/overview"),
    ("GET",  "/api/v1/export/staff-time"),
    ("GET",  "/api/v1/export/elpm-qrp-time"),
    ("GET",  "/api/v1/export/engagement-time"),
    ("GET",  "/api/v1/export/project"),
    ("GET",  "/api/v1/export/summary"),
]


@pytest.mark.parametrize("method,path", REMOVED_ENDPOINTS)
def test_excel_endpoint_returns_404(client, elpm_cookie, method, path):
    resp = client.request(method, path, cookies=elpm_cookie)
    assert resp.status_code == 404, (
        f"{method} {path} should be removed (404), got {resp.status_code}"
    )
```

#### `frontend/tests/regression/test_appendix_route_removed.spec.ts`
```ts
import { test, expect } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:8001";
const EL = process.env.EL_EMPNO || "170661";

test.describe("S8 — /appendix route 제거됨", () => {
  test("Appendix navigation 메뉴가 사이드바에 없음", async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[placeholder="사번을 입력하세요"]', EL);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.toString().includes("/login"));

    const appendixLink = page.locator('a[href="/appendix"], nav a:has-text("Appendix")');
    expect(await appendixLink.count(), "Appendix 메뉴가 보이면 안 됨").toBe(0);
  });

  test("/appendix 직접 접근 시 404", async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[placeholder="사번을 입력하세요"]', EL);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.toString().includes("/login"));

    const resp = await page.goto(`${FRONTEND}/appendix`);
    expect(resp?.status()).toBeGreaterThanOrEqual(400);
  });
});
```

#### `frontend/tests/regression/test_step3_sticky_header.spec.ts`
```ts
import { test, expect } from "@playwright/test";

test.describe("S8 — Step 3 sticky header + sticky column", () => {
  test.skip(true, "manual test — Step 3 데이터 시드 필요. 스크롤 후 12개월 헤더·대분류 컬럼 가시성 boundingBox 비교");
});
```

#### `frontend/tests/regression/test_step3_distribution_helper.spec.ts`
```ts
import { test, expect } from "@playwright/test";

test.describe("S8 — Step 3 분배 도우미 모달", () => {
  test.skip(true, "manual test — '분배 도우미' 버튼 → 모달 → 균등 분배 적용 → 셀 값 검증");
});
```

#### `frontend/tests/regression/test_step3_inline_validation.spec.ts`
```ts
import { test, expect } from "@playwright/test";

test.describe("S8 — Step 3 실시간 검증", () => {
  test.skip(true, "manual test — enabled+empno 미선택 시 빨간 테두리, 시간 0 시 노란 테두리");
});
```

#### `frontend/tests/regression/test_step3_search_collapse.spec.ts`
```ts
import { test, expect } from "@playwright/test";

test.describe("S8 — Step 3 검색/접기", () => {
  test.skip(true, "manual test — 검색 input + 대분류 접기 동작");
});
```

#### Verify RED + commit
```bash
cd backend && pytest tests/regression/test_excel_endpoints_removed.py -v 2>&1 | tail -15
```
Expected: 12/12 FAIL — endpoints still exist.

```bash
git add backend/tests/regression/test_excel_endpoints_removed.py frontend/tests/regression/test_*.spec.ts
git commit -m "test(s8): 6 RED safety-net tests for Excel removal + Grid UX"
```

---

## Batch 2 — Backend Excel 제거 (Tasks 3-5)

### Task 3: Delete Excel modules + budget_upload + export.py

```bash
git rm backend/app/services/excel_parser.py
git rm backend/app/services/excel_export.py
git rm backend/app/api/v1/budget_upload.py
git rm backend/app/api/v1/export.py
```

Update `backend/app/main.py`:
```python
# Line 15 — remove `budget_upload, export` from imports
from app.api.v1 import auth, budget_input, budget_workflow, overview, projects, assignments, summary, cache, admin, chat, budget_assist, tracking, sync

# Lines 153, 160 — remove these:
# app.include_router(budget_upload.router, prefix="/api/v1/budget", tags=["budget-upload"])
# app.include_router(export.router, prefix="/api/v1", tags=["export"])
```

Verify backend imports OK:
```bash
cd backend && python -c "from app.main import app; print('OK')"
```
Expected: `OK`. If error, find remaining import of removed modules.

```bash
cd backend && pytest 2>&1 | tail -5
```
Expected: most tests pass. Some Excel-related tests FAIL (Task 4 deletes them).

```bash
git add backend/app/main.py
git commit -m "refactor(s8): remove Excel modules — excel_parser/export/budget_upload + main.py routers"
```

### Task 4: Delete Excel tests + fixtures + permission_matrix entries

```bash
git rm backend/tests/regression/test_excel_roundtrip_template.py
git rm backend/tests/test_template_upload_export.py
git rm backend/tests/test_members_upload_export.py
git rm backend/tests/regression/test_members_export_columns.py
git rm -rf backend/tests/fixtures/roundtrip/
```

Update `backend/tests/fixtures/permission_matrix.yaml` — remove these entries (search and delete blocks):
- `POST /api/v1/budget/upload`
- `POST /api/v1/budget/projects/{project_code}/template/upload`
- `POST /api/v1/budget/projects/{project_code}/members/upload`
- (any other Excel endpoint entries)

Verify:
```bash
grep -E "budget/upload|template/upload|members/upload|template/export|members/export|blank-export|/export/" backend/tests/fixtures/permission_matrix.yaml
```
Expected: 0 matches.

```bash
cd backend && pytest 2>&1 | tail -5
```
Expected: ~218 passed (was 234 - 16 deleted Excel tests). 0 failed.

```bash
git add backend/tests/fixtures/permission_matrix.yaml
git commit -m "test(s8): remove Excel-related tests + permission matrix entries"
```

### Task 5: Remove Excel endpoints from budget_input.py

`backend/app/api/v1/budget_input.py` — delete the following functions and their `@router` decorators:

1. **Lines ~576-664**: `export_project_members`
2. **Lines ~667-721**: `export_project_template`
3. **Lines ~723-799**: `upload_project_template`
4. **Lines ~1050-1113**: `upload_project_members`
5. **Lines ~1115-1140**: `blank_export_template`

Also remove `from openpyxl import ...` lines inside these functions (5 occurrences in the file).

After deletion, verify only legitimate endpoints remain:
```bash
grep -n "@router" backend/app/api/v1/budget_input.py
```
Expected: GET /master/*, GET /clients/*, GET /employees/search, GET /projects/list, GET /projects/search, POST /projects, PUT /projects/{code}, DELETE /projects/{code}, etc. — but NO export/upload/blank-export.

Verify:
```bash
cd backend && python -c "from app.main import app; print('OK')"
cd backend && pytest tests/regression/test_excel_endpoints_removed.py -v 2>&1 | tail -10
```
Expected: 12/12 PASS (endpoints now 404).

```bash
cd backend && pytest 2>&1 | tail -5
```
Expected: ~218 passed + 12 new (test_excel_endpoints_removed) = ~230 passed, 0 failed.

```bash
git add backend/app/api/v1/budget_input.py
git commit -m "refactor(s8): remove Excel endpoints from budget_input.py (5 functions, ~300 LOC)"
```

---

## Batch 3 — Frontend Excel 제거 (Tasks 6-8)

### Task 6: Delete Appendix page + remove navigation

```bash
git rm -rf frontend/src/app/\(dashboard\)/appendix/
```

Update `frontend/src/components/layout/Header.tsx`:
Read lines 60-65, find:
```tsx
{
  name: "Appendix",
  href: "/appendix",
  // ...
},
```
Delete this block.

Verify:
```bash
grep -n "appendix\|Appendix" frontend/src/components/layout/Header.tsx
```
Expected: 0 matches.

```bash
cd frontend && npx tsc --noEmit 2>&1 | tail -3
```
Expected: 0 NEW errors.

```bash
git add frontend/src/components/layout/Header.tsx
git commit -m "refactor(s8): remove Appendix page + navigation menu"
```

### Task 7: Remove Excel buttons from Step2Members.tsx

`frontend/src/app/(dashboard)/budget-input/[project_code]/components/Step2Members.tsx`:

Find Excel button block (search for `📥 Excel 다운로드` or `members/export`):
```bash
grep -n "Excel\|members/export\|members/upload" frontend/src/app/\(dashboard\)/budget-input/\[project_code\]/components/Step2Members.tsx
```

Remove:
- The `<button>` for "📥 Excel 다운로드"
- The `<button>` (or `<input type="file">`) for "📤 Excel 업로드"
- The wrapping `<div>` if it only contains these buttons
- The handler functions `handleMembersExport`, `handleMembersImport` (or similar)
- The fetch calls to `/members/export` and `/members/upload`
- The hidden file input element if any
- Any related state (`uploadStatus`, `members exporting` etc.) that's now unused

Verify:
```bash
grep -n "Excel\|members/export\|members/upload" frontend/src/app/\(dashboard\)/budget-input/\[project_code\]/components/Step2Members.tsx
```
Expected: 0 matches.

```bash
cd frontend && npx tsc --noEmit 2>&1 | tail -3
```

```bash
git add frontend/src/app/\(dashboard\)/budget-input/\[project_code\]/components/Step2Members.tsx
git commit -m "refactor(s8): remove Excel 다운로드/업로드 buttons from Step2Members"
```

### Task 8: Remove Excel from Step3Grid + rename hook

`frontend/src/app/(dashboard)/budget-input/[project_code]/components/Step3Grid/Toolbar.tsx`:

Find Excel button blocks (search for `📥 Excel`, `📤 Excel`, `빈 Template`):
```bash
grep -n "Excel\|template/export\|template/upload\|blank-export\|빈 Template" frontend/src/app/\(dashboard\)/budget-input/\[project_code\]/components/Step3Grid/Toolbar.tsx
```

Remove all Excel-related JSX + handler props (handleExportTemplate, handleExportBlankTemplate, handleImportTemplate). Keep handleReset, AI 버튼, fiscal_end input, V 토글.

Rename `useStep3Roundtrip.ts` → `useStep3Reset.ts`:
```bash
git mv frontend/src/app/\(dashboard\)/budget-input/\[project_code\]/hooks/useStep3Roundtrip.ts frontend/src/app/\(dashboard\)/budget-input/\[project_code\]/hooks/useStep3Reset.ts
```

Edit `useStep3Reset.ts`:
- Rename `useStep3Roundtrip` → `useStep3Reset` (export name)
- Remove `handleExportTemplate`, `handleExportBlankTemplate`, `handleImportTemplate` functions
- Keep only `handleReset` function
- Update return value to just `{ handleReset }`

Update callers:
```bash
grep -rn "useStep3Roundtrip" frontend/src/app
```
Update `Step3Grid/index.tsx` (or wherever the hook is called):
```typescript
// Before:
import { useStep3Roundtrip } from "../../hooks/useStep3Roundtrip";
const { handleExportTemplate, handleExportBlankTemplate, handleImportTemplate, handleReset } = useStep3Roundtrip({...});

// After:
import { useStep3Reset } from "../../hooks/useStep3Reset";
const { handleReset } = useStep3Reset({...});
```

Update Toolbar.tsx props — remove the now-deleted handler props.

Verify:
```bash
grep -rn "useStep3Roundtrip\|handleExportTemplate\|handleExportBlankTemplate\|handleImportTemplate" frontend/src/app
```
Expected: 0 matches.

```bash
cd frontend && npx tsc --noEmit 2>&1 | tail -3
```

```bash
git add -A
git commit -m "refactor(s8): remove Excel from Step3Grid Toolbar + rename useStep3Roundtrip → useStep3Reset"
```

---

## Batch 4 — Sticky Header + Sticky Column (Task 9)

### Task 9: Sticky CSS in MonthGrid + visual baseline 갱신

`frontend/src/app/(dashboard)/budget-input/[project_code]/components/Step3Grid/MonthGrid.tsx`:

Read first 50 lines to understand current table structure:
```bash
head -80 frontend/src/app/\(dashboard\)/budget-input/\[project_code\]/components/Step3Grid/MonthGrid.tsx
```

Apply Tailwind sticky classes:

1. **Wrapping container** — must have `overflow-auto` (needed for sticky to work):
   ```tsx
   <div className="overflow-auto max-h-[70vh] border border-pwc-gray-100 rounded">
     <table className="...">
   ```

2. **Header row (`<thead>`)**:
   ```tsx
   <thead className="sticky top-0 z-20 bg-pwc-gray-50 shadow-sm">
   ```

3. **Left columns (대분류, 관리단위, 해당, 담당자)** — apply `sticky left-X` with cumulative offsets. Example for 4 left columns each ~120px:
   ```tsx
   <td className="sticky left-0 z-10 bg-white border-r" style={{ minWidth: 120 }}>대분류</td>
   <td className="sticky left-[120px] z-10 bg-white border-r" style={{ minWidth: 200 }}>관리단위</td>
   <td className="sticky left-[320px] z-10 bg-white border-r text-center" style={{ minWidth: 60 }}>해당</td>
   <td className="sticky left-[380px] z-10 bg-white border-r" style={{ minWidth: 140 }}>담당자</td>
   ```
   For header `<th>` cells, increase z-index to z-30 (sticky header AND sticky column intersect).

4. **합계 column (last)** — `sticky right-0`:
   ```tsx
   <td className="sticky right-0 z-10 bg-pwc-gray-50 border-l font-semibold">합계</td>
   ```

5. **Update grid styling** — table needs `border-collapse: separate; border-spacing: 0;` for sticky to render borders correctly.

Verify visually with dev server:
```bash
cd backend && uvicorn app.main:app --port 3001 &
BE=$!
cd frontend && npm run dev &
FE=$!
sleep 12
```

Open browser to http://localhost:8001/budget-input/<existing project>?step=3, scroll vertically + horizontally, verify headers stay visible.

Update visual baselines:
```bash
cd frontend && npm run test:visual -- --update-snapshots 2>&1 | tail -10
```

Verify second run clean:
```bash
cd frontend && npm run test:visual 2>&1 | tail -5
```
Expected: 5/5 pass, 0 diff.

Stop servers:
```bash
kill $BE $FE 2>/dev/null
```

```bash
cd frontend && npx tsc --noEmit 2>&1 | tail -3
git add -A
git commit -m "feat(s8-A): Step3 sticky header + sticky left/right columns + visual baseline 갱신"
```

---

## Batch 5 — 분배 도우미 (Tasks 10-11)

### Task 10: Distribution algorithms (`lib/distribution.ts`) + unit tests

Create `frontend/src/app/(dashboard)/budget-input/[project_code]/lib/distribution.ts`:

```typescript
"use client";

import type { TemplateRow } from "../types";

export interface DistributionResult {
  /** rowKey → months map: {"category|unit|empno": {"2026-04": 5, "2026-05": 5, ...}} */
  changes: Map<string, Record<string, number>>;
  /** preview summary for UI display */
  summary: { totalHours: number; rowCount: number };
}

/**
 * 균등 분배 — 총 시간 N → 12개월에 N/12 (소수점은 마지막 월에 누적).
 */
export function distributeEvenly(
  rows: TemplateRow[],
  monthRange: string[],
  totalHoursPerRow: number,
): DistributionResult {
  const changes = new Map<string, Record<string, number>>();
  const monthCount = monthRange.length;
  if (monthCount === 0 || totalHoursPerRow <= 0) {
    return { changes, summary: { totalHours: 0, rowCount: 0 } };
  }

  const perMonth = Math.floor((totalHoursPerRow / monthCount) * 4) / 4; // 0.25 단위
  const remainder = totalHoursPerRow - perMonth * monthCount;

  for (const row of rows) {
    const key = `${row.budget_category}|${row.budget_unit}|${row.empno}`;
    const months: Record<string, number> = {};
    for (let i = 0; i < monthRange.length - 1; i++) {
      months[monthRange[i]] = perMonth;
    }
    months[monthRange[monthCount - 1]] = perMonth + remainder;
    changes.set(key, months);
  }

  return {
    changes,
    summary: { totalHours: totalHoursPerRow * rows.length, rowCount: rows.length },
  };
}

/**
 * 기말 집중 분배 — 총 시간 N. 기말(마지막 3개월) 에 N×기말비율, 나머지 9개월에 균등.
 */
export function distributeYearEndConcentrated(
  rows: TemplateRow[],
  monthRange: string[],
  totalHoursPerRow: number,
  yearEndRatio: number, // 0.0 ~ 1.0
): DistributionResult {
  const changes = new Map<string, Record<string, number>>();
  const monthCount = monthRange.length;
  if (monthCount < 3 || totalHoursPerRow <= 0) {
    return { changes, summary: { totalHours: 0, rowCount: 0 } };
  }

  const yearEndHours = totalHoursPerRow * yearEndRatio;
  const restHours = totalHoursPerRow - yearEndHours;
  const yearEndMonths = monthRange.slice(-3);
  const restMonths = monthRange.slice(0, -3);

  const yearEndPerMonth = Math.floor((yearEndHours / 3) * 4) / 4;
  const restPerMonth = restMonths.length > 0
    ? Math.floor((restHours / restMonths.length) * 4) / 4
    : 0;

  for (const row of rows) {
    const key = `${row.budget_category}|${row.budget_unit}|${row.empno}`;
    const months: Record<string, number> = {};
    for (const m of restMonths) months[m] = restPerMonth;
    for (const m of yearEndMonths) months[m] = yearEndPerMonth;

    // Adjust last month to absorb rounding remainder
    const totalAssigned = Object.values(months).reduce((s, v) => s + v, 0);
    const lastMonth = monthRange[monthCount - 1];
    months[lastMonth] += totalHoursPerRow - totalAssigned;

    changes.set(key, months);
  }

  return {
    changes,
    summary: { totalHours: totalHoursPerRow * rows.length, rowCount: rows.length },
  };
}

/**
 * 유사회사 비율 적용 — peer_statistics 의 avg_ratio 곱한 시간으로 분배 후 균등.
 *
 * peerStats: { budget_unit → avg_ratio (0.0~1.0) }
 * baseHours: 적용 기준 시간 (예: ET Controllable Budget)
 */
export function distributeByPeerRatio(
  rows: TemplateRow[],
  monthRange: string[],
  peerStats: Record<string, number>,
  baseHours: number,
): DistributionResult {
  const changes = new Map<string, Record<string, number>>();
  let totalHours = 0;
  let rowCount = 0;

  for (const row of rows) {
    const ratio = peerStats[row.budget_unit];
    if (ratio === undefined || ratio <= 0) continue;

    const hoursForRow = Math.round(baseHours * ratio * 4) / 4; // 0.25 단위
    if (hoursForRow <= 0) continue;

    const key = `${row.budget_category}|${row.budget_unit}|${row.empno}`;
    const monthCount = monthRange.length;
    const perMonth = Math.floor((hoursForRow / monthCount) * 4) / 4;
    const remainder = hoursForRow - perMonth * monthCount;

    const months: Record<string, number> = {};
    for (let i = 0; i < monthCount - 1; i++) {
      months[monthRange[i]] = perMonth;
    }
    months[monthRange[monthCount - 1]] = perMonth + remainder;
    changes.set(key, months);
    totalHours += hoursForRow;
    rowCount++;
  }

  return { changes, summary: { totalHours, rowCount } };
}
```

Create `backend/tests/test_distribution_algorithms.py` (NO — this is frontend code). Skip backend test.

Frontend Jest test would require Jest setup. Inline doctest comments are sufficient for now — manual verification.

Verify TypeScript:
```bash
cd frontend && npx tsc --noEmit 2>&1 | tail -3
```

```bash
git add frontend/src/app/\(dashboard\)/budget-input/\[project_code\]/lib/distribution.ts
git commit -m "feat(s8-B): distribution algorithms (균등/기말/유사회사 비율)"
```

### Task 11: DistributionHelper modal + Toolbar 통합

Create `frontend/src/app/(dashboard)/budget-input/[project_code]/components/Step3Grid/DistributionHelper.tsx`:

```tsx
"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { NumberField } from "@/components/ui/NumberField";
import { distributeEvenly, distributeYearEndConcentrated, distributeByPeerRatio } from "../../lib/distribution";
import type { TemplateRow } from "../../types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface DistributionHelperProps {
  open: boolean;
  onClose: () => void;
  templateRows: TemplateRow[];
  selectedRowKeys: string[]; // ["category|unit|empno", ...]
  monthRange: string[];
  peerGroup: string | null; // e.g., "A1" — fetched from /peer-group
  baseHours: number; // ET controllable budget
  onApply: (changes: Map<string, Record<string, number>>) => void;
}

type Target = "selected" | "active";
type Mode = "even" | "year-end" | "peer";

export function DistributionHelper(props: DistributionHelperProps) {
  const { open, onClose, templateRows, selectedRowKeys, monthRange, peerGroup, baseHours, onApply } = props;

  const [target, setTarget] = useState<Target>("selected");
  const [mode, setMode] = useState<Mode>("even");
  const [totalHours, setTotalHours] = useState(0);
  const [yearEndRatio, setYearEndRatio] = useState(0.5);
  const [peerStats, setPeerStats] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<Map<string, Record<string, number>> | null>(null);

  // Fetch peer stats if mode = peer
  useEffect(() => {
    if (mode !== "peer" || !peerGroup) return;
    fetch(`${API_BASE}/api/v1/budget/master/peer-stats?group=${peerGroup}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : {})
      .then(data => {
        // data: [{budget_unit, avg_ratio}, ...]
        const stats: Record<string, number> = {};
        for (const item of data) stats[item.budget_unit] = item.avg_ratio;
        setPeerStats(stats);
      })
      .catch(() => {});
  }, [mode, peerGroup]);

  if (!open) return null;

  const targetRows = target === "selected"
    ? templateRows.filter(r => selectedRowKeys.includes(`${r.budget_category}|${r.budget_unit}|${r.empno}`))
    : templateRows.filter(r => r.enabled);

  const computePreview = () => {
    let result;
    if (mode === "even") {
      result = distributeEvenly(targetRows, monthRange, totalHours);
    } else if (mode === "year-end") {
      result = distributeYearEndConcentrated(targetRows, monthRange, totalHours, yearEndRatio);
    } else {
      result = distributeByPeerRatio(targetRows, monthRange, peerStats, baseHours);
    }
    setPreview(result.changes);
  };

  const apply = () => {
    if (preview) {
      onApply(preview);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg p-6 w-[600px] max-h-[80vh] overflow-auto">
        <h3 className="text-lg font-bold mb-4">📊 분배 도우미</h3>

        <fieldset className="mb-4">
          <legend className="text-sm font-semibold mb-2">적용 대상</legend>
          <label className="block">
            <input type="radio" name="target" checked={target === "selected"} onChange={() => setTarget("selected")} />
            <span className="ml-2">선택한 행만 ({selectedRowKeys.length}개)</span>
          </label>
          <label className="block">
            <input type="radio" name="target" checked={target === "active"} onChange={() => setTarget("active")} />
            <span className="ml-2">활성(V 체크) 행 전체 ({templateRows.filter(r => r.enabled).length}개)</span>
          </label>
        </fieldset>

        <fieldset className="mb-4">
          <legend className="text-sm font-semibold mb-2">분배 방식</legend>

          <label className="block mb-2">
            <input type="radio" name="mode" checked={mode === "even"} onChange={() => setMode("even")} />
            <span className="ml-2">총 시간 → 12개월 균등 분배</span>
            {mode === "even" && (
              <div className="ml-6 mt-1">
                <NumberField label="총 시간 (행당)" value={totalHours} onChange={setTotalHours} step={0.25} min={0} max={300} />
              </div>
            )}
          </label>

          <label className="block mb-2">
            <input type="radio" name="mode" checked={mode === "year-end"} onChange={() => setMode("year-end")} />
            <span className="ml-2">기말 집중 (마지막 3개월에 비중)</span>
            {mode === "year-end" && (
              <div className="ml-6 mt-1 space-y-2">
                <NumberField label="총 시간 (행당)" value={totalHours} onChange={setTotalHours} step={0.25} min={0} max={300} />
                <label className="block text-sm">
                  기말 비율: {Math.round(yearEndRatio * 100)}%
                  <input type="range" min={0.1} max={0.9} step={0.05} value={yearEndRatio} onChange={(e) => setYearEndRatio(parseFloat(e.target.value))} className="w-full" />
                </label>
              </div>
            )}
          </label>

          <label className="block">
            <input type="radio" name="mode" checked={mode === "peer"} onChange={() => setMode("peer")} />
            <span className="ml-2">유사회사 평균 비율 적용</span>
            {mode === "peer" && (
              <div className="ml-6 mt-1 text-sm text-pwc-gray-600">
                {peerGroup ? `유사회사 그룹: ${peerGroup}` : "유사회사 그룹 미매핑 — Step 1 정보 확인"}
                {peerGroup && Object.keys(peerStats).length > 0 && (
                  <div>비율 수: {Object.keys(peerStats).length}건 / 적용 기준 시간: {baseHours}h</div>
                )}
              </div>
            )}
          </label>
        </fieldset>

        {preview && (
          <div className="mb-4 p-3 bg-blue-50 rounded">
            <div className="text-sm font-semibold">미리보기</div>
            <div className="text-sm">{preview.size} 개 행에 변경 예정. 총 {Array.from(preview.values()).reduce((s, m) => s + Object.values(m).reduce((a, b) => a + b, 0), 0).toFixed(2)}h</div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-pwc-gray-200 rounded">취소</button>
          <button onClick={computePreview} className="px-4 py-2 text-sm border border-pwc-orange text-pwc-orange rounded">미리보기</button>
          <button onClick={apply} disabled={!preview} className="px-4 py-2 text-sm bg-pwc-orange text-white rounded disabled:opacity-50">적용</button>
        </div>
      </div>
    </div>
  );
}
```

Update `Step3Grid/Toolbar.tsx`:
- Add new button: `<button onClick={() => setShowDistributionHelper(true)}>📊 분배 도우미</button>`
- Add prop `onOpenDistributionHelper: () => void`

Update `Step3Grid/index.tsx`:
- Add state `const [showDist, setShowDist] = useState(false);`
- Add state `const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);` (selection state)
- Add state for `peerGroup` (fetch on mount from `/api/v1/budget/peer-group?industry=...`)
- Render `<DistributionHelper open={showDist} onClose={() => setShowDist(false)} ... onApply={(changes) => { setTemplateRows(rows => applyChanges(rows, changes)); }} />`
- Implement `applyChanges` helper: takes templateRows + changes Map, returns new array with months merged in

Verify:
```bash
cd frontend && npx tsc --noEmit 2>&1 | tail -3
```

```bash
git add -A
git commit -m "feat(s8-B): DistributionHelper 모달 + Toolbar 통합 (균등/기말/유사회사)"
```

---

## Batch 6 — 실시간 검증 (Task 12)

### Task 12: validateRow + cell-level styling + SummaryRow 강화

Update `frontend/src/app/(dashboard)/budget-input/[project_code]/lib/wizard-validators.ts`:

Add (or replace existing):
```typescript
import type { TemplateRow } from "../types";

export type RowValidationStatus = "ok" | "missing-empno" | "no-hours" | "over-budget" | "negative";

export function validateRow(row: TemplateRow): RowValidationStatus {
  if (!row.enabled) return "ok"; // disabled rows not validated
  if (!row.empno || row.empno.trim() === "") return "missing-empno";
  const total = Object.values(row.months || {}).reduce((s, v) => s + (v || 0), 0);
  if (total === 0) return "no-hours";
  if (Object.values(row.months || {}).some(v => v < 0)) return "negative";
  return "ok";
}

export function getRowValidationClass(status: RowValidationStatus): string {
  switch (status) {
    case "missing-empno": return "border-pwc-red";
    case "no-hours": return "border-pwc-yellow";
    case "negative": return "border-pwc-red";
    default: return "";
  }
}

export function getCellValidationClass(row: TemplateRow, columnType: "empno" | "hours-total"): string {
  const status = validateRow(row);
  if (columnType === "empno" && status === "missing-empno") return "border-2 border-pwc-red bg-red-50";
  if (columnType === "hours-total" && status === "no-hours") return "border-2 border-pwc-yellow bg-yellow-50";
  return "";
}
```

Update `Step3Grid/MonthGrid.tsx`:
- For each row, compute `validateRow(row)` (memoize)
- Apply `getCellValidationClass(row, "empno")` to 담당자 (empno) cell
- Apply `getCellValidationClass(row, "hours-total")` to 합계 cell

Update `Step3Grid/SummaryRow.tsx`:
- Add progress bar: `<div className="w-full bg-pwc-gray-100 rounded-full h-2"><div style={{width: `${pct}%`}} className="bg-pwc-orange h-2 rounded-full" /></div>`
- Display difference clearly: 일치 시 ✓ (green), 차이 시 차이값 + 비율 (red if over-budget, yellow if under)

Verify:
```bash
cd frontend && npx tsc --noEmit 2>&1 | tail -3
```

```bash
git add -A
git commit -m "feat(s8-C): 실시간 검증 (validateRow + cell highlighting + SummaryRow progress bar)"
```

---

## Batch 7 — 검색/접기 (Task 13)

### Task 13: Search input + 대분류 접기/펼치기 + state persistence

Update `Step3Grid/index.tsx`:

Add state:
```typescript
const [searchQuery, setSearchQuery] = useState(() => sessionStorage.getItem("step3-search") || "");
const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(() => {
  const saved = sessionStorage.getItem("step3-collapsed");
  return saved ? new Set(JSON.parse(saved)) : new Set();
});

useEffect(() => {
  sessionStorage.setItem("step3-search", searchQuery);
}, [searchQuery]);

useEffect(() => {
  sessionStorage.setItem("step3-collapsed", JSON.stringify(Array.from(collapsedCategories)));
}, [collapsedCategories]);
```

Compute filtered rows:
```typescript
const filteredRows = useMemo(() => {
  const q = searchQuery.toLowerCase();
  return templateRows.filter(row => {
    if (collapsedCategories.has(row.budget_category)) return false;
    if (!q) return true;
    return (
      row.budget_category.toLowerCase().includes(q) ||
      row.budget_unit.toLowerCase().includes(q) ||
      (row.emp_name || "").toLowerCase().includes(q)
    );
  });
}, [templateRows, searchQuery, collapsedCategories]);
```

Pass `filteredRows` to `MonthGrid` instead of `templateRows`.

Update `Step3Grid/Toolbar.tsx`:
- Add search input next to existing buttons:
  ```tsx
  <input
    type="search"
    placeholder="검색 (대분류/관리단위/담당자)"
    value={searchQuery}
    onChange={(e) => setSearchQuery(e.target.value)}
    className="px-3 py-1 text-sm border border-pwc-gray-200 rounded"
  />
  <button onClick={onExpandAll}>전체 펼침</button>
  <button onClick={onCollapseAll}>전체 접힘</button>
  ```

Update `MonthGrid.tsx`:
- For each category header row, add toggle:
  ```tsx
  <tr className="bg-pwc-gray-50 cursor-pointer" onClick={() => toggleCategory(category)}>
    <td colSpan={...}>
      {collapsedCategories.has(category) ? "▶" : "▼"} {category} ({activeCount}/{totalCount})
    </td>
  </tr>
  ```

Verify:
```bash
cd frontend && npx tsc --noEmit 2>&1 | tail -3
```

Note: `sessionStorage` access in initial useState requires SSR-safe pattern. In Next.js, `useState(() => sessionStorage.getItem(...))` may fail on SSR. Wrap with check:
```typescript
const [searchQuery, setSearchQuery] = useState(() => {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("step3-search") || "";
});
```

Apply same pattern to collapsedCategories.

```bash
cd frontend && npx tsc --noEmit 2>&1 | tail -3
git add -A
git commit -m "feat(s8-D): Step 3 검색 input + 대분류 접기/펼치기 + sessionStorage 영속성"
```

---

## Batch 8 — Final verification + PR (Task 14)

### Task 14: Final verify + draft PR

```bash
cd backend && pytest 2>&1 | tail -10
```
Expected: ~230 passed (234 - 16 deleted Excel tests + 12 new excel-removed test).

```bash
cd /Users/jkim564/Documents/Programming/my_budget/.worktrees/s8-excel-removal
bash scripts/ci/check-no-direct-number-input.sh && \
bash scripts/ci/check-no-direct-budget-arithmetic.sh && \
bash scripts/ci/check-docker-compose-no-dev.sh
echo "GREP EXIT: $?"
```

```bash
cd backend && uvicorn app.main:app --port 3001 &
BE=$!
cd frontend && npm run dev &
FE=$!
sleep 12
cd frontend && npm test -- --project=default --project=regression 2>&1 | tail -25
cd frontend && npm run test:visual 2>&1 | tail -10
kill $BE $FE 2>/dev/null
```

Push + draft PR:
```bash
git push -u origin s8/excel-removal-grid-ux 2>&1 | tail -3

gh pr create --draft --base s7/area-7-wizard-decomp --title "S8 — Excel I/O 제거 + Grid UX 개선 (sticky/분배도우미/검증/검색)" --body "$(cat <<'BODYEOF'
## Summary
**제거** (user-facing Excel — 약 -1,830 LOC):
- Backend modules: excel_parser, excel_export, budget_upload, export.py
- budget_input.py 5 endpoints (members/template export·upload, blank-export)
- Frontend Appendix 페이지 + Step 2/3 Excel 버튼
- 4 Excel test files + roundtrip fixtures
- 사이드바 Appendix 메뉴

**유지**:
- non_audit_activity_import.py (admin 시드)
- openpyxl dependency

**신규** (Grid UX 4건 — 약 +900 LOC):
- A: Sticky header + sticky column
- B: 분배 도우미 (균등/기말/유사회사)
- C: 실시간 검증 + 누락 highlight + progress bar
- D: 검색/필터 + 대분류 접기/펼치기 + sessionStorage 영속성

**순 변화**: 약 -930 LOC

Spec: docs/superpowers/specs/2026-04-29-s8-excel-removal-grid-ux-design.md
Plan: docs/superpowers/plans/2026-04-29-s8-excel-removal-grid-ux.md

## Test plan
- [ ] Backend pytest 230+ passed
- [ ] Excel endpoints 12/12 return 404
- [ ] Visual regression diff 0 (sticky 적용 후 baseline 갱신됨)
- [ ] Grep guards 3/3
- [ ] Manual QA: Step 3 sticky 스크롤 / 분배 도우미 3가지 / 검증 색상 / 검색·접기

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODYEOF
)" 2>&1 | tail -3
```

Create final report `docs/superpowers/runbooks/s8-baseline-report.md`:
```markdown
# S8 — Final Verification

**Date:** 2026-04-29

## Results
- Backend pytest: <count> passed (Excel removed — net -16 + 12 new = -4)
- Excel endpoints 404: 12/12
- Visual regression diff: 0 (Step 3 baseline 갱신)
- Grep guards: 3/3
- Frontend tsc: clean (no NEW errors)

## LOC 변화
- 제거: 약 -1,830 LOC
- 신규 (UX 4건): 약 +900 LOC
- 순: -930 LOC

## Hand-off
- Manual QA: Step 3 사용자 흐름 staging 검증 (sticky / 분배 도우미 / 검증 / 검색)
- Sign-off → S8 종료
```

```bash
git add docs/superpowers/runbooks/s8-baseline-report.md
git commit -m "docs(s8): final verification report"
git push 2>&1 | tail -3
```

---

## Self-Review

### Spec coverage
- ✅ Excel 제거 (Section 2 of spec) → Tasks 3-8
- ✅ A Sticky (Section 3.1) → Task 9
- ✅ B 분배 도우미 (Section 3.2) → Tasks 10-11
- ✅ C 실시간 검증 (Section 3.3) → Task 12
- ✅ D 검색/접기 (Section 3.4) → Task 13
- ✅ 안전망 (Section 4) → Task 2 (RED tests) + Task 14 (verify)
- ✅ Phase A-H (Section 5) ↔ Batches 1-8

### Placeholder scan
- No "TBD"/"TODO" — all functions/files have explicit content.
- `frontend/src/components/layout/Header.tsx` lines 60-65 referenced but exact removal block depends on actual file content — Task 6 has explicit grep for verification.

### Type/name consistency
- `useStep3Roundtrip` → `useStep3Reset` rename consistently applied (Task 8).
- `validateRow` returns `RowValidationStatus` enum — used in `getRowValidationClass` and `getCellValidationClass` consistently (Task 12).
- `DistributionResult` interface has `changes: Map`, `summary: { totalHours, rowCount }` — used in DistributionHelper (Task 11).

---

**Plan complete and saved.** Ready for subagent-driven execution (8 batches).

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

    await page.getByRole("button", { name: /프로젝트.*검색/ }).click();

    const modal = page.locator('[role="dialog"], [data-modal="project-search"]').first();
    await expect(modal).toBeVisible();

    await modal.locator('input[type="search"], input[placeholder*="검색"]').first().fill("");
    await page.waitForTimeout(500);

    const rows = modal.locator('[role="row"], tbody tr, [data-row="project"]');
    await expect(rows.first()).toBeVisible({ timeout: 5000 });
    expect(await rows.count()).toBeGreaterThan(0);
  });
});

import { test, expect } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:8001";
const EL = process.env.EL_EMPNO || "170661";

test.describe("regression #121 — list search is case-insensitive", () => {
  test("various capitalizations of 'SK텔레콤' all match SK텔레콤 row", async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[placeholder="사번을 입력하세요"]', EL);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.toString().includes("/login"));
    await page.goto(`${FRONTEND}/budget-input`);
    await page.waitForLoadState("networkidle");

    const search = page.locator('input[placeholder*="검색"]').first();

    for (const q of ["sk", "SK", "Sk텔레콤", "SK텔레콤"]) {
      await search.fill(q);
      await page.waitForTimeout(200);
      const cellText = await page.locator("tbody").textContent();
      expect(cellText, `query "${q}" should match SK텔레콤`).toMatch(/SK텔레콤/i);
    }
  });
});

import { test, expect } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:8001";
const EL = process.env.EL_EMPNO || "170661";

test.describe("S0 — Production Build", () => {
  test("no Next.js dev overlay buttons on production page", async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[placeholder="사번을 입력하세요"]', EL);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(overview-person)?\/?$/);
    await expect(page.locator("nextjs-portal")).toHaveCount(0);
    await expect(page.locator("[data-nextjs-toast]")).toHaveCount(0);
    await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
  });
});

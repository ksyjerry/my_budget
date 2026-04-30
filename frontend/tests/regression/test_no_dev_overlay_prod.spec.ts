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

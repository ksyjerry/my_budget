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
    await page.waitForURL((url) => !url.toString().includes("/login"));
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

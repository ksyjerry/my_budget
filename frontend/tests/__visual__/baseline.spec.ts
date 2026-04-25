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
        await page.waitForURL((url) => !url.toString().includes("/login"));
      }
      await page.goto(`${FRONTEND}${s.path}`);
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveScreenshot(`${s.name}.png`, { fullPage: true });
    });
  }
});

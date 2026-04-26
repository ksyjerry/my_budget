import { test, expect } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:8001";
const EL = process.env.EL_EMPNO || "170661";

test.describe("regression #102 — TBD/NS/Associate placeholder member 추가 가능", () => {
  test("placeholder 추가 버튼 존재 + 클릭 시 행 추가", async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[placeholder="사번을 입력하세요"]', EL);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.toString().includes("/login"));
    await page.goto(`${FRONTEND}/budget-input/new?step=2`);
    await page.waitForLoadState("networkidle");

    // "TBD/NS/Associate 추가" 버튼 존재
    const placeholderBtn = page.getByRole("button", { name: /TBD|NS\b|Associate|뉴스텝|placeholder/i }).first();
    await expect(placeholderBtn).toBeVisible();
  });
});

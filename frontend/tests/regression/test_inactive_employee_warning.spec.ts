import { test, expect } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:8001";
const EL = process.env.EL_EMPNO || "170661";
const INACTIVE = process.env.INACTIVE_EMPNO || "999999";

test.describe("regression #71 — inactive employee selection is blocked with alert", () => {
  test("selecting inactive employee triggers alert and does not register", async ({ page }) => {
    test.skip(!process.env.INACTIVE_EMPNO, "INACTIVE_EMPNO not set — seed an emp_status='휴직' empno for this test");

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

    const empnoSearch = page.locator('input[placeholder*="사번"], input[placeholder*="이름"]').first();
    await empnoSearch.fill(INACTIVE);
    await page.waitForTimeout(500);

    await empnoSearch.press("Enter");

    expect(alertText).toMatch(/재직|퇴사|휴직/);

    await expect(page.locator(`text=${INACTIVE}`)).toHaveCount(0);
  });
});

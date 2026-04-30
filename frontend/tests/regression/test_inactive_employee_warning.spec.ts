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
    // Wait for authentication redirect away from login before accessing protected page
    await page.waitForURL((url) => !url.toString().includes("/login"));
    await page.goto(`${FRONTEND}/budget-input/new?step=2`);
    await page.waitForLoadState("networkidle");

    // Step 2 shows empty FLDT list — add a member row first to expose the EmployeeSearch input
    await page.locator('button:has-text("구성원 추가")').first().click();
    await page.waitForTimeout(200);

    const empnoSearch = page.locator('input[placeholder*="사번"], input[placeholder*="이름"]').first();
    await empnoSearch.fill(INACTIVE);
    await page.waitForTimeout(500);

    await empnoSearch.press("Enter");

    expect(alertText).toMatch(/재직|퇴사|휴직/);

    // After alert is dismissed the search input should be cleared and the
    // inactive employee must NOT appear as a registered member row.
    // We check by looking for the display pattern "이름(empno)" that the
    // EmployeeSearch component renders for a confirmed selection.
    await expect(page.locator(`input[value="${INACTIVE}"]`)).toHaveCount(0);
    // The search input itself should be cleared (guard resets it)
    await expect(empnoSearch).toHaveValue("");
  });
});

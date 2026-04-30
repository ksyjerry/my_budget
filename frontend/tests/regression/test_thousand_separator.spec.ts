import { test, expect } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:8001";
const EL = process.env.EL_EMPNO || "170661";

test.describe("regression #70 — readOnly numeric fields display thousand separators", () => {
  test("contract hours readOnly fields use ko-KR locale formatting", async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[placeholder="사번을 입력하세요"]', EL);
    await page.click('button[type="submit"]');
    // Wait for authentication redirect away from login before accessing protected page
    await page.waitForURL((url) => !url.toString().includes("/login"));
    await page.goto(`${FRONTEND}/budget-input/new`);
    await page.waitForLoadState("networkidle");

    const contract = page.locator('label:has-text("총 계약시간")').locator("..").locator("input").first();
    await contract.fill("12345");
    await contract.blur();

    const readOnlyFields = page.locator('input[readonly]');
    const count = await readOnlyFields.count();
    expect(count).toBeGreaterThan(0);

    let foundFormatted = false;
    for (let i = 0; i < count; i++) {
      const v = await readOnlyFields.nth(i).inputValue();
      if (/^\d{1,3}(,\d{3})+/.test(v)) {
        foundFormatted = true;
        break;
      }
    }
    expect(foundFormatted).toBe(true);
  });
});

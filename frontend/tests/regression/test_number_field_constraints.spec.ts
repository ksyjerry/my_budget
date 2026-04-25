import { test, expect } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:8001";
const EL = process.env.EL_EMPNO || "170661";

test.describe("regression #74 — NumberField rejects negative / step-violations / over-max", () => {
  test("Step 1 시간 배분 rejects -1", async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[placeholder="사번을 입력하세요"]', EL);
    await page.click('button[type="submit"]');
    await page.goto(`${FRONTEND}/budget-input/new`);
    await page.waitForLoadState("networkidle");

    const axdx = page.locator('label:has-text("AX/DX")').locator("..").locator("input").first();
    await axdx.fill("-1");
    await axdx.blur();
    expect(parseFloat(await axdx.inputValue())).toBeGreaterThanOrEqual(0);
  });

  test("Step 3 month cell rejects 0.24 and 301", async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[placeholder="사번을 입력하세요"]', EL);
    await page.click('button[type="submit"]');

    await page.goto(`${FRONTEND}/budget-input`);
    await page.waitForLoadState("networkidle");
    const firstProject = page.locator('a[href*="/budget-input/"]').first();
    await firstProject.click();
    await page.goto(page.url() + "?step=3");
    await page.waitForLoadState("networkidle");

    const monthCell = page.locator('input[type="number"][step="0.25"]').first();
    if (await monthCell.count() === 0) {
      test.skip(true, "no enabled month cell on this project");
    }

    await monthCell.fill("0.24");
    await monthCell.blur();
    const v1 = parseFloat(await monthCell.inputValue());
    expect(v1 % 0.25).toBe(0);

    await monthCell.fill("301");
    await monthCell.blur();
    const v2 = parseFloat(await monthCell.inputValue());
    expect(v2).toBeLessThanOrEqual(300);
  });
});

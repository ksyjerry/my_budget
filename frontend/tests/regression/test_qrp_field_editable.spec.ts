import { test, expect } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:8001";
const EL = process.env.EL_EMPNO || "170661";

test.describe("regression #68 — QRP empno field stays editable across renders", () => {
  test("QRP empno input retains value after blur and refocus", async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[placeholder="사번을 입력하세요"]', EL);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.toString().includes("/login"));

    await page.goto(`${FRONTEND}/budget-input/new`);
    await page.waitForLoadState("networkidle");

    const qrp = page.locator('input[placeholder*="QRP 사번"]').first();
    await qrp.fill("160553");

    const projectName = page.locator('input[placeholder*="프로젝트명"]').first();
    await projectName.click();
    await qrp.click();

    await expect(qrp).toHaveValue("160553");

    await qrp.type("0", { delay: 100 });
    await expect(qrp).toHaveValue("1605530");
  });
});

import { test, expect } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:8001";
const EL = process.env.EL_EMPNO || "170661";

test.describe("S8 — /appendix route 제거됨", () => {
  test("Appendix navigation 메뉴가 사이드바에 없음", async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[placeholder="사번을 입력하세요"]', EL);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.toString().includes("/login"));

    const appendixLink = page.locator('a[href="/appendix"], nav a:has-text("Appendix")');
    expect(await appendixLink.count(), "Appendix 메뉴가 보이면 안 됨").toBe(0);
  });

  test("/appendix 직접 접근 시 404", async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[placeholder="사번을 입력하세요"]', EL);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.toString().includes("/login"));

    const resp = await page.goto(`${FRONTEND}/appendix`);
    expect(resp?.status()).toBeGreaterThanOrEqual(400);
  });
});

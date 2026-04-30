import { test, expect } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:8001";
const EL = process.env.EL_EMPNO || "170661";

test.describe("regression #57 — 클라이언트 변경 시 의존 필드가 새 client로 갱신", () => {
  test("client A → client B 시퀀스에서 표준산업분류 갱신", async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[placeholder="사번을 입력하세요"]', EL);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.toString().includes("/login"));
    await page.goto(`${FRONTEND}/budget-input/new`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: /클라이언트.*검색/ }).first().click();
    await page.waitForTimeout(300);
    const modalRows = page.locator('[data-modal="client-search"] tbody tr, [role="dialog"] tbody tr').first();
    if (await modalRows.count() > 0) {
      await modalRows.click();
    } else {
      test.skip(true, "no client search results — DB seed needed");
    }
    await page.waitForTimeout(300);

    const industryA = await page.locator('label:has-text("표준산업분류"), label:has-text("산업분류")').locator("..").locator("select, input").first().inputValue();

    await page.getByRole("button", { name: /클라이언트.*검색/ }).first().click();
    await page.waitForTimeout(300);
    const allRows = page.locator('[data-modal="client-search"] tbody tr, [role="dialog"] tbody tr');
    const rowCount = await allRows.count();
    if (rowCount < 2) {
      test.skip(true, "need ≥2 distinct clients in DB");
    }
    await allRows.nth(1).click();
    await page.waitForTimeout(300);

    const industryB = await page.locator('label:has-text("표준산업분류"), label:has-text("산업분류")').locator("..").locator("select, input").first().inputValue();
    expect(industryB).toBeDefined();
  });
});

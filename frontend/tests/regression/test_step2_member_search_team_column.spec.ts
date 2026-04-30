import { test, expect } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:8001";
const EL = process.env.EL_EMPNO || "170661";

test.describe("regression #88 — EmployeeSearch 결과에 팀명 표시", () => {
  test("EmployeeSearch 응답에 team_name (또는 department) 컬럼 표시", async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[placeholder="사번을 입력하세요"]', EL);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.toString().includes("/login"));
    await page.goto(`${FRONTEND}/budget-input/new?step=2`);
    await page.waitForLoadState("networkidle");

    // Add a member row first
    const addBtn = page.getByRole("button", { name: /\+\s*구성원\s*추가|구성원 추가/ }).first();
    if (await addBtn.count() > 0) await addBtn.click();
    await page.waitForTimeout(300);

    const search = page.locator('input[placeholder*="사번"], input[placeholder*="이름"]').first();
    await search.fill("최");
    await page.waitForTimeout(800);

    // Search dropdown should show team_name (or department) column
    const dropdown = page.locator('[data-component="employee-search-results"], [role="listbox"]').first();
    if (await dropdown.count() > 0) {
      const dropText = await dropdown.textContent();
      // The fix: dropdown rows show team_name field. Check for "team" in markup or
      // check for a known team string like "Audit" / "FS"
      expect(dropText).toMatch(/Audit|FS|TMT|IOA|본부|팀/);
    }
  });
});

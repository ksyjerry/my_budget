import { test, expect } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:8001";
const EL = process.env.EL_EMPNO || "170661";

test.describe("regression #79 #82 — Budget 입력 목록 visibility", () => {
  test("EL/PM 사용자가 본인 프로젝트가 목록에 표시됨", async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[placeholder="사번을 입력하세요"]', EL);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.toString().includes("/login"));
    await page.goto(`${FRONTEND}/budget-input`);
    await page.waitForLoadState("networkidle");

    const rows = page.locator("tbody tr");
    const visibleCodes: string[] = [];
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const code = await rows.nth(i).locator("td").first().textContent();
      if (code) visibleCodes.push(code.trim());
    }
    // EL=170661 사용자는 P1/P2/P3 보여야 (#79/#82 fix 후)
    expect(visibleCodes).toContain("AREA2-LIST-P1");
    expect(visibleCodes).toContain("AREA2-LIST-P2");
    expect(visibleCodes).toContain("AREA2-LIST-P3");
    expect(visibleCodes).not.toContain("AREA2-LIST-P4");
  });
});

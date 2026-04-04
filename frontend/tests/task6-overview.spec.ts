import { test, expect } from "@playwright/test";

// 로그인 helper
async function login(page: any, empno: string) {
  await page.goto("/login");
  await page.fill('input[placeholder*="사번"]', empno);
  await page.click('button:has-text("로그인")');
  await page.waitForURL("**/overview**", { timeout: 10000 }).catch(() => {
    // Staff는 overview-person으로 리다이렉트
  });
}

test.describe("Task #6: Budget/Actual 기준 일치 검증", () => {
  test("Overview for EL/PM — 프로젝트 테이블에 Budget/Actual 표시", async ({ page }) => {
    await login(page, "170661"); // 최성우 EL/PM

    // Overview 페이지 로드 대기
    await page.waitForSelector("text=프로젝트별 Time 현황", { timeout: 15000 });

    // 프로젝트 테이블이 데이터를 갖는지 확인
    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    console.log(`프로젝트 테이블 행 수: ${count}`);
    expect(count).toBeGreaterThan(0);

    // 첫 번째 프로젝트의 Budget/Actual 값 확인
    const firstRow = rows.first();
    const cells = firstRow.locator("td");
    const budget = await cells.nth(3).textContent();
    const actual = await cells.nth(4).textContent();
    console.log(`첫 프로젝트 — Budget: ${budget}, Actual: ${actual}`);
  });

  test("Overview for EL/PM — KPI 카드 수치 확인", async ({ page }) => {
    await login(page, "170661");

    await page.waitForSelector("text=총 계약시간", { timeout: 15000 });

    // KPI 값이 숫자인지 확인 (- 가 아닌)
    const staffBudget = await page.locator("text=Staff 총 Budget time").locator("..").locator("p").first().textContent();
    const actualTime = await page.locator("text=Actual time").locator("..").locator("p").first().textContent();
    console.log(`KPI — Staff Budget: ${staffBudget}, Actual: ${actualTime}`);

    expect(staffBudget).not.toBe("-");
  });

  test("Overview for EL/PM — EL/PM/QRP Time 테이블 확인", async ({ page }) => {
    await login(page, "170661");

    await page.waitForSelector("text=EL/PM/QRP Time", { timeout: 15000 });

    // QRP 행이 있는지, Actual이 0이 아닌 행이 있는지
    const qrpCells = page.locator("td:has-text('QRP')");
    const qrpCount = await qrpCells.count();
    console.log(`QRP 행 수: ${qrpCount}`);
  });

  test("Details for EL/PM — 검증 KPI 확인", async ({ page }) => {
    await login(page, "170661");

    // Details 페이지로 이동
    await page.goto("/projects");
    await page.waitForSelector("text=검증", { timeout: 15000 });

    // 검증 값 확인
    const verifyCard = page.locator("text=검증").locator("..").locator("p").first();
    const verifyText = await verifyCard.textContent();
    console.log(`검증 값: ${verifyText}`);
  });
});

test.describe("Task #6: Staff 뷰 검증", () => {
  test("Overview for Staff — Budget/Actual 표시", async ({ page }) => {
    await login(page, "320915"); // 지해나 Staff

    // Staff는 overview-person으로 이동
    await page.goto("/overview-person");
    await page.waitForSelector("text=BUDGET TIME", { timeout: 15000 });

    const budgetVal = await page.locator("text=BUDGET TIME").locator("..").locator("p").first().textContent();
    const actualVal = await page.locator("text=ACTUAL TIME").locator("..").locator("p").first().textContent();
    console.log(`Staff KPI — Budget: ${budgetVal}, Actual: ${actualVal}`);

    expect(budgetVal).not.toBe("0");
  });
});

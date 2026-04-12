import { test, expect } from "@playwright/test";

async function login(page: any, empno: string) {
  await page.goto("/login");
  await page.fill('input[placeholder*="사번"]', empno);
  await page.click('button:has-text("로그인")');
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 10000 });
}

test.describe("보험계리 서비스 분류 추가 검증", () => {
  test("Budget 입력 Step 1 — 서비스 분류 드롭다운에 보험계리 포함", async ({ page }) => {
    await login(page, "170661");

    // Budget 입력 페이지로 이동 (신규 프로젝트)
    await page.goto("/budget-input/new");
    await page.waitForSelector("text=서비스 분류", { timeout: 15000 });

    // "서비스 분류" 라벨 바로 아래의 select를 찾음
    const label = page.locator("label", { hasText: "서비스 분류" }).first();
    const select = label.locator("xpath=../select");
    const options = await select.locator("option").allTextContents();
    console.log("서비스 분류 옵션:", options);

    expect(options).toContain("보험계리");
    expect(options).toContain("감사");
  });

  test("API — /master/service-types에 ACT 포함", async ({ request }) => {
    // 로그인하여 토큰 획득
    const loginRes = await request.post("http://localhost:3001/api/v1/auth/login", {
      data: { empno: "170661" },
    });
    const { token } = await loginRes.json();

    const res = await request.get("http://localhost:3001/api/v1/budget/master/service-types", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    const codes = data.map((d: { code: string }) => d.code);
    console.log("서비스 분류 코드:", codes);
    expect(codes).toContain("ACT");
  });

  test("API — /master/tasks?service_type=ACT가 16개 Task 반환", async ({ request }) => {
    const loginRes = await request.post("http://localhost:3001/api/v1/auth/login", {
      data: { empno: "170661" },
    });
    const { token } = await loginRes.json();

    const res = await request.get(
      "http://localhost:3001/api/v1/budget/master/tasks?service_type=ACT",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(res.status()).toBe(200);
    const data = await res.json();
    console.log(`ACT Tasks: ${data.length}개`);
    expect(data.length).toBe(16);

    // 중분류 확인
    const categories = new Set(data.map((t: { task_category: string }) => t.task_category));
    console.log("중분류:", Array.from(categories));
    expect(categories).toContain("PMO");
    expect(categories).toContain("보험계리 정책자문");
    expect(categories).toContain("보험계리 시스템자문");
  });
});

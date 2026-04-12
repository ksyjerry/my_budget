import { test, expect } from "@playwright/test";

async function login(page: any, empno: string) {
  await page.goto("/login");
  await page.fill('input[placeholder*="사번"]', empno);
  await page.click('button:has-text("로그인")');
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 10000 });
}

test.describe("Budget Tracking — Partner Only", () => {
  test("API — /tracking/access returns has_access for registered partner", async ({ request }) => {
    const loginRes = await request.post("http://localhost:3001/api/v1/auth/login", {
      data: { empno: "120507" }, // 이재혁 (scope=self)
    });
    const { token } = await loginRes.json();

    const res = await request.get("http://localhost:3001/api/v1/tracking/access", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    console.log("Access:", data);
    expect(data.has_access).toBe(true);
    expect(data.scope).toBeDefined();
  });

  test("API — /tracking/projects returns KPI and project list", async ({ request }) => {
    const loginRes = await request.post("http://localhost:3001/api/v1/auth/login", {
      data: { empno: "120507" },
    });
    const { token } = await loginRes.json();

    const res = await request.get("http://localhost:3001/api/v1/tracking/projects", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    console.log(`KPI projects: ${data.kpi?.project_count}, EM: ${data.kpi?.total_em}`);
    expect(data.kpi).toBeDefined();
    expect(Array.isArray(data.projects)).toBe(true);
  });

  test("UI — Budget Tracking page loads for Partner", async ({ page }) => {
    await login(page, "120507");

    await page.goto("/projects/tracking");
    await page.waitForTimeout(6000); // wait for API + KPI render

    // KPI 카드 확인 (긴 timeout)
    await expect(page.locator("text=계약금액").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Budget Cost").first()).toBeVisible();
    await expect(page.locator("text=Actual Cost").first()).toBeVisible();
    await expect(page.locator("text=원가차이").first()).toBeVisible();
  });

  test("API — Non-partner receives 403 from /tracking/projects", async ({ request }) => {
    // 320915 지해나 (Staff) — partner_access_config에 없음
    const loginRes = await request.post("http://localhost:3001/api/v1/auth/login", {
      data: { empno: "320915" },
    });
    const { token } = await loginRes.json();

    const res = await request.get("http://localhost:3001/api/v1/tracking/projects", {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log("Non-partner status:", res.status());
    expect(res.status()).toBe(403);

    const accessRes = await request.get("http://localhost:3001/api/v1/tracking/access", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const accessData = await accessRes.json();
    console.log("Non-partner access:", accessData);
    expect(accessData.has_access).toBe(false);
  });

  test("API — Filter by year_month returns that specific month", async ({ request }) => {
    const loginRes = await request.post("http://localhost:3001/api/v1/auth/login", {
      data: { empno: "120507" },
    });
    const { token } = await loginRes.json();

    // 먼저 사용 가능한 월 목록 조회
    const res1 = await request.get("http://localhost:3001/api/v1/tracking/projects", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data1 = await res1.json();
    const availableYms: string[] = data1.year_months || [];
    console.log("Available year_months:", availableYms);
    expect(availableYms.length).toBeGreaterThan(0);

    if (availableYms.length > 1) {
      const targetYm = availableYms[1]; // 두 번째 월 (최신 외)
      const res2 = await request.get(
        `http://localhost:3001/api/v1/tracking/projects?year_month=${targetYm}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data2 = await res2.json();
      console.log(`Filtered to ${targetYm}, project count: ${data2.kpi?.project_count}`);
      expect(data2.kpi?.year_month).toBe(targetYm);
    }
  });

  test("API — /tracking/filter-options returns EL/PM/departments", async ({ request }) => {
    const loginRes = await request.post("http://localhost:3001/api/v1/auth/login", {
      data: { empno: "120507" },
    });
    const { token } = await loginRes.json();

    const res = await request.get("http://localhost:3001/api/v1/tracking/filter-options", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    console.log(`Filter options — projects: ${data.projects.length}, els: ${data.els.length}, depts: ${data.departments.length}`);
    expect(Array.isArray(data.projects)).toBe(true);
    expect(Array.isArray(data.els)).toBe(true);
  });
});

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
    await page.waitForSelector("text=Budget Tracking", { timeout: 15000 });

    // KPI 카드 확인
    await expect(page.locator("text=Total Revenue").first()).toBeVisible();
    await expect(page.locator("text=Std Cost").first()).toBeVisible();
    const emVisible = await page.locator("text=EM").first().isVisible();
    expect(emVisible).toBe(true);
  });

  test("UI — Non-partner sees access denied", async ({ page }) => {
    // 320915 지해나 (Staff) — partner_access_config에 없음
    await login(page, "320915");

    await page.goto("/projects/tracking");
    await page.waitForTimeout(3000);

    // "Partner 권한" 문구가 있는지 확인
    const deniedText = await page.locator("text=Partner 권한").first().isVisible().catch(() => false);
    console.log("Access denied shown:", deniedText);
    expect(deniedText).toBe(true);
  });
});

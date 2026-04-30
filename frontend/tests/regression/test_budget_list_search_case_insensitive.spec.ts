import { test, expect, request as apiRequest } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:8001";
const BACKEND = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const EL = process.env.EL_EMPNO || "170661";
const SEED_CODE = "AREA2-SKTEL-SEED";

test.describe("regression #121 — list search is case-insensitive", () => {
  test.beforeAll(async () => {
    // Seed SK텔레콤 project via backend API with session cookie
    const ctx = await apiRequest.newContext({ baseURL: BACKEND });
    // Login to get session cookie
    await ctx.post("/api/v1/auth/login", { data: { empno: EL } });
    // Create seed project
    await ctx.post("/api/v1/budget/projects", {
      data: {
        project_code: SEED_CODE,
        project_name: "SK텔레콤 2026 감사",
        el_empno: EL,
        pm_empno: EL,
        contract_hours: 100,
      },
    });
    await ctx.dispose();
  });

  test.afterAll(async () => {
    // Clean up seed project
    const ctx = await apiRequest.newContext({ baseURL: BACKEND });
    await ctx.post("/api/v1/auth/login", { data: { empno: EL } });
    await ctx.delete(`/api/v1/budget/projects/${SEED_CODE}`).catch(() => {});
    await ctx.dispose();
  });

  test("various capitalizations of 'SK텔레콤' all match SK텔레콤 row", async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[placeholder="사번을 입력하세요"]', EL);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.toString().includes("/login"));
    await page.goto(`${FRONTEND}/budget-input`);
    await page.waitForLoadState("networkidle");

    const search = page.locator('input[placeholder*="검색"]').first();

    for (const q of ["sk", "SK", "Sk텔레콤", "SK텔레콤"]) {
      await search.fill(q);
      await page.waitForTimeout(200);
      const cellText = await page.locator("tbody").textContent();
      expect(cellText, `query "${q}" should match SK텔레콤`).toMatch(/SK텔레콤/i);
    }
  });
});

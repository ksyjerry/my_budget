import { test, expect } from "@playwright/test";

const API = "http://localhost:3001/api/v1";
const EL = process.env.EL_EMPNO || "170661";
const STAFF = process.env.STAFF_EMPNO || "320915";

test.describe("S0 — Auth Authorization", () => {
  test("staff cannot POST /budget/projects", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: STAFF } });
    const r = await request.post(`${API}/budget/projects`, {
      data: {
        project_code: "S0_TEST_PJ_STAFF",
        project_name: "Staff 거부",
        el_empno: EL,
        pm_empno: EL,
        contract_hours: 100,
      },
    });
    expect(r.status()).toBe(403);
  });

  test("staff cannot sync employees", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: STAFF } });
    const r = await request.post(`${API}/sync/employees`);
    expect([401, 403]).toContain(r.status());
  });

  test("unauthenticated request is 401", async ({ playwright }) => {
    const ctx = await playwright.request.newContext();
    const r = await ctx.post(`${API}/budget/projects`, { data: {} });
    expect(r.status()).toBe(401);
    await ctx.dispose();
  });
});

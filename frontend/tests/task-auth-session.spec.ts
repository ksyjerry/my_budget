import { test, expect } from "@playwright/test";

const API = "http://localhost:3001/api/v1";
const EL = process.env.EL_EMPNO || "170661";

test.describe("S0 — Auth Session", () => {
  test("GET /auth/me without cookie is 401", async ({ playwright }) => {
    const ctx = await playwright.request.newContext();
    const res = await ctx.get(`${API}/auth/me`);
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });

  test("logout revokes session and /auth/me becomes 401", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const meOk = await request.get(`${API}/auth/me`);
    expect(meOk.status()).toBe(200);
    const logout = await request.post(`${API}/auth/logout`);
    expect(logout.status()).toBe(200);
    const meAfter = await request.get(`${API}/auth/me`);
    expect(meAfter.status()).toBe(401);
  });

  test("different request contexts have isolated cookie jars", async ({ playwright }) => {
    const ctxA = await playwright.request.newContext();
    const ctxB = await playwright.request.newContext();
    await ctxA.post(`${API}/auth/login`, { data: { empno: EL } });
    const meA = await ctxA.get(`${API}/auth/me`);
    expect(meA.status()).toBe(200);
    const meB = await ctxB.get(`${API}/auth/me`);
    expect(meB.status()).toBe(401);
    await ctxA.dispose();
    await ctxB.dispose();
  });
});

import { test, expect } from "@playwright/test";

const API = "http://localhost:3001/api/v1";
const EL = process.env.EL_EMPNO || "170661";
const STAFF = process.env.STAFF_EMPNO || "320915";

test.describe("S0 — Auth Login", () => {
  test("valid empno returns user and sets httpOnly cookie", async ({ request }) => {
    const res = await request.post(`${API}/auth/login`, { data: { empno: EL } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.empno).toBe(EL);
    expect(body.role).toMatch(/^(elpm|admin|staff)$/);
    const setCookie = res.headers()["set-cookie"] || "";
    expect(setCookie).toContain("mybudget_session=");
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
    expect(body.token).toBeUndefined();
  });

  test("unknown empno returns 401", async ({ request }) => {
    const res = await request.post(`${API}/auth/login`, { data: { empno: "ZZZZZZ" } });
    expect(res.status()).toBe(401);
  });

  test("staff empno returns role=staff", async ({ request }) => {
    const res = await request.post(`${API}/auth/login`, { data: { empno: STAFF } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.role).toBe("staff");
  });

  test("GET /auth/me returns current user after login", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const me = await request.get(`${API}/auth/me`);
    expect(me.status()).toBe(200);
    const body = await me.json();
    expect(body.empno).toBe(EL);
  });
});

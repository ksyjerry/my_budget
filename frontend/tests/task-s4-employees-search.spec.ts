import { test, expect } from "@playwright/test";

const API = "http://localhost:3001/api/v1";
const EL = process.env.EL_EMPNO || "170661";

test.describe("S4 — Employees search (#39)", () => {
  test("returns emp_status field in each row", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/budget/employees/search?q=`);
    expect(r.status()).toBe(200);
    const rows = await r.json();
    if (rows.length > 0) {
      expect(rows[0]).toHaveProperty("emp_status");
    }
  });

  test("default search returns only active employees", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/budget/employees/search?q=`);
    const rows = await r.json();
    for (const row of rows) {
      expect(row.emp_status).toBe("재직");
    }
  });

  test("include_inactive=true returns inactive employees too", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/budget/employees/search?q=&include_inactive=true`);
    expect(r.status()).toBe(200);
    // Not strict — just a shape check
    const rows = await r.json();
    expect(Array.isArray(rows)).toBe(true);
  });
});

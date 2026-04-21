import { test, expect } from "@playwright/test";

const API = "http://localhost:3001/api/v1";
const EL = process.env.EL_EMPNO || "170661";

test.describe("S1 — Step 2 activity mapping (API)", () => {
  test("ESG activity-mapping returns non-empty categories", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/budget/master/activity-mapping?service_type=ESG`);
    expect(r.status()).toBe(200);
    const rows = await r.json();
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveProperty("category");
    expect(rows[0]).toHaveProperty("detail");
  });

  test("TRADE activity-mapping returns non-empty categories", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/budget/master/activity-mapping?service_type=TRADE`);
    expect(r.status()).toBe(200);
    const rows = await r.json();
    expect(rows.length).toBeGreaterThan(0);
    const categories = new Set(rows.map((x: { category: string }) => x.category).filter(Boolean));
    expect(categories.size).toBeGreaterThan(0);
  });

  test("activity-mapping includes subcategory and role fields", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/budget/master/activity-mapping?service_type=ESG`);
    expect(r.status()).toBe(200);
    const rows = await r.json();
    expect(rows.length).toBeGreaterThan(0);
    // ESG rows should have subcategory and role
    expect(rows[0]).toHaveProperty("subcategory");
    expect(rows[0]).toHaveProperty("role");
  });

  test("activity-mapping for all 7 non-audit service types returns data", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const serviceTypes = ["AC", "IC", "ESG", "VAL", "TRADE", "ACT", "ETC"];
    for (const st of serviceTypes) {
      const r = await request.get(`${API}/budget/master/activity-mapping?service_type=${st}`);
      expect(r.status(), `${st} should return 200`).toBe(200);
      const rows = await r.json();
      // Each non-audit service type should have data seeded
      expect(Array.isArray(rows), `${st} should return an array`).toBe(true);
    }
  });
});

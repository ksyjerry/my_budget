import { test, expect } from "@playwright/test";

const API = "http://localhost:3001/api/v1";
const EL = process.env.EL_EMPNO || "170661";

test.describe("S2 — Overview aggregation integrity (API)", () => {
  test("overview returns non-negative KPI values", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/overview`);
    expect(r.status()).toBe(200);
    const body = await r.json();
    const kpi = body.kpi || {};
    if (typeof kpi.budget_total === "number") {
      expect(kpi.budget_total).toBeGreaterThanOrEqual(0);
    }
    if (typeof kpi.actual_total === "number") {
      expect(kpi.actual_total).toBeGreaterThanOrEqual(0);
    }
  });

  test("elpm_qrp_time rows have no duplicates per (project, empno, role)", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/overview`);
    expect(r.status()).toBe(200);
    const body = await r.json();
    const rows = body.elpm_qrp_time || [];
    const seen = new Set<string>();
    for (const row of rows) {
      const key = `${row.project_code || ""}|${row.empno || ""}|${row.role || ""}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  test("staff_time has expected shape when present", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/overview`);
    expect(r.status()).toBe(200);
    const body = await r.json();
    if (Array.isArray(body.staff_time) && body.staff_time.length > 0) {
      expect(body.staff_time[0]).toHaveProperty("empno");
    }
  });

  test("budget_by_category and budget_by_unit present", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/overview`);
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body).toHaveProperty("budget_by_category");
    expect(body).toHaveProperty("budget_by_unit");
  });
});

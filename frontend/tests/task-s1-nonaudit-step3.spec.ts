import { test, expect } from "@playwright/test";

const API = "http://localhost:3001/api/v1";
const EL = process.env.EL_EMPNO || "170661";

test.describe("S1 — Step 3 budget units (non-audit tasks)", () => {
  test("/master/tasks?service_type=TRADE is non-empty after seed", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/budget/master/tasks?service_type=TRADE`);
    expect(r.status()).toBe(200);
    const rows = await r.json();
    expect(rows.length).toBeGreaterThan(0);
    const categories = new Set(rows.map((x: { task_category: string }) => x.task_category).filter(Boolean));
    expect(categories.size).toBeGreaterThan(0);
  });

  test("/master/tasks returns extended fields (activity_detail, role)", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/budget/master/tasks?service_type=ESG`);
    expect(r.status()).toBe(200);
    const rows = await r.json();
    if (rows.length > 0) {
      expect(rows[0]).toHaveProperty("activity_detail");
      expect(rows[0]).toHaveProperty("role");
      expect(rows[0]).toHaveProperty("budget_unit");
    }
  });

  test("/master/tasks?service_type=ESG returns ESG-specific tasks", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/budget/master/tasks?service_type=ESG`);
    expect(r.status()).toBe(200);
    const rows = await r.json();
    expect(rows.length).toBeGreaterThan(0);
    // All returned rows should belong to ESG
    for (const row of rows) {
      expect(row.service_type).toBe("ESG");
    }
  });

  test("/master/tasks?service_type=ACT returns actuarial tasks", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/budget/master/tasks?service_type=ACT`);
    expect(r.status()).toBe(200);
    const rows = await r.json();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.service_type).toBe("ACT");
    }
  });

  test("/master/tasks fields include sort_order and task_name", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/budget/master/tasks?service_type=VAL`);
    expect(r.status()).toBe(200);
    const rows = await r.json();
    if (rows.length > 0) {
      expect(rows[0]).toHaveProperty("sort_order");
      expect(rows[0]).toHaveProperty("task_name");
      expect(rows[0]).toHaveProperty("task_category");
      expect(rows[0]).toHaveProperty("service_type");
    }
  });
});

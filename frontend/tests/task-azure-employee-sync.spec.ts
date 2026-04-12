import { test, expect } from "@playwright/test";

const API = "http://localhost:3001/api/v1";
const ADMIN_EMPNO = process.env.ADMIN_EMPNO || "160553";

async function adminLogin(request: any): Promise<string> {
  const res = await request.post(`${API}/auth/login`, { data: { empno: ADMIN_EMPNO } });
  const j = await res.json();
  return j.token;
}

test.describe("Azure Employee Sync", () => {
  test("API — /sync/employees/status requires auth and returns counts", async ({ request }) => {
    const unauth = await request.get(`${API}/sync/employees/status`);
    expect(unauth.status()).toBe(401);

    const token = await adminLogin(request);
    const res = await request.get(`${API}/sync/employees/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const s = await res.json();
    expect(s).toHaveProperty("total_employees");
    expect(s).toHaveProperty("last_sync");
    expect(s.total_employees).toBeGreaterThan(0);
    console.log(`Employees — total: ${s.total_employees}, last_sync: ${s.last_sync}`);
  });

  test("API — /sync/employees rejects non-admin", async ({ request }) => {
    const loginRes = await request.post(`${API}/auth/login`, { data: { empno: "320915" } });
    const { token } = await loginRes.json();
    const res = await request.post(`${API}/sync/employees`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("API — admin can trigger employee sync", async ({ request }) => {
    const token = await adminLogin(request);
    const res = await request.post(`${API}/sync/employees`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const j = await res.json();
    expect(j.synced).toBeGreaterThan(0);
    console.log(`Synced ${j.synced} employees in ${j.elapsed_ms}ms`);
  });

  test("API — /budget/employees/search by full name returns active employees", async ({ request }) => {
    // 김수진 (full 2-Korean-char name, avoids len(q)<2 guard)
    const res = await request.get(`${API}/budget/employees/search?q=${encodeURIComponent("김수진")}`);
    expect(res.status()).toBe(200);
    const rows = await res.json();
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r).toHaveProperty("empno");
      expect(r).toHaveProperty("name");
      expect(r).toHaveProperty("grade");
      expect(r).toHaveProperty("department");
      expect(r.name).toContain("김수진");
    }
  });

  test("API — /budget/employees/search by empno returns that employee", async ({ request }) => {
    // Seed the known admin empno 160553
    const res = await request.get(`${API}/budget/employees/search?q=160553`);
    expect(res.status()).toBe(200);
    const rows = await res.json();
    expect(Array.isArray(rows)).toBe(true);
    // 160553 should exist after sync
    const found = rows.find((r: any) => r.empno === "160553");
    expect(found).toBeTruthy();
  });

  test("API — /budget/employees/search returns [] for empty query", async ({ request }) => {
    const res = await request.get(`${API}/budget/employees/search?q=`);
    expect(res.status()).toBe(200);
    const rows = await res.json();
    expect(rows).toEqual([]);
  });
});

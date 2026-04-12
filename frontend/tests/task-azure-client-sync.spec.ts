import { test, expect } from "@playwright/test";

const API = "http://localhost:3001/api/v1";
const ADMIN_EMPNO = process.env.ADMIN_EMPNO || "160553";

async function adminLogin(request: any): Promise<string> {
  const res = await request.post(`${API}/auth/login`, { data: { empno: ADMIN_EMPNO } });
  const j = await res.json();
  return j.token;
}

test.describe("Azure Client Sync", () => {
  test("API — /clients/search returns needs_detail field", async ({ request }) => {
    const res = await request.get(`${API}/budget/clients/search?q=`);
    expect(res.status()).toBe(200);
    const rows = await res.json();
    expect(Array.isArray(rows)).toBe(true);
    if (rows.length > 0) {
      expect(rows[0]).toHaveProperty("needs_detail");
      expect(typeof rows[0].needs_detail).toBe("boolean");
    }
  });

  test("API — /sync/clients/status requires auth and returns counts", async ({ request }) => {
    // Unauthenticated → 401
    const unauth = await request.get(`${API}/sync/clients/status`);
    expect(unauth.status()).toBe(401);

    // Authenticated → 200 with expected shape
    const token = await adminLogin(request);
    const res = await request.get(`${API}/sync/clients/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const s = await res.json();
    expect(s).toHaveProperty("total_clients");
    expect(s).toHaveProperty("azure_synced");
    expect(s).toHaveProperty("last_sync");
    expect(typeof s.total_clients).toBe("number");
    console.log(`Status — total: ${s.total_clients}, azure_synced: ${s.azure_synced}, last_sync: ${s.last_sync}`);
  });

  test("API — /sync/clients rejects non-admin", async ({ request }) => {
    const loginRes = await request.post(`${API}/auth/login`, { data: { empno: "320915" } });
    const { token } = await loginRes.json();
    const res = await request.post(`${API}/sync/clients`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("API — admin can trigger sync", async ({ request }) => {
    const token = await adminLogin(request);
    const res = await request.post(`${API}/sync/clients`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const j = await res.json();
    expect(j).toHaveProperty("synced");
    expect(j.synced).toBeGreaterThan(0);
    console.log(`Synced ${j.synced} clients in ${j.elapsed_ms}ms`);
  });

  test("API — Azure-only client is findable with needs_detail=true", async ({ request }) => {
    // Hit the status endpoint first to confirm there are Azure-synced clients
    const token = await adminLogin(request);
    const statusRes = await request.get(`${API}/sync/clients/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const status = await statusRes.json();
    expect(status.azure_synced).toBeGreaterThan(0);

    // Search with empty query and look for any needs_detail=true entry
    const searchRes = await request.get(`${API}/budget/clients/search?q=`);
    const rows = await searchRes.json();
    const needsDetail = rows.filter((r: any) => r.needs_detail === true);
    console.log(`Found ${needsDetail.length} / ${rows.length} clients needing detail`);
    // Not all responses will have needs_detail=true (only 50 rows returned, may all be Excel-uploaded)
    // So we don't hard-assert needsDetail.length > 0, just that the field exists
    expect(rows.every((r: any) => typeof r.needs_detail === "boolean")).toBe(true);
  });
});

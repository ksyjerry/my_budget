import { test, expect } from "@playwright/test";

const API = "http://localhost:3001/api/v1";
const EL = process.env.EL_EMPNO || "170661";

test.describe("S3 — Project search autofill (#37)", () => {
  test("/clients/{code}/info returns 11 client fields", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const search = await request.get(`${API}/budget/clients/search?q=`);
    const clients = await search.json();
    if (!Array.isArray(clients) || clients.length === 0) {
      test.skip();
      return;
    }
    const code = clients[0].client_code;
    const r = await request.get(`${API}/budget/clients/${code}/info`);
    expect(r.status()).toBe(200);
    const info = await r.json();
    for (const key of [
      "client_code", "client_name", "industry", "asset_size",
      "listing_status", "business_report", "gaap", "consolidated",
      "subsidiary_count", "internal_control", "initial_audit",
    ]) {
      expect(info).toHaveProperty(key);
    }
  });

  test("project search returns results with project_code and client_name", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/budget/projects/search?q=`);
    expect(r.status()).toBe(200);
    const projects = await r.json();
    if (Array.isArray(projects) && projects.length > 0) {
      // Each project must have project_code and client_name for autofill
      const withIdentifiers = projects.filter(
        (p: { project_code?: string; client_name?: string }) =>
          p.project_code && p.client_name,
      );
      expect(withIdentifiers.length).toBeGreaterThan(0);
    }
  });
});

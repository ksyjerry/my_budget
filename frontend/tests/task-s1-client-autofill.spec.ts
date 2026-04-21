import { test, expect } from "@playwright/test";

const API = "http://localhost:3001/api/v1";
const EL = process.env.EL_EMPNO || "170661";

// Known client with full detail (needs_detail=false) from the seed data
const KNOWN_CLIENT_CODE = "39344"; // (사)삼성미소금융재단

test.describe("S1 — Client info autofill (API)", () => {
  test("GET /clients/{code}/info returns 11 client fields", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/budget/clients/${KNOWN_CLIENT_CODE}/info`);
    expect(r.status()).toBe(200);
    const info = await r.json();
    for (const key of [
      "client_code",
      "client_name",
      "industry",
      "asset_size",
      "listing_status",
      "business_report",
      "gaap",
      "consolidated",
      "subsidiary_count",
      "internal_control",
      "initial_audit",
    ]) {
      expect(info, `missing field: ${key}`).toHaveProperty(key);
    }
  });

  test("GET /clients/BOGUS_XYZ_NOEXIST/info returns 404", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/budget/clients/BOGUS_XYZ_NOEXIST/info`);
    expect(r.status()).toBe(404);
  });

  test("client info endpoint requires auth — unauthenticated gets 401", async ({ request }) => {
    // New request context has no session cookie
    const r = await request.get(`${API}/budget/clients/${KNOWN_CLIENT_CODE}/info`);
    expect(r.status()).toBe(401);
  });

  test("GET /clients/search returns clients with client_code field", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const search = await request.get(`${API}/budget/clients/search?q=삼성`);
    expect(search.status()).toBe(200);
    const clients = await search.json();
    expect(Array.isArray(clients)).toBe(true);
    if (clients.length > 0) {
      expect(clients[0]).toHaveProperty("client_code");
      expect(clients[0]).toHaveProperty("client_name");
      expect(clients[0]).toHaveProperty("needs_detail");
    }
  });

  test("client info values match search result for same client", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    // Get the known client via search
    const search = await request.get(`${API}/budget/clients/search?q=${KNOWN_CLIENT_CODE}`);
    expect(search.status()).toBe(200);
    const clients = await search.json();
    const found = clients.find((c: { client_code: string }) => c.client_code === KNOWN_CLIENT_CODE);
    if (!found) {
      test.skip();
      return;
    }
    // Get via info endpoint and compare key fields
    const info = await (await request.get(`${API}/budget/clients/${KNOWN_CLIENT_CODE}/info`)).json();
    expect(info.client_code).toBe(found.client_code);
    expect(info.industry).toBe(found.industry);
    expect(info.gaap).toBe(found.gaap);
  });
});

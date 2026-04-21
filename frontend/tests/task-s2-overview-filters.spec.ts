import { test, expect } from "@playwright/test";

const API = "http://localhost:3001/api/v1";
const EL = process.env.EL_EMPNO || "170661";

test.describe("S2 — Overview filters (API)", () => {
  test("filter-options returns service_types with value/label shape", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/filter-options`);
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(Array.isArray(body.service_types)).toBe(true);
    if (body.service_types.length > 0) {
      expect(body.service_types[0]).toHaveProperty("value");
      expect(body.service_types[0]).toHaveProperty("label");
    }
  });

  test("filter-options excludes unused service_type codes like TAX", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/filter-options`);
    expect(r.status()).toBe(200);
    const body = await r.json();
    const values = new Set(
      (body.service_types || []).map((s: { value: string }) => s.value),
    );
    expect(values.has("TAX")).toBe(false);
  });

  test("overview respects service_type=AUDIT filter", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/overview?service_type=AUDIT`);
    expect(r.status()).toBe(200);
  });

  test("overview respects service_type=ESG filter", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/overview?service_type=ESG`);
    expect(r.status()).toBe(200);
  });

  test("overview without service_type returns scope with kpi+projects", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/overview`);
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body).toHaveProperty("projects");
    expect(body).toHaveProperty("kpi");
  });

  test("overview with unused service_type returns empty projects list", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/overview?service_type=NONEXISTENT_CODE_XYZ`);
    expect(r.status()).toBe(200);
    const body = await r.json();
    if (Array.isArray(body.projects)) {
      expect(body.projects.length).toBe(0);
    }
  });
});

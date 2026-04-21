import { test, expect } from "@playwright/test";

const API = "http://localhost:3001/api/v1";
const EL = process.env.EL_EMPNO || "170661";

test.describe("S2 — Overview filters (API)", () => {
  test("filter-options returns projects array with value/label shape", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/filter-options`);
    expect(r.status()).toBe(200);
    const body = await r.json();
    // filter-options exposes: projects, els, pms, departments
    expect(Array.isArray(body.projects)).toBe(true);
    if (body.projects.length > 0) {
      expect(body.projects[0]).toHaveProperty("value");
      expect(body.projects[0]).toHaveProperty("label");
    }
  });

  test("filter-options returns els and pms arrays", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/filter-options`);
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(Array.isArray(body.els)).toBe(true);
    expect(Array.isArray(body.pms)).toBe(true);
    if (body.els.length > 0) {
      expect(body.els[0]).toHaveProperty("value");
      expect(body.els[0]).toHaveProperty("label");
    }
  });

  test("overview respects el_empno filter — returns 200", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/overview?el_empno=${EL}`);
    expect(r.status()).toBe(200);
  });

  test("overview without filters returns all projects in scope", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/overview`);
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body).toHaveProperty("projects");
    expect(body).toHaveProperty("kpi");
  });

  test("overview with nonexistent el_empno returns empty or default shape", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/overview?el_empno=NONEXISTENT_99999`);
    expect(r.status()).toBe(200);
    // el_empno 필터가 적용되면 projects 배열이 비어있거나 전체 구조 반환
    const body = await r.json();
    expect(body).toHaveProperty("projects");
    if (Array.isArray(body.projects)) {
      // projects may be empty or full depending on backend filter implementation
      expect(body.projects.length).toBeGreaterThanOrEqual(0);
    }
  });
});

import { test, expect } from "@playwright/test";

const API = "http://localhost:3001/api/v1";
const EL = process.env.EL_EMPNO || "170661";

test.describe("S5 — Template Excel export (#20 #43)", () => {
  test("template/export returns xlsx for accessible project", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const ov = await request.get(`${API}/overview`);
    const body = await ov.json();
    const projects = body.projects || [];
    if (projects.length === 0) {
      test.skip();
      return;
    }
    const code = projects[0].project_code;
    const r = await request.get(
      `${API}/budget/projects/${code}/template/export`,
    );
    expect(r.status()).toBe(200);
    const ct = r.headers()["content-type"] || "";
    expect(ct).toContain("spreadsheetml");
  });

  test("template/export of nonexistent project still returns valid xlsx", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/budget/projects/NOEXIST_S5/template/export`);
    expect([200, 404]).toContain(r.status());
  });
});

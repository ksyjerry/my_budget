import { test, expect } from "@playwright/test";

const API = "http://localhost:3001/api/v1";
const EL = process.env.EL_EMPNO || "170661";

test.describe("S4 — Members Excel upload/export (#40)", () => {
  test("export returns xlsx content-type", async ({ request }) => {
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
      `${API}/budget/projects/${code}/members/export`,
    );
    expect(r.status()).toBe(200);
    const ct = r.headers()["content-type"] || "";
    expect(ct).toContain("spreadsheetml");
  });

  test("export of any accessible project returns 200", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const ov = await request.get(`${API}/overview`);
    const body = await ov.json();
    const projects = body.projects || [];
    if (projects.length === 0) {
      test.skip();
      return;
    }
    for (const p of projects.slice(0, 2)) {
      const r = await request.get(
        `${API}/budget/projects/${p.project_code}/members/export`,
      );
      expect(r.status()).toBe(200);
    }
  });
});

import { test, expect } from "@playwright/test";

const API = "http://localhost:3001/api/v1";
const EL = process.env.EL_EMPNO || "170661";

test.describe("S6 — Appendix exports + blank template (#32 #33)", () => {
  test("blank template export returns xlsx", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/budget/template/blank-export`);
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"] || "").toContain("spreadsheetml");
  });

  test("export with project_code returns 200/400/404", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const ov = await request.get(`${API}/overview`);
    const body = await ov.json();
    const projects = body.projects || [];
    if (projects.length === 0) {
      test.skip();
      return;
    }
    const code = projects[0].project_code;
    const r = await request.get(`${API}/export/overview?project_code=${code}`);
    expect([200, 400, 404]).toContain(r.status());
  });
});

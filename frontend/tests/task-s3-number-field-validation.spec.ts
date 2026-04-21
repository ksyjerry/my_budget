import { test, expect } from "@playwright/test";

const API = "http://localhost:3001/api/v1";
const EL = process.env.EL_EMPNO || "170661";

test.describe("S3 — AI endpoint error shape (#18 #42)", () => {
  test("suggest returns structured error with detail field", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.post(`${API}/budget-assist/suggest`, {
      data: {
        project_code: "NONEXISTENT",
        et_controllable: 100.0,
        enabled_units: [{ category: "자산", unit_name: "매출채권-일반" }],
        members: [{ empno: EL, name: "최성우", grade: "EL" }],
      },
    });
    // config 미설정 시 500/503, 설정 있지만 호출 실패 시 502, 성공 시 200
    expect([200, 500, 502, 503]).toContain(r.status());
    if (r.status() !== 200) {
      const body = await r.json();
      expect(body).toHaveProperty("detail");
      expect(typeof body.detail).toBe("string");
      expect(body.detail.length).toBeGreaterThan(0);
    }
  });

  test("validate returns structured error with detail field", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.post(`${API}/budget-assist/validate`, {
      data: {
        project_code: "NONEXISTENT",
        et_controllable: 100.0,
        rows: [],
      },
    });
    expect([200, 500, 502, 503]).toContain(r.status());
    if (r.status() !== 200) {
      const body = await r.json();
      expect(body).toHaveProperty("detail");
    }
  });
});

import { test, expect } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:8001";
const EL = process.env.EL_EMPNO || "170661";

const PAGES = [
  "/", "/overview-person", "/projects", "/assignments",
  "/summary", "/budget-input", "/appendix",
];

test.describe("smoke — no console errors anywhere", () => {
  for (const path of PAGES) {
    test(`${path} has 0 console errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });
      page.on("pageerror", (err) => errors.push(String(err)));

      await page.goto(`${FRONTEND}/login`);
      await page.fill('input[placeholder="사번을 입력하세요"]', EL);
      await page.click('button[type="submit"]');
      await page.waitForURL((url) => !url.toString().includes("/login"));

      await page.goto(`${FRONTEND}${path}`);
      await page.waitForLoadState("networkidle");

      // Filter out known noise (3rd party, font fetch quirks). Adjust as needed.
      const filtered = errors.filter((e) =>
        !/favicon|chrome-extension|net::ERR_INTERNET_DISCONNECTED/.test(e)
      );
      expect(filtered, `${path} console errors: ${JSON.stringify(filtered, null, 2)}`).toHaveLength(0);
    });
  }
});

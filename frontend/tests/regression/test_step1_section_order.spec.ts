import { test, expect } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:8001";
const EL = process.env.EL_EMPNO || "170661";

test.describe("regression #62 — Step 1 프로젝트 정보 섹션이 클라이언트 정보 위에 위치", () => {
  test("프로젝트 정보 h-tag y가 클라이언트 정보 h-tag y보다 작음", async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[placeholder="사번을 입력하세요"]', EL);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.toString().includes("/login"));
    await page.goto(`${FRONTEND}/budget-input/new`);
    await page.waitForLoadState("networkidle");

    const projectInfoHeading = page.locator(':is(h1,h2,h3,h4):has-text("프로젝트 정보")').first();
    const clientInfoHeading = page.locator(':is(h1,h2,h3,h4):has-text("클라이언트 기본정보")').first();
    await expect(projectInfoHeading).toBeVisible();
    await expect(clientInfoHeading).toBeVisible();

    const projY = (await projectInfoHeading.boundingBox())?.y ?? Infinity;
    const cliY = (await clientInfoHeading.boundingBox())?.y ?? -Infinity;
    expect(projY, "프로젝트 정보가 클라이언트 정보보다 위에 있어야").toBeLessThan(cliY);
  });
});

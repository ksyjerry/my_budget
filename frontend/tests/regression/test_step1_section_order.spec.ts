import { test, expect } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:8001";
const EL = process.env.EL_EMPNO || "170661";

test.describe("Step 1 섹션 순서 — 서비스 분류 → 클라이언트 정보 → 프로젝트 정보", () => {
  test("서비스 분류 → 클라이언트 정보 → 프로젝트 정보 순으로 위→아래 배치", async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[placeholder="사번을 입력하세요"]', EL);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.toString().includes("/login"));
    await page.goto(`${FRONTEND}/budget-input/new`);
    await page.waitForLoadState("networkidle");

    const serviceHeading = page.locator(':is(h1,h2,h3,h4):has-text("서비스 분류")').first();
    const clientInfoHeading = page.locator(':is(h1,h2,h3,h4):has-text("클라이언트 기본정보")').first();
    const projectInfoHeading = page.locator(':is(h1,h2,h3,h4):has-text("프로젝트 정보")').first();
    await expect(serviceHeading).toBeVisible();
    await expect(clientInfoHeading).toBeVisible();
    await expect(projectInfoHeading).toBeVisible();

    const svcY = (await serviceHeading.boundingBox())?.y ?? Infinity;
    const cliY = (await clientInfoHeading.boundingBox())?.y ?? Infinity;
    const projY = (await projectInfoHeading.boundingBox())?.y ?? -Infinity;
    expect(svcY, "서비스 분류가 클라이언트 정보보다 위에 있어야").toBeLessThan(cliY);
    expect(cliY, "클라이언트 정보가 프로젝트 정보보다 위에 있어야").toBeLessThan(projY);
  });
});

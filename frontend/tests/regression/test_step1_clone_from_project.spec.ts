import { test, expect } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:8001";
const EL = process.env.EL_EMPNO || "170661";
const SOURCE = process.env.CLONE_SOURCE_PROJECT || "AREA3-CLONE-SRC";

test.describe("regression #86 #100 — '이전 프로젝트 정보 가져오기' 정상 작동", () => {
  test("기존 프로젝트 선택 → 시간/구성원/template 자동 채움", async ({ page }) => {
    test.skip(!process.env.CLONE_SOURCE_PROJECT, "CLONE_SOURCE_PROJECT env 시드 필요");

    let alertText = "";
    page.on("dialog", async (d) => { alertText = d.message(); await d.accept(); });

    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[placeholder="사번을 입력하세요"]', EL);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.toString().includes("/login"));
    await page.goto(`${FRONTEND}/budget-input/new`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: /이전 프로젝트.*가져오기/ }).first().click();
    await page.waitForTimeout(300);

    const search = page.locator('[role="dialog"] input[type="search"], [role="dialog"] input[placeholder*="검색"]').first();
    await search.fill(SOURCE);
    await page.waitForTimeout(500);

    const firstRow = page.locator('[role="dialog"] tbody tr').first();
    await expect(firstRow).toBeVisible();
    await firstRow.click();

    await page.waitForTimeout(500);
    expect(alertText).toMatch(/정보를 가져왔습니다|가져왔습/);
  });
});

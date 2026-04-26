import { test, expect } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:8001";
const EL = process.env.EL_EMPNO || "170661";

test.describe("regression #101 — Step 1에 Fulcrum/RA-Staff/Specialist 입력칸 없음 (POL-06 (a))", () => {
  test("Step 1 화면에 fulcrum/ra-staff/specialist label 0개", async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[placeholder="사번을 입력하세요"]', EL);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.toString().includes("/login"));
    await page.goto(`${FRONTEND}/budget-input/new`);
    await page.waitForLoadState("networkidle");

    const fulcrumLabel = page.locator('label:has-text("Fulcrum")');
    const raStaffLabel = page.locator('label:has-text("RA-Staff"), label:has-text("RA Staff"), label:has-text("RA 스태프")');
    const specialistLabel = page.locator('label:has-text("Specialist")');

    expect(await fulcrumLabel.count(), "Step 1에 Fulcrum 라벨이 보이면 안 됨").toBe(0);
    expect(await raStaffLabel.count(), "Step 1에 RA-Staff 라벨이 보이면 안 됨").toBe(0);
    expect(await specialistLabel.count(), "Step 1에 Specialist 라벨이 보이면 안 됨").toBe(0);
  });
});

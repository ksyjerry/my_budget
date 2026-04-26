import { test, expect } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:8001";
const PM = process.env.PM_EMPNO || "170661";

const PROJECT = "AREA2-LIST-P1";  // seeded by Task 2 backend test

test.describe("regression #61 #98 — POL-04 워크플로우 PM submit → EL approve", () => {
  test("PM submits, EL approves, EL can unlock", async ({ page }) => {
    // Accept all native confirm() dialogs automatically
    page.on("dialog", (dialog) => dialog.accept());

    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[placeholder="사번을 입력하세요"]', PM);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.toString().includes("/login"));

    await page.goto(`${FRONTEND}/budget-input/${PROJECT}`);
    await page.waitForLoadState("networkidle");

    const submitBtn = page.getByRole("button", { name: /작성완료\s*제출|제출하기/ }).first();
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();
    await expect(page.locator("text=/작성완료/").first()).toBeVisible();

    const approveBtn = page.getByRole("button", { name: /승인|Approve/ }).first();
    await expect(approveBtn).toBeVisible();
    await approveBtn.click();
    await expect(page.locator("text=/승인완료/").first()).toBeVisible();

    const unlockBtn = page.getByRole("button", { name: /락\s*해제|Unlock/ }).first();
    await expect(unlockBtn).toBeVisible();
    await unlockBtn.click();
    await expect(page.locator("text=/작성중/").first()).toBeVisible();
  });
});

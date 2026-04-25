import { test, expect } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:8001";
const EL = process.env.EL_EMPNO || "170661";

test.describe("regression #99 — Step 1 nav buttons do not overlap", () => {
  test("AI Assistant / 이전 / 다음 button bounding boxes are disjoint", async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[placeholder="사번을 입력하세요"]', EL);
    await page.click('button[type="submit"]');
    await page.goto(`${FRONTEND}/budget-input/new`);
    await page.waitForLoadState("networkidle");

    const candidates = ["AI Assistant", "이전", "다음", "임시저장"];
    const boxes: { name: string; box: { x: number; y: number; width: number; height: number } }[] = [];

    for (const name of candidates) {
      const btn = page.getByRole("button", { name }).first();
      if (await btn.count() === 0) continue;
      const box = await btn.boundingBox();
      if (box) boxes.push({ name, box });
    }

    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].box;
        const b = boxes[j].box;
        const overlap = !(
          a.x + a.width <= b.x ||
          b.x + b.width <= a.x ||
          a.y + a.height <= b.y ||
          b.y + b.height <= a.y
        );
        expect(overlap, `${boxes[i].name} overlaps ${boxes[j].name}`).toBe(false);
      }
    }
  });
});

import { test, expect } from "@playwright/test";

test.describe("regression #111 — 등록오류 alert 에 IP 노출 차단", () => {
  test("alert 메시지에 IP 패턴 0", async ({ page }) => {
    test.skip(true, "manual test — backend 5xx 강제 후 verify");
  });
});

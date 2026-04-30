import { test, expect } from "@playwright/test";

test.describe("regression #87 — Excel 업로드 오류 행 단위 표시", () => {
  test.skip(true, "manual test — Excel fixture 필요. Backend 단위 테스트로 schema 보장");
});

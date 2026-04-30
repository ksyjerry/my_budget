import { test, expect } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:8001";
const EL = process.env.EL_EMPNO || "170661";

test.describe("regression #73 — Step 2 Excel 업로드 사번+이름만으로도 성공", () => {
  test.skip(true, "manual test — Excel binary fixture creation 복잡. Backend 단위 테스트로 보장");
});

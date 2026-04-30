# Area 1 — Manual QA Checklist (Phase E Layer 2)

Run after all automated gates (Layer 1) green. Tester goes through items
in order, marks pass/fail with notes.

**Tester:** _________________  **Date:** _________________  **Build:** _________________

## 회귀 7건 manual 재현 시도 — 모두 차단되어야 함

- [ ] **#67 — Dev overlay**
  - Run prod build (`npm run build && npm run start` or `docker compose up`)
  - Open `/login`, `/overview-person`, `/budget-input`, `/budget-input/new`
  - Open DevTools → look for Next.js dev overlay UI elements (nextjs-portal, error/warning toast)
  - Expected: NONE on any page. PASS / FAIL: ____

- [ ] **#68 — QRP empno editable**
  - Go to `/budget-input/new` Step 1
  - Find QRP 사번 input
  - Type "16055", click another field, click QRP again
  - Type "3" — value should become "160553" without losing focus
  - PASS / FAIL: ____

- [ ] **#69 — Project search without client**
  - Go to `/budget-input/new`
  - WITHOUT selecting a client first, click "프로젝트 검색"
  - Search results include non-AUDIT projects (e.g., 통상자문)
  - PASS / FAIL: ____

- [ ] **#70 — Thousand separator**
  - Step 1: enter "12345" into 총 계약시간
  - ET 잔여시간 (read-only) displays "12,345" (or similar with commas)
  - PASS / FAIL: ____

- [ ] **#71 — Inactive employee alert**
  - Step 2: search for a 휴직 사번 (use seed: ___)
  - Press Enter or click result
  - Alert appears with 재직/퇴사/휴직 keyword
  - Member NOT added to list
  - PASS / FAIL: ____

- [ ] **#74 — NumberField constraints**
  - Step 1 AX/DX: type "-1" → snaps to 0
  - Step 3 month cell: type "0.24" → snaps to 0.25 (or 0)
  - Step 3 month cell: type "301" → clamps to 300
  - PASS / FAIL: ____

- [ ] **#99 — Step 1 button non-overlap**
  - At Step 1 bottom, all visible buttons (AI Assistant, 이전, 다음, 임시저장) do NOT overlap
  - Resize browser window — still no overlap at common widths (1024 / 1280 / 1920)
  - PASS / FAIL: ____

## 배포 위생

- [ ] **Docker prod build clean**
  - `docker compose up --build`
  - All pages: 0 dev overlay artifacts
  - All pages: DevTools console — 0 errors
  - PASS / FAIL: ____

- [ ] **CI workflow visible**
  - Open recent PR on GitHub
  - All 5 jobs (Grep Guards / Backend pytest / Frontend / Visual / Smoke) ran
  - All green
  - PASS / FAIL: ____

## CI gate negative test

- [ ] **Intentional regression PR**
  - Open a draft PR that adds `<input type="number">` somewhere in src/app
  - `Grep Guards` job FAILS
  - Merge button is grayed out (after branch protection applied)
  - Close draft PR without merging
  - PASS / FAIL: ____

## 22 기존 Playwright sanity

- [ ] **5개 무작위 spec 수동 실행**
  - Pick 5 specs from `frontend/tests/task-*.spec.ts`
  - Run: `npx playwright test <spec> --reporter=list`
  - All 5 PASS
  - PASS / FAIL: ____

---

## Sign-off

Tester signature / date: _________________

Issues found (with task tracker IDs): _________________

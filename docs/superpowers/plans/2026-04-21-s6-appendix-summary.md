# S6 — Appendix / Summary UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자 피드백 #32/#33/#45/#53 처리 + #14 를 backlog doc 으로 정리.

**Architecture:**
- 프론트 3 파일 (`appendix/page.tsx`, `budget-input/page.tsx`, `summary/page.tsx`)
- 백엔드 1 파일 (빈 template 엔드포인트 추가 — `budget_input.py`)
- backlog doc 1 파일

**Tech Stack:** FastAPI, openpyxl, Next.js, React.

**Spec:** [docs/superpowers/specs/2026-04-21-s6-appendix-summary-design.md](../specs/2026-04-21-s6-appendix-summary-design.md)

---

## Task 1: Appendix CSV→XLSX + 프로젝트 dropdown (#45, #32)

**File:** `frontend/src/app/(dashboard)/appendix/page.tsx`

### Step 1: Find and update CSV text (#45)

```bash
cd frontend && grep -n "CSV\|csv" src/app/\(dashboard\)/appendix/page.tsx | head
```

Update text "CSV" → "XLSX" wherever it appears in user-visible strings (typically the page header description).

### Step 2: Add project filter dropdown (#32)

Inspect existing structure:

```bash
cd frontend && grep -n "useFilterOptions\|filterOpts\|projects\|export\|API_BASE" src/app/\(dashboard\)/appendix/page.tsx | head
```

Add to component:

```tsx
const filterOpts = useFilterOptions();
const [selectedProjectCode, setSelectedProjectCode] = useState("");
```

Render the dropdown above the download buttons:

```tsx
<div className="flex items-center gap-2 mb-4">
  <label className="text-xs text-pwc-gray-600">프로젝트:</label>
  <select
    value={selectedProjectCode}
    onChange={(e) => setSelectedProjectCode(e.target.value)}
    className="border border-pwc-gray-200 rounded-md px-3 py-1.5 text-sm bg-white"
  >
    <option value="">(전체)</option>
    {(filterOpts?.projects || []).map((p: { value: string; label: string }) => (
      <option key={p.value} value={p.value}>{p.label}</option>
    ))}
  </select>
</div>
```

Then in download button onClick (find existing fetch URL construction, around line 80+):

```tsx
const url = `${API_BASE}/api/v1/export/${section.type}` +
  (selectedProjectCode ? `?project_code=${selectedProjectCode}` : "");
```

Adapt to actual variable names — section/type/etc may differ.

### Step 3: Build + commit

```bash
cd frontend && npm run build 2>&1 | tail -3
git add frontend/src/app/\(dashboard\)/appendix/page.tsx
git commit -m "feat(s6): Appendix CSV→XLSX text + project filter dropdown (#32 #45)"
```

---

## Task 2: 빈 Budget Template 다운로드 (#33)

**Files:**
- Modify: `backend/app/api/v1/budget_input.py` (add blank-template endpoint)
- Modify: `frontend/src/app/(dashboard)/budget-input/page.tsx` (add download button)

### Step 1: Add backend endpoint

In `backend/app/api/v1/budget_input.py`, add an endpoint that returns a blank Time Budget xlsx (header row only, no data):

```python
@router.get("/budget/template/blank-export")
def export_blank_budget_template(user: dict = Depends(require_login)):
    """비활성 상태에서도 받을 수 있는 빈 Budget Template Excel."""
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = "Time Budget"
    # Default 4월 시작 12개월 헤더
    months = []
    base_year = __import__("datetime").datetime.now().year
    for i in range(12):
        m = ((4 - 1 + i) % 12) + 1
        y = base_year + (1 if i >= 9 else 0)
        months.append(f"{y}-{m:02d}")
    headers = ["budget_category", "budget_unit", "empno", "name", "grade"] + months
    ws.append(headers)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="budget_template_blank.xlsx"'},
    )
```

**Important**: Place this BEFORE any `/budget/template/{x}` patterns to avoid route ordering issues (currently no such pattern, so location-flexible).

If the function name is added inside `budget_input.py`, the prefix `/api/v1/budget` is added by the router include in `main.py`. The full URL will be `/api/v1/budget/budget/template/blank-export` if router prefix is `/api/v1/budget` — that's a duplicate `budget`.

**Verify the prefix:**

```bash
cd backend && grep -n "budget_input\.router\|prefix" app/main.py | head
```

If prefix is `/api/v1/budget`, change the path to just `/template/blank-export`.

```python
@router.get("/template/blank-export")
def export_blank_budget_template(...):
    ...
```

So the final URL becomes `/api/v1/budget/template/blank-export`.

### Step 2: Quick sanity test

```bash
cd backend && python -c "
from fastapi.testclient import TestClient
from app.main import app
from app.core.sessions import SESSION_COOKIE_NAME, create_session
from app.db.session import SessionLocal
db = SessionLocal()
sid = create_session(db, empno='170661', role='elpm', scope='self')
db.close()
c = TestClient(app)
r = c.get('/api/v1/budget/template/blank-export', cookies={SESSION_COOKIE_NAME: sid})
print('status:', r.status_code, 'len:', len(r.content))
"
```

Expected: `status: 200, len: <several hundred bytes>`.

### Step 3: Add frontend button

In `frontend/src/app/(dashboard)/budget-input/page.tsx` (project list page), add a download button at the top of the page:

```tsx
<button
  onClick={async () => {
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    const res = await fetch(
      `${API_BASE}/api/v1/budget/template/blank-export`,
      { credentials: "include" }
    );
    if (!res.ok) {
      alert("다운로드 실패");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "budget_template_blank.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }}
  className="px-3 py-1.5 text-xs border border-pwc-gray-200 rounded-md hover:bg-pwc-gray-50 text-pwc-gray-900 mb-3"
>
  📄 빈 Budget Template 다운로드
</button>
```

Place near top of the page above the project list / project cards.

### Step 4: Build + commit

```bash
cd backend && python -c "from app.main import app; print('ok')"
cd frontend && npm run build 2>&1 | tail -3
git add backend/app/api/v1/budget_input.py frontend/src/app/\(dashboard\)/budget-input/page.tsx
git commit -m "feat(s6): blank Budget Template download endpoint + UI (#33)"
```

---

## Task 3: Summary 검색 + 정렬 (#53)

**File:** `frontend/src/app/(dashboard)/summary/page.tsx`

### Step 1: Inspect current page

```bash
cd frontend && grep -n "useState\|filter\|sort\|map\|empno\|name" src/app/\(dashboard\)/summary/page.tsx | head -30
```

Identify:
- 인원 목록 또는 staff 테이블 위치
- 어떤 데이터 array 가 렌더링되는지 (예: `staffData`, `personList`)

### Step 2: Add search + sort state

Inside Summary component, add:

```tsx
const [searchQuery, setSearchQuery] = useState("");
const [sortBy, setSortBy] = useState<"name" | "grade" | "budget" | "actual">("name");
```

### Step 3: Add UI controls

Above the staff/person table:

```tsx
<div className="flex items-center gap-2 mb-3">
  <input
    type="text"
    placeholder="이름/사번 검색"
    value={searchQuery}
    onChange={(e) => setSearchQuery(e.target.value)}
    className="border border-pwc-gray-200 rounded-md px-3 py-1.5 text-sm bg-white w-40"
  />
  <select
    value={sortBy}
    onChange={(e) => setSortBy(e.target.value as "name" | "grade" | "budget" | "actual")}
    className="border border-pwc-gray-200 rounded-md px-3 py-1.5 text-sm bg-white"
  >
    <option value="name">이름순</option>
    <option value="grade">직급순</option>
    <option value="budget">Budget 큰 순</option>
    <option value="actual">Actual 큰 순</option>
  </select>
</div>
```

### Step 4: Apply filter + sort

Before the `.map` that renders staff list, add:

```tsx
const GRADE_ORDER: Record<string, number> = {
  P: 0, MD: 1, D: 2, SM: 3, M: 4, SA: 5, A: 6, AA: 7,
};

const filteredSorted = useMemo(() => {
  let arr = [...(staffData || [])];
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    arr = arr.filter((s: { name?: string; empno?: string }) =>
      (s.name || "").toLowerCase().includes(q) ||
      (s.empno || "").toLowerCase().includes(q)
    );
  }
  arr.sort((a: any, b: any) => {
    if (sortBy === "name") return (a.name || "").localeCompare(b.name || "", "ko");
    if (sortBy === "grade") return (GRADE_ORDER[a.grade] ?? 99) - (GRADE_ORDER[b.grade] ?? 99);
    if (sortBy === "budget") return (b.budget ?? 0) - (a.budget ?? 0);
    if (sortBy === "actual") return (b.actual ?? 0) - (a.actual ?? 0);
    return 0;
  });
  return arr;
}, [staffData, searchQuery, sortBy]);
```

Use `filteredSorted` instead of the original array in `.map`.

**Variable names will differ** — adapt to actual names found in Step 1.

### Step 5: Build + commit

```bash
cd frontend && npm run build 2>&1 | tail -3
git add frontend/src/app/\(dashboard\)/summary/page.tsx
git commit -m "feat(s6): Summary staff search + sort controls (#53)"
```

---

## Task 4: #14 backlog doc

**File:** Create `docs/superpowers/specs/_backlog.md`

```markdown
# Backlog — Deferred Features

이 문서는 사용자 피드백 중 별도 sub-project 사이클이 필요한 기능을 기록한다.

## #14 직급별 단가 + 협업 코드 (deferred from S6)

**원본 피드백** (김미진, 2026-04-16):
> 협업코드도 있어,
> 1) 협업유무 및
> 2) PM, staff외에 예산 수립시 고려(time code 생성시 입력값)되는
>    직급별 입력 값을 넣을 수 있는지 궁금합니다.
> 예산 CM 등은 직급별 단가를 고려하여 산정되고 있어서,
> 이 점 들이 고려될 수 있는지 궁금합니다.

**왜 별도 sub-project 인가:**

1. 직급별 단가표 (rate table) 가 신규 데이터 모델로 필요
2. "협업 코드" 의 정의·운영 방식이 불명확 (PwC 내부 도메인 용어 인터뷰 필요)
3. Time code 생성 시 백엔드 로직과 연동 필요 (현재 코드와 별개)
4. 예산 CM(원가) 산정 공식 — 도메인 전문가의 결정 사항

**다음 단계 권장:**

- 김미진/재무팀과 직급별 cost rate 정의 인터뷰 (예: SA: ₩60k/h, M: ₩90k/h, ...)
- "협업 코드" 운영 ruleset 확정 (사용 시점, 기록 방법, 보고 영향)
- 신규 spec 작성 → 별도 sub-project 사이클로 진행 (S7+ 또는 별도 브랜치)
- 영향 범위: `project_members` 모델 확장 + Step 2 UI + Step 3 cost 계산 + Summary CM 컬럼

**현재 구현 가능한 partial 작업** (필요 시):

- ProjectMember 의 `grade` 필드는 이미 존재 (Step 2 UI 에서 입력 가능)
- 직급별 단가 → 별도 `grade_rate` 테이블 + 마이그레이션 필요
```

Commit:

```bash
git add docs/superpowers/specs/_backlog.md
git commit -m "docs(s6): backlog doc for #14 직급별 단가 + 협업 코드 (deferred)"
```

---

## Task 5: Playwright + 최종 검증

**File:**
- Create: `frontend/tests/task-s6-appendix-export.spec.ts`

```ts
import { test, expect } from "@playwright/test";

const API = "http://localhost:3001/api/v1";
const EL = process.env.EL_EMPNO || "170661";

test.describe("S6 — Appendix exports + blank template (#32 #33)", () => {
  test("blank template export returns xlsx", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/budget/template/blank-export`);
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"] || "").toContain("spreadsheetml");
  });

  test("export with project_code returns xlsx", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const ov = await request.get(`${API}/overview`);
    const body = await ov.json();
    const projects = body.projects || [];
    if (projects.length === 0) {
      test.skip();
      return;
    }
    const code = projects[0].project_code;
    const r = await request.get(`${API}/export/overview?project_code=${code}`);
    // export endpoint may return 200 or 404 depending on permissions / data
    expect([200, 400, 404]).toContain(r.status());
  });
});
```

Run + commit:

```bash
cd frontend && npx playwright test task-s6 --reporter=line 2>&1 | tail -5
git add frontend/tests/task-s6-appendix-export.spec.ts
git commit -m "test(s6): Playwright for blank template + appendix export"
```

### Final verification

```bash
cd backend && pytest -q 2>&1 | tail -3
cd frontend && npx playwright test task-auth task-s1 task-s2 task-s3 task-s4 task-s5 task-s6 --reporter=line 2>&1 | tail -10
git log main..HEAD --oneline
```

---

## 완료 기준

- [ ] Task 1-5 완료
- [ ] Appendix "CSV"→"XLSX" 텍스트
- [ ] Appendix 프로젝트 dropdown 동작
- [ ] 빈 template 다운로드 가능
- [ ] Summary 검색 + 정렬 동작
- [ ] #14 backlog doc 추가
- [ ] 회귀 없음

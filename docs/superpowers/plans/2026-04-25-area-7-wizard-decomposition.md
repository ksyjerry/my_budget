# 영역 7 (Wizard 분해) Implementation Plan

> **For agentic workers:** subagent-driven, batched. Refactor sprint — no new features, no defect fixes.

**Goal:** `frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx` (3150 LOC) → 12+ files (~200 LOC each). 시각 회귀 + 기능 동등 유지.

**Architecture:** 단일 파일 → components/ + hooks/ + lib/ + types.ts. 각 분해 단계 독립 commit.

**Tech Stack:** 동일 (Next.js / React / TypeScript). 신규 deps 없음.

---

## Spec
[../specs/2026-04-25-area-7-wizard-decomposition-design.md](../specs/2026-04-25-area-7-wizard-decomposition-design.md)

## Files

**Create**:
- `frontend/src/app/(dashboard)/budget-input/[project_code]/types.ts`
- `.../lib/wizard-validators.ts`
- `.../components/ClientSearchModal.tsx`
- `.../components/ProjectSearchModal.tsx`
- `.../components/WorkflowButtons.tsx`
- `.../components/Step1Form.tsx`
- `.../components/Step2Members.tsx`
- `.../components/Step3Grid/index.tsx`
- `.../components/Step3Grid/CategoryPanel.tsx`
- `.../components/Step3Grid/MonthGrid.tsx`
- `.../components/Step3Grid/Toolbar.tsx`
- `.../components/Step3Grid/SummaryRow.tsx`
- `.../hooks/useWizardState.ts`
- `.../hooks/useStep3Roundtrip.ts`
- `.../hooks/useAiAssist.ts`
- `frontend/tests/regression/test_wizard_decomposition_baseline.spec.ts` (시각 회귀 강화)

**Modify**:
- `.../page.tsx` (3150 LOC → ~250 LOC wizard shell)

---

## Batch 1 — Foundation (Tasks 1-3)

### Task 1: Baseline + 시각 회귀 baseline 갱신
```bash
cd /Users/jkim564/Documents/Programming/my_budget/.worktrees/s7-area-7-wizard
cd backend && pytest 2>&1 | tail -3
cd .. && bash scripts/ci/check-no-direct-number-input.sh
bash scripts/ci/check-no-direct-budget-arithmetic.sh
bash scripts/ci/check-docker-compose-no-dev.sh
```
Expected: 234 passed, 3/3 grep guards.

시각 회귀 baseline 재캡처 (S7 모든 영역 fix 후 상태):
```bash
cd backend && uvicorn app.main:app --port 3001 &
BE=$!
cd frontend && npm run dev &
FE=$!
sleep 12
cd frontend && npm run test:visual -- --update-snapshots 2>&1 | tail -5
kill $BE $FE 2>/dev/null
git add frontend/tests/__visual__/
git commit -m "chore(s7-area7): Area 7 baseline + visual baseline 갱신 (S7 후 안정 상태)"
```

### Task 2: types.ts 추출
**File**: `frontend/src/app/(dashboard)/budget-input/[project_code]/types.ts` (NEW)

page.tsx 의 첫 ~100 LOC interface 정의들 (NumberFieldProps 제외 — 영역 1에서 이미 추출, ProjectInfo, ClientInfo, MemberRow, TemplateRow 등) 이동.

```bash
grep -n "^interface \|^type " frontend/src/app/\(dashboard\)/budget-input/\[project_code\]/page.tsx | head -20
```

각 interface 를 types.ts 로 옮기고 page.tsx 에 `import type {...} from "./types"` 추가. NumberFieldProps 는 영역 1 NumberField.tsx 에서 export 된 것 사용.

```bash
cd frontend && npx tsc --noEmit 2>&1 | tail -3
git add -A
git commit -m "refactor(s7-area7): 1. types.ts 추출 — interface 정의 분리"
```

### Task 3: lib/wizard-validators.ts 추출
**File**: `.../lib/wizard-validators.ts` (NEW)

검증 함수들 (필수 입력 / 배부 검증 / month range 등):
```bash
grep -n "function validate\|const validate\|isValid\|배부 검증" frontend/src/app/\(dashboard\)/budget-input/\[project_code\]/page.tsx | head -10
```

각 검증 함수를 wizard-validators.ts 로 옮기고 page.tsx 에 `import { validateXxx } from "./lib/wizard-validators"` 추가.

```bash
cd frontend && npx tsc --noEmit 2>&1 | tail -3
git add -A
git commit -m "refactor(s7-area7): 2. lib/wizard-validators.ts 추출"
```

---

## Batch 2 — Modal 분리 (Tasks 4-5)

### Task 4: ClientSearchModal 분리
**File**: `.../components/ClientSearchModal.tsx` (NEW)

page.tsx 의 `function ClientSearchModal({ ... }) { ... }` 블록 (~200 LOC) 통째로 이동.
page.tsx 에 `import { ClientSearchModal } from "./components/ClientSearchModal"`.

```bash
grep -n "function ClientSearchModal\|<ClientSearchModal" frontend/src/app/\(dashboard\)/budget-input/\[project_code\]/page.tsx
```

```bash
cd frontend && npx tsc --noEmit 2>&1 | tail -3
git add -A
git commit -m "refactor(s7-area7): 3. ClientSearchModal 컴포넌트 분리"
```

### Task 5: ProjectSearchModal 분리
**File**: `.../components/ProjectSearchModal.tsx` (NEW)

동일 패턴. page.tsx 의 `function ProjectSearchModal({ ... }) { ... }` 블록 이동.

```bash
cd frontend && npx tsc --noEmit 2>&1 | tail -3
git add -A
git commit -m "refactor(s7-area7): 4. ProjectSearchModal 컴포넌트 분리"
```

---

## Batch 3 — State + Workflow (Tasks 6-7)

### Task 6: WorkflowButtons 분리
**File**: `.../components/WorkflowButtons.tsx` (NEW)

영역 2에서 추가한 POL-04 워크플로우 버튼 (작성완료 제출 / 승인 / 락 해제) 분리. ~100 LOC.

```bash
grep -n "작성완료 제출\|승인\|락 해제\|template_status" frontend/src/app/\(dashboard\)/budget-input/\[project_code\]/page.tsx | head -10
```

```bash
git add -A && git commit -m "refactor(s7-area7): 5. WorkflowButtons 컴포넌트 분리 (POL-04)"
```

### Task 7: useWizardState hook 분리
**File**: `.../hooks/useWizardState.ts` (NEW)

page.tsx 의 wizard state (project, client, members, templateRows, step, etControllable, isNew, etc.) 를 단일 hook으로 격리.

```bash
grep -n "useState\|useEffect" frontend/src/app/\(dashboard\)/budget-input/\[project_code\]/page.tsx | head -20
```

State + setter 들을 useWizardState 가 반환:
```ts
export function useWizardState(projectCode: string) {
  const [project, setProject] = useState<ProjectInfo>({...});
  const [client, setClient] = useState<ClientInfo>({...});
  // ... etc
  return { project, setProject, client, setClient, ... };
}
```

page.tsx 에 `const { project, setProject, ... } = useWizardState(projectCode);`.

```bash
cd frontend && npx tsc --noEmit 2>&1 | tail -3
git add -A && git commit -m "refactor(s7-area7): 6. useWizardState hook 분리 (state 격리)"
```

---

## Batch 4 — Step1 + Step2 (Tasks 8-9)

### Task 8: Step1Form 분리
**File**: `.../components/Step1Form.tsx` (NEW, ~500 LOC)

page.tsx 의 `function Step1Form({ ... }) { ... }` 블록 통째로 이동. 의존: NumberField (영역 1), types, ClientSearchModal, ProjectSearchModal, validators.

```bash
grep -n "function Step1Form\|<Step1Form" frontend/src/app/\(dashboard\)/budget-input/\[project_code\]/page.tsx
```

```bash
cd frontend && npx tsc --noEmit 2>&1 | tail -3
git add -A && git commit -m "refactor(s7-area7): 7. Step1Form 컴포넌트 분리"
```

### Task 9: Step2Members 분리
**File**: `.../components/Step2Members.tsx` (NEW, ~400 LOC)

동일 패턴. EmployeeSearch 가 inline 인지 별도 import 인지 확인 후 처리.

```bash
git add -A && git commit -m "refactor(s7-area7): 8. Step2Members 컴포넌트 분리"
```

---

## Batch 5 — Step3 분해 (Tasks 10-13) — 가장 복잡

### Task 10: useStep3Roundtrip + useAiAssist hooks
**Files**:
- `.../hooks/useStep3Roundtrip.ts` (NEW) — Excel export/upload + reset
- `.../hooks/useAiAssist.ts` (NEW) — suggest/validate + abort

```bash
grep -n "handleExportExcel\|handleUploadExcel\|handleAiSuggest\|handleAiValidate\|handleReset" frontend/src/app/\(dashboard\)/budget-input/\[project_code\]/page.tsx | head
```

각 핸들러 set을 hook 으로 추출.

```bash
git add -A && git commit -m "refactor(s7-area7): 9. useStep3Roundtrip + useAiAssist hooks"
```

### Task 11: Step3Grid 컴포넌트 분리 (가장 복잡)
**Files**:
- `.../components/Step3Grid/index.tsx` (NEW) — coordinator
- `.../components/Step3Grid/CategoryPanel.tsx` (NEW) — 왼쪽 카테고리
- `.../components/Step3Grid/MonthGrid.tsx` (NEW) — 12개월 입력 그리드
- `.../components/Step3Grid/Toolbar.tsx` (NEW) — Excel I/O + 초기화 + 종료월 + AI
- `.../components/Step3Grid/SummaryRow.tsx` (NEW) — 합계 행

page.tsx 의 `function Step3Template({ ... })` 블록 (~1200 LOC) 5 컴포넌트로 분할.

전략: index.tsx 가 wizard state 받아 sub-components 에 props 전달.

이 task 는 가장 위험. 분할 전 + 후 시각 회귀 비교 필수.

```bash
cd backend && uvicorn app.main:app --port 3001 &
BE=$!
cd frontend && npm run dev &
FE=$!
sleep 12
cd frontend && npm run test:visual 2>&1 | tail -10
kill $BE $FE 2>/dev/null
```
Expected: 0 diff (분해 전후 동일 렌더링).

```bash
git add -A && git commit -m "refactor(s7-area7): 10. Step3Grid 분해 (5 컴포넌트)"
```

### Task 12: page.tsx 정리 (wizard shell)
page.tsx 가 ~250 LOC wizard shell 만 남음:
- useWizardState hook 호출
- step state 관리
- 5 step 컴포넌트 라우팅 (Step1Form / Step2Members / Step3Grid / WorkflowButtons)
- 모달 (Client/Project Search) 렌더링

남은 코드 정리. Dead code (이미 추출된 함수 잔재) 제거.

```bash
wc -l frontend/src/app/\(dashboard\)/budget-input/\[project_code\]/page.tsx
```
Expected: ~250 LOC.

```bash
cd frontend && npx tsc --noEmit 2>&1 | tail -3 && npm run lint 2>&1 | tail -5
git add -A && git commit -m "refactor(s7-area7): 11. page.tsx 정리 — wizard shell 만 남김 (3150 → ~250 LOC)"
```

---

## Batch 6 — 최종 검증 + PR (Task 13)

### Task 13: 최종 검증 + draft PR

```bash
# Backend pytest
cd backend && pytest 2>&1 | tail -5
# Expected: 234 passed (no regressions)

# Frontend full + visual
cd backend && uvicorn app.main:app --port 3001 &
BE=$!
cd frontend && npm run dev &
FE=$!
sleep 12
cd frontend && npm test -- --project=default --project=regression --project=visual 2>&1 | tail -25
kill $BE $FE 2>/dev/null

# Grep guards
cd /Users/jkim564/Documents/Programming/my_budget/.worktrees/s7-area-7-wizard
bash scripts/ci/check-no-direct-number-input.sh
bash scripts/ci/check-no-direct-budget-arithmetic.sh
bash scripts/ci/check-docker-compose-no-dev.sh

# Push + PR
git push -u origin s7/area-7-wizard-decomp 2>&1 | tail -3

gh pr create --draft --base s7/post-cycle-deliverables --title "S7 Area 7 — Wizard 분해 (3150 → ~250 LOC shell + 12+ files)" --body "$(cat <<'BODYEOF'
## Summary
- frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx: 3150 → ~250 LOC
- 12+ files: types, validators, modals, hooks, Step components
- 시각 회귀 + E2E 동등 검증
- 결함 fix 0건 (refactor 전용)

## Test plan
- [ ] Visual regression baseline diff 0
- [ ] All E2E pass
- [ ] Backend pytest 234 (no regressions)
- [ ] Wizard 전체 흐름 manual QA — Step 1 → 2 → 3 → submit/approve/unlock 동일 동작

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODYEOF
)" 2>&1 | tail -3

# Final report
cat > docs/superpowers/runbooks/area-7-baseline-report.md <<EOF
# Area 7 — Final Verification

**Date:** 2026-04-25

## Results
- Backend pytest: <count>
- Frontend tests: <pass>/<fail>
- Visual regression diff: 0
- Grep guards: 3/3
- LOC: 3150 → <new>
- Files: 1 → <count>

## Hand-off
- Manual QA: wizard 전체 흐름 staging 검증
- Sign-off → Area 7 종료
EOF

git add docs/superpowers/runbooks/area-7-baseline-report.md
git commit -m "docs(s7-area7): final verification report"
git push 2>&1 | tail -3
```

---

## Risk Mitigation

각 commit 후 type-check + (가능 시) 시각 회귀. 1-2 commit 단위로 작업 진행 후 휴식 (subagent timeout 회피).

분해 자체가 회귀 도입 시 즉시 git revert + 재시도. 단일 commit 단위로 atomic.

---

**Plan complete. Ready for batched execution (6 batches).**

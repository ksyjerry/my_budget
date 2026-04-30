# S7 PR Merge Strategy — Stacked PR Chain → main

**작성일**: 2026-04-25
**대상**: 사용자 (GitHub UI 작업)
**범위**: 6개 stacked draft PR (#1-#6) → main

## 현재 PR Chain 구조

```
main
 └── PR #1: s7/area-1-safety-net (회귀 7건 + CI + 횡단 추상화)
      └── PR #2: s7/area-2-budget-list (Budget 목록 + POL-04 + POL-05)
           └── PR #3: s7/area-3-step1 (Step 1 + ProjectSearchModal bonus)
                └── PR #4: s7/area-4-step2 (Step 2 — export/upload/placeholder)
                     └── PR #5: s7/area-5-step3 (Step 3 + 금융업 시드 + 8 그룹)
                          └── PR #6: s7/area-6-overview (Overview + POL-01/08)
```

각 PR 은 이전 PR 을 base로 한 stacked structure. Area N+1 의 commits 가 Area N 위에 누적됨.

---

## Merge Strategy 선택지

### 옵션 A — 순차 merge (rebase chain) — **권장**

각 PR을 순차적으로 main에 merge. 각 단계에서 base 변경 + rebase 필요.

**절차** (6단계):

```
[단계 1] PR #1 → main merge
  - PR #1 base 는 이미 main → squash 또는 merge commit 선택
  - main 에 Area 1 안전망 + 회귀 fix 적용됨
  - GitHub Actions CI 가 main 에서 처음 작동 시작
  - **branch protection 적용** (docs/superpowers/runbooks/branch-protection.md)

[단계 2] PR #2 rebase + merge
  - PR #2 의 base 를 s7/area-1-safety-net → main 으로 변경 (GitHub UI: Edit → base branch)
  - GitHub 가 자동 rebase 시도. 충돌 시 로컬에서 git rebase main 후 force-push
  - CI 통과 확인 → merge

[단계 3-6] PR #3 → #4 → #5 → #6 동일 절차
  - 각 PR 의 base 를 main 으로 변경
  - rebase
  - CI 통과
  - merge
```

**예상 시간**: PR 당 10-15분 (CI 통과 대기 포함). 총 60-90분.

**장점**:
- 각 영역이 main 에 별도 commit으로 기록 — git history 명확
- CI 가 각 단계에서 회귀 검증 (단계적 안전성)
- 한 영역에서 문제 발생 시 그 영역만 revert 가능

**단점**:
- 6번의 rebase + force-push — 작업 자체는 mechanical
- branch protection 이 적용된 main 에는 force-push 불가 — PR 별 rebase 만 사용

### 옵션 B — All-in-one squash merge

모든 PR 의 변경을 한 번에 main 에 적용. PR #6 의 base 를 main 으로 변경 → merge → 다른 PR 자동 close.

**절차**:
```
1. PR #6 base 변경: s7/area-5-step3 → main
2. PR #6 의 diff 가 Areas 1-6 전체를 포함하게 됨 (~100+ commits)
3. CI 통과 확인 → squash merge (또는 merge commit)
4. PRs #1-#5 자동 close (commits 모두 main 에 포함됨)
```

**장점**:
- 1번의 merge 작업으로 끝
- main 에 단일 거대 commit (또는 100+ commits)

**단점**:
- main history 에 영역 구분 없음 (squash 시) 또는 너무 많은 commits (merge commit 시)
- 한 영역 revert 어려움 (squash 시) — 영역별 revert 불가
- CI 가 거대 diff 검증 — 실패 시 원인 파악 복잡

**권장 안 함** — S7 는 영역 구조 자체가 가치이므로 옵션 A 권장.

### 옵션 C — Cherry-pick / 부분 merge

특정 영역만 main 에 반영하고 나머지는 보류.

**적용**: 영역 1 (안전망) 만 즉시 merge 하고, 영역 2-6 은 사용자 검증 후 순차. POL 컨펌 진행 상황에 따라 일부 영역 보류 가능.

**권장 시나리오**: POL 외부 결정자 컨펌이 늦어질 경우 영역 1·2 만 merge하고 영역 3-6 은 컨펌 완료 후 진행.

---

## 권장 절차 (옵션 A 상세)

### 사전 준비

1. **모든 영역 manual QA 완료** — `docs/superpowers/qa-checklists/area-{1..6}.md` 일괄 실행
2. **Phase E Layer 3 사용자 sign-off** — staging 에서 모든 결함 차단 확인
3. **POL provisional 인지** — 외부 결정자 (4/27 회의 대기) 다른 안 결정 시 후속 fix 발생 가능. 그래도 진행 OK (메타 spec 1.7 트레이드오프 정책)

### 단계 1 — PR #1 merge (가장 중요)

```bash
# GitHub UI 에서:
1. PR #1 (s7/area-1-safety-net → main) 검토
2. CI 5 jobs 통과 확인
3. "Ready for review" → "Merge pull request" → "Squash and merge" (단일 commit 선호) OR "Create a merge commit" (history 보존)
4. Merge 후 즉시 branch protection 적용:
   - Settings → Branches → Add rule
   - Branch name pattern: main
   - Require status checks: Grep Guards, Backend pytest, Frontend, Visual, Smoke (5개)
   - Require pull request + approvals: 1
   - Save
```

**Verification**: 의도적 위반 PR (예: <input type="number"> 추가) 만들어 merge 차단 확인 → 즉시 close.

### 단계 2-6 — Areas 2-6 순차

각 PR 에 대해 동일 절차:

```bash
# GitHub UI:
1. PR # N (area-N → area-N-1) 검토
2. PR base 변경: area-N-1 → main (Edit dropdown 옆)
3. GitHub 가 conflicts 표시 → 로컬 작업:
   git fetch origin
   git checkout s7/area-N
   git rebase origin/main
   # 충돌 해결 (대부분 없음 — 영역 간 file overlap 적음)
   git push --force-with-lease origin s7/area-N
4. CI 통과 확인 (재실행 자동)
5. Squash and merge
6. 다음 영역 진행
```

### 충돌 발생 가능 영역

가장 가능성 높은 충돌 위치 (사전 인지):
- `frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx` (영역 1, 3, 4, 5, 6 모두 수정) — 가장 큰 충돌 위험
- `backend/app/api/v1/budget_input.py` (영역 1, 2, 3, 5 수정)
- `frontend/src/app/(dashboard)/budget-input/page.tsx` (영역 2 만 수정)

→ stacked chain 으로 작업했기 때문에 영역 N+1 이 영역 N 의 변경을 이미 포함. main → main rebase 시 conflict 가 적을 것.

---

## Rollback 절차

특정 영역에서 production 결함 발견 시:

```bash
# 1. 단일 commit revert (squash merge 가정)
git revert <area-X-merge-commit>
git push origin main

# 2. 또는 hotfix branch
git checkout -b s8/hotfix-areaX-issue main
# fix changes
git push -u origin s8/hotfix-areaX-issue
# PR + merge (CI 통과 후)
```

영역별 commits 가 main 에 squash 된 경우 단일 revert 로 영역 통째 rollback 가능.

---

## POL 외부 결정자 컨펌 후 후속 작업

POL provisional → 정식 결정 후 다음 시나리오:

| POL 결정 | 영역 N 영향 | 후속 작업 |
|---|---|---|
| 추천안 그대로 confirm | 없음 | policy-decisions.md 업데이트만 |
| 다른 안 결정 (예: POL-04 (a) 단순형) | 영역 2 일부 fix | hotfix PR 또는 다음 영역 사이클에 포함 |
| 신규 옵션 결정 | 영역 X 추가 작업 | mini-cycle (별도 spec → plan → execution) |

**가장 큰 위험**: POL-01 결정이 (b) 가 아닌 다른 안 → 영역 6 거의 전체 재작업. 다른 POL 들은 영향 범위 단일 service/file 로 제한됨.

---

## 체크리스트

merge 진행 시 사용자 체크:

- [ ] **PR #1**: CI green / manual QA / merge → branch protection 적용
- [ ] **PR #2**: rebase / CI green / manual QA / merge
- [ ] **PR #3**: rebase / CI green / manual QA / merge
- [ ] **PR #4**: rebase / CI green / manual QA / merge
- [ ] **PR #5**: rebase / CI green / manual QA / merge
- [ ] **PR #6**: rebase / CI green / manual QA / merge
- [ ] **검증**: main 에서 6 영역 모든 결함 fix 확인
- [ ] **알림**: ASR 파트너에게 5/6 메일 발송 ready 상태 보고
- [ ] **POL 컨펌**: 4/27 회의에서 9개 POL 정식 결정
- [ ] **Worktree 정리**: `.worktrees/` 6개 디렉토리 모두 제거 (`git worktree remove`)
- [ ] **S7 종료**: `docs/superpowers/retros/s7-meta-cycle.md` Hand-off 섹션 완료

---

## 참고
- Branch protection 절차: `docs/superpowers/runbooks/branch-protection.md`
- 영역별 QA 체크리스트: `docs/superpowers/qa-checklists/area-{1..6}.md`
- S7 메타 회고: `docs/superpowers/retros/s7-meta-cycle.md`

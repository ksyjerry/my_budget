# S6 — Appendix / Summary UX 개선 + 마지막 정리

**Date:** 2026-04-21
**Status:** Approved (brainstorm)
**Sub-project:** S6 (of 7) — 2026-04-20 사용자 피드백 45건 분할안의 마지막 단계
**Addresses feedback items:** #32, #33, #45, #53 (#14 는 backlog 로 이관)

## Context

마지막 sub-project. 5건 중 #14 (직급별 단가/협업 코드) 는 cost rate 모델·time code 정의 같은 도메인 결정이 필요한 신규 기능이라 별도 product brainstorm 사이클로 backlog 처리한다. 나머지 4건은 Appendix·Summary UX 개선.

## Goals

1. Appendix 안내 문구 "CSV" → "XLSX" (#45)
2. Appendix 에 프로젝트 선택 dropdown — 선택 시 해당 프로젝트만 export (#32)
3. Step 3 toolbar 에 "Excel template 다운로드" 항상 노출 (업로드 비활성 상태에서도) (#33)
4. Summary 화면에 인원 검색 + 정렬 controls (#53)
5. #14 를 docs 로 backlog 화 — 다음 단계 sub-project 로 진행 가능하게 정리

## Non-Goals

- 직급별 단가 모델 신규 도입 (#14 deferred)
- 협업 유무 컬럼 추가 (#14 deferred)
- Appendix 페이지 redesign — 기존 카드/섹션 구조 유지
- Summary 의 차트 변경

## Feedback → 설계 매핑

| No | 사용자 | 요지 | 대응 |
|---|---|---|---|
| #14 | 김미진 | 협업유무 + 직급별 단가 | §5 (defer) |
| #32 | 나형우 | Appendix 프로젝트 선택 | §2 |
| #33 | 나형우 | Budget template 다운로드 | §3 |
| #45 | 서보경 | CSV → XLSX 안내 | §1 |
| #53 | 신승엽 | Summary 인원 검색·정렬 | §4 |

## Design

### 1. Appendix CSV → XLSX (#45)

**파일:** `frontend/src/app/(dashboard)/appendix/page.tsx` line 117

```diff
-각 View의 데이터를 CSV 파일로 다운로드할 수 있습니다.
+각 View의 데이터를 XLSX 파일로 다운로드할 수 있습니다.
```

추가로 다른 위치에 "CSV" 라는 단어가 또 있다면 점검 후 일괄 교체.

### 2. Appendix 프로젝트 dropdown (#32)

**파일:** `frontend/src/app/(dashboard)/appendix/page.tsx`

**현재**: 다운로드 버튼들이 `?project_code=` 없이 호출 → 사용자 권한 내 전체 프로젝트 export.

**변경**:
- `useFilterOptions` 훅으로 프로젝트 목록 가져옴 (이미 다른 페이지에서 사용 중)
- `selectedProjectCode` state 추가
- `<select>` 드롭다운 렌더링 — 옵션: `(전체)` + 프로젝트 목록
- 다운로드 버튼 onClick 에서 selectedProjectCode 값을 query string 에 포함:
  ```tsx
  const url = `${API_BASE}/api/v1/export/${section.type}` +
    (selectedProjectCode ? `?project_code=${selectedProjectCode}` : "");
  ```

백엔드 `/export/{view_type}` 는 이미 `project_code` 파라미터 받음 (export.py:73 확인됨).

### 3. Step 3 Template 다운로드 노출 (#33)

**참고**: S5 T6 + T7 에서 이미 Step 3 toolbar 에 "📥 Excel 다운로드" 추가됨. #33 의 요구사항 ("업로드는 비활성이지만 template 다운로드는 가능") 은 이미 부분 충족.

**추가 개선**: Budget 입력 메인 메뉴 (`/budget-input` — 프로젝트 목록 페이지) 에서도 "📄 Budget Template 다운로드" 링크/버튼 노출. 사용자가 프로젝트 미선택 상태에서 빈 template 을 받을 수 있게.

**파일**: `frontend/src/app/(dashboard)/budget-input/page.tsx` (목록 페이지)

**구현**:
- 페이지 상단에 "📄 빈 Budget Template 다운로드" 버튼
- onClick → 정적 빈 xlsx 생성 또는 신규 백엔드 엔드포인트 `/budget/template/blank-export`
- **단순화**: openpyxl 로 헤더만 들어간 빈 xlsx 생성. project_code 없이 호출.

### 4. Summary 인원 검색 + 정렬 (#53)

**파일:** `frontend/src/app/(dashboard)/summary/page.tsx`

**현재**: 인원 목록 또는 프로젝트 요약 테이블이 정렬·검색 없이 표시됨.

**변경**:

(a) 인원 검색 input — 좌측 인원 목록 위에 input box, 입력 시 client-side filter (`name.includes(query)` or `empno.includes(query)`)

(b) 정렬 옵션 — 인원 목록을:
- 이름 가나다순 (기본)
- 직급 순 (P→D→SM→M→SA→A→AA, S2 sort 와 동일 패턴)
- Budget 내림차순
- Actual 내림차순

dropdown `<select>` 또는 toggle buttons 로 선택 가능.

**구현 위치**: Summary 페이지의 staff 또는 인원 목록 섹션 (실제 코드 구조 확인 후 적용).

### 5. #14 Backlog 처리

**파일**: 신규 `docs/superpowers/specs/_backlog.md` 또는 기존 spec backlog 섹션

내용:
```markdown
## #14 직급별 단가 / 협업 코드 (deferred from S6)

**원본 피드백** (김미진, 2026-04-16):
> 협업코드도 있어, 1) 협업유무 및 2) PM, staff외에 예산 수립시 고려(time code
> 생성시 입력값)되는 직급별 입력 값을 넣을 수 있는지 궁금합니다. 예산 CM 등은
> 직급별 단가를 고려하여 산정되고 있어서, 이 점 들이 고려될 수 있는지 궁금합니다.

**왜 별도 sub-project 인가**:
- 직급별 단가표 (rate table) 가 신규 데이터 모델로 필요
- "협업 코드" 의 정의·운영 방식 불명확 (PwC 내부 도메인 용어 필요)
- Time code 생성 시 백엔드 로직과 연동 필요 (현재 코드와 별개)

**다음 단계**:
- 김미진 / 재무팀과 직급별 cost rate 정의 인터뷰
- 협업 코드 운영 ruleset 확정 (단일 문서로)
- 기능 spec 작성 → 별도 sub-project (S7+)
```

### 6. 테스트 플랜

**Playwright E2E (API):**

- `task-s6-appendix-export.spec.ts`
  - `/export/{view}?project_code=X` 가 200 + xlsx 반환 (이미 export.py 동작)
  - 빈 template 엔드포인트 (있으면) 200 + xlsx

**Backend pytest:**

- 빈 template 엔드포인트가 신규 추가되면 단순 export 테스트 추가
- (선택) 이미 export.py 가 `project_code` 필터 동작 — 추가 테스트 불필요

### 7. 성공 기준

- Appendix "CSV" 단어 → "XLSX" (#45)
- Appendix 프로젝트 dropdown 으로 단일 프로젝트 export 가능 (#32)
- 빈 budget template 다운로드 가능 (#33)
- Summary 화면에서 이름/empno 검색 + 정렬 동작 (#53)
- #14 backlog doc 작성

## Open Questions

- 빈 template 의 컬럼 구성 — Step 3 export 와 동일 헤더만 사용 (rows 없이)
- Summary 의 정렬 옵션 정확한 라벨 사용자 확인 — 일단 plan 대로 진행

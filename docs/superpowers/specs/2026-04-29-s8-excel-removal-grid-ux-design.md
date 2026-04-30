# S8 — Excel I/O 제거 + Grid UX 개선 (Spec)

**작성일**: 2026-04-29
**선행**: S7 (Areas 1-7 + post-cycle) 완료
**의존 영역**: 영역 5 (Step 3 Grid 인프라) + 영역 7 (분해된 컴포넌트 구조)
**의존 POL**: 없음

---

## 1. 목적과 결과물

### 1.1 목적
사용자 가시 Excel I/O 기능을 전부 제거하고, Step 3 Grid 입력 편의성을 4가지 방안으로 개선한다.

**왜 제거인가**: 사용자 결정. Excel I/O 가 (a) 운영 부담 (b) round-trip 일관성 결함 위험 (영역 5 #75/#105/#107/#114/#117) (c) Grid 직접 입력으로 대체 가능 — 이 세 요인이 합쳐 제거가 합리적.

### 1.2 비목표
- Admin 운영 도구 (`non_audit_activity_import.py` — activity master 시드용 xlsx 읽기) 는 유지. 이는 사용자 가시 기능이 아닌 운영 데이터 시드.
- `openpyxl` dependency 유지 (admin 시드용)
- 새로운 도메인 기능 (예: 다른 형식 export — CSV/PDF — 미지원)
- 자동 저장 (정책 결정 필요 — 별도 sprint)
- Mobile 대응 (별도 sprint)

### 1.3 Deliverables 요약

**제거 (Excel I/O)**:
- Backend: 6 endpoints + 2 service modules (excel_parser, excel_export) — 약 800 LOC
- Frontend: Appendix page 전체 + Step 2/3 Excel 버튼 + Step 3 Toolbar 의 Excel I/O 영역
- Routes: `/appendix` 라우트 + 사이드바 메뉴 항목 제거
- Tests: 3 Excel 관련 테스트 파일 삭제
- Frontend 호출 제거: `members/export`, `members/upload`, `template/export`, `template/upload`, `blank-export`, `/api/v1/budget/upload`, `/api/v1/export/*`

**유지**:
- `non_audit_activity_import.py` (admin 시드)
- `openpyxl==3.1.5` (admin 시드용)
- Step 3 Grid 직접 입력 UI (편의성 강화)

**Grid UX 개선 4건 (A·B·C·D)**:
- A: Sticky header + sticky column
- B: 분배 도우미 (총 시간 → 12개월 분배 + 유사회사 비율 1-click)
- C: 실시간 검증 + 누락 highlight
- D: 검색/필터 + 대분류 접기/펼치기

---

## 2. Excel 제거 — 상세 범위

### 2.1 Backend 제거 대상

#### 2.1.1 삭제할 모듈
| 파일 | LOC | 비고 |
|---|---|---|
| `backend/app/services/excel_parser.py` | 283 | Budget Template / Bulk DB 파싱 — 사용처 모두 제거됨 |
| `backend/app/services/excel_export.py` | 147 | Styled Excel export utility — 사용처 모두 제거됨 |
| `backend/app/api/v1/budget_upload.py` | 89 | `POST /api/v1/budget/upload` — 사용자 Budget upload |
| `backend/app/api/v1/export.py` | 293 | 12개 Excel download endpoints (Appendix용) |

#### 2.1.2 budget_input.py 안에서 제거할 부분
| 위치 | 함수 | 변경 |
|---|---|---|
| `:576-664` | `export_project_members` | 함수 통째 삭제 + route decorator 제거 |
| `:667-721` | `export_project_template` | 동일 |
| `:723-799` | `upload_project_template` | 동일 |
| `:1050-1113` | `upload_project_members` | 동일 |
| `:1115-1140` | `blank_export_template` | 동일 |
| Top imports | `from openpyxl import ...` (4곳) | 사용 안 하는 import 제거 |

#### 2.1.3 main.py router 제거
```python
# Remove:
app.include_router(budget_upload.router, prefix="/api/v1/budget", tags=["budget-upload"])
app.include_router(export.router, prefix="/api/v1", tags=["export"])
# Remove imports: budget_upload, export
```

### 2.2 Frontend 제거 대상

#### 2.2.1 Appendix 화면 전체
- `frontend/src/app/(dashboard)/appendix/page.tsx` (168 LOC) 삭제
- `frontend/src/app/(dashboard)/appendix/` 디렉토리 삭제
- 사이드바 navigation 에서 "Appendix" 메뉴 항목 제거 — `frontend/src/components/layout/`에서 찾아 제거

#### 2.2.2 Step 2 Members.tsx (영역 7 분해 후 위치)
- `Step2Members.tsx` 의 "📥 Excel 다운로드" / "📤 Excel 업로드" 버튼 영역 제거
- 관련 handler 함수 (handleMembersExport, handleMembersImport) 제거
- 관련 fetch 호출 제거

#### 2.2.3 Step 3 Toolbar.tsx (영역 7 분해 후 위치)
- `Step3Grid/Toolbar.tsx` 의 Excel 관련 버튼 영역 제거 ("📥 Excel 다운로드", "📤 Excel 업로드", "📥 빈 Template")
- `useStep3Roundtrip` hook의 Excel 관련 함수 (handleExportTemplate, handleExportBlankTemplate, handleImportTemplate) 제거 — `handleReset`만 유지
- hook을 `useStep3Reset` 으로 이름 변경 (round-trip 의미 사라짐)

#### 2.2.4 Budget 입력 목록 페이지
- 영역 2 에서 "빈 Budget Template 다운로드" 버튼 이미 제거됨 (#84) — 추가 작업 없음

### 2.3 Tests 제거

| 파일 | 처리 |
|---|---|
| `backend/tests/regression/test_excel_roundtrip_template.py` | 삭제 |
| `backend/tests/test_template_upload_export.py` | 삭제 |
| `backend/tests/test_members_upload_export.py` | 삭제 |
| `backend/tests/regression/test_members_export_columns.py` (영역 4) | 삭제 — 영역 4 #72 fix는 export 자체가 사라지므로 무효 |
| `backend/tests/fixtures/roundtrip/*.json` (8 fixtures) | 삭제 |

권한 매트릭스 fixture (`backend/tests/fixtures/permission_matrix.yaml`) 에서 제거된 endpoint 항목들 삭제. test_permission_matrix.py 자동 검증 — `pytest`가 누락 endpoint 처리.

### 2.4 Routes 정리

`frontend/src/app/(dashboard)/layout.tsx` 또는 navigation 컴포넌트에서:
- "Appendix" 메뉴 항목 제거
- 사이드바 ordering 조정 (기존 6개 → 5개)

### 2.5 Backward Compatibility — 없음

- API endpoints 완전 삭제 (404 반환 — FastAPI default)
- Frontend 기존 호출 모두 제거
- 외부 호출자 없음 (단일 사용자 시스템)

---

## 3. Grid UX 개선 (4건)

### 3.1 A — Sticky Header + Sticky Column

**현재 문제**:
- 80+ rows × 12개월 그리드. 세로 스크롤 시 12개월 헤더 (4월·5월·...) 사라짐 → 어느 월 입력 중인지 혼동
- 가로 스크롤 시 대분류·관리단위 컬럼 사라짐 → 어느 budget unit 입력 중인지 혼동

**해결**:
- Tailwind CSS `position: sticky` 활용
- Header row: `sticky top-0` + 적절한 `z-index`
- 좌측 4개 컬럼 (대분류, 관리단위, 해당 체크박스, 담당자): `sticky left-0` + cumulative `left` 값
- 합계 컬럼: `sticky right-0` (월별 입력 후 즉시 합계 보임)
- Background 색상으로 sticky 영역 가시성 (white bg + shadow)

**구현 위치**: `Step3Grid/MonthGrid.tsx` (영역 7 분해 후)

**시각 회귀 baseline 갱신 필요** (sticky 적용 후 layout 변경)

### 3.2 B — 분배 도우미 (Distribution Helper)

**현재 문제**:
- Step 3에서 사용자가 각 row에 12개월 분배를 직접 입력 — 시간 소요 많음
- 유사회사 비율 (peer_statistics) 데이터 존재 — 화면에 read-only 표시 (영역 5에서 추가 권장 있었지만 미구현)
- 일반적 분배 패턴 ("균등 분배", "기말 집중") 자주 사용

**해결 — Toolbar에 새 모달**:

```
[📊 분배 도우미] 버튼 → 모달:
┌─────────────────────────────────────────┐
│ 분배 도우미                                  │
├─────────────────────────────────────────┤
│ 적용 대상:                                   │
│ (•) 선택한 행만 (N개)                         │
│ ( ) 활성(V 체크) 행 전체                      │
│                                            │
│ 분배 방식:                                   │
│ ( ) 총 시간 입력 → 균등 분배                  │
│      [총 시간: ___] (12개월 균등)            │
│ ( ) 총 시간 입력 → 기말 집중 (12·1·2월 N%)   │
│      [총 시간: ___] [기말 비율: 50%▼]       │
│ (•) 유사회사 평균 비율 적용                   │
│      유사회사 그룹: A1 (자동 매핑)            │
│      적용 시 산출 시간: 8h ~ 12h             │
│                                            │
│ [취소] [미리보기] [적용]                      │
└─────────────────────────────────────────┘
```

**기능**:
- **균등 분배**: 총 시간 N → 12개월에 N/12 (소수점은 마지막 월에 누적)
- **기말 집중**: 총 시간 N → 기말 (12·1·2월) 에 N×기말비율, 나머지에 균등
- **유사회사 비율**: peer_statistics 의 avg_ratio 곱한 시간 적용 (영역 1 budget_definitions.py 의 axdx_excluded_budget 활용)
- **미리보기**: 적용 전 grid에 변경될 값 highlight (green = 추가, red = 변경)
- **적용**: 미리보기 확정 시 templateRows state 갱신

**구현 위치**:
- `Step3Grid/DistributionHelper.tsx` (NEW)
- `Step3Grid/index.tsx` 에서 Toolbar 의 "분배 도우미" 버튼 → 모달 toggle

**Backend 활용**:
- `GET /api/v1/budget/master/peer-stats?group=...` (이미 영역 1+ 시기에 존재) 호출
- 새 endpoint 불필요 — frontend computation

### 3.3 C — 실시간 검증 + 누락 Highlight

**현재 문제**:
- 작성완료 제출 직전에만 검증 (영역 5 #52 fix, computeStep3Errors)
- 입력 중에 실수 인지 어려움 — 한참 입력 후 작성완료 누르면 "10건 누락" alert

**해결**:

1. **인라인 에러 표시 (입력 시)**:
   - 행이 enabled=true 인데 담당자 미선택 → 담당자 cell에 빨간 테두리
   - 활성 행이지만 시간 입력 0 → 합계 cell에 노란 테두리 + tooltip "시간 미입력"
   - 음수 (NumberField에서 자동 0 clamp 되지만 일시적으로) → 빨간 highlight

2. **합계 차이 시각화 (영역 7 분해 시 만들어진 `Step3Grid/SummaryRow.tsx` 강화)**:
   - 합계 row 의 차이 (총 분배 vs ET Controllable) 시각화
   - 일치: ✓ green
   - 차이: 차이값 + 비율 빨간색
   - 추가: progress bar (% 분배 완료) — 사용자에게 명확한 진척감

3. **누락 highlight (작성완료 직전)**:
   - "작성완료 제출" 버튼 클릭 직전에 hover 시 → 누락 행에 펄스 애니메이션
   - 클릭 시 자동 스크롤 → 첫 누락 행으로

**구현 위치**:
- `Step3Grid/MonthGrid.tsx`: cell 단위 validation classNames 추가
- `Step3Grid/SummaryRow.tsx`: 차이 시각화 강화 + progress bar
- `lib/wizard-validators.ts`: validateRow 함수 추가 (현재 computeStep3Errors는 작성완료 시만 사용)

**상태 추가**:
- `templateRows` 항목에 derived `validationStatus` (memoized) — 'ok' / 'missing-empno' / 'no-hours' / 'over-budget' 등

### 3.4 D — 검색/필터 + 대분류 접기

**현재 문제**:
- 80+ rows 그리드 (10 대분류 × 평균 8 관리단위). 특정 unit (예: "재고자산-실사") 찾기 위해 스크롤
- 대분류 단위로 시각 그룹화는 되지만 접기 불가

**해결**:

1. **검색 input** (Toolbar 또는 그리드 상단):
   - input에 "재고" 입력 → 대분류·관리단위·담당자 이름 case-insensitive 매칭 row 만 표시
   - 비매칭 row는 hidden (원래 데이터는 보존)
   - "✕" 버튼으로 검색 clear

2. **대분류 접기/펼치기**:
   - 각 대분류 헤더 row 에 ▼/▶ 토글 아이콘
   - ▶ 클릭 시 해당 대분류 하위 모든 관리단위 row 숨김
   - 접힌 상태에서 대분류 row 에 active row count 표시 ("자산 (5/17)")
   - state: `Map<categoryName, "expanded" | "collapsed">`

3. **콤비네이션**:
   - 검색 + 접기 동시 동작 (검색 결과가 접힌 카테고리에 있으면 자동 펼침)
   - "전체 펼침" / "전체 접힘" 버튼

**구현 위치**:
- `Step3Grid/CategoryPanel.tsx` (현재 영역 7에서 일부 분리) — 토글 아이콘 + state 관리
- `Step3Grid/MonthGrid.tsx` — visibility filter
- `Step3Grid/Toolbar.tsx` 또는 별도 영역 — 검색 input

---

## 4. 안전망

### 4.1 회귀 가드 (S7 누적 + 신규)
- S7 누적 안전망 모두 GREEN 유지 (Areas 1-7)
- Excel 관련 테스트 삭제로 일부 가드 사라짐 — 영향: round-trip 가드 제거 (Excel 자체 없으므로 무관)

### 4.2 신규 회귀 테스트

**Excel 제거 가드**:
- `backend/tests/regression/test_excel_endpoints_removed.py`: 삭제된 endpoint들이 404 반환 검증
  ```python
  import pytest

  REMOVED_ENDPOINTS = [
      ("POST", "/api/v1/budget/upload"),
      ("GET",  "/api/v1/budget/projects/AREA8-X/template/export"),
      ("POST", "/api/v1/budget/projects/AREA8-X/template/upload"),
      ("GET",  "/api/v1/budget/projects/AREA8-X/members/export"),
      ("POST", "/api/v1/budget/projects/AREA8-X/members/upload"),
      ("GET",  "/api/v1/budget/template/blank-export"),
      ("GET",  "/api/v1/export/overview"),
      # ... export.py 12 endpoints 중 sample
  ]

  @pytest.mark.parametrize("method,path", REMOVED_ENDPOINTS)
  def test_excel_endpoint_returns_404(client, elpm_cookie, method, path):
      resp = client.request(method, path, cookies=elpm_cookie)
      assert resp.status_code == 404, f"{method} {path} should be removed but got {resp.status_code}"
  ```
- `frontend/tests/regression/test_appendix_route_removed.spec.ts`: `/appendix` 접근 → 404 또는 redirect

**Grid UX 가드**:
- `frontend/tests/regression/test_step3_sticky_header.spec.ts`: 그리드 스크롤 후 헤더 가시성 검증 (boundingBox 비교)
- `frontend/tests/regression/test_step3_distribution_helper.spec.ts`: 분배 도우미 모달 → 균등 분배 적용 후 셀 값 검증
- `frontend/tests/regression/test_step3_inline_validation.spec.ts`: enabled+empno 미선택 시 빨간 테두리 검증
- `frontend/tests/regression/test_step3_search_collapse.spec.ts`: 검색 input + 대분류 접기 동작 검증

**시각 회귀 baseline 갱신**:
- Step 3 화면 (sticky + 새 toolbar) — baseline 재캡처
- Appendix 화면 baseline 제거 (라우트 사라짐)

### 4.3 단위 테스트
- `lib/wizard-validators.ts`의 `validateRow`, `distributeBudget` 함수 단위 테스트
- `Step3Grid/DistributionHelper.tsx` snapshot test (모달 렌더링)

---

## 5. 페이즈 (Sprint 구성)

### Phase A — 진단 + 안전망 작성
- 페이지/컴포넌트 의존성 그래프 (Excel 사용처 최종 확인)
- 신규 회귀 테스트 RED 상태 작성

### Phase B — Excel 제거 (Backend)
- budget_upload.py / export.py / excel_parser.py / excel_export.py 삭제
- budget_input.py 안 5 endpoints 제거
- main.py router 제거
- Excel 관련 tests 삭제
- permission_matrix.yaml 정리

### Phase C — Excel 제거 (Frontend)
- Appendix 페이지 + 라우트 + 메뉴 제거
- Step 2 Members.tsx Excel 버튼 + handler 제거
- Step 3 Toolbar Excel 영역 제거
- useStep3Roundtrip → useStep3Reset rename + 정리

### Phase D — Grid UX (A: Sticky)
- MonthGrid sticky CSS 적용
- 시각 회귀 baseline 갱신
- 가드 테스트 GREEN

### Phase E — Grid UX (B: 분배 도우미)
- DistributionHelper.tsx 신규 컴포넌트
- 분배 알고리즘 함수 (`lib/wizard-validators.ts` 또는 별도 `lib/distribution.ts`)
- peer_statistics endpoint 활용
- 모달 통합

### Phase F — Grid UX (C: 실시간 검증)
- validateRow 함수 + memoized
- MonthGrid cell-level validation classNames
- SummaryRow 강화 (progress bar + 차이 시각화)

### Phase G — Grid UX (D: 검색/접기)
- 검색 input + filter logic
- CategoryPanel 토글 + state
- "전체 펼침/접힘" 버튼

### Phase H — 검증 + PR
- 영역 1-7 누적 가드 GREEN 확인
- Manual QA + 시각 회귀 baseline diff 0
- Draft PR 생성

---

## 6. 리스크 + 완화책

| 리스크 | 영향 | 완화 |
|---|---|---|
| Excel 제거가 의외의 경로에서 사용 중 (예: 외부 스크립트) | 사용자 작업 중단 | grep으로 호출자 전수 조사 — 사용자 가시 외 호출자 0건 확인. admin 시드는 별도 |
| Sticky CSS가 Safari/Chrome 버전 차이로 동작 안 함 | UX 깨짐 | CSS spec 표준 — 모던 브라우저 모두 지원. visual regression baseline 으로 검증 |
| 분배 도우미 알고리즘 (균등/기말/유사회사) 정확도 부족 | 잘못 분배 → 사용자 재입력 부담 | 미리보기 단계 필수 + "되돌리기" 옵션 제공 |
| 실시간 검증이 입력 중 너무 많은 빨간 표시 → 사용자 위축 | UX 부정적 | "한 번 이상 blur 한 cell 만 검증" + 오류 priority (담당자 누락 = 빨강 / 시간 0 = 노랑) |
| 검색/접기 state 가 새로고침 시 유실 | 사용자 불편 | sessionStorage에 search/collapsed state 저장 |
| 영역 7 분해된 컴포넌트 구조 변경 (Step3Grid/index.tsx 등) | 영역 7 commit 충돌 | S8 은 영역 7 base. rebase 시 wizard 파일들 다시 읽어야 함 |
| 누적 회귀 가드 깨짐 (영역 5 round-trip test 삭제로 의도된 빨강) | CI 실패 | 의도된 삭제는 commit 메시지에 명시. permission_matrix.yaml 일관 정리 |

---

## 7. 산출물 요약 (예상 LOC 변화)

| 영역 | 시작 | 끝 | 변화 |
|---|---|---|---|
| Backend Excel 모듈 | ~812 | 0 | -812 |
| Backend budget_input.py Excel 함수 | ~300 (5 함수) | 0 | -300 |
| Frontend Appendix | 168 | 0 | -168 |
| Frontend Step 2/3 Excel UI | ~150 | 0 | -150 |
| Backend tests Excel | ~400 | 0 | -400 |
| **소계 (제거)** | | | **약 -1830 LOC** |
| 신규 Grid UX (A·B·C·D 합) | 0 | ~600 | +600 |
| 신규 회귀 테스트 | 0 | ~300 | +300 |
| **순 변화** | | | **약 -930 LOC** |

---

## 8. 다음 단계

1. **사용자 spec 검토** — 본 문서 검토 후 승인
2. writing-plans skill로 implementation plan 작성 (Phase A~H 단위로 batched tasks)
3. subagent-driven-development 로 실행
4. Draft PR 생성 (base: `s7/area-7-wizard-decomp`)

---

## 9. 참고 — Excel 제거 후 사용자 흐름

**Before (S7)**:
1. Budget 입력 메뉴 → "신규 프로젝트" 또는 기존 선택
2. Step 1 입력
3. Step 2 입력 — 또는 Excel 다운로드 → 입력 → Excel 업로드
4. Step 3 입력 — 또는 Excel 다운로드 → 입력 → Excel 업로드
5. 작성완료 제출

**After (S8)**:
1. Budget 입력 메뉴 → "신규 프로젝트" 또는 기존 선택
2. Step 1 입력
3. Step 2 직접 입력 (Excel 옵션 사라짐)
4. Step 3 직접 입력 — Grid 편의성 4건 (sticky / 분배 도우미 / 실시간 검증 / 검색/접기) 활용
5. 작성완료 제출

→ 사용자에게 "Excel 의존" 사라짐. Grid 편의성으로 입력 시간 단축 기대.

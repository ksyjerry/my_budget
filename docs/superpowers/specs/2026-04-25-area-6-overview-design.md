# 영역 6 — Overview / Tracking (Area 6 Spec)

**작성일**: 2026-04-25
**메타 프레임워크**: [2026-04-25-feedback-0425-systematic-framework-design.md](2026-04-25-feedback-0425-systematic-framework-design.md)
**의존 영역**: 영역 1-5 (`s7/area-6-overview` 분기 from `s7/area-5-step3`)
**의존 POL**: POL-01 (provisional (b) — 총계약−AX/DX), POL-08 (provisional (b) — Budget Tracking = EL+admin)

---

## 1. 목적과 결과물

### 1.1 목적
Overview / Tracking / Details for staff·EL·PM 화면의 결함 + #03 시트 9건 + BT-001~016 권한 매트릭스 fix. 마지막 영역 — 데이터 정합성 단일화가 핵심.

### 1.2 결함 분류 (그룹별)

**Group A — Budget 정의 단일화 (POL-01 적용)** (#03 시트 1~3)
- 영역 1에서 만든 `budget_definitions.py` 의 `display_budget()` 활성화
- 모든 view (overview, project table, tracking, summary)에서 `axdx_excluded_budget()` 사용
- 실질 Progress 컬럼 추가

**Group B — 데이터 누락 fix** (#65 #93 #94)
- #65 인원 이름 미표시 (타 LoS) — fallback 표시
- #93 QRP Actual TMS 호출
- #94 Budget 없는 인원 Actual

**Group C — 필터 UX** (#60 #95 #96)
- #60 Project/PM 검색 (input)
- #95 연월 월별 선택
- #96 프로젝트→EL cascading

**Group D — Budget Tracking 권한 (POL-08 (b))** (#59 + BT-001~016)
- EL + admin 만 접근 (PM/Staff 차단)
- 권한 매트릭스에 BT endpoint 추가
- Layer 1 권한 가드 적용

**Group E — Details for staff** (#77)
- service_type 분류명 "감사/비감사" 통일

**Group F — Appendix** (#78)
- 다운로드 차단 경고 — Content-Disposition + 파일 시그니처 보강

**Group G — RA 주관 정책 적용 (POL-06 (a))** (#66)
- FLDT overview 만 노출 → POL-06 (a) 에 따라 RA 주관 케이스도 FLDT 입력 (Step 3에서)

**Group H — Overview 도넛 click cascading** (#03 시트 7~8)
- 도넛 click → 상단 KPI + Staff Time 동시 필터 (이전 라운드 S2 #49 부분 적용 → 영역 6에서 확장)

**Group I — Staff time 분리 컬럼** (#03 시트 5~6)
- FLDT-Staff vs Fulcrum 별도 컬럼

**Group J — 필터 직접 입력** (#03 시트 9)
- Project/EL/PM 등 모든 필터 dropdown에 input 검색 추가

### 1.3 Deliverables (집약)

**Backend**:
- `budget_definitions.py.display_budget()` 활성화 (POL-01 (b) 결정값 반영)
- `overview.py` / `tracking.py` 모든 view 에서 `display_budget()` 사용
- `overview.py` 응답에 "실질 Progress" 컬럼 + Staff time 분리
- `tracking.py` 권한 가드 — POL-08 (b) EL + admin
- `azure_service.py` QRP TMS 조회 + Budget 없는 인원 Actual 확장
- 권한 매트릭스 fixture에 BT endpoints 16개 추가

**Frontend**:
- Overview 도넛 click cascading (KPI + Staff Time)
- 필터 input 검색 (Project/EL/PM)
- 연월 월별 dropdown (12개월 dynamic)
- 프로젝트→EL cascading
- 인원 이름 fallback 표시
- service_type 분류명 표시 통일

**테스트**: ~10 신규 회귀 + BT 권한 매트릭스 케이스 추가

**문서**: qa-checklist + retro + S7 전체 사이클 회고 (메타 프레임워크 효과 평가)

### 1.4 비목표
- Wizard 분해 (Area 7 별도)
- Azure SQL 동기화 인프라 변경
- POL-08 다른 안 (PM 노출 등) 별도 mini-cycle

---

## 2. 페이즈 A — 진단 (compact)

10개 결함 + 9 sheet items + 16 BT cases. 모두 backend overview/tracking + frontend Overview/Details 화면에 집중. POL-01 결정 활성화가 가장 큰 변화.

### 2.1 의존 POL
- POL-01 (b) provisional → display_budget() 라우팅: 모든 view 에 axdx_excluded_budget() 적용
- POL-08 (b) provisional → BT 권한 EL + admin

### 2.2 페이즈 A DoD
- [ ] 모든 결함 그룹 분류
- [ ] POL-01 (b) 적용 범위 — 4 view (overview KPI, project table, tracking, summary) 모두 동일 정의
- [ ] POL-08 (b) BT endpoint 식별 (tracking.py 의 endpoint 목록)

---

## 3-7. 페이즈 B-F (Areas 1-5 동일 패턴)

### Phase B 안전망 (요약)
- `test_display_budget_pol01_routing.py` — POL-01 (b) 적용 검증
- `test_overview_qrp_tms_lookup.py` — #93 가드
- `test_overview_real_progress_column.py` — #03 시트 1 가드
- `test_bt_permission_matrix_pol08.py` — Group D
- frontend regression: cascading filter / 도넛 click / 인원 이름 fallback

### Phase D Fix
- Group A-J 위 매핑대로

### Phase F 회고
- **S7 전체 사이클 메타 회고** — Area 1-6 6개 영역 사이클 효과 평가 + Area 7 (분해) 백로그 정리

---

## 8. 리스크
| 리스크 | 완화 |
|---|---|
| POL-01 (b) 적용으로 모든 view 의 Budget 값 변경 | 사용자에게 변경점 명시. 기존 view 와 비교 가능한 dual display 옵션 일시 제공 |
| BT 권한 변경으로 일부 사용자 갑자기 접근 불가 | POL-08 변경 알림 + 영역 1 권한 매트릭스에 BT case 추가로 회귀 가드 |
| QRP TMS 조회가 Azure SQL 의존 → mock 환경 미작동 | 영역 1 처럼 graceful fallback 처리 |

---

## 9. 다음 단계
1. writing-plans → execute (3 batches: backend / frontend / docs+PR)
2. S7 전체 사이클 회고 작성 (별도 doc)

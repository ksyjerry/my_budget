# My Budget+ 2.0 — S7 사이클 결과 보고 (1-pager)

**작성일**: 2026-04-25
**대상**: ASR 파트너 / 비감사 TF / EL·PM 사용자
**기간**: 2026-04-25 (단일일 집중 실행)
**입력**: 0425 피드백 65건 + Overview 9건 + 금융업 80행 + 회귀 7건

---

## 한눈에 보기

| 지표 | 값 |
|---|---|
| 처리한 결함 | **약 70건** |
| 영역 사이클 | **6 / 6 완료** (Area 1~6) |
| 정책 결정(POL) | **9건 잠정 승인** (외부 결정자 컨펌 대기) |
| 신규 회귀 테스트 | **40+ 건** |
| DB 마이그레이션 | **4건** |
| GitHub PR | **6건** (모두 stacked draft) |
| 누적 회귀 가드 | **0건 깨짐** ✅ |

---

## 영역별 핵심 산출물

**Area 1 — 안전망 + 배포 위생** ([PR #1](https://github.com/ksyjerry/my_budget/pull/1))
회귀 7건 (#67·#68·#69·#70·#71·#74·#99) fix + GitHub Actions CI 5 jobs + NumberField·budget_definitions 횡단 추상화 + 권한 매트릭스 92/92 통과

**Area 2 — Budget 입력 목록** ([PR #2](https://github.com/ksyjerry/my_budget/pull/2))
6 결함 (#79·#82·#84·#85·#120·#121) + **POL-04 표준형 워크플로우** (PM 작성완료 제출 → EL 승인 → 락) + **POL-05 daily TBA sync** (04:00 KST)

**Area 3 — Step 1 (기본정보)** ([PR #3](https://github.com/ksyjerry/my_budget/pull/3))
4 결함 (#57·#62·#86·#100·#101) + ProjectSearchModal stale-client 패턴 동일 fix (bonus) + **POL-06 (a)** Step 1에서 Fulcrum/RA-Staff/Specialist 입력칸 제거

**Area 4 — Step 2 (구성원)** ([PR #4](https://github.com/ksyjerry/my_budget/pull/4))
6 결함 (#72·#73·#87·#88·#102·#103) — Excel export 한글 헤더, 부분 컬럼 업로드, 행 단위 오류 누적, 동명이인 팀 표시, TBD/NS/Associate placeholder, 지원 구성원 enum

**Area 5 — Step 3 (Time Budget)** ([PR #5](https://github.com/ksyjerry/my_budget/pull/5)) — 가장 큰 영역
22 결함 across 8 그룹 + **금융업 78행 시드** (#04 시트) + Excel data validation list + AI 추천 컨텍스트 (service_type / 초도/계속) + error_sanitize (IP 노출 차단) + **POL-03/07** alembic 007 마이그레이션

**Area 6 — Overview / Tracking** ([PR #6](https://github.com/ksyjerry/my_budget/pull/6))
**POL-01 (b) 활성화** — 모든 view에서 `Budget = 총계약 − AX/DX 시간` 통일 + **POL-08 (b)** Budget Tracking 권한 (EL+admin) + #03 시트 9건 부분 처리

---

## 외부 결정자 컨펌 필요 — 4/27 회의 안건

9개 정책 결정 모두 owner 잠정 승인 상태. 외부 결정자 컨펌 시 정식 확정.

| POL | 결정자 | 추천안 | 영향 |
|---|---|---|---|
| POL-01 "Budget 정의" | 김동환 | (b) 총계약 − AX/DX | Overview/Tracking 모든 view 통일 |
| POL-02 통상자문/내부회계 입력 | 신승엽 | (b) service_type별 다름 | Step 3 Description 입력 (별도 mini-cycle) |
| POL-03 비감사 관리단위 | 나형우/김지민 | (a) 소분류명 별도 컬럼 | 금융업 시드 + 데이터 모델 |
| POL-04 EL 승인/취소 워크플로우 | 김동환 | (b) 표준형 3단계 | Budget 입력 목록 + 상태 |
| POL-05 TBA daily batch | 김미진 | (d) 하이브리드 (자동+수동) | 동기화 운영 |
| POL-06 RA 주관 FLDT | 홍상호 | (a) Step 1 제거, Step 3에만 | Step 1/3 입력 위치 |
| POL-07 프로젝트 기간 | 신승엽 | (c) 시작 자동 + 끝 수동 | Step 3 기간 UI |
| POL-08 Budget Tracking 권한 | 김동환 | (b) EL + admin | Tracking 화면 노출 |
| POL-09 TBA sync 권한 | (owner) | admin only | 운영 정책 |

⚠ **결정 변경 시**: 영역 단위로 재작업 가능 (단일 service/file로 영향 최소화 설계됨)

---

## 다음 단계

### 즉시 (5/6 메일 발송 전)
1. **이해관계자 검토**: 본 1-pager + qa-checklist 6건 회람
2. **Manual QA 실행**: `docs/superpowers/qa-checklists/area-{1..6}.md` 일괄
3. **Phase E Layer 3 staging 검증**: 6개 영역 모두 사용자 sign-off
4. **POL 외부 결정자 컨펌**: 4/27 회의에서 일괄 처리 권장

### 5/15 1차 작성 완료 시한 전
5. **PR 순차 merge**: #1 → #2 → ... → #6 (rebase chain)
6. **Branch protection 적용**: `docs/superpowers/runbooks/branch-protection.md` GitHub UI 절차
7. **EL/PM 교육 자료 갱신** (4/29·4/30 교육 직전)

### 다음 라운드 (S8 후보)
- **Area 7 Wizard 분해**: `[project_code]/page.tsx` 2966 LOC → ~5 컴포넌트 (S7 회고 P1 백로그)
- **POL-02 통상자문 Description UI**: 별도 mini-cycle (schema는 영역 5에서 준비)
- **ACT regression**: 영역 1 baseline 발견, 영역 5 백로그

---

## 참고 문서
- 메타 프레임워크: `docs/superpowers/specs/2026-04-25-feedback-0425-systematic-framework-design.md`
- 영역별 spec/plan/retro: `docs/superpowers/{specs,plans,retros}/`
- S7 메타 회고: `docs/superpowers/retros/s7-meta-cycle.md`
- 정책 결정 트래커: `docs/superpowers/specs/policy-decisions.md`

---

*"회귀 7건이 한 라운드에 발생한 구조적 원인을 차단하고, 같은 종류 결함이 재발하지 않도록 만든다." — S7 메타 프레임워크 목표 달성*

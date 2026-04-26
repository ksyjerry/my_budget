# 영역 5 — Step 3 (Time Budget) (Area 5 Spec)

**작성일**: 2026-04-25
**메타 프레임워크**: [2026-04-25-feedback-0425-systematic-framework-design.md](2026-04-25-feedback-0425-systematic-framework-design.md)
**의존 영역**: 영역 1 + 2 + 3 + 4
**의존 POL**: POL-02 (provisional (b)), POL-03 (provisional (a)), POL-06 (provisional (a)), POL-07 (provisional (c))

---

## 1. 목적과 결과물

### 1.1 목적
Step 3 (Time Budget) 의 22개 결함 fix + 금융업 Activity 80행 시드. 다음 그룹별 처리:

**Group A — Excel I/O 라운드트립** (#75 #105 #106 #107 #114 #117)
- 저장 후 다운로드 공란, 초기화 후 다운로드 기존 정보, 시간 미입력 월 누락, 업로드 후 비활성 사라짐, 일부 삭제 후 업로드, 화면-엑셀 순서 불일치
- → 영역 1 Excel round-trip property test 시나리오 확장으로 보장

**Group B — 초기화 동작** (#115 #116)
- 초기화 미완전, step 이동 후 잔존
- → backend truncate + frontend state reset 일관성

**Group C — UX 토글** (#112 #113)
- V 전체 체크/해제 토글 버튼

**Group D — Layout** (#58)
- 합계 칸 정렬 fix

**Group E — AI Assist** (#76 #108 #109 #110 #111)
- 비감사 관리단위 없음 → 시드 추가
- 계속감사 1시간 추천 → prompt 컨텍스트 주입
- 추천 결과 천단위·열간격
- AI 검증 cancel 핸들링
- 등록오류 IP 노출 → sanitize

**Group F — 금융업 시드 + 데이터 모델** (#81 #92 #04 시트 + POL-03)
- 금융업 80행 import (#04 시트 → ServiceTaskMaster)
- budget_unit 표준화 (소분류명 별도 컬럼 분리)

**Group G — 정책 적용** (#91 #118)
- 관리단위 중복 인원 정책 통일
- 프로젝트 기간 (POL-07 (c) — 시작 자동, 끝 수동)

**Group H — Template** (#83 #104 #119)
- Template 업로드 에러 (#83 — round-trip 보장으로 함께 해결)
- 빈 Template 다운로드 (#104, 영역 2 #84와 균형)
- Excel 템플릿 dropbox 형식 (#119 — Excel data validation list 적용)

### 1.2 Deliverables (집약)

**Backend**:
- `non_audit_activity_import.py` — 금융업 80행 import 추가 (또는 신규 import)
- `budget_input.py` Step 3 endpoints — Excel I/O 일관성 + 초기화 fix
- `budget_assist.py` — AI prompt 컨텍스트 (service_type + 초도/계속) + cancel handler
- `error_sanitize.py` (신규) — IP/host pattern 제거 함수
- `service_task_master` 테이블에 `subcategory_name` 컬럼 추가 + 시드 마이그레이션 (POL-03 (a))
- `Project.fiscal_end` 컬럼 추가 (POL-07 (c)) + 마이그레이션

**Frontend**:
- Step3 layout fix (합계 정렬)
- Step3 toolbar에 V 전체 토글 + 빈 Template 다운로드 버튼
- Step3 Excel template export — Excel data validation list 적용 (#119)
- AI 추천 결과 천단위 + 컬럼 width
- 등록오류 alert 에서 IP sanitize 적용
- 프로젝트 기간 선택 UI (시작 자동 / 끝 수동)

**테스트**: ~10 신규 회귀 테스트 + Excel round-trip 시나리오 6건 추가

**문서**: qa-checklist + retro + 금융업 시드 가이드

### 1.3 비목표
- **Wizard 핫스팟 분해 (2966 LOC) — DEFER**: 별도 "Area 7 — 구조 정리" 스프린트로 이연. 이유: 22 결함 fix 자체가 큰 변경. 분해 + 결함 fix 동시 진행 시 회귀 위험 폭증. 회고에서 분해 우선순위 평가
- 신규 도메인 (다중 budget template 등)
- POL-02 결정에 따른 통상자문/내부회계 Description 입력 UI — 영역 5 페이즈 D 외 별도 mini-cycle 권장 (사용자 컨펌 필요)

---

## 2. 페이즈 A — 진단 (그룹별)

(상세 분류표는 페이즈 D fix 계획에 인라인. 페이즈 A 핵심: 모든 22개 결함이 Step 3 화면 + Excel I/O + AI Assist 의 3개 영역에 집중. 영역 1 round-trip + 영역 2 sanitize 인프라 활용 가능.)

### 2.1 의존 POL 상태
| POL | 결정값 (provisional) | 적용 |
|---|---|---|
| POL-02 | (b) service_type별 다름 | 통상자문/내부회계 Description 입력 — 별도 mini-cycle 또는 Area 5 후속 |
| POL-03 | (a) 소분류명 별도 컬럼 | service_task_master 마이그레이션 + 금융업 시드 |
| POL-06 | (a) Step 3에서만 입력 | Area 3 에서 Step 1 이미 정리 — Area 5에서 Step 3 입력 유지 |
| POL-07 | (c) 시작 자동 + 끝 수동 | Project.fiscal_end 추가 + UI |

### 2.2 페이즈 A DoD
- [ ] 22 결함 모두 8 그룹에 분류
- [ ] 4개 POL provisional 상태 확인
- [ ] Wizard 분해 deferred 결정 사용자 컨펌 (제 추천: 분해 별도 스프린트)

---

## 3. 페이즈 B — 안전망 (요약)
- Excel round-trip 시나리오 확장 (영역 1 인프라)
- AI assist mocked LLM 단위 테스트
- Error sanitize 단위 테스트
- 금융업 시드 후 service_type=금융업 → 80행 표시 단위
- 초기화 → step 이동 → 재진입 깨끗한 상태 E2E
- V 전체 토글 E2E

---

## 4. 페이즈 C — 구조 정리 (skip — 분해 deferred)

신규 추상화:
- `error_sanitize.py` (작은 모듈 — 분해 아님)
- `Project.fiscal_end` 컬럼 (스키마 확장 — 분해 아님)

---

## 5. 페이즈 D — Fix (Group별)

| Group | Fix 위치 | 결함 IDs |
|---|---|---|
| A | `budget_input.py` Step 3 endpoints + Excel parser | #75 #105 #106 #107 #114 #117 |
| B | Step 3 frontend toolbar 초기화 + backend truncate | #115 #116 |
| C | Step 3 frontend toolbar V 토글 | #112 #113 |
| D | Step 3 frontend grid CSS | #58 |
| E | `budget_assist.py` + frontend AI 결과 표시 + error sanitize | #76 #108 #109 #110 #111 |
| F | `non_audit_activity_import.py` + alembic 마이그레이션 + service_task_master | #81 #92 #04 시트 |
| G | `budget_input.py` 정책 + `Project.fiscal_end` + frontend | #91 #118 |
| H | Step 3 toolbar + Excel template generator | #83 #104 #119 |

---

## 6~8. 검증 / 회고 / 리스크 (영역 1~4 동일 패턴)

### 8.1 핵심 리스크
- **Wizard 분해 deferred**: 향후 결함 fix 시 같은 큰 파일에서 작업 → 회귀 위험 지속. 회고에 "Area 7 분해 스프린트" 정식 등록 권장
- **POL-02 적용 범위 모호**: 통상자문/내부회계 Description 입력 UI는 별도 mini-cycle. 본 영역에서는 Description 데이터 모델만 schema에 준비, UI는 후속
- **금융업 시드 데이터 충돌**: 기존 ServiceTaskMaster 행과 중복 가능성. 시드 시 ON CONFLICT DO NOTHING 또는 명시적 조건
- **누적 회귀 가드**: 영역 1+2+3+4 안전망이 영역 5 변경으로 깨질 수 있음 — 매 commit 후 재실행

---

## 9. 다음 단계
1. 사용자 컨펌 (특히 wizard 분해 deferred 동의 + POL-02 통상자문 UI 별도 처리)
2. writing-plans → execute
3. Area 6 진입

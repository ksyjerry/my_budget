# 영역 3 — Step 1 (기본정보) (Area 3 Spec)

**작성일**: 2026-04-25
**메타 프레임워크**: [2026-04-25-feedback-0425-systematic-framework-design.md](2026-04-25-feedback-0425-systematic-framework-design.md)
**의존 영역**: 영역 1 + 영역 2 (안전망 + 워크플로우 — `s7/area-3-step1` 브랜치는 `s7/area-2-budget-list` HEAD에서 분기)
**의존 POL**: POL-04 (provisional, 영역 2에서 도입), POL-06 (provisional (a) — Step 1 Fulcrum/RA-Staff/Specialist 제거)

본 문서는 영역 3의 단일 spec으로, 페이즈 A~F 산출물의 What·Why를 정의한다. How는 writing-plans 산출물에서 다룬다.

---

## 1. 목적과 결과물

### 1.1 목적

Step 1 (기본정보) 화면은 신규 프로젝트 생성의 첫 단계이자 사용자가 가장 자주 마주치는 화면이다. 영역 1 회귀 fix 후에도 다음 4가지 결함이 사용성에 영향을 준다:

- **#57** 클라이언트 변경 시 이전 클라이언트의 표준산업분류·자산규모 등이 그대로 잔존 — 새 프로젝트 생성 시 잘못된 정보 입력 위험
- **#62** 비감사 service_type 클릭 시 클라이언트정보 영역만 변경 → UX 비직관적
- **#86 / #100** "이전 프로젝트 정보 가져오기" 미작동 — 더본코리아·롯데지알에스 케이스 모두 실패 → 계속감사 입력 시 효율성 저하
- **#101** Step 1과 Step 3에 동일한 Fulcrum/RA-Staff/Specialist 입력칸 존재 → 사용자 혼란 + 데이터 일관성 위협 (POL-06 의존)

영역 3은 위 4건을 fix하여 Step 1을 안정화한다.

### 1.2 결과물 (Deliverables)

본 영역 종료 시점에 다음이 main 브랜치에 반영된 상태:

**Frontend Step 1 fix**:
- `[project_code]/page.tsx` Step1Form 영역 수정:
  - **#57**: ClientSearchModal onSelect 시 `base.X || info.X || ""` 패턴을 `info.X || ""` (또는 명시적 reset 후 채우기) 로 변경. 이전 클라이언트 정보 자동 clear
  - **#62**: 화면 섹션 순서 — 프로젝트 정보 → 클라이언트 정보 → EL/PM/QRP 시간 (현재는 클라이언트 → 프로젝트 → 시간)
  - **#101 (POL-06 (a))**: Step 1 시간 배분 영역에서 `fulcrum_hours`, `ra_staff_hours`, `specialist_hours` 입력칸 제거 (필드는 schema에 유지하되 UI만 숨김)

**Backend / clone-data fix**:
- `backend/app/api/v1/budget_input.py:359` `/projects/{code}/clone-data` 디버깅 + fix
  - 404 발생 케이스 진단: project_code 형식 vs 사용자 입력 형식 mismatch 여부
  - 응답 schema 검증 (frontend가 기대하는 `data.hours`, `data.members`, `data.template.rows` 모두 반환)
  - 권한 가드 추가 (현재 누구나 호출 가능 — Area 1 권한 매트릭스 적용)

**테스트 (Area 3 안전망)**:
- 신규 회귀 테스트:
  - `frontend/tests/regression/test_step1_client_change_clears_dependent.spec.ts` — #57 가드
  - `frontend/tests/regression/test_step1_section_order.spec.ts` — #62 가드 (프로젝트 정보가 클라이언트 정보 위에 위치)
  - `frontend/tests/regression/test_step1_clone_from_project.spec.ts` — #86 / #100 가드 (E2E: 기존 프로젝트 선택 → 시간/구성원/template 자동 채움)
  - `frontend/tests/regression/test_step1_no_fulcrum_inputs.spec.ts` — #101 가드 (Step 1에 fulcrum/ra-staff/specialist input 없음)
- 신규 단위 테스트:
  - `backend/tests/regression/test_clone_data_endpoint.py` — clone-data 응답 schema + 권한 가드

**문서**:
- `docs/superpowers/qa-checklists/area-3.md`
- `docs/superpowers/retros/area-3.md`
- (필요 시) `docs/superpowers/runbooks/area-3-baseline-report.md`

### 1.3 비목표

- Step 2 / Step 3 작업 (영역 4·5)
- 신규 도메인 (예: 다중 클라이언트, 자동 client master 갱신)
- ClientSearchModal/ProjectSearchModal 자체 분해 (영역 5 wizard 분해와 함께)
- POL-06 다른 안 결정 시 fallback (provisional 진행)

---

## 2. 페이즈 A — 진단

### 2.1 결함 분류표

| ID | 표면 증상 | 근본 원인 카테고리 | 추정 위치 | 의존 POL | 가드 |
|---|---|---|---|---|---|
| #57 | 클라이언트 변경해도 표준산업분류·자산규모 등 이전 정보 잔존 | RC-CLIENT-MERGE-PRESERVE: ClientSearchModal onSelect의 `base.X \|\| info.X \|\| ""` 패턴이 base(이전) 우선 → 사용자가 이전 클라이언트 변경 의도를 무시 | `[project_code]/page.tsx:1326-1363` | 없음 | E2E A→B→C 시퀀스 |
| #62 | 비감사 클릭 시 고객정보만 변경되어 직관적이지 않음. 프로젝트 정보를 상단으로 | RC-LAYOUT-ORDER: 클라이언트 → 프로젝트 → 시간 순. 비감사 토글이 클라이언트 영역만 즉시 변경되어 사용자가 "어디가 바뀐 건지" 명확치 않음 | `[project_code]/page.tsx` Step1Form | 없음 | 시각 + boundingBox |
| #86 | 더본코리아 "이전 프로젝트 정보 가져오기" 미작동 | RC-CLONE-DATA-LOOKUP: backend가 project_code로만 조회 → 사용자가 client_code 또는 project_name으로 검색 시 mismatch | `budget_input.py:359` + frontend onCloneFromProject | 없음 | 단위 + E2E |
| #100 | 롯데지알에스 계속감사 시 동일 미작동 | RC-CLONE-DATA-LOOKUP: 동일 (#86) | 동일 | 없음 | 동일 (통합 테스트) |
| #101 | Step 3에 Fulcrum/RA/Specialist 시간 입력 있는데 Step 1에도 동일 입력칸 → 중복 | RC-DUPLICATE-INPUT: Step 1 시간 배분 영역의 fulcrum_hours, ra_staff_hours, specialist_hours input | `[project_code]/page.tsx` Step1Form 시간배분 섹션 | POL-06 (a) | 단위 + E2E (Step 1 화면에 fulcrum input 없음) |

### 2.2 메타원인

- **RC-CLIENT-STATE-MERGE**: 일반적으로 사용자가 "변경"을 의도할 때 시스템이 "병합"을 수행 → #57의 핵심. 모든 search modal onSelect 패턴에서 동일 위험 존재 (Step 1 client, Step 1 project, Step 2 employee 등). 영역 3 fix는 #57만 다루지만, 영역 4/5에서 동일 패턴 재발 가능 — 패턴 가이드 문서화 권장.
- **RC-CLONE-DATA-COVERAGE**: clone-data endpoint가 단일 lookup key (project_code) 만 지원 → 사용자가 다른 식별자로 검색하면 실패. 영역 3 fix는 lookup 다양화.

### 2.3 의존 POL 상태 점검

| POL | 상태 | 차단 여부 |
|---|---|---|
| POL-04 (워크플로우) | provisional (b) — 영역 2에서 도입 | ✅ 영역 3 진입 가능 (Step 1 자체는 워크플로우 영향 적음) |
| POL-06 (RA FLDT) | provisional (a) — Step 1 입력칸 제거 | ✅ 영역 3 진입 가능 |

**provisional 리스크**: POL-06이 외부 결정자(홍상호) 컨펌에서 (b) 또는 (c) 결정 시 #101 fix 일부 롤백 (Step 1 입력칸 다시 노출). 영향 범위: Step1Form 시간 배분 섹션 단일 commit — 롤백 trivial.

### 2.4 신규 POL 후보 (페이즈 A 결과로 surfaced)

본 영역 진단 중 **신규 POL 발견 없음**. 기존 POL-06 의 적용 범위만 확정.

### 2.5 사용자 컨펌 게이트 (페이즈 A DoD)

- [ ] 본 분류표가 누락 0인지 사용자 확인 — Step 1에 다른 결함 없는지 점검
- [ ] POL-06 (a) provisional 적용 범위 — Step 1만 (Step 3 입력칸은 영역 5에서 처리)

---

## 3. 페이즈 B — 안전망 작성

### 3.1 회귀 테스트 (RED state)

**B.1 #57 클라이언트 변경 시 의존 필드 clear**

`frontend/tests/regression/test_step1_client_change_clears_dependent.spec.ts`

시나리오:
1. 신규 프로젝트 생성 화면 진입
2. ClientSearchModal로 클라이언트 A 선택 (예: 산업=제조업, 자산규모=대기업)
3. 다시 ClientSearchModal 열어 클라이언트 B 선택 (예: 산업=서비스업, 자산규모=중견기업)
4. **검증**: 표준산업분류 = "서비스업", 자산규모 = "중견기업" (B의 정보로 갱신, A 잔존 없음)
5. 사용자가 직접 입력했던 값(예: GAAP)은 clear되지 않는지 확인 (B의 GAAP가 비어있다면 그대로 빈 값)

**B.2 #62 섹션 순서**

`frontend/tests/regression/test_step1_section_order.spec.ts`

시나리오:
- Step 1 화면에서 "프로젝트 정보" h3 위치가 "클라이언트 기본정보" h3 위치보다 위(y 좌표 작음)인지 boundingBox 비교

**B.3 #86 / #100 clone-data E2E**

`frontend/tests/regression/test_step1_clone_from_project.spec.ts`

시나리오 (시드 필요):
1. DB에 시드 프로젝트 `AREA3-CLONE-SRC` (시간/구성원/template 모두 채워진 상태)
2. 신규 프로젝트 화면 → "이전 프로젝트 정보 가져오기" 모달 → `AREA3-CLONE-SRC` 선택
3. **검증**: 시간 필드 (contract_hours, axdx_hours 등) 자동 채움 + alert "정보를 가져왔습니다" 표시

**B.4 #101 Step 1 fulcrum 입력칸 없음**

`frontend/tests/regression/test_step1_no_fulcrum_inputs.spec.ts`

시나리오:
- Step 1 화면 진입 후 다음 input/label이 0개:
  - "Fulcrum" 라벨 (label:has-text("Fulcrum"))
  - "RA-Staff" 또는 "RA Staff" 라벨
  - "Specialist" 라벨
- 단, Step 3 화면에서는 동일 검사를 적용하지 않음 (Step 3는 영역 5 작업)

**B.5 backend clone-data 단위 + integration**

`backend/tests/regression/test_clone_data_endpoint.py`

테스트:
1. `test_clone_data_existing_project_full_response` — 시드 프로젝트 → 응답에 hours/members/template 모두 존재
2. `test_clone_data_404_for_unknown_project` — 존재하지 않는 project_code → 404
3. `test_clone_data_requires_login` — anon → 401 (현재 권한 가드 없음 — 추가 필요)
4. `test_clone_data_response_schema` — 응답이 frontend가 기대하는 schema (hours dict + members list + template.rows list) 정합

### 3.2 페이즈 B DoD

- [ ] B.1~B.5 5개 테스트 모두 빨간색으로 작성 + commit
- [ ] CI에서 자동 실행
- [ ] 사용자가 테스트 목록 검토·확정

---

## 4. 페이즈 C — 구조 정리 (선택적)

### 4.1 진단

영역 3 결함의 핫스팟은 `[project_code]/page.tsx` (3000+ LOC). 그러나 분해는 영역 5 wizard 분해와 함께 처리 예정 (영역 2에서도 동일 결정).

### 4.2 신규 추상화

**C.1 (선택적) Search modal merge 패턴 가이드**

영역 3에서 `merge previous client info` 버그 발견 → 동일 패턴이 다른 영역에도 있을 가능성. 영역 3 페이즈 F 회고에서 영역 4/5 점검 권고.

본 영역에서는 #57 fix만 진행 (다른 영역 검토는 retrospective).

### 4.3 페이즈 C DoD

(분해 없음 — 페이즈 C 진입 조건 미충족, skip)

---

## 5. 페이즈 D — Fix

### 5.1 Fix 매핑

| ID | Fix 위치 | 변경 내용 |
|---|---|---|
| #57 | `[project_code]/page.tsx:1326-1363` ClientSearchModal onSelect | 신규 client 선택 시 의존 필드를 명시적으로 새 client의 값(또는 빈 값)으로 reset. 사용자 직접 입력 보존 로직 별도 분리 |
| #62 | `[project_code]/page.tsx` Step1Form 섹션 순서 | "프로젝트 정보" section을 "클라이언트 기본정보" section 위로 이동 |
| #86 / #100 | `budget_input.py:359-` clone-data + frontend onCloneFromProject | (a) backend: 404 시 project_name으로도 fallback lookup. (b) backend: 권한 가드 추가 (`require_login`). (c) frontend: fetch에 `credentials: "include"` 추가 (현재 누락) |
| #101 | `[project_code]/page.tsx` Step1Form 시간 배분 섹션 | fulcrum_hours / ra_staff_hours / specialist_hours `<NumberField>` 3개 제거. (state 자체는 유지 — Step 3 입력 시 사용) |

### 5.2 페이즈 D DoD

- [ ] 페이즈 B 안전망 5개 모두 녹색
- [ ] 영역 1 + 영역 2 누적 가드 모두 녹색
- [ ] 코드 리뷰 통과
- [ ] 의도하지 않은 변경 0

---

## 6. 페이즈 E — 검증

### 6.1 Layer 1 (자동)
- 페이즈 D DoD 모두 녹색
- CI 5 jobs 모두 녹색
- 누적 회귀 가드: **영역 1 + 영역 2 + 영역 3 신규 5개 합산 통과**

### 6.2 Layer 2 (수동 QA)
체크리스트: `docs/superpowers/qa-checklists/area-3.md`

- [ ] 클라이언트 A 선택 → B 선택 → C 선택 시퀀스에서 매번 의존 필드가 새 클라이언트 값으로 갱신
- [ ] Step 1 화면 상단에 "프로젝트 정보", 하단에 "클라이언트 기본정보" 표시
- [ ] 더본코리아 / 롯데지알에스 케이스에서 "이전 프로젝트 정보 가져오기" 정상 작동 (시간/구성원/template 자동 채움)
- [ ] Step 1에 Fulcrum/RA-Staff/Specialist 입력칸 0개. Step 3에는 여전히 존재

### 6.3 Layer 3 (사용자 컨펌)
- 사용자가 staging에서 신규 프로젝트 생성 → 4건 시나리오 직접 시도
- 사용자 영역 3 종료 승인

---

## 7. 페이즈 F — 회고

산출물: `docs/superpowers/retros/area-3.md`

- POL-06 외부 결정자(홍상호) 컨펌 진행 상황 기록
- search modal merge 패턴 (RC-CLIENT-STATE-MERGE) 이 영역 4 employee search 에 동일 위험 있는지 영역 4 진입 전 점검 권고
- clone-data endpoint 의 lookup 다양화 (project_code + project_name) 가 향후 Step 1 검색 UX 개선의 기반이 되는지 평가

---

## 8. 리스크 + 완화책

| 리스크 | 영향 | 완화 |
|---|---|---|
| POL-06 외부 결정자가 (b) 또는 (c) 결정 | Step 1 입력칸 복구 필요 | #101 fix를 단일 commit으로 분리 → 롤백 trivial |
| #57 fix가 사용자 입력 보존 의도까지 깨뜨림 (clear가 너무 공격적) | 사용자가 입력한 값이 client 변경 시 사라짐 | 명확한 정책: "사용자 직접 입력 = 보존, 자동 채움 = 새 client로 갱신". onSelect 시 `markedAsUserInput` flag 도입. 페이즈 D 코드 리뷰에서 점검 |
| clone-data 권한 가드 추가가 기존 호출자 깨뜨림 | 401 발생 가능 | 호출자 grep + 영역 1 권한 매트릭스에 추가 → 기존 호출자가 인증된 상태인지 검증 |
| 누적 회귀 가드 (영역 1 + 2) 가 영역 3 변경으로 깨짐 | 영역 3 종료 차단 | 페이즈 D 작업 시작 전 누적 가드 baseline 확인. 페이즈 E Layer 1에서 누적 재실행 |

---

## 9. 다음 단계

1. 사용자가 본 spec 검토 → 승인
2. POL-06 provisional 위험 인정 (외부 결정자 컨펌 미접수)
3. writing-plans skill로 영역 3 implementation plan 작성
4. subagent-driven-development로 plan 실행
5. 페이즈 F 회고 후 영역 4 spec 작성 시작

# My Budget+ Web Application

## Project Overview
PwC Assurance 감사시간 Budget vs Actual 관리 시스템.
기존 Power BI + Excel 기반 시스템을 웹 애플리케이션으로 전환.

## Tech Stack
- **Frontend**: Next.js 14+ (App Router), TypeScript, Tailwind CSS, Recharts
- **Backend**: FastAPI (Python 3.11+), SQLAlchemy, Alembic
- **Database**: PostgreSQL (주 DB), Azure SQL Server (외부 읽기 전용)
- **Auth**: Azure AD SSO (PwC 계정 연동)

## Project Structure
```
my_budget/
├── frontend/                  # Next.js App
│   ├── src/
│   │   ├── app/              # App Router pages
│   │   │   ├── (auth)/       # 로그인
│   │   │   ├── overview/     # Overview 대시보드
│   │   │   ├── projects/     # Project별 Details
│   │   │   ├── assignments/  # 인별 Details
│   │   │   ├── summary/      # Summary
│   │   │   ├── budget-input/ # Budget 입력 (3-Step Wizard)
│   │   │   │   ├── page.tsx           # 프로젝트 목록 + 신규 생성
│   │   │   │   └── [project_code]/    # 프로젝트별 입력
│   │   │   │       ├── step1/         # 기본정보
│   │   │   │       ├── step2/         # 구성원
│   │   │   │       └── step3/         # Budget Template
│   │   │   └── appendix/     # Appendix / 다운로드
│   │   ├── components/
│   │   │   ├── ui/           # 공통 UI (Button, Card, Table, Select 등)
│   │   │   ├── charts/       # 차트 컴포넌트 (BarChart, DonutChart, KPICard)
│   │   │   ├── filters/      # 필터 컴포넌트 (EL, PM, 본부, 연월, 프로젝트)
│   │   │   ├── tables/       # 데이터 테이블 컴포넌트
│   │   │   └── layout/       # Header, Sidebar, Navigation
│   │   ├── lib/              # API 클라이언트, 유틸리티
│   │   ├── hooks/            # Custom hooks
│   │   └── styles/           # Global CSS, PwC 테마
│   ├── public/
│   │   ├── pwc-logo.png
│   │   └── favicon.ico
│   └── package.json
├── backend/                   # FastAPI App
│   ├── app/
│   │   ├── api/
│   │   │   ├── v1/
│   │   │   │   ├── overview.py
│   │   │   │   ├── projects.py
│   │   │   │   ├── assignments.py
│   │   │   │   ├── summary.py
│   │   │   │   ├── budget_upload.py
│   │   │   │   └── export.py
│   │   │   └── deps.py       # Dependencies (DB sessions, auth)
│   │   ├── models/           # SQLAlchemy models
│   │   │   ├── client.py
│   │   │   ├── project.py
│   │   │   ├── employee.py
│   │   │   ├── budget.py
│   │   │   └── actual.py
│   │   ├── schemas/          # Pydantic schemas
│   │   ├── services/         # Business logic
│   │   │   ├── budget_service.py
│   │   │   ├── actual_service.py
│   │   │   ├── sync_service.py     # Azure SQL → PostgreSQL 동기화
│   │   │   └── excel_parser.py     # Budget Excel 파싱
│   │   ├── db/
│   │   │   ├── session.py
│   │   │   ├── azure_session.py    # Azure SQL 읽기전용 연결
│   │   │   └── base.py
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   └── security.py
│   │   └── main.py
│   ├── alembic/              # DB 마이그레이션
│   ├── tests/
│   └── requirements.txt
├── files/                     # 참조 엑셀 파일
├── power_bi/                  # 참조 Power BI 스크린샷
├── PwC Logo.png
└── CLAUDE.md
```

## Database Design (PostgreSQL)

### Core Tables
```sql
-- 클라이언트 기본정보 (Excel B시트 데이터)
clients (
  id, client_code, project_code, client_name, project_name,
  industry, asset_size, listing_status, gaap, consolidated,
  subsidiary_count, internal_control, initial_audit, fiscal_year_end,
  created_at, updated_at
)

-- 프로젝트 정보
projects (
  id, project_code PK, project_name, client_id FK,
  el_empno, el_name, pm_empno, pm_name, qrp_empno, qrp_name,
  department, group_code,
  contract_hours, axdx_hours, qrp_hours, rm_hours,
  el_hours, pm_hours, ra_elpm_hours,
  et_controllable_budget, fulcrum_hours, ra_staff_hours,
  specialist_hours, travel_hours,
  total_budget_hours, template_status,
  created_at, updated_at
)

-- 직원 (Azure SQL에서 동기화)
employees (
  empno PK, name, department, grade_code, grade_name,
  team_leader_empno, los, org_name, email, emp_status,
  synced_at
)

-- 팀/본부 (Azure SQL에서 동기화)
teams (
  team_code PK, team_name, synced_at
)

-- 개인별 Budget 상세 (핵심 테이블)
budget_details (
  id, project_code FK, budget_category, -- 대분류 (자산, 부채 등)
  budget_unit,     -- Budget 관리단위 (매출채권-일반, 재고자산-실사 등)
  empno FK, emp_name, grade,
  department,
  year_month,      -- 2026-01 형식
  budget_hours,    -- 배분된 시간
  created_at, updated_at
)

-- Actual 시간 (Azure SQL TMS에서 동기화 + Activity 코드 매핑)
actual_details (
  id, project_code, empno,
  input_date,      -- 일별
  year_month,      -- 집계용
  use_time,
  activity_code_1, activity_name_1, -- 대분류
  activity_code_2, activity_name_2, -- 중분류
  activity_code_3, activity_name_3, -- 소분류
  budget_unit,     -- 매핑된 Budget 관리단위
  synced_at
)

-- Activity → Budget 관리단위 매핑 (Excel E시트)
activity_budget_mapping (
  id, activity_code_1, activity_name_1,
  activity_code_2, activity_name_2,
  activity_code_3, activity_name_3,
  budget_unit,     -- Budget 관리단위명
  budget_category  -- 대분류명
)
```

## External Data Sources

### Azure SQL Server (읽기 전용)
- Host: `gx-zsesqlp011.database.windows.net`
- DB: `REPORT_COMMON`
- 주요 테이블:
  - `BI_STAFFREPORT_EMP_V` → employees 동기화
  - `BI_STAFFREPORT_TEAM_V` → teams 동기화
  - `BI_STAFFREPORT_TMS_V` → actual_details 동기화 (481만건, 일별 Time Report)
  - `BI_STAFFREPORT_PRJT_V` → projects 참조
  - `BI_STAFFREPORT_GRADE_V` → 직급 마스터
  - `API_AD_ELPMINFO_V` → EL/PM 감사 대시보드 정보

### Budget Excel 파일
- 개별 프로젝트 Budget 파일 업로드 → 파싱 → budget_details 저장
- 통합 Budget DB 파일 (Budget_데이터_2025.xlsx) 일괄 업로드 지원

## Design System (PwC Style)

### Colors
```
--pwc-black: #000000          # Primary text, headers
--pwc-orange: #D04A02         # PwC brand accent (from logo)
--pwc-orange-light: #EB8C00   # Secondary accent
--pwc-white: #FFFFFF           # Background
--pwc-gray-50: #F5F5F5        # Section backgrounds
--pwc-gray-100: #E0E0E0       # Borders, dividers
--pwc-gray-200: #C6C6C6       # Disabled states
--pwc-gray-600: #6D6D6D       # Secondary text
--pwc-gray-900: #2D2D2D       # Body text
--pwc-red: #D93954            # Over-budget, danger
--pwc-green: #22992E          # Under-budget, success
--pwc-yellow: #FFB600         # Warning, near-budget
```

### Typography
- Font: `PwC Helvetica Neue`, system sans-serif fallback
- Headings: Bold (700), generous sizing
- Body: Regular (400), 14-16px
- Data/Tables: 13-14px

### Components
- **KPI Cards**: 큰 숫자 + 라벨, 진행률 표시
- **Data Tables**: 정렬 가능, 트리 구조 지원 (expand/collapse)
- **Charts**: 가로 막대 (Budget vs Actual), 도넛 (비율), 진행률 바
- **Filters**: 드롭다운 슬라이서 (EL, PM, 본부, 연월, 프로젝트)
- **Navigation**: 상단 탭 (Overview / Project별 / 인별 / Summary / Budget 입력 / Appendix)
- **Buttons**: 아웃라인 스타일 (1px black border), hover시 반전
- **Wizard/Stepper**: Budget 입력용 3-Step 위저드 (스텝 인디케이터 + 이전/다음/저장)
- **Spreadsheet Grid**: Budget Template 입력용 스프레드시트 (셀 직접 편집, Tab키 이동)

### Layout
- 상단: 로고 + "My Budget +" 타이틀 + 최종 갱신일 + 탭 네비게이션
- 필터 바: 탭 아래, 페이지별 필터 슬라이서
- 메인: KPI 카드 → 차트 → 데이터 테이블 (Power BI와 동일한 배치)

## Page Specifications

### 1. Overview (메인 대시보드)
- KPI 카드: 총 계약시간, AX/DX, Staff Budget, Actual, 진행률, 작성여부
- 프로젝트별 Time 현황 (가로 막대)
- 활동별 Budget 현황 (도넛)
- Budget 관리단위별 Status (테이블)
- EL/PM/QRP Time (테이블)
- Staff Time (테이블)

### 2. Project별 Details
- 시간 구분 KPI: FLDT-Staff, Fulcrum, RA-Staff, Specialist, AX/DX 등
- FLDT구분별 Budget 현황 (도넛)
- Activity별 Time 현황 (가로 막대)
- Project별 상세내역 (트리 테이블: 프로젝트→관리단위→본부→인원)

### 3. 인별 Details (Assignment Details)
- 좌측 인원 목록 (검색 가능)
- Project별 Budget 현황 (도넛)
- Activity별 Time 현황 (가로 막대)
- 인원별 상세 테이블 (프로젝트/관리단위별 Budget/Actual/잔여/진행률)

### 4. Summary
- 그룹별 time 현황 (가로 막대 + 테이블)
- 프로젝트별 요약 테이블 (최종계약시간, 총Budget, 총Actual, YRA, AX/DX, 비율)

### 5. Appendix
- 참고 링크
- Excel Quick Download (각 뷰 데이터 CSV/Excel 내보내기)

### 6. Budget 입력 (신규 메뉴)
Excel Budget Template의 입력 프로세스를 웹 UI로 구현.
기존 Excel 업로드도 계속 지원하되, 웹에서 직접 입력/수정 가능하게 함.

#### 6-1. 입력 흐름 (3-Step Wizard)

**Step 1: 프로젝트 기본정보** (Excel B시트 대응)
- 신규 생성 or 기존 프로젝트 선택
- 클라이언트 기본정보:
  - 표준산업분류 (제조업/서비스업/건설업/금융업/도소매업/기타)
  - 자산규모 (7단계)
  - 상장/비상장 (유가증권/코스닥/코넥스/채권/상장예정/비상장)
  - 사업보고서 제출 (대상/미대상)
  - GAAP (IFRS/일반기준)
  - 연결재무제표작성 (작성/미작성)
  - 연결자회사수 (없음/10개이하/11~50/51~100/100초과)
  - 내부회계관리제도 (연결감사/별도감사/검토/의무없음)
  - 초도/계속감사
- 프로젝트 정보:
  - Project code, Project명, 본부명
  - EL (검색: 이름/사번), PM (검색: 이름/사번)
  - 업무개시일 (연월 선택)
  - 총 계약시간
- EL/PM/QRP 시간:
  - QRP, RM/CRS/M&T, FLDT-EL, FLDT-PM, RA-EL/PM 시간 입력
- → 입력 시 유사회사 그룹 자동 매핑 (DB_tMap + DB_tStat)

**Step 2: ET 구성원 정보** (Excel C시트 대응)
- FLDT 구성원 추가/삭제:
  - 이름 + 사번 (직원 DB에서 검색/자동완성)
  - 또는 TBD/New comer로 임시 지정
- 지원 구성원 (Fulcrum, RA, Specialist) — 기본 제공, 시간만 입력
- AX/DX Transition 목표치 입력
- → ET controllable budget 자동 산출 표시

**Step 3: Budget Template 입력** (Excel D시트 대응 — 핵심)
- 스프레드시트 형태의 입력 테이블:

```
┌─────────────┬──────────────────────┬───────┬──────────┬───────┬─────┬─────┬─────┬─────┬───┐
│ 대분류       │ Budget 관리단위       │ 해당  │ 담당자    │ 합계  │ 4월 │ 5월 │ 6월 │ ... │3월│
├─────────────┼──────────────────────┼───────┼──────────┼───────┼─────┼─────┼─────┼─────┼───┤
│ 계획단계     │ 계획단계              │ ☑     │ 이채연 ▼ │  8    │     │     │  8  │     │   │
│ 계획단계     │ 초도감사              │ ☑     │ 정다희 ▼ │  4    │     │     │  4  │     │   │
│ 자산         │ 현금및현금성자산-일반  │ ☑     │ 정다희 ▼ │  8    │     │     │  2  │     │   │
│ 자산         │ 매출채권-일반         │ ☑     │ 이채연 ▼ │ 10    │     │     │  2  │     │   │
│ ...          │ ...                  │       │          │       │     │     │     │     │   │
└─────────────┴──────────────────────┴───────┴──────────┴───────┴─────┴─────┴─────┴─────┴───┘
```

- 관리단위 목록 (10개 대분류, ~80개 소분류):
  - **분반기 검토**: 분반기 검토
  - **계획단계**: 계획단계, 초도감사
  - **재무제표 수준 위험**: 부정위험, 계속기업, 기타
  - **자산** (17개): 현금-일반/조회, 채무증권-일반/공정가치, 파생상품, 매출채권-일반/조회, 고객반품, 재고자산-일반/실사, 건설계약, 기타자산, 유무형자산-일반/취득처분, 종속기업투자-일반/손상, 영업권-일반/PPA/손상, 자산기타
  - **부채 및 자본** (13개): 매입채무-일반/조회, 특수관계자, 기타부채-일반/부외부채, 법인세, 차입금-일반/공정가치/약정, 이연수익, 리스, 퇴직급여, 부채기타, 자본금
  - **수익/비용** (10개): 매출-일반/발생사실/Cut-off, 기타영업수익, 매출원가-일반/증빙, 영업비용, 인건비, 영업외손익, 주식기준보상, 비용기타
  - **종결단계** (4개): 종결단계, 주석검토-별도, 주석검토-연결, 기말감사-별도CF, 외국어보고서
  - **연결** (4개): 연결일반, 연결GA/CA, 연결법인세, 연결CF
  - **내부통제** (23개): 계획/종결, 내부회계검토, 설계평가(ELC/ITGC/FR/자금/매출/재고/매입/급여/유무형/연결/기타), 운영평가(동일 11개)
  - **IT 감사-RA**: IT 감사-RA

- 입력 UI 기능:
  - **해당 체크박스**: 해당 프로젝트에 적용되는 관리단위만 체크
  - **담당자 드롭다운**: Step 2에서 등록한 구성원 목록에서 선택
  - **같은 관리단위 복수 행**: 한 관리단위에 여러 담당자 배정 가능 (+ 버튼)
  - **월별 시간 입력**: 12개월 (업무개시월~종료월), 직접 숫자 입력
  - **합계 자동 계산**: 행별 합계, 열별(월별) 합계, 전체 합계
  - **유사회사 비율 참고**: 유사회사 평균 비율 / 적용시 산출시간 표시 (읽기 전용)
  - **배부 검증**: 전체시간 = ET controllable budget 일치 여부 표시
  - **기말비율**: 기말(12~2월) 시간 비율 자동 계산

- 입력 완료 시:
  - 작성상태: 작성중 / 작성완료 선택
  - 저장 → budget_details 테이블에 반영
  - Excel 다운로드 (기존 양식 호환)

#### 6-2. Budget 수정
- 프로젝트 목록에서 기존 Budget 선택 → 동일 3-Step UI로 수정
- 변경 이력 추적 (변경일시, 변경자)

#### 6-3. Excel 업로드 (기존 방식 호환)
- 기존 Excel Budget Template 파일 업로드 → 자동 파싱 → DB 저장
- 통합 Budget DB 파일 (Budget_데이터_*.xlsx) 일괄 업로드

#### 6-4. Budget 입력용 추가 DB 테이블
```sql
-- 유사회사 통계 (Excel DB_tStat)
peer_statistics (
  id, stat_group,              -- A1, A2, B30 등
  budget_unit,                 -- 관리단위명
  avg_ratio FLOAT,             -- 유사회사 평균 비율
  PRIMARY KEY (stat_group, budget_unit)
)

-- 유사회사 그룹 매핑 (Excel DB_tMap)
peer_group_mapping (
  id, industry, asset_size, listing_status,
  consolidated, internal_control,
  stat_group                   -- → peer_statistics.stat_group
)

-- Budget 관리단위 마스터 (Excel DB_cList 기반)
budget_unit_master (
  id, category,                -- 대분류 (자산, 부채 및 자본 등)
  unit_name,                   -- 관리단위명
  sort_order,                  -- 표시 순서
  is_financial BOOLEAN,        -- 금융/비금융 구분
  DEFAULT true
)

-- Budget 변경 이력
budget_change_log (
  id, project_code, changed_by_empno, changed_at TIMESTAMP,
  change_type,                 -- 'create' | 'update' | 'upload'
  change_summary TEXT           -- 변경 요약
)
```

#### 6-5. Budget 입력용 추가 API
```
POST   /api/v1/budget/projects                    — 프로젝트 생성 (Step 1)
PUT    /api/v1/budget/projects/{project_code}      — 프로젝트 수정
POST   /api/v1/budget/projects/{project_code}/members  — 구성원 등록 (Step 2)
PUT    /api/v1/budget/projects/{project_code}/members  — 구성원 수정
GET    /api/v1/budget/projects/{project_code}/template  — Budget Template 조회 (Step 3)
PUT    /api/v1/budget/projects/{project_code}/template  — Budget Template 저장
GET    /api/v1/budget/master/units                 — 관리단위 마스터 목록
GET    /api/v1/budget/master/peer-stats?group={group}  — 유사회사 통계
GET    /api/v1/budget/peer-group?industry=...&asset_size=...  — 유사회사 그룹 조회
GET    /api/v1/budget/projects/{project_code}/history  — 변경 이력
POST   /api/v1/budget/upload                       — Excel 파일 업로드 (기존)
GET    /api/v1/budget/projects/{project_code}/export-excel  — Excel 다운로드
```

## API Endpoints

### Budget
- `POST /api/v1/budget/upload` — Budget Excel 파일 업로드 및 파싱
- `GET /api/v1/budget/overview` — Overview 데이터
- `GET /api/v1/budget/projects` — Project별 상세
- `GET /api/v1/budget/projects/{project_code}` — 단일 프로젝트 상세
- `GET /api/v1/budget/assignments` — 인별 상세
- `GET /api/v1/budget/assignments/{empno}` — 단일 인원 상세
- `GET /api/v1/budget/summary` — Summary 데이터

### Actual (TMS)
- `POST /api/v1/actual/sync` — Azure SQL에서 TMS 데이터 동기화
- `GET /api/v1/actual/by-project/{project_code}` — 프로젝트별 Actual

### Master Data
- `POST /api/v1/sync/employees` — 직원 동기화
- `POST /api/v1/sync/teams` — 팀 동기화
- `GET /api/v1/employees` — 직원 목록
- `GET /api/v1/teams` — 팀 목록

### Export
- `GET /api/v1/export/{view_type}` — Excel/CSV 내보내기

### Filters (공통 쿼리 파라미터)
- `el_empno` — EL 필터
- `pm_empno` — PM 필터
- `department` — 소속본부
- `project_code` — 프로젝트
- `year_month` — 연월
- `cumulative` — 월별/누적 (true/false)
- `budget_category` — 대분류명

## Key Data Flows

### 1. Budget 입력 흐름
```
Excel Budget Template 업로드
  → excel_parser.py로 파싱 (B/C/D 시트)
  → clients, projects, budget_details 테이블에 저장
  → 통합 Budget DB 파일도 일괄 업로드 가능
```

### 2. Actual 동기화 흐름
```
Azure SQL (BI_STAFFREPORT_TMS_V)
  → sync_service.py가 주기적으로 가져옴
  → activity_budget_mapping으로 Budget 관리단위 매핑
  → actual_details 테이블에 저장
```

### 3. Budget vs Actual 비교
```
budget_details JOIN actual_details
  ON (project_code, empno, budget_unit, year_month)
  → 진행률 = actual / budget * 100
```

## Development Commands
```bash
# Frontend
cd frontend && npm run dev          # 개발 서버 (localhost:8001)
cd frontend && npm run build        # 프로덕션 빌드
cd frontend && npm run lint         # ESLint

# Backend
cd backend && uvicorn app.main:app --reload --port 3001  # 개발 서버 (localhost:3001)
cd backend && alembic upgrade head           # DB 마이그레이션
cd backend && pytest                         # 테스트

# Database
docker compose up -d postgres       # PostgreSQL 실행
```

## Environment Variables
```env
# Backend (.env)
DATABASE_URL=postgresql://user:pass@localhost:5432/mybudget
AZURE_SQL_HOST=gx-zsesqlp011.database.windows.net
AZURE_SQL_DB=REPORT_COMMON
AZURE_SQL_USER=KRAzureCommon
AZURE_SQL_PASSWORD=<secret>

# Frontend (.env.local)
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Implementation Priority
1. **Phase 1**: 프로젝트 구조 + DB 스키마 + Backend CRUD + Excel 파싱 ✅
2. **Phase 2**: Frontend Overview 페이지 API 연동 + Budget 입력 메뉴 (Step 1~3)
3. **Phase 3**: Project별/인별 Details 페이지
4. **Phase 4**: Summary + Appendix + Export
5. **Phase 5**: Azure SQL 동기화 + 실시간 Actual 데이터
6. **Phase 6**: 인증(Azure AD) + 권한 관리

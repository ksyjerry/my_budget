# My Budget+ 데이터 스키마

## 핵심 테이블

### projects (프로젝트)
감사 Engagement 단위. 각 프로젝트에 EL(감사담당이사), PM(감사담당매니저)이 배정됨.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| project_code | VARCHAR(50) PK | 프로젝트코드 (예: 01116-01-065) |
| project_name | VARCHAR(300) | 프로젝트명 (예: (주)국민은행/2025IFRS회계감사) |
| el_empno / el_name | VARCHAR | EL(감사담당이사) 사번/이름 |
| pm_empno / pm_name | VARCHAR | PM(감사담당매니저) 사번/이름 |
| qrp_empno / qrp_name | VARCHAR | QRP 사번/이름 |
| department | VARCHAR(100) | EL 소속본부 (예: FS BCM 1, CM Audit 1) |
| contract_hours | DOUBLE | 총 계약시간 |
| axdx_hours | DOUBLE | AX/DX 시간 |
| el_hours / pm_hours / qrp_hours | DOUBLE | EL/PM/QRP 배정시간 |
| rm_hours | DOUBLE | RM/CRS/M&T 시간 |
| et_controllable_budget | DOUBLE | ET controllable budget |
| fulcrum_hours | DOUBLE | Fulcrum 시간 |
| ra_staff_hours | DOUBLE | RA-Staff 시간 |
| specialist_hours | DOUBLE | Specialist 시간 |
| template_status | VARCHAR(50) | Budget 작성상태 (작성중/작성완료) |
| fiscal_start | DATE | 업무개시일 |

### budget_details (개인별 Budget 상세)
프로젝트별, 인원별, 관리단위별 Budget 시간 배정. 핵심 데이터 테이블.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| project_code | VARCHAR(50) FK | 프로젝트코드 |
| budget_category | VARCHAR(100) | 대분류 (자산, 부채 및 자본, 수익/비용, 계획단계, 종결단계, 연결, 내부통제 등) |
| budget_unit | VARCHAR(200) | Budget 관리단위 (매출채권-일반, 재고자산-실사, 계획단계 등 ~80개) |
| empno | VARCHAR(50) | 직원 사번 |
| emp_name | VARCHAR(100) | 직원 이름 |
| grade | VARCHAR(50) | 직급 (P=파트너, D=디렉터, SM=시니어매니저, M=매니저, SA=시니어, A=어소시에이트) |
| department | VARCHAR(100) | 소속 본부 |
| year_month | VARCHAR(7) | 월별 배정 (2026-01 형식) |
| budget_hours | DOUBLE | 배정 시간 |

### project_members (프로젝트 구성원)
프로젝트에 배정된 구성원 목록 (FLDT, Fulcrum, RA, Specialist 등).

| 컬럼 | 타입 | 설명 |
|------|------|------|
| project_code | VARCHAR(50) FK | 프로젝트코드 |
| role | VARCHAR(50) | 역할 (FLDT, Fulcrum, RA, Specialist) |
| name | VARCHAR(100) | 이름 |
| empno | VARCHAR(50) | 사번 |
| grade | VARCHAR(20) | 직급 |

### clients (클라이언트 기본정보)
감사 대상 회사 정보. 유사회사 그룹 매핑에 사용.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| client_code | VARCHAR(50) PK | 클라이언트코드 |
| client_name | VARCHAR(200) | 클라이언트명 |
| industry | VARCHAR(100) | 표준산업분류 (제조업/서비스업/건설업/금융업/도소매업/기타) |
| asset_size | VARCHAR(200) | 자산규모 (7단계) |
| listing_status | VARCHAR(100) | 상장/비상장 (유가증권/코스닥/코넥스/채권/상장예정/비상장) |
| gaap | VARCHAR(50) | 회계기준 (IFRS/일반기준) |
| consolidated | VARCHAR(50) | 연결재무제표작성 여부 |
| subsidiary_count | VARCHAR(50) | 연결자회사수 |
| internal_control | VARCHAR(100) | 내부회계관리제도 (연결감사/별도감사/검토/의무없음) |
| initial_audit | VARCHAR(50) | 초도/계속감사 |

## Actual (실적) 데이터

### actual_cache (TMS 실적 캐시)
Azure SQL의 일별 Time Report 데이터를 캐싱. 프로젝트별, 인별 실제 투입 시간.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| project_code | VARCHAR(20) | 프로젝트코드 |
| empno | VARCHAR(20) | 직원 사번 |
| activity_code_1~3 / activity_name_1~3 | VARCHAR | Activity 코드/명 (대/중/소분류) |
| use_time | DOUBLE | 투입 시간 |

### activity_budget_mapping (Activity→Budget 매핑)
TMS Activity 코드를 Budget 관리단위에 매핑하는 마스터 테이블.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| activity_code_1~3 / activity_name_1~3 | VARCHAR | Activity 대/중/소분류 |
| budget_unit | VARCHAR(200) | 매핑된 Budget 관리단위 |
| budget_category | VARCHAR(100) | 매핑된 대분류 |

## 참조 테이블

### budget_unit_master (Budget 관리단위 마스터)
10개 대분류, ~80개 관리단위 목록.
- 대분류: 분반기 검토, 계획단계, 재무제표 수준 위험, 자산, 부채 및 자본, 수익/비용, 종결단계, 연결, 내부통제, IT 감사-RA

### peer_statistics / peer_group_mapping (유사회사 통계)
유사회사 그룹별 관리단위 평균 비율. Budget 작성 시 참고.

### partner_access_config (파트너 접근 범위)
| 컬럼 | 설명 |
|------|------|
| empno | 파트너 사번 |
| scope | 접근 범위 (self=본인 프로젝트, departments=특정 본부, all=전체) |
| departments | scope=departments일 때 접근 가능 본부 목록 (콤마 구분) |

## 주요 관계
- `projects.client_id` → `clients.id`
- `budget_details.project_code` → `projects.project_code`
- `project_members.project_code` → `projects.project_code`
- `actual_cache.project_code` → `projects.project_code`

## 직급 체계
P(파트너) > D(디렉터) > SM(시니어매니저) > M(매니저) > SA(시니어어소시에이트) > A(어소시에이트)

## Budget 대분류 및 관리단위 구조
- **분반기 검토**: 분반기 검토
- **계획단계**: 계획단계, 초도감사
- **재무제표 수준 위험**: 부정위험, 계속기업, 기타
- **자산** (17개): 현금-일반/조회, 채무증권, 파생상품, 매출채권-일반/조회, 재고자산-일반/실사, 유무형자산 등
- **부채 및 자본** (13개): 매입채무, 특수관계자, 기타부채, 법인세, 차입금, 리스, 퇴직급여 등
- **수익/비용** (10개): 매출-일반/발생사실/Cut-off, 매출원가, 영업비용, 인건비 등
- **종결단계** (4개): 종결단계, 주석검토-별도/연결, 기말감사-별도CF, 외국어보고서
- **연결** (4개): 연결일반, 연결GA/CA, 연결법인세, 연결CF
- **내부통제** (23개): 계획/종결, 내부회계검토, 설계평가(ELC/ITGC/FR 등), 운영평가(동일)
- **IT 감사-RA**: IT 감사-RA

# Azure 직원(Employees) 동기화 — Design

**Date:** 2026-04-12
**Status:** Approved (brainstorm)
**Context:** Budget 입력 Step 2 (구성원 선택) 에서 쓸 직원 마스터 데이터를 Azure → Postgres 로 일방향 동기화하여, 검색 성능/일관성을 개선하고 클라이언트/프로젝트 동기화와 동일한 I/F 패턴을 유지한다.

## Goals

1. Azure `BI_STAFFREPORT_EMP_V` 의 **재직자 전체** (모든 LoS, Tax 제외) 를 Postgres `employees` 테이블에 동기화
2. 초기 1회 수동 동기화 + 매일 06:05 KST 자동 동기화 (clients 와 부하 분산)
3. `/api/v1/budget/employees/search` 를 Postgres 만 조회하는 단순 엔드포인트로 재작성
4. `/api/v1/sync/employees` 에 admin 가드 추가, clients 패턴과 일관된 응답
5. 상태 조회 엔드포인트 추가

## Non-Goals

- 퇴사자 동기화 (검색에는 포함되지 않음, 기존 `budget_details` 에 이름이 남아있는 historical 데이터는 그대로 유지)
- Tax LoS 직원 동기화 (Budget+ 는 Assurance 용이므로)
- 직원 상세 편집 UI (읽기 전용 마스터)
- 실시간 webhook 동기화

## Design

### 1. Data Model

변경 없음. `backend/app/models/employee.py` 의 `Employee` 모델에는 이미:
- `empno` (PK), `name`, `department`, `grade_code`, `grade_name`
- `team_leader_empno`, `los`, `org_code`, `org_name`, `email`, `emp_status`
- `synced_at DateTime server_default=func.now()`

새 컬럼/마이그레이션 불필요.

### 2. `sync_employees()` 업데이트

[backend/app/services/sync_service.py:14](backend/app/services/sync_service.py#L14) 의 기존 함수를 수정.

**Azure 쿼리에 필터 추가**:

```sql
SELECT EMPNO, EMPNM, CM_NM, GRADCD, GRADNM,
       TL_EMPNO, LOS, ORG_CD, ORG_NM, PWC_ID, EMP_STAT
FROM BI_STAFFREPORT_EMP_V
WHERE EMP_STAT = N'재직'
  AND LOS NOT IN (<Tax LoS 값 목록>)
```

**구현 순서**:
1. 먼저 `SELECT DISTINCT LOS FROM BI_STAFFREPORT_EMP_V WHERE EMP_STAT=N'재직'` 을 실행해서 Tax LoS 의 실제 값을 확인 (예: `'Tax'`, `'세무'`, `'Tax Services'` 등)
2. 확인된 값들을 NOT IN 절로 제외
3. 값이 복수일 수 있으면 리스트로 관리

**필터 통과 조건 외에는 기존 UPSERT 로직 그대로**: `empno` 로 조회 → 없으면 INSERT, 있으면 모든 필드 UPDATE + `synced_at` 갱신.

**Note**: 클라이언트 sync 와 달리, employees 는 "사용자 입력 보존" 개념이 없음 (마스터 데이터). 그래서 조건부 setattr 없이 단순 덮어쓰기.

### 3. Sync API 엔드포인트 업그레이드

[backend/app/api/v1/sync.py](backend/app/api/v1/sync.py) 수정:

**기존 `sync_employees_endpoint` 교체**:

```python
@router.post("/employees")
def sync_employees_endpoint(
    db: Session = Depends(get_db),
    user: dict | None = Depends(get_optional_user),
):
    """Azure → Postgres 직원 동기화 (admin only)."""
    _require_admin(db, user)
    t0 = time.time()
    count = sync_employees(db)
    elapsed_ms = int((time.time() - t0) * 1000)
    return {"synced": count, "elapsed_ms": elapsed_ms, "message": "ok"}
```

**신규 `/employees/status` 엔드포인트**:

```python
@router.get("/employees/status")
def sync_employees_status(
    db: Session = Depends(get_db),
    user: dict | None = Depends(get_optional_user),
):
    """마지막 Azure 직원 동기화 상태 조회 (인증 필요)."""
    if not user:
        raise HTTPException(status_code=401, detail="인증이 필요합니다.")
    from app.models.employee import Employee
    total = db.query(func.count(Employee.empno)).scalar() or 0
    last_sync = db.query(func.max(Employee.synced_at)).scalar()
    return {
        "total_employees": total,
        "last_sync": last_sync.isoformat() if last_sync else None,
    }
```

### 4. APScheduler 통합

[backend/app/main.py](backend/app/main.py) 의 기존 scheduler 에 job 추가:

```python
def _scheduled_employee_sync():
    """매일 06:05 KST 에 Azure → Postgres 직원 동기화."""
    from app.db.session import SessionLocal
    from app.services.sync_service import sync_employees
    logger = logging.getLogger("scheduler")
    db = SessionLocal()
    try:
        n = sync_employees(db)
        logger.info(f"Scheduled employee sync: {n} employees")
    except Exception as e:
        logger.error(f"Scheduled employee sync failed: {e}")
    finally:
        db.close()


@app.on_event("startup")
def start_scheduler():
    if not _scheduler.running:
        _scheduler.add_job(_scheduled_client_sync, "cron", hour=6, minute=0,
                           id="sync_clients", replace_existing=True)
        _scheduler.add_job(_scheduled_employee_sync, "cron", hour=6, minute=5,
                           id="sync_employees", replace_existing=True)
        _scheduler.start()
```

- 06:00 clients 끝나고 5분 후 employees 시작 (Azure 부하 분산)
- 각 job 독립 실패 (한쪽 실패해도 다른쪽 영향 없음)

### 5. `/budget/employees/search` 재작성

[backend/app/api/v1/budget_input.py:100-147](backend/app/api/v1/budget_input.py#L100) 전체 교체:

```python
@router.get("/employees/search")
def search_employees(q: str = "", db: Session = Depends(get_db)):
    """직원 이름/사번으로 검색 (Postgres employees 마스터)."""
    if not q or len(q) < 2:
        return []
    from app.models.employee import Employee
    query = db.query(Employee).filter(
        (Employee.name.ilike(f"%{q}%")) |
        (Employee.empno.ilike(f"%{q}%"))
    ).order_by(Employee.name).limit(30)
    return [
        {
            "empno": e.empno,
            "name": e.name,
            "grade": e.grade_name or "",
            "department": e.department or "",
        }
        for e in query.all()
    ]
```

**제거되는 것**:
- `azure_service.get_employees()` 호출 (live Azure 쿼리)
- `budget_details` fallback (퇴사자 검색용이었음)
- in-memory dict merge 로직

**영향**: 기존 budget_details 에 있는 퇴사자는 더 이상 검색되지 않음. Budget 신규 입력시에는 재직자만 보이는 것이 맞음. 과거 입력된 Budget 의 퇴사자 이름은 budget_details 에 그대로 저장되어 있으므로 수정/조회에는 영향 없음.

### 6. 초기 수동 Sync

현재 `employees` 테이블이 0 rows 인 상태. 구현 직후 admin 토큰으로 `POST /api/v1/sync/employees` 1회 호출하여 초기 시드.

### 7. Testing

**pytest** (`backend/tests/test_sync_employees.py`):
- `test_insert_new_employee`: Azure mock → 새 empno INSERT 검증
- `test_update_existing_employee`: 기존 row 의 name/grade 변경 반영 검증
- `test_filter_query_has_emp_stat_and_los`: 실제 SQL 문자열에 `EMP_STAT` 과 `LOS NOT IN` 포함 확인 (sync 함수 내부 쿼리 인스펙션)

**Playwright** (`frontend/tests/task-azure-employee-sync.spec.ts`):
- `/sync/employees/status` 인증/미인증 구분
- `/sync/employees` admin / non-admin 구분
- `/sync/employees` admin 호출시 synced > 0
- `/budget/employees/search?q=김` 결과 존재 + 구조 검증

### 8. PDCA 매핑

- **Plan**: 이 문서 + plan 문서
- **Do**: Task 1~7 (plan 에서 구체화)
- **Check**: pytest, Playwright, 초기 sync count, `/employees/search` 수동 curl
- **Act**: commit/push, 다음날 06:05 로그 확인

## Open Questions / Risks

- **Tax LoS 의 정확한 값**: 구현 1단계에서 `SELECT DISTINCT LOS` 로 확인. 값이 여러 개면 모두 제외.
- **Azure LOS 컬럼 값 인코딩**: 한글 `'세무'` 인지 영문 `'Tax'` 인지. `N'...'` 프리픽스 필요할 수 있음.
- **employees 테이블 크기**: 회사 재직자 수 규모 (수천~1만). 단순 UPSERT 로 충분.
- **Grade 값 변경**: 매일 06:05 에 grade 가 업데이트되면서 진행중 budget_details 의 grade 와 drift 발생 가능. 현재 budget_details 는 empno + grade 를 복사 저장하므로 문서화된 snapshot 동작. 드리프트는 의도된 동작.

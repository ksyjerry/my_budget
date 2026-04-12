# Azure 클라이언트 동기화 & 상세정보 UPSERT — Design

**Date:** 2026-04-12
**Status:** Approved (brainstorm)
**Context:** Budget+ 는 기존에 감사(LoS=10) 전용이었으나, AC/IC/ESG/VAL/TRADE/ACT/ETC 비감사 서비스까지 확장 중. Budget 입력 Step 1 의 클라이언트 검색이 Postgres `clients` 테이블만 조회하기 때문에, Excel Budget Template 을 업로드한 적이 없는 클라이언트는 검색이 안 됨. Azure DB 의 전체 클라이언트가 검색 가능해야 하고, Azure-only 클라이언트의 상세정보는 사용자가 직접 채울 수 있어야 함.

## Goals

1. Budget 입력 Step 1 클라이언트 검색에서 Azure DB 의 모든 진행중 프로젝트의 클라이언트가 검색되어야 함 (모든 LoS 포함)
2. 초기 1회 + 매일 자동 동기화로 Azure → Postgres `clients` 테이블 UPSERT
3. Azure-only 클라이언트는 상세정보 필드가 비어있어 "정보 미입력" 상태로 표시
4. 사용자가 직접 상세정보 채우면 `clients` 테이블에 저장, 이후 재검색시 채워진 상태로 반환
5. 동기화는 상세필드를 덮어쓰지 않음 (사용자 입력 보존)

## Non-Goals

- 종결 프로젝트(`CLOSDV != '진행'`) 클라이언트 동기화
- 상세정보 자동 추론/LLM 채움
- 과거 상세정보 이력/변경 로그 (기존 `updated_at` 만 사용)

## Design

### 1. Data Model

`clients` 테이블에 컬럼 1개 추가 (Alembic 마이그레이션 1개):

```sql
ALTER TABLE clients ADD COLUMN synced_at TIMESTAMP NULL;
```

- `synced_at`: Azure 동기화로 insert/update 된 마지막 시각. NULL 이면 "동기화로 들어온 적 없음 (Excel 업로드 또는 수동 입력 전용)".
- `updated_at` (기존): 사용자가 상세정보를 저장할 때마다 갱신 (SQLAlchemy `onupdate` 이미 설정됨).
- 출처 판별: `updated_at > synced_at` 이면 사용자가 수정한 것, 같으면 동기화 직후 상태.

### 2. Azure 쿼리 & Sync Service

`backend/app/services/sync_service.py` 에 `sync_clients(db: Session) -> int` 추가.

**Azure 쿼리** (BI_STAFFREPORT_PRJT_V):

```sql
SELECT
  LEFT(PRJTCD, 5) AS CLIENT_CODE,
  MAX(CLIENTNM)   AS CLIENT_NAME,   -- CLIENTNM 우선, 없으면 SHRTNM
  MAX(SHRTNM)     AS SHORT_NAME
FROM BI_STAFFREPORT_PRJT_V
WHERE CLOSDV = N'진행'
GROUP BY LEFT(PRJTCD, 5)
```

- LoS 필터 제거 → 모든 서비스 타입 포함
- `CLIENT_CODE` 가 앞 5자리 (Q1 결정 사항과 일치)
- `client_name` 은 `CLIENTNM` 우선, 없으면 `SHRTNM` 폴백 (Python 측에서 처리)

**UPSERT 로직**:

```python
def sync_clients(db: Session) -> int:
    with _get_azure() as conn:
        cursor = conn.cursor(as_dict=True)
        cursor.execute(<above query>)
        rows = cursor.fetchall()

    now = datetime.now()
    count = 0
    for row in rows:
        code = row["CLIENT_CODE"]
        name = row.get("CLIENT_NAME") or row.get("SHORT_NAME") or ""
        if not code:
            continue
        client = db.query(Client).filter(Client.client_code == code).first()
        if not client:
            client = Client(client_code=code, client_name=name, synced_at=now)
            db.add(client)
        else:
            # 이름만 갱신, 상세필드는 건드리지 않음
            if name:
                client.client_name = name
            client.synced_at = now
        count += 1
    db.commit()
    return count
```

**중요**: `industry`, `asset_size`, `listing_status`, `gaap`, `consolidated`, `subsidiary_count`, `internal_control`, `business_report`, `initial_audit` 는 sync 시 **절대 건드리지 않음**. 사용자 입력 보존이 최우선.

### 3. 스케줄러 (APScheduler)

`backend/requirements.txt` 에 `apscheduler` 추가 (이미 있으면 생략).

`backend/app/main.py` 에 startup 이벤트로 등록:

```python
from apscheduler.schedulers.background import BackgroundScheduler
from app.db.session import SessionLocal
from app.services.sync_service import sync_clients

scheduler = BackgroundScheduler(timezone="Asia/Seoul")

def _scheduled_client_sync():
    db = SessionLocal()
    try:
        n = sync_clients(db)
        logger.info(f"Scheduled client sync: {n} clients")
    except Exception as e:
        logger.error(f"Scheduled client sync failed: {e}")
    finally:
        db.close()

@app.on_event("startup")
def start_scheduler():
    scheduler.add_job(_scheduled_client_sync, "cron", hour=6, minute=0, id="sync_clients")
    scheduler.start()

@app.on_event("shutdown")
def stop_scheduler():
    scheduler.shutdown(wait=False)
```

- 매일 06:00 KST
- 실패시 로그만 남기고 서버는 계속 동작
- 서버 재시작 없이 유지됨 (in-memory scheduler 로 충분, DB 저장 불필요)

### 4. 수동 동기화 API (Admin Only)

`backend/app/api/v1/sync.py` (신규 파일 또는 기존 sync 관련 파일):

```python
POST /api/v1/sync/clients
  Auth: admin only (role check via get_current_user)
  Response: { "synced": N, "elapsed_ms": M }

GET /api/v1/sync/clients/status
  Auth: any authenticated user
  Response: { "last_sync": "2026-04-12T06:00:00", "total_clients": 1234, "azure_synced": 1100 }
```

- `total_clients` = Postgres `clients` row count
- `azure_synced` = `synced_at IS NOT NULL` row count
- `last_sync` = `MAX(synced_at)`

`backend/app/main.py` 에 `include_router(sync.router)` 추가.

### 5. `/clients/search` 엔드포인트 수정

[backend/app/api/v1/budget_input.py:65](backend/app/api/v1/budget_input.py#L65):

```python
@router.get("/clients/search")
def search_clients(q: str = "", db: Session = Depends(get_db)):
    query = db.query(Client)
    if q:
        query = query.filter(
            (Client.client_name.ilike(f"%{q}%")) |
            (Client.client_code.ilike(f"%{q}%"))
        )
    results = query.order_by(Client.client_name).limit(50).all()
    return [
        {
            "client_code": c.client_code,
            "client_name": c.client_name,
            "industry": c.industry or "",
            "asset_size": c.asset_size or "",
            "listing_status": c.listing_status or "",
            "gaap": c.gaap or "",
            "consolidated": c.consolidated or "",
            "subsidiary_count": c.subsidiary_count or "",
            "internal_control": c.internal_control or "",
            "business_report": c.business_report or "",
            "initial_audit": c.initial_audit or "",
            "needs_detail": _needs_detail(c),
        }
        for c in results
    ]

def _needs_detail(c: Client) -> bool:
    """주요 상세필드가 모두 비어있으면 True."""
    key_fields = [c.industry, c.asset_size, c.listing_status, c.gaap]
    return not any(f for f in key_fields)
```

- `needs_detail=True` 면 프론트에서 "정보 미입력" 배지
- 검색 필드에 `client_code` 도 포함 (코드 앞자리로 검색 가능)

### 6. Frontend Step 1 변경

[frontend/src/app/(dashboard)/budget-input/.../step1/...]

- 클라이언트 검색 드롭다운에서 `needs_detail=true` 항목에 회색 배지 `정보 미입력`
- 선택시 동작은 기존과 동일 — 빈 필드로 폼이 채워지고 사용자가 직접 입력
- 저장시 기존 `upsert_project_from_client_data` 가 `clients` 테이블의 상세필드를 업데이트 (이 부분 로직 확인 필요 — 없으면 추가)
- (옵션) Step 1 상단 작은 텍스트: `마지막 Azure 동기화: 2026-04-12 06:00` + admin 전용 `지금 동기화` 버튼

### 7. `upsert_project_from_client_data` 검증

현재 [backend/app/services/budget_service.py] 의 해당 함수가 `clients` 테이블의 상세필드를 제대로 UPDATE 하는지 확인. 만약 client_code 로 찾아서 INSERT 만 하고 UPDATE 를 안 한다면, Azure-sync 로 이미 존재하는 row 를 만났을 때 상세필드 저장이 안 될 수 있음. 이 경우 해당 함수에 UPDATE 경로 추가 필요.

## Testing (PDCA Check)

### Pytest

`backend/tests/test_sync_clients.py`:

1. **신규 INSERT**: Azure mock 이 client_code "A0001" 반환, Postgres 에 없음 → sync 후 row 존재, `synced_at` 설정, 상세필드 NULL
2. **기존 UPDATE — 이름만**: Postgres 에 `A0001 + industry='제조업'` 이미 존재, Azure 에서 같은 코드 + 새 이름 반환 → sync 후 이름만 갱신, `industry` 는 `'제조업'` 그대로 보존
3. **빈 client_code 스킵**: Azure 에서 LEFT(PRJTCD,5) 가 빈 문자열 반환되는 edge → 스킵
4. **CLIENTNM 폴백**: CLIENTNM NULL 이고 SHRTNM 있으면 SHRTNM 사용
5. **`_needs_detail`**: 주요 필드 비었으면 True, 하나라도 있으면 False

### Playwright

`frontend/tests/task-azure-client-sync.spec.ts`:

1. `/clients/search` API 가 `needs_detail` 필드 포함 반환
2. Budget 입력 Step 1 에서 Azure-only 클라이언트 검색시 "정보 미입력" 배지 노출
3. 배지 있는 클라이언트 선택 → 빈 필드 확인 → 상세정보 입력 → 저장 → 재검색시 배지 사라짐

### 수동 검증

- 개발 DB 에서 `POST /api/v1/sync/clients` 1회 실행 → count 확인
- 전체 Postgres clients 개수와 Azure 진행중 프로젝트 client_code 개수 대조
- 기존에 Excel 로 업로드된 상세정보 있는 클라이언트의 `industry` 등이 sync 후에도 보존되는지 SQL 확인

## Migration & Rollout

1. Alembic 마이그레이션 생성 → `alembic upgrade head`
2. sync_service + API + scheduler 배포
3. `POST /api/v1/sync/clients` 수동 1회 실행 (초기 시드)
4. 프론트 배포 (배지 표시)
5. 다음날 06:00 자동 동기화 로그 확인

## Open Questions / Risks

- **Azure `BI_STAFFREPORT_PRJT_V` 에 `CLOSDV` / `LoS` 컬럼명이 정확한지** — 현재 코드 [backend/app/services/azure_service.py:751](backend/app/services/azure_service.py#L751) 에서 `WHERE CLOSDV = N'진행' AND LOS = '10'` 사용중이므로 컬럼 존재 확인됨.
- **클라이언트 수 규모** — 수만건 이하면 단순 UPSERT 로 충분. 10만건 이상이면 batch commit 필요.
- **동일 client_code 에 다른 client_name** — 드물게 이름이 바뀔 수 있음. `MAX(CLIENTNM)` 은 임의 선택이 될 수 있으므로, 실제로 가장 최근 프로젝트 기준이 필요하면 `MAX(STARTDT)` 등의 ORDER BY 를 고려.
- **APScheduler + FastAPI multi-worker** — 프로덕션에서 uvicorn multi-worker 를 쓰면 scheduler 가 worker 별로 중복 실행될 수 있음. 현재는 single worker 이므로 문제 없지만 향후 주의.

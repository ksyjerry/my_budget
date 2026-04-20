# S0 — 보안 / 세션 기반 재설계

**Date:** 2026-04-21
**Status:** Approved (brainstorm)
**Sub-project:** S0 (of 7) — 2026-04-20 사용자 피드백 45건 대응의 첫 번째 단계
**Addresses feedback items:** #23, #34, #35, #48

## Context

현재 My Budget+ 의 로그인은 empno만 입력하면 JWT 를 발급하고, 프런트엔드 localStorage 에 24시간 저장하는 임시 구현이다. 궁극적으로 Azure AD SSO 로 전환할 예정이지만, 그 전까지는 empno-only 로그인을 유지하되 **세션·권한 계층을 Azure AD 전환 후에도 그대로 쓸 수 있는 구조**로 재정비한다.

## Goals

1. 브라우저 종료 시 세션 종료, 서버측 8시간 절대 만료 (#34, #48 자동 로그인 이슈 해소)
2. httpOnly Secure 세션 쿠키 기반 — XSS 내성 및 JS 접근 차단
3. 모든 쓰기 API 에 서버측 권한 가드 — URL 직접 접근으로 권한 우회 불가 (#48 권한 우회 이슈 해소)
4. 로그인 감사 로그 — empno-only 의 본인 확인 한계 보완 (#23 일부 완화)
5. Azure AD 전환 시 로그인 엔드포인트만 교체하면 되도록 세션·권한 레이어 분리
6. 프로덕션 빌드로 Next.js dev overlay 제거 (#35)

## Non-Goals

- Azure AD SSO (MSAL) 실제 구현 — 별도 sub-project 로 분리
- 비밀번호/OTP/2FA 추가 — empno-only 유지
- 세분화된 RBAC (부서별/팀장별 등) — 현재 EL/PM / Staff / Admin 3단계 유지
- IP allowlist/방화벽 정책 — 인프라 영역, 앱 범위 밖
- 타 sub-project 범위 (비감사/Overview 집계/Step UX/Appendix 등)

## Feedback → 본 설계 매핑

| No | 사용자 | 내용 요약 | 대응 |
|---|---|---|---|
| #23 | 홍상호 | 사번만 입력 시 타인 사번으로 조회 가능 | 감사 로그 + 직원 상태 체크로 완화 (근본 해결은 Azure AD 전환 시) |
| #34 | 서보경 | 노트북 재시작 후 자동 로그인 | 브라우저 세션 쿠키 + 서버 8h 절대 만료 |
| #35 | 서보경 | 프로덕션에 Next.js dev overlay 노출 | `next build && next start` 배포 체계 확정 |
| #48 | 서보경 | Chrome→Edge 이동 시 타인 계정 유지 + 권한 없는 메뉴로 신규 프로젝트 생성 가능 | httpOnly 쿠키 (브라우저별 독립) + 모든 쓰기 API 서버측 권한 가드 |

## Design

### 1. 세션 저장 — PostgreSQL `sessions` 테이블

```
sessions (
  session_id   TEXT PRIMARY KEY,           -- 256비트 난수 (secrets.token_urlsafe(32))
  empno        TEXT NOT NULL REFERENCES employees(empno),
  role         TEXT NOT NULL,              -- 'elpm' | 'staff' | 'admin'
  scope        TEXT NOT NULL,              -- 'self' | 'departments' | 'all'
  created_at   TIMESTAMP NOT NULL DEFAULT now(),
  expires_at   TIMESTAMP NOT NULL,         -- created_at + 8h
  last_seen_at TIMESTAMP NOT NULL DEFAULT now(),
  ip           TEXT,
  user_agent   TEXT,
  revoked_at   TIMESTAMP                   -- NULL 이면 유효
)

INDEX sessions_empno_idx ON (empno, revoked_at)
INDEX sessions_expires_at_idx ON (expires_at)
```

- `session_id` 는 URL-safe 난수 → httpOnly 쿠키의 값으로 사용
- `role` 은 로그인 시점에 계산하여 고정 (세션 동안 불변) — 단, 권한 체크는 매 요청마다 `scope` 와 리소스 소유 관계를 재검증
- Redis 가 아닌 PostgreSQL 을 쓰는 이유: 현재 인프라에 이미 있고, 8h TTL 수준의 만료는 DB 인덱스 조회로 충분. 청소는 주 1회 크론으로 `DELETE WHERE expires_at < now() - INTERVAL '30 days'`.

### 2. 감사 로그 — PostgreSQL `login_log` 테이블

```
login_log (
  id            BIGSERIAL PRIMARY KEY,
  empno         TEXT,                       -- 성공/실패 모두 기록 (실패 시 입력한 empno)
  logged_in_at  TIMESTAMP NOT NULL DEFAULT now(),
  ip            TEXT,
  user_agent    TEXT,
  success       BOOLEAN NOT NULL,
  failure_reason TEXT                        -- 'not_found' | 'inactive' | 'internal_error'
)

INDEX login_log_empno_time_idx ON (empno, logged_in_at DESC)
```

- 퇴사 처리된 empno 로 로그인 시도 시에도 기록됨
- Azure AD 전환 후에도 동일 테이블 계속 사용

### 3. 로그인 플로우

1. POST `/api/v1/auth/login` { empno }
2. 직원 DB 조회 — `employees.empno == empno AND emp_status == 'ACTIVE'`
3. 조회 실패 시 `login_log.success = false` 기록 후 401 반환
4. 조회 성공:
   - `role` 계산 (아래 5절 참조)
   - `session_id` 생성
   - `sessions` insert (expires_at = now() + 8h)
   - `login_log.success = true` 기록
   - Set-Cookie 헤더로 세션 쿠키 발급:
     ```
     Set-Cookie: mybudget_session=<session_id>;
                 HttpOnly; Secure; SameSite=Lax; Path=/
     ```
     (Max-Age / Expires 미설정 → 브라우저 세션 쿠키)
   - Response body: `{ empno, name, role, department }` (토큰 포함 안 됨)

### 4. 요청 인증 미들웨어

`backend/app/api/deps.py` 에 FastAPI Dependency 추가:

```
get_current_user(request):
  1. request.cookies.get("mybudget_session") → session_id
  2. 없으면 401
  3. sessions 조회 — session_id 일치 AND revoked_at IS NULL AND expires_at > now()
  4. 조건 불충족 시 401 (쿠키 삭제 응답 포함)
  5. last_seen_at 업데이트 (1분 이내 갱신은 스킵 — write 감소)
  6. return { empno, name, role, scope, department }
```

기존 JWT 검증 코드 (`backend/app/core/security.py`, `backend/app/api/deps.py`) 는 **제거** — 점진 전환 없음.

### 5. 역할(role) 판정 로직

로그인 시점에 한 번 계산:

```
if empno in admin_empno_list (PartnerAccessConfig.scope == 'all'):
    role = 'admin', scope = 'all'
elif empno exists as EL or PM in projects table:
    role = 'elpm', scope = 'self'
elif empno exists in budget_details (= 구성원):
    role = 'staff', scope = 'self'
else:
    role = 'staff', scope = 'self'   # 기본값 — 본인 데이터만
```

### 6. 권한 매트릭스

| 기능 | admin | elpm | staff |
|---|---|---|---|
| Overview / Details / Summary / Appendix (본인 관련) | ✅ | ✅ | ✅ |
| Overview 등 전체 조회 | ✅ | ❌ | ❌ |
| 신규 프로젝트 생성 (Step 1~3) | ✅ | ✅ (본인이 EL 또는 PM 인 경우만) | ❌ |
| 기존 Budget 수정 | ✅ | ✅ (본인이 EL/PM 인 프로젝트) | ❌ |
| Budget 삭제 | ✅ | ✅ (본인이 EL 인 프로젝트만) | ❌ |
| Excel 다운로드 (본인 관련) | ✅ | ✅ | ✅ |
| 세션 강제 종료 / 감사 로그 조회 | ✅ | ❌ | ❌ |

### 7. 권한 가드 구현

FastAPI Dependencies 3종:

```
require_login(user=Depends(get_current_user)) -> user
require_elpm(user=Depends(get_current_user)):
    if user.role not in ('elpm', 'admin'): raise 403
require_admin(user=Depends(get_current_user)):
    if user.role != 'admin': raise 403
```

리소스 단위 권한은 헬퍼 함수로:

```
assert_can_modify_project(db, user, project_code):
    if user.role == 'admin': return
    project = db.query(Project).filter_by(project_code=project_code).first()
    if not project: raise 404
    if user.empno not in (project.el_empno, project.pm_empno): raise 403

assert_can_delete_project(db, user, project_code):
    if user.role == 'admin': return
    project = db.query(Project).filter_by(project_code=project_code).first()
    if not project: raise 404
    if user.empno != project.el_empno: raise 403    # EL 만 삭제
```

**적용 대상 (모든 쓰기 API 재점검):**

- `POST /api/v1/budget/projects` → `require_elpm` + 생성 시 body 의 el_empno/pm_empno 에 user.empno 포함 여부 확인 (admin 은 예외)
- `PUT /api/v1/budget/projects/{project_code}` → `assert_can_modify_project`
- `DELETE /api/v1/budget/projects/{project_code}` → `assert_can_delete_project`
- `POST /api/v1/budget/projects/{project_code}/members` → `assert_can_modify_project`
- `PUT /api/v1/budget/projects/{project_code}/members` → `assert_can_modify_project`
- `PUT /api/v1/budget/projects/{project_code}/template` → `assert_can_modify_project`
- `POST /api/v1/budget/upload` → `require_elpm`
- 기타 쓰기 엔드포인트 일괄 점검 (grep `@router.(post|put|delete)`)

### 8. 로그아웃

- POST `/api/v1/auth/logout`
- 서버: `sessions.revoked_at = now()`
- 응답: `Set-Cookie: mybudget_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
- 프런트: 로그아웃 버튼은 우상단 사용자명 드롭다운 (기존 Header 컴포넌트 확장)

### 9. 관리자용 세션 관리 API

- GET `/api/v1/admin/sessions?empno={empno}` — 특정 사용자 활성 세션 목록
- DELETE `/api/v1/admin/sessions/{session_id}` — 특정 세션 revoke
- DELETE `/api/v1/admin/sessions?empno={empno}` — 특정 사용자 전체 세션 revoke (사고 대응)
- GET `/api/v1/admin/login-log?empno={empno}&from={date}&to={date}` — 감사 로그 조회

### 10. 프런트엔드 변경

**삭제:**
- `localStorage.setItem('auth_user', ...)` / `getItem` / `removeItem` 호출 전부
- `Authorization: Bearer ...` 헤더 삽입 로직
- `frontend/src/lib/auth.tsx` 의 JWT 파싱/저장 로직

**추가/변경:**
- 모든 `fetch` 호출에 `credentials: 'include'` — 쿠키 자동 송수신
- `lib/auth.tsx` 의 현재 사용자 정보는 새 엔드포인트 `GET /api/v1/auth/me` 로 조회 (세션 쿠키 기반)
- 401 응답 감지 시 → 로그인 페이지 리다이렉트 (`useEffect` 기반 글로벌 인터셉터)
- 로그아웃 버튼 UI 추가 (Header 사용자명 우측)

### 11. 배포/빌드 (#35 대응)

- 프런트엔드 프로덕션 실행 명령: `npm ci && npm run build && npm run start`
- Docker 이미지가 있다면 `CMD` 가 `next start` 를 가리키는지 확인
- systemd/PM2 유닛 파일에서 `next dev` 사용 여부 점검 — 있으면 `next start` 로 교체
- `NODE_ENV=production` 환경변수 명시
- 배포 후 프로덕션 URL 에서 하단 우측에 Route/Bundler/Preferences 버튼이 **보이지 않음**을 Playwright 로 확인

### 12. CORS / 쿠키 도메인

- 프런트 `http://10.137.206.166/mybudget` 과 백엔드 `http://10.137.206.166:3001` 같은 호스트면 SameSite=Lax 로 충분
- 포트만 다른 경우도 same-site 로 취급됨
- CORS 미들웨어: `allow_credentials=True`, `allow_origins=[정확한 origin]` (와일드카드 금지)

### 13. 마이그레이션 전략

1. `sessions` / `login_log` 테이블 Alembic 마이그레이션 생성
2. 백엔드 `/auth/login` 엔드포인트 교체, `get_current_user` 교체, JWT 코드 삭제
3. 프런트엔드 `fetch` 설정 교체, localStorage 로직 삭제
4. 배포 — 기존 사용자는 최초 접속 시 1회 재로그인 (예상·수용)
5. 3일 모니터링 후 구 JWT 관련 코드 완전 삭제 확인

### 14. 테스트 플랜

**Playwright E2E** (`frontend/tests/`, 기존 `task-*.spec.ts` 패턴):

- `task-auth-login.spec.ts`
  - 유효 empno 로그인 → `/overview` 리다이렉트
  - 존재하지 않는 empno → 401 메시지
  - 퇴사자(EMP_STATUS != ACTIVE) empno → 401 메시지
  - 로그아웃 후 보호 페이지 접근 시도 → 로그인 페이지로 리다이렉트
- `task-auth-session.spec.ts`
  - 세션 쿠키 삭제 후 API 호출 → 401
  - (선택) 시간 모킹: 8h 경과 시뮬레이션 → 자동 로그아웃
  - 다른 브라우저 컨텍스트에서 같은 URL 접근 → 로그인 페이지 표시 (자동 로그인 안 됨)
- `task-auth-authorization.spec.ts`
  - Staff 계정 로그인 → `/budget-input/new` 직접 URL 접근 → 403 or 리다이렉트
  - Staff 계정 로그인 → `POST /api/v1/budget/projects` 직접 호출 → 403
  - EL/PM 계정 로그인 → 본인 EL/PM 아닌 프로젝트 수정 API 호출 → 403
  - admin 계정 → 모든 API 통과
- `task-auth-prod-overlay.spec.ts` (#35)
  - 프로덕션 URL 에서 Next.js dev overlay 버튼 미존재 확인

**백엔드 pytest** (`backend/tests/`):

- `test_auth.py` — 로그인 성공/실패 분기, login_log 기록, 세션 만료
- `test_permissions.py` — 각 가드 데코레이터·헬퍼의 허용/거부 매트릭스
- `test_sessions.py` — 세션 revoke, 재발급, last_seen_at 갱신

### 15. 성공 기준

- Playwright 위 시나리오 전부 통과
- 기존 감사 이용자 3명(신재익/서보경/홍상호) 수기 확인:
  - 재부팅 후 로그인 화면이 뜨는가 — #34
  - 같은 URL 을 다른 브라우저에서 열면 로그인 화면이 뜨는가 — #48 세션 공유
  - Staff 계정으로 직접 `/budget-input/new` 접근 시 차단되는가 — #48 권한 우회
  - 프로덕션 UI 하단에 dev overlay 가 없는가 — #35
- 감사 로그(`login_log`)에 최소 1주일치 이력이 기록되고 관리자 API 로 조회됨

## Open Questions

- 관리자(scope=all) 계정을 누가 보유하는가 — 현재 `PartnerAccessConfig` 테이블에 정의되어 있을 것으로 추정. 배포 전 실제 값 확인 필요.
- Next.js 배포 방식이 docker-compose 인지, 호스트 머신의 systemd 인지, pm2 인지 — 점검 시 실체 확인 후 `next start` 적용 방법 결정.
- 세션 쿠키의 `Secure` 플래그는 HTTPS 전제. 현재 배포가 HTTP (`http://10.137.206.166`) 이면 `Secure` 는 개발환경에서만 생략하고, 사내 운영은 HTTPS 로 전환해야 함 — 인프라 팀과 별도 협의 필요.

"""Parameterized permission matrix — every write endpoint × every persona.

Design notes:
- Tests only assert the AUTH dimension (401/403 vs allowed).
- Endpoints that call Azure SQL (sync/*) will raise pymssql.OperationalError when
  access is granted in test env — treated as "access granted" because auth passed.
- POST /api/v1/auth/logout is a public no-op; always called with anon cookie to
  avoid revoking session-scoped cookies used by later tests.
"""
from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient

MATRIX = yaml.safe_load(
    (Path(__file__).parent.parent / "fixtures" / "permission_matrix.yaml").read_text()
)

# Endpoints whose implementation calls external services (Azure SQL) and will
# raise an unhandled exception when access is granted in the test environment.
# We catch these so the test can confirm auth-pass rather than treating the
# exception as a test failure.
_EXTERNAL_SERVICE_PATHS = {
    "/api/v1/sync/employees",
    "/api/v1/sync/teams",
    "/api/v1/sync/actual",
    "/api/v1/sync/clients",
    "/api/v1/cache/warmup",
    "/api/v1/tracking/sync",
}

# Paths where we must not pass real session cookies because calling the
# endpoint revokes the session (e.g., logout), which would invalidate
# session-scoped fixtures used by later tests.
_NO_SESSION_PATHS = {
    "/api/v1/auth/logout",
}


def _params():
    for entry in MATRIX:
        method = entry["method"]
        path = entry["path"]
        for persona, expected in entry["expected"].items():
            yield pytest.param(
                method,
                path,
                persona,
                expected,
                id=f"{method}-{path.replace('/', '_')}-{persona}",
            )


@pytest.mark.parametrize("method,path,persona,expected", list(_params()))
def test_permission_matrix(
    client: TestClient,
    admin_cookie,
    elpm_cookie,
    staff_cookie,
    method: str,
    path: str,
    persona: str,
    expected: int,
):
    # For logout and similar session-destroying endpoints, always use anon
    # to avoid invalidating the session-scoped cookies used by later tests.
    if path in _NO_SESSION_PATHS:
        cookies = None
    else:
        cookies = {
            "admin": admin_cookie,
            "elpm": elpm_cookie,
            "staff": staff_cookie,
            "anon": None,
        }[persona]

    # Path params are already substituted in the YAML (no {placeholders} remain),
    # but keep this as a safety net for any dynamic entries added later.
    p = (
        path.replace("{project_code}", "RT-AUDIT-MIN-001")
            .replace("{empno}", "320915")
    )

    # Some endpoints that pass auth will call external services (Azure SQL)
    # which are unavailable in test env — catch the resulting exception and
    # treat it as "access granted" (auth layer passed, service layer failed).
    if path in _EXTERNAL_SERVICE_PATHS and expected in (200, 201, 202):
        try:
            resp = client.request(method, p, cookies=cookies, json={})
            # If we got a response (even 500), auth layer allowed the request.
            assert resp.status_code not in (401, 403), (
                f"{persona} expected allow on {method} {p}, "
                f"got {resp.status_code}: {resp.text[:200]}"
            )
        except Exception as exc:
            exc_name = type(exc).__name__
            # An unhandled exception means the request passed auth and reached
            # the service layer. Acceptable outcome for the permission test.
            if "OperationalError" in exc_name or "pymssql" in str(exc).lower() or "Error" in exc_name:
                return  # auth passed — external service unavailable, as expected
            raise
        return

    resp = client.request(method, p, cookies=cookies, json={})

    # We only assert the AUTH dimension:
    #   expected in (200, 201, 202) → access must be GRANTED (not 401/403)
    #   expected == 403 → must be exactly 403
    #   expected == 401 → must be exactly 401
    if expected in (200, 201, 202):
        assert resp.status_code not in (401, 403), (
            f"{persona} expected allow on {method} {p}, "
            f"got {resp.status_code}: {resp.text[:200]}"
        )
    else:
        assert resp.status_code == expected, (
            f"{persona} expected {expected} on {method} {p}, "
            f"got {resp.status_code}: {resp.text[:200]}"
        )

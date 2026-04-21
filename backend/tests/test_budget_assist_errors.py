"""Tests for budget_assist endpoint error handling (#18, #42)."""
from unittest.mock import patch

import pytest


def test_suggest_returns_503_when_config_missing(client, elpm_cookie, monkeypatch):
    """#18 #42 — config 없으면 503 + 사용자 친화 메시지."""
    monkeypatch.delenv("GENAI_BASE_URL", raising=False)
    monkeypatch.delenv("PwC_LLM_API_KEY", raising=False)
    r = client.post(
        "/api/v1/budget-assist/suggest",
        json={
            "project_code": "TEST",
            "et_controllable": 100.0,
            "enabled_units": [{"category": "자산", "unit_name": "매출채권-일반"}],
            "members": [{"empno": "170661", "name": "최성우", "grade": "EL"}],
        },
        cookies=elpm_cookie,
    )
    assert r.status_code == 503, r.text
    body = r.json()
    assert "detail" in body
    assert any(kw in body["detail"] for kw in ["AI", "설정", "관리자", "서비스"])


def test_validate_returns_503_when_config_missing(client, elpm_cookie, monkeypatch):
    monkeypatch.delenv("GENAI_BASE_URL", raising=False)
    monkeypatch.delenv("PwC_LLM_API_KEY", raising=False)
    r = client.post(
        "/api/v1/budget-assist/validate",
        json={
            "project_code": "TEST",
            "et_controllable": 100.0,
            "rows": [],
        },
        cookies=elpm_cookie,
    )
    assert r.status_code == 503, r.text
    assert "detail" in r.json()


def test_suggest_returns_502_when_llm_raises(client, elpm_cookie, monkeypatch):
    """외부 LLM 호출 실패 시 502 + 구체 detail."""
    monkeypatch.setenv("GENAI_BASE_URL", "http://fake.example.com")
    monkeypatch.setenv("PwC_LLM_API_KEY", "test-key")

    from app.api.v1 import budget_assist

    class FakeClient:
        async def complete_json(self, **kwargs):
            raise RuntimeError("simulated LLM network failure")

    with patch.object(budget_assist, "_get_client", return_value=FakeClient()):
        r = client.post(
            "/api/v1/budget-assist/suggest",
            json={
                "project_code": "TEST",
                "et_controllable": 100.0,
                "enabled_units": [{"category": "자산", "unit_name": "매출채권-일반"}],
                "members": [{"empno": "170661", "name": "최성우", "grade": "EL"}],
            },
            cookies=elpm_cookie,
        )
    assert r.status_code == 502, r.text
    detail = r.json().get("detail", "")
    assert "AI" in detail or "실패" in detail

"""Unit tests for error_sanitize — strip IP/host/port info."""
import pytest


def test_sanitize_removes_ip_addresses():
    from app.services.error_sanitize import sanitize_error_message
    msg = "Connection refused at 10.137.206.166:3001"
    assert "10.137" not in sanitize_error_message(msg)


def test_sanitize_removes_localhost():
    from app.services.error_sanitize import sanitize_error_message
    assert "localhost" not in sanitize_error_message("connection to localhost:5432 failed").lower()


def test_sanitize_keeps_user_friendly_text():
    from app.services.error_sanitize import sanitize_error_message
    result = sanitize_error_message("프로젝트를 찾을 수 없습니다 at 10.137.0.1")
    assert "프로젝트를 찾을 수 없습니다" in result
    assert "10.137" not in result

"""Shared fixtures for tests."""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.session import get_db, engine
from sqlalchemy.orm import Session
from app.core.security import create_token


@pytest.fixture(scope="session")
def client():
    """FastAPI test client."""
    return TestClient(app)


@pytest.fixture(scope="session")
def db():
    """Direct DB session for verification queries."""
    from app.db.session import SessionLocal
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture(scope="session")
def elpm_token():
    """Token for EL/PM user (최성우 170661)."""
    return create_token("170661", "최성우", role="EL/PM")


@pytest.fixture(scope="session")
def staff_token():
    """Token for Staff user (지해나 320915)."""
    return create_token("320915", "지해나", role="Staff")


def auth_header(token: str) -> dict:
    """Helper to create auth header."""
    return {"Authorization": f"Bearer {token}"}

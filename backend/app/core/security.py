"""JWT token utilities for authentication."""
import jwt
from datetime import datetime, timedelta
from app.core.config import settings

ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24


def create_token(empno: str, name: str, role: str = "Staff") -> str:
    payload = {
        "empno": empno,
        "name": name,
        "role": role,
        "exp": datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])

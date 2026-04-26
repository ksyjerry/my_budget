"""Sanitize error messages — remove IP / host / port info before user display.

Used by budget_assist + budget_input upload error responses.
Backend ensures no internal infrastructure detail leaks via error messages (#111).
"""
import re

_IP_PATTERN = re.compile(r'\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?\b')
_LOCALHOST_PATTERN = re.compile(r'\blocalhost(:\d+)?\b', re.IGNORECASE)
_HOST_PATTERN = re.compile(r'\bhttps?://[^\s]+', re.IGNORECASE)


def sanitize_error_message(msg: str) -> str:
    """Strip IP/host/URL info from error message."""
    if not msg:
        return msg
    msg = _IP_PATTERN.sub("[host]", msg)
    msg = _LOCALHOST_PATTERN.sub("[host]", msg)
    msg = _HOST_PATTERN.sub("[url]", msg)
    return msg

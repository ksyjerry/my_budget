#!/usr/bin/env python3
"""Block direct <input type="number"> outside NumberField (handles multi-line JSX)."""
from __future__ import annotations
import re
import sys
from pathlib import Path

ROOTS = [Path("frontend/src/app"), Path("frontend/src/components")]
EXCLUDE_FRAGMENT = "frontend/src/components/ui/NumberField"
PATTERN = re.compile(r'<input\b[^>]*?type=["\']number["\']', re.DOTALL)

def main() -> int:
    hits: list[str] = []
    for root in ROOTS:
        if not root.exists():
            continue
        for path in root.rglob("*.tsx"):
            if EXCLUDE_FRAGMENT in str(path):
                continue
            text = path.read_text(encoding="utf-8")
            for m in PATTERN.finditer(text):
                line = text.count("\n", 0, m.start()) + 1
                snippet = text[m.start():m.end()].replace("\n", " ")[:80]
                hits.append(f"{path}:{line}: {snippet}")

    if hits:
        print('ERROR: <input type="number"> 직접 사용 금지. NumberField 사용 필수.')
        for h in hits:
            print(h)
        return 1
    print("OK: no direct <input type=number> outside NumberField")
    return 0

if __name__ == "__main__":
    sys.exit(main())

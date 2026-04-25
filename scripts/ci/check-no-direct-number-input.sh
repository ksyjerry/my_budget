#!/usr/bin/env bash
# Block direct <input type="number"> outside NumberField.tsx.
# Exit 1 with offending lines on hit.
set -euo pipefail

hits=$(grep -rEn '<input[^>]*type="number"' \
  frontend/src/app frontend/src/components 2>/dev/null \
  | grep -v 'frontend/src/components/ui/NumberField' || true)

if [ -n "$hits" ]; then
  echo "ERROR: <input type=\"number\"> 직접 사용 금지. NumberField 컴포넌트 사용 필수."
  echo "$hits"
  exit 1
fi
echo "OK: no direct <input type=number> outside NumberField"

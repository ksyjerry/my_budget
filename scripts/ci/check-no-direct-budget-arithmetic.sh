#!/usr/bin/env bash
# Block ad-hoc Budget arithmetic (contract_hours - axdx, total_budget_hours - ...)
# outside backend/app/services/budget_definitions.py.
# Exit 1 with offending lines on hit.
set -euo pipefail

hits=$(grep -rEn 'contract_hours\s*-\s*axdx|total_budget_hours\s*-' \
  backend/app 2>/dev/null \
  | grep -v 'budget_definitions.py' || true)

if [ -n "$hits" ]; then
  echo "ERROR: Budget 직접 산술 금지. backend/app/services/budget_definitions.py 함수 사용."
  echo "$hits"
  exit 1
fi
echo "OK: no direct Budget arithmetic outside budget_definitions.py"

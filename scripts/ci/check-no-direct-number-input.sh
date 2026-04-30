#!/usr/bin/env bash
# Block direct <input type="number"> outside NumberField, including multi-line JSX.
# Delegates to Python regex with DOTALL so attributes spread across lines are caught.
set -euo pipefail

python3 "$(dirname "$0")/check_no_direct_number_input.py"

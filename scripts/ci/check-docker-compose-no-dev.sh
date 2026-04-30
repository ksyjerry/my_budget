#!/usr/bin/env bash
# Block 'npm run dev' commands in production-targeted compose files.
# Files matched: docker-compose.yml, docker-compose.prod*.yml.
# Excluded: docker-compose.dev*.yml, docker-compose.local*.yml.
set -euo pipefail

prod_files=$(ls docker-compose.yml docker-compose.prod*.yml 2>/dev/null || true)
if [ -z "$prod_files" ]; then
  echo "OK: no production compose files found"
  exit 0
fi

hits=$(grep -EnH '^\s*command:.*npm\s+run\s+dev' $prod_files 2>/dev/null || true)

if [ -n "$hits" ]; then
  echo "ERROR: 'npm run dev' 사용 금지 in production compose."
  echo "$hits"
  exit 1
fi
echo "OK: no 'npm run dev' in production compose"

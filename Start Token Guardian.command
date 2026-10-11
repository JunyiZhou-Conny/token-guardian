#!/usr/bin/env bash
set -euo pipefail

guardian_project_dir="$(cd "$(dirname "$0")" && pwd)"
cd "$guardian_project_dir"
if ! command -v node >/dev/null 2>&1; then
  echo "Install Node.js 20 or newer, then open this launcher again."
  echo "Download: https://nodejs.org/"
  read -r -p "Press Enter to close."
  exit 1
fi
exec node scripts/start-guardian.cjs

#!/usr/bin/env bash
set -euo pipefail

guardian_project_dir="$(cd "$(dirname "$0")" && pwd)"
cd "$guardian_project_dir"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  echo "Install Node.js 22.12 or newer, then open this launcher again."
  echo "Download: https://nodejs.org/"
  read -r -p "Press Enter to close."
  exit 1
fi
if node scripts/start-floating-guardian.cjs; then
  exit 0
else
  read -r -p "Press Enter to close."
  exit 1
fi

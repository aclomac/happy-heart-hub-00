#!/usr/bin/env bash
# Wrapper around `playwright test` that fails loudly when something real is
# broken but degrades gracefully when the host (or CI job) hasn't been
# configured for E2E yet.
#
# Usage:
#   scripts/run-e2e.sh                          # strict: missing env => exit 1
#   scripts/run-e2e.sh --skip-if-unconfigured   # missing env => exit 0 with a note
#
# Always passes any remaining args through to `playwright test`.

set -euo pipefail

SKIP_IF_UNCONFIGURED=0
PASSTHROUGH=()
for arg in "$@"; do
  case "$arg" in
    --skip-if-unconfigured) SKIP_IF_UNCONFIGURED=1 ;;
    *) PASSTHROUGH+=("$arg") ;;
  esac
done

REQUIRED_VARS=(
  E2E_BASE_URL
  E2E_OWNER_EMAIL
  E2E_OWNER_PASSWORD
  E2E_USER_EMAIL
  E2E_USER_PASSWORD
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  E2E_COMPANY_ID
)

MISSING=()
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var:-}" ]; then
    MISSING+=("$var")
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "[e2e] Missing required environment variables:"
  for var in "${MISSING[@]}"; do
    echo "       - $var"
  done
  echo "[e2e] See e2e/README.md for setup instructions."
  if [ "$SKIP_IF_UNCONFIGURED" -eq 1 ]; then
    echo "[e2e] Skipping Playwright run (--skip-if-unconfigured)."
    exit 0
  fi
  exit 1
fi

# Install chromium on first run; cached afterwards.
if ! bunx playwright --version >/dev/null 2>&1; then
  echo "[e2e] Installing Playwright CLI..."
fi

if [ ! -d "${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}" ]; then
  echo "[e2e] Installing Chromium browser (one-time)..."
  bunx playwright install --with-deps chromium
fi

echo "[e2e] Running Playwright tests..."
exec bunx playwright test "${PASSTHROUGH[@]}"

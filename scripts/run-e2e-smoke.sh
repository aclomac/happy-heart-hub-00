#!/usr/bin/env bash
# Wrapper for the Phase 10 publish-readiness smoke suite.
#
# Only E2E_BASE_URL is required. Demo credentials default to the seeded
# demo admin (admin@erpovo.com / 12345678) and can be overridden via
# E2E_DEMO_EMAIL / E2E_DEMO_PASSWORD.
#
# Usage:
#   scripts/run-e2e-smoke.sh                          # strict: missing env => exit 1
#   scripts/run-e2e-smoke.sh --skip-if-unconfigured   # missing env => exit 0 with note
#
# Remaining args are forwarded to `playwright test`.

set -euo pipefail

SKIP_IF_UNCONFIGURED=0
PASSTHROUGH=()
for arg in "$@"; do
  case "$arg" in
    --skip-if-unconfigured) SKIP_IF_UNCONFIGURED=1 ;;
    *) PASSTHROUGH+=("$arg") ;;
  esac
done

if [ -z "${E2E_BASE_URL:-}" ]; then
  echo "[e2e:smoke] E2E_BASE_URL is not set."
  if [ "$SKIP_IF_UNCONFIGURED" -eq 1 ]; then
    echo "[e2e:smoke] Skipping smoke run (--skip-if-unconfigured)."
    exit 0
  fi
  exit 1
fi

if [ ! -d "${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}" ]; then
  echo "[e2e:smoke] Installing Chromium browser (one-time)..."
  bunx playwright install --with-deps chromium
fi

echo "[e2e:smoke] Running Playwright smoke tests against $E2E_BASE_URL ..."
exec bunx playwright test --config=playwright.smoke.config.ts "${PASSTHROUGH[@]}"

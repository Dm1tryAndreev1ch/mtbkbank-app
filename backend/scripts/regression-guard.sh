#!/usr/bin/env bash
# CI-02 / regression-guard — scans backend/src for forbidden patterns.
# Fails the CI job (exit 1) as soon as any pattern is found.
# Add new rules below following the same format.
#
# Usage: bash scripts/regression-guard.sh
# Run from backend/ directory (working-directory in CI).

set -euo pipefail

ROOT="${REGRESSION_GUARD_ROOT:-./src}"
FAILED=0

check() {
  local label="$1"
  local pattern="$2"
  local exclude="${3:-__NEVER_MATCH__}"

  # grep -rn: recursive + line numbers; exit 0 = found, 1 = not found
  if grep -rn --include='*.js' -E "$pattern" "$ROOT" \
       | grep -v "$exclude" \
       | grep -v 'regression-guard' 2>/dev/null | grep .; then
    echo "❌  REGRESSION: $label"
    FAILED=1
  else
    echo "✅  OK: $label"
  fi
}

echo "══════════════════════════════════════════════════"
echo "  Regression Guard — backend/src"
echo "══════════════════════════════════════════════════"

# ── Security regressions ──────────────────────────────────────────────────

# R-01: No empty catch blocks — `catch` must log or rethrow
check \
  "R-01 empty catch block" \
  'catch\s*\([^)]*\)\s*\{\s*\}'

# R-02: No console.log/warn/error — must use pino logger
check \
  "R-02 console.* usage (use pino logger)" \
  'console\.(log|warn|error|info|debug)\(' \
  '// allow-console'

# R-03: ALLOWED_ORIGINS must never contain wildcard
check \
  "R-03 ALLOWED_ORIGINS wildcard" \
  "ALLOWED_ORIGINS.*=.*'\\*'"

# R-04: JWT_SECRET must not be hardcoded
check \
  "R-04 hardcoded JWT_SECRET" \
  "JWT_SECRET\s*[:=]\s*['\"][^'\"]{8,}"

# R-05: No ACCESS EXCLUSIVE lock in migration SQL
# (checked in prisma/migrations, not src — adjust ROOT)
if grep -rn --include='*.sql' 'ACCESS EXCLUSIVE' ../prisma/migrations/ 2>/dev/null | grep .; then
  echo "❌  REGRESSION: R-05 ACCESS EXCLUSIVE lock in migration SQL"
  FAILED=1
else
  echo "✅  OK: R-05 no ACCESS EXCLUSIVE lock"
fi

# R-06: SIGTERM handler must be registered (close-with-grace present)
if ! grep -rn --include='*.js' 'closeWithGrace' "$ROOT" > /dev/null 2>&1; then
  echo "❌  REGRESSION: R-06 closeWithGrace missing from src"
  FAILED=1
else
  echo "✅  OK: R-06 closeWithGrace present"
fi

# R-07: No app-level loginLimiter/registerLimiter const redeclaration
check \
  "R-07 app-level rate-limiter const redeclaration" \
  '^const (loginLimiter|registerLimiter|refreshLimiter)'

echo "══════════════════════════════════════════════════"

if [ "$FAILED" = "1" ]; then
  echo "Regression guard FAILED. Fix issues above before merging."
  exit 1
fi

echo "Regression guard PASSED."

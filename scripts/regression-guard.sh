#!/usr/bin/env bash
# gsd-phase: 01-observability-foundation-regression-scaffolding
# regression-guard.sh — Phase-1 regression guard.
# Fails (exit 1) if any of the four already-fixed Phase-1 anti-patterns reappear,
# OR if console.log/error/warn/info survives in backend/src/, OR if the JWT fallback
# secret literal returns. Runs locally (developer pre-commit option) AND in CI as a required step.
#
# Six guard categories (per .planning/phases/01-.../01-RESEARCH.md §5.9):
#   1. CORS allows wildcard / `origin: true`
#   2. JWT fallback secret literal (`'fallback_secret'` or `JWT_SECRET || '...'`)
#   3. `let TOKEN` module-scope variable in admin/src/
#   4. Empty `.catch(() => {})` or empty `catch {}` in mobile/services/api.ts and mobile/stores/useStore.ts
#   5. console.log/error/warn/info in backend/src/ (post-Phase-1 migration)
#   6. Surviving 'fallback_secret' literal anywhere in backend/src/ (covered by guard 2 above)
#
# NOTE: We use `git grep -nP` (PCRE) so `\s` / `\b` work portably across macOS + Linux.
# POSIX `git grep -E` on macOS does not support `\s` / `\b`.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FAIL=0

check() {
  local label="$1"; local pattern="$2"; shift 2
  # remaining args are paths; quote-safe via "$@"
  if git grep -nP "$pattern" -- "$@" 2>/dev/null; then
    echo "FAIL  $label"
    FAIL=1
  else
    echo "OK    $label"
  fi
}

echo "=== Phase-1 regression-guard ==="

# 1. CORS open
check "CORS origin: true"           '\borigin:\s*true\b'                                 'backend/src/'
check "CORS wildcard origin"        "ALLOWED_ORIGINS.*['\"]\\*['\"]"                     'backend/src/'

# 2. JWT fallback secret
check "JWT fallback_secret literal" "'fallback_secret'|\"fallback_secret\""              'backend/src/'
check "JWT_SECRET || fallback"      'JWT_SECRET\s*\|\|\s*['\''"]'                        'backend/src/'

# 3. let TOKEN in admin
check "Admin module-scope let TOKEN" '^let\s+TOKEN\b'                                    'admin/src/'

# 4. Empty catches in two pinned mobile files
check "Empty .catch(() => {}) in mobile" '\.catch\s*\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)' 'mobile/services/api.ts' 'mobile/stores/useStore.ts'
check "Empty catch {} in mobile"     'catch\s*(\([^)]*\))?\s*\{\s*\}'                    'mobile/services/api.ts' 'mobile/stores/useStore.ts'

# 5. console.* in backend src (after Phase-1 console migration in plan 01)
check "console.* in backend/src"    '\bconsole\.(log|error|warn|info)\b'                 'backend/src/'

if [[ $FAIL -ne 0 ]]; then
  echo ""
  echo "Regression-guard FAILED — fix the listed pattern(s) before committing."
  exit 1
fi

echo "Regression-guard passed."

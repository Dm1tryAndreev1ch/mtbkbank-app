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
#
# === Phase-2 staging notice (added by plan 02-00) ===
# This script ALSO ships 5 Phase-2 gates that are deliberately STAGED RED until
# their respective fix-plans land. Until then, `regression-guard.sh` will exit 1
# at the new section below — that is INTENTIONAL, the same staging strategy used
# by Phase 1 plan 99 (see .planning/STATE.md). Plan 02-99 (verify) gates green-on-all-5
# as a phase-completion check. The 5 staged gates and the plans that flip them green:
#   - STAGED — JWT_REFRESH_SECRET || JWT_SECRET fallback        → green after Plan 02-10
#   - STAGED — Test phone +79001234567 outside seed             → green after Plans 02-08 + 02-12
#   - STAGED — Test cred hint 'ПИН: 1234'                       → green after Plans 02-08 + 02-12
#   - STAGED — SecureStore call outside services/tokenStore.ts  → green after Plans 02-04, 02-05, 02-07, 02-09
#   - STAGED — setTimeout in mobile/app/login.tsx               → green after Plan 02-08

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

echo "=== Phase-2 regression-guard ==="

# Phase 2 — D-22: JWT_REFRESH_SECRET || JWT_SECRET fallback in backend.
# STAGED: this gate goes RED on first run; turns GREEN after Plan 02-10 lands.
check "JWT_REFRESH_SECRET || JWT_SECRET fallback" \
  'JWT_REFRESH_SECRET\s*\|\|\s*process\.env\.JWT_SECRET' \
  'backend/src/'

# Phase 2 — D-15: hardcoded test phone +79001234567 outside backend/src/seed/.
# STAGED: turns GREEN after Plan 02-08 (mobile login.tsx) + Plan 02-12 (admin App.jsx).
# Use `git ls-files | grep -v` subshell substitution (NOT `git grep -- ':!path'`)
# because the exclusion syntax differs across git versions (macOS git ships an
# older PCRE). Trailing `|| true` prevents `set -e` killing the script on empty grep.
check "Test phone +79001234567 outside seed" \
  '\+79001234567' \
  $(git ls-files 'mobile/' 'admin/' | grep -vE '(^|/)__tests__/' || true) \
  $(git ls-files 'backend/src/' | grep -v '^backend/src/seed/' | grep -v '^backend/src/routes/auth.js$' || true)

# Phase 2 — D-15: hint string «ПИН: 1234» (or «ПИН 1234») on any client surface.
# STAGED: turns GREEN after Plan 02-08 (mobile login.tsx) + Plan 02-12 (admin App.jsx).
check "Test cred hint 'ПИН: 1234'" \
  'ПИН[:\s]*1234' \
  $(git ls-files 'mobile/' 'admin/' | grep -vE '(^|/)__tests__/' || true)

# Phase 2 — D-25 belt+suspenders: SecureStore call outside services/tokenStore.ts (and the
# Plan 02-05 ui-prefs adapter `services/secureStorageUiPrefs.ts`, scoped to NON-SENSITIVE UI
# prefs only — D-09 / REL-01).
# STAGED: turns GREEN after Plans 02-04 (api.ts) + 02-05 (useStore.ts) + 02-07 (BiometricGuard.tsx) + 02-09 (app/index.tsx slim).
check "SecureStore outside tokenStore (and ui-prefs)" \
  'SecureStore\.(getItem|setItem|deleteItem)Async' \
  $(git ls-files 'mobile/' | grep -vE '^mobile/services/(tokenStore\.ts|secureStorageUiPrefs\.ts)$|(^|/)__tests__/' || true)

# Phase 2 — D-25 belt+suspenders: setTimeout inside mobile/app/login.tsx.
# STAGED: turns GREEN after Plan 02-08 lands.
check "setTimeout in mobile/app/login.tsx" \
  '\bsetTimeout\b' \
  'mobile/app/login.tsx'

if [[ $FAIL -ne 0 ]]; then
  echo ""
  echo "Regression-guard FAILED — fix the listed pattern(s) before committing."
  exit 1
fi

echo "Regression-guard passed."

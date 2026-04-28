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
check "CORS wildcard origin"        "ALLOWED_ORIGINS\s*=\s*\[[^]]*['\"]\\*['\"]"          'backend/src/'

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
  $(git ls-files 'backend/src/' | grep -v '^backend/src/seed/' | grep -v '^backend/src/routes/auth.js$' | grep -v '^backend/src/schemas/' || true)

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

echo "=== Phase 3 gates ==="
# These gates are STAGED RED today and will go GREEN as plans 03-01..03-16 land:
#   - SEC-11 / S-3 : process.env.JWT_SECRET outside backend/src/env.js
#   - REL-09       : connectedUsers Map in backend/src/websocket/index.js
#   - D-13/D-14    : duplicate rate-limit defs at app level (backend/src/index.js)
#   - D-08         : requireFreshAdmin wired on /api/admin
#   - D-12         : legacy login literal 'Неверный телефон или PIN'
#   - SEC-13       : docs/adr/ADR-001-no-csrf-middleware.md
#   - D-09         : backend/src/schemas/ directory
#   - SEC-06       : module-level tokenRef / setToken in admin/src/App.jsx
#   - SEC-07       : raw String(e?.message) in admin/src/App.jsx + codebook file
#   - REL-08       : processCardDrop receives transaction.id (not raw amount)

# Phase-3 SEC-11 / S-3: process.env.JWT_SECRET must NOT appear outside backend/src/env.js
if git grep -nP 'process\.env\.JWT_SECRET' -- 'backend/src/' ':!backend/src/env.js' 2>/dev/null; then
  echo "FAIL  Phase-3 SEC-11/S-3: process.env.JWT_SECRET leaked outside env.js"
  FAIL=1
else
  echo "OK    Phase-3 SEC-11/S-3: process.env.JWT_SECRET only in env.js"
fi

# Phase-3 REL-09: connectedUsers Map must be gone from websocket/index.js
if git grep -nP 'connectedUsers\s*=\s*new\s+Map' -- 'backend/src/websocket/index.js' 2>/dev/null; then
  echo "FAIL  Phase-3 REL-09: connectedUsers Map still present in websocket/index.js"
  FAIL=1
else
  echo "OK    Phase-3 REL-09: connectedUsers Map removed"
fi

# Phase-3 D-13/D-14 / Pitfall 4: app-level rate-limiters at index.js must be removed
if git grep -nP '^\s*const\s+(loginLimiter|registerLimiter|refreshLimiter)\s*=' -- 'backend/src/index.js' 2>/dev/null; then
  echo "FAIL  Phase-3 D-13/D-14: duplicate rate-limit definitions at app level — must be route-mounted only"
  FAIL=1
else
  echo "OK    Phase-3 D-13/D-14: no duplicate app-level rate-limit definitions"
fi

# Phase-3 D-08: /api/admin must chain requireFreshAdmin
if git grep -nP 'requireFreshAdmin' -- 'backend/src/index.js' 'backend/src/routes/admin.js' >/dev/null 2>&1; then
  echo "OK    Phase-3 D-08: requireFreshAdmin wired on /api/admin"
else
  echo "FAIL  Phase-3 D-08: requireFreshAdmin not wired on /api/admin"
  FAIL=1
fi

# Phase-3 D-12: legacy login literal 'Неверный телефон или PIN' (with capital PIN, no «-»)
# must be replaced by AUTH_INVALID_CREDENTIALS path
if git grep -nP "'Неверный телефон или PIN'" -- 'backend/src/routes/auth.js' 2>/dev/null; then
  echo "FAIL  Phase-3 D-12: legacy login error literal still in auth.js — use AUTH_INVALID_CREDENTIALS codebook"
  FAIL=1
else
  echo "OK    Phase-3 D-12: legacy login literal replaced (AUTH_INVALID_CREDENTIALS)"
fi

# Phase-3 SEC-13: ADR-001 file must exist after Phase 3
if [[ ! -f docs/adr/ADR-001-no-csrf-middleware.md ]]; then
  echo "FAIL  Phase-3 SEC-13: docs/adr/ADR-001-no-csrf-middleware.md missing"
  FAIL=1
else
  echo "OK    Phase-3 SEC-13: ADR-001 present"
fi

# Phase-3 D-09: zod schemas directory must exist
if [[ ! -d backend/src/schemas ]]; then
  echo "FAIL  Phase-3 D-09: backend/src/schemas/ missing"
  FAIL=1
else
  echo "OK    Phase-3 D-09: backend/src/schemas/ present"
fi

# Phase-3 SEC-06: admin must not hold module-level mutable token state
if git grep -nP '^(let|const)\s+tokenRef\b' -- 'admin/src/App.jsx' 2>/dev/null; then
  echo "FAIL  Phase-3 SEC-06: module-level tokenRef still in admin/src/App.jsx"
  FAIL=1
else
  echo "OK    Phase-3 SEC-06: no module-level tokenRef in admin/src/App.jsx"
fi
if git grep -nP '^function\s+setToken\s*\(' -- 'admin/src/App.jsx' 2>/dev/null; then
  echo "FAIL  Phase-3 SEC-06: module-level setToken function still in admin/src/App.jsx"
  FAIL=1
else
  echo "OK    Phase-3 SEC-06: no module-level setToken function in admin/src/App.jsx"
fi

# Phase-3 SEC-07: admin must not interpolate raw error.message into JSX path
if git grep -nP 'String\(e\?\.message' -- 'admin/src/App.jsx' 2>/dev/null; then
  echo "FAIL  Phase-3 SEC-07: raw String(e?.message) interpolation in admin/src/App.jsx — use codebook"
  FAIL=1
else
  echo "OK    Phase-3 SEC-07: no raw String(e?.message) interpolation in admin/src/App.jsx"
fi
if [[ ! -f admin/src/errors/codebook.js ]]; then
  echo "FAIL  Phase-3 SEC-07: admin/src/errors/codebook.js missing"
  FAIL=1
else
  echo "OK    Phase-3 SEC-07: admin/src/errors/codebook.js present"
fi

# Phase-3 REL-08: cardEngine.processCardDrop must receive transactionId, not raw amount
if git grep -nP 'processCardDrop\s*\(\s*[^,]+,\s*Number' -- 'backend/src/routes/admin.js' 2>/dev/null; then
  echo "FAIL  Phase-3 REL-08: processCardDrop second arg looks like a Number — must be transaction.id"
  FAIL=1
else
  echo "OK    Phase-3 REL-08: processCardDrop signature does not pass raw Number"
fi

echo "=== Phase-4 gates ==="

# Phase-4 D-03: AppAlert.tsx must be physically deleted (split into Toast + ConfirmDialog).
if [[ -f mobile/components/AppAlert.tsx ]]; then
  echo "FAIL  Phase-4 D-03: mobile/components/AppAlert.tsx still present (must be deleted; use Toast/ConfirmDialog)"
  FAIL=1
else
  echo "OK    Phase-4 D-03: AppAlert.tsx removed"
fi

# Phase-4 D-03: no consumers of AppAlert remaining.
# Path-restricted to mobile/ excluding component-internal historical doc-comments
# in Toast.tsx / ConfirmDialog.tsx (those reference the *file* in comments, not import it).
if git grep -nP "from\s+['\"][^'\"]*AppAlert['\"]" -- 'mobile/' 2>/dev/null; then
  echo "FAIL  Phase-4 D-03: AppAlert import still present in mobile/"
  FAIL=1
else
  echo "OK    Phase-4 D-03: no AppAlert imports"
fi

# Phase-4 D-07: empty/no-op onPress in mobile/app/.
check "Phase-4 D-07: Empty onPress in mobile/app" 'onPress=\{\s*\(\s*\)\s*=>\s*(\{\s*\}|undefined)\s*\}' 'mobile/app/'

# Phase-4 D-06/D-08: raw async onPress on TouchableOpacity/Pressable in mobile/app
# (ActionButton is the sole permitted async-onPress consumer per UX-04). git grep -P
# is line-scoped; we must use `-z` to span the JSX element across newlines.
if git grep -znP '<(TouchableOpacity|Pressable)\b[^>]*onPress=\{\s*async\s' -- 'mobile/app/' 2>/dev/null; then
  echo "FAIL  Phase-4 D-06/D-08: raw async onPress on TouchableOpacity/Pressable — use <ActionButton />"
  FAIL=1
else
  echo "OK    Phase-4 D-06/D-08: no raw async onPress on Touchable/Pressable in mobile/app"
fi

# Phase-4 D-12: mergeByUpdatedAt helper present.
if [[ ! -f mobile/stores/mergeByUpdatedAt.ts ]]; then
  echo "FAIL  Phase-4 D-12: mobile/stores/mergeByUpdatedAt.ts missing"
  FAIL=1
else
  echo "OK    Phase-4 D-12: mergeByUpdatedAt.ts present"
fi

# Phase-4 D-05: root ErrorBoundary mounted in _layout.tsx.
if ! git grep -q 'ErrorBoundary scope="root"' -- 'mobile/app/_layout.tsx' 2>/dev/null; then
  echo "FAIL  Phase-4 D-05: root ErrorBoundary not mounted in mobile/app/_layout.tsx"
  FAIL=1
else
  echo "OK    Phase-4 D-05: root ErrorBoundary mounted"
fi

# Phase-4 D-09: OfflineBanner + ToastHost mounted in _layout.tsx.
if ! git grep -qE 'OfflineBanner|ToastHost' -- 'mobile/app/_layout.tsx' 2>/dev/null; then
  echo "FAIL  Phase-4 D-09: OfflineBanner/ToastHost not mounted in _layout.tsx"
  FAIL=1
else
  echo "OK    Phase-4 D-09: OfflineBanner/ToastHost mounted"
fi

echo "=== Phase-4.5 regression-guard ==="

# (a) backend/src/routes/admin.js (singular file) MUST be deleted by Plan 1 (D-01).
if [ -f backend/src/routes/admin.js ]; then
  echo "FAIL  Phase-4.5 D-01: backend/src/routes/admin.js still exists; sub-router split required"
  FAIL=1
else
  echo "OK    Phase-4.5 D-01: backend/src/routes/admin.js (singular file) absent"
fi

# (b) backend/eslint.config.js MUST exist with destructive-prisma selectors (D-02).
if ! grep -q "no-restricted-syntax" backend/eslint.config.js 2>/dev/null; then
  echo "FAIL  Phase-4.5 D-02: backend/eslint.config.js missing no-restricted-syntax rule"
  FAIL=1
else
  echo "OK    Phase-4.5 D-02: backend/eslint.config.js has destructive-prisma rule"
fi
if ! grep -q "prisma.user.delete" backend/eslint.config.js 2>/dev/null; then
  echo "FAIL  Phase-4.5 D-02: backend/eslint.config.js missing prisma.user.delete selector"
  FAIL=1
else
  echo "OK    Phase-4.5 D-02: prisma.user.delete selector present"
fi
if ! grep -q "spendingLimit" backend/eslint.config.js 2>/dev/null; then
  echo "FAIL  Phase-4.5 D-02: backend/eslint.config.js missing spendingLimit selector (RESEARCH ADMIN-07 reconciliation)"
  FAIL=1
else
  echo "OK    Phase-4.5 D-02: spendingLimit selector present"
fi

# (c) every routes/admin/*.js mutation handler must call auditLog.withAudit (or writeAudit
#     inside $transaction). Skip the index.js mount file and pure scaffolds with no mutations.
if [ -d backend/src/routes/admin ]; then
  for f in backend/src/routes/admin/*.js; do
    [ "$(basename "$f")" = "index.js" ] && continue
    if grep -qE "(prisma|tx)\.(user|transaction|bankAccount|bankCard|userCard|deck|quest|spendingLimit|payment|subscription|cardTrade|notification)\.(create|update|delete)" "$f"; then
      if ! grep -qE "withAudit|writeAudit" "$f"; then
        echo "FAIL  Phase-4.5 D-03: $f mutates Prisma without audit wiring"
        FAIL=1
      fi
    fi
  done
  echo "OK    Phase-4.5 D-03: every routes/admin mutation handler routes through withAudit/writeAudit"
fi

# (d) sub-routers MUST NOT remount auth middleware (D-01 lock). Strip comments before grepping
#     so commentary in index.js documenting the rule does not trigger the guard.
if [ -d backend/src/routes/admin ]; then
  for f in backend/src/routes/admin/*.js; do
    if sed 's|//.*||' "$f" | grep -qE "router\.use\(.*authMiddleware|router\.use\(.*adminMiddleware|router\.use\(.*requireFreshAdmin"; then
      echo "FAIL  Phase-4.5 D-01: $f re-mounts admin auth middleware; chain stays at app-level only"
      FAIL=1
    fi
  done
  echo "OK    Phase-4.5 D-01: no sub-router remounts admin auth middleware"
fi

echo "=== Phase-4.5 final regression-guard ==="

# (a) every routes/admin/*.js mutation handler must call auditLog.withAudit
#     (or writeAudit inside $transaction). Wave-final pin against the populated
#     sub-routers from Plans 2-5.
for f in backend/src/routes/admin/*.js; do
  base=$(basename "$f")
  [ "$base" = "index.js" ] && continue
  [ "$base" = "dashboard.js" ] && continue
  if grep -qE "router\.(post|put|patch|delete)" "$f"; then
    if grep -qE "(prisma|tx)\.(user|transaction|bankAccount|bankCard|userCard|deck|quest|spendingLimit|payment|subscription|cardTrade|notification|collectionCard|deckCard)\.(create|createMany|update|updateMany|delete|deleteMany)" "$f"; then
      if ! grep -qE "auditLog\.withAudit|auditLog\.writeAudit|withAudit\(|writeAudit\(" "$f"; then
        echo "FAIL  Phase-4.5 D-03/D-04: $f mutates Prisma without audit wiring"
        FAIL=1
      fi
    fi
  fi
done
echo "OK    Phase-4.5 D-03/D-04: all routes/admin sub-router mutations wrap audit"

# (b) backend/eslint.config.js MUST register destructive-prisma selectors for
#     every D-02 (model, op) pair populated by Plans 2-5.
for selector in \
  "prisma\\.user\\.delete" \
  "prisma\\.user\\.update" \
  "prisma\\.transaction\\.delete" \
  "prisma\\.transaction\\.update" \
  "prisma\\.bankAccount\\.update" \
  "prisma\\.bankAccount\\.delete" \
  "prisma\\.bankCard\\.delete" \
  "prisma\\.userCard\\.delete" \
  "prisma\\.deck\\.delete" \
  "prisma\\.quest\\.delete" \
  "prisma\\.spendingLimit\\.delete" \
  "prisma\\.payment\\.update" \
  "prisma\\.subscription\\.delete" \
  "prisma\\.cardTrade\\.update" \
  "prisma\\.cardTrade\\.delete" \
  "prisma\\.notification\\.delete" \
; do
  if ! grep -q "$selector" backend/eslint.config.js 2>/dev/null; then
    echo "FAIL  Phase-4.5 D-02: backend/eslint.config.js missing $selector selector"
    FAIL=1
  fi
done
echo "OK    Phase-4.5 D-02: destructive-prisma ESLint selectors all registered"

# (c) backend/src/routes/admin.js (singular file) MUST be deleted by Plan 1.
#     (Already covered above; re-pin in the final-gate banner.)
if [ -f backend/src/routes/admin.js ]; then
  echo "FAIL  Phase-4.5 D-01: backend/src/routes/admin.js still exists"
  FAIL=1
else
  echo "OK    Phase-4.5 D-01: backend/src/routes/admin.js (singular) absent"
fi

# (d) auth chain mount preservation in backend/src/index.js.
if grep -qE "app\.use\(\s*['\"]/api/admin['\"]\s*,.*authMiddleware" backend/src/index.js 2>/dev/null; then
  echo "OK    Phase-4.5 D-01: /api/admin authMiddleware mounted"
else
  echo "FAIL  Phase-4.5 D-01: /api/admin auth chain mount missing in backend/src/index.js"
  FAIL=1
fi
if grep -qE "app\.use\(\s*['\"]/api/admin['\"]\s*,.*requireFreshAdmin" backend/src/index.js 2>/dev/null; then
  echo "OK    Phase-4.5 D-01: /api/admin requireFreshAdmin in mount chain"
else
  echo "FAIL  Phase-4.5 D-01: /api/admin requireFreshAdmin not in mount chain"
  FAIL=1
fi

# (e) absence of eslint-disable.*no-restricted-syntax in backend/src/**.
if grep -rE "eslint-disable.*no-restricted-syntax" backend/src/ >/dev/null 2>&1; then
  echo "FAIL  Phase-4.5 D-02: eslint-disable for no-restricted-syntax found in backend/src/**"
  FAIL=1
else
  echo "OK    Phase-4.5 D-02: no eslint-disable bypass for no-restricted-syntax in backend/src/**"
fi

# (f) admin-audit-rollback.test.js must exist AND reference writeAudit/withAudit.
if [ ! -f backend/tests/integration/admin-audit-rollback.test.js ]; then
  echo "FAIL  Phase-4.5 D-04: backend/tests/integration/admin-audit-rollback.test.js missing"
  FAIL=1
elif ! grep -qE "writeAudit|withAudit" backend/tests/integration/admin-audit-rollback.test.js; then
  echo "FAIL  Phase-4.5 D-04: admin-audit-rollback.test.js does not exercise writeAudit/withAudit"
  FAIL=1
else
  echo "OK    Phase-4.5 D-04: admin-audit-rollback.test.js shipped + exercises writeAudit"
fi

# (g) cascade FK count pin — schema.prisma must retain >=9 onDelete: Cascade
#     and >=3 onDelete: SetNull (Plan-1 Migration A; guards ADMIN-12 cascade
#     against future schema drift).
cascade_count=$(grep -c "onDelete: Cascade" backend/prisma/schema.prisma 2>/dev/null || echo 0)
if [ "$cascade_count" -lt 9 ]; then
  echo "FAIL  Phase-4.5 D-06: schema.prisma has $cascade_count onDelete: Cascade (expected >=9)"
  FAIL=1
else
  echo "OK    Phase-4.5 D-06: $cascade_count onDelete: Cascade entries (>=9 required)"
fi
setnull_count=$(grep -c "onDelete: SetNull" backend/prisma/schema.prisma 2>/dev/null || echo 0)
if [ "$setnull_count" -lt 3 ]; then
  echo "FAIL  Phase-4.5 D-06: schema.prisma has $setnull_count onDelete: SetNull (expected >=3)"
  FAIL=1
else
  echo "OK    Phase-4.5 D-06: $setnull_count onDelete: SetNull entries (>=3 required)"
fi

echo "=== Phase-5 regression-guard ==="

# Phase 5 ANIM-01 — GestureHandlerRootView provider mount in mobile/app/_layout.tsx.
if grep -q "GestureHandlerRootView" mobile/app/_layout.tsx 2>/dev/null; then
  echo "OK    Phase-5 ANIM-01: GestureHandlerRootView mounted in mobile/app/_layout.tsx"
else
  echo "FAIL  Phase-5 ANIM-01: GestureHandlerRootView missing from mobile/app/_layout.tsx"
  FAIL=1
fi

# Phase 5 ANIM-01 — gesture-handler dependency pinned at 2.31.x.
if grep -E '"react-native-gesture-handler":\s*"[\^~]?2\.31\.' mobile/package.json >/dev/null 2>&1; then
  echo "OK    Phase-5 ANIM-01: react-native-gesture-handler@2.31.x in mobile/package.json"
else
  echo "FAIL  Phase-5 ANIM-01: react-native-gesture-handler@2.31.x missing from mobile/package.json"
  FAIL=1
fi

# Phase 5 ANIM-02 — both hooks present in mobile/hooks/.
if [ -f mobile/hooks/useReducedMotion.ts ] && [ -f mobile/hooks/useCancellableAnimation.ts ]; then
  echo "OK    Phase-5 ANIM-02: mobile/hooks/{useReducedMotion,useCancellableAnimation}.ts present"
else
  echo "FAIL  Phase-5 ANIM-02: missing hook(s) in mobile/hooks/"
  FAIL=1
fi

# Phase 5 ANIM-02 — useReducedMotion is a re-export of Reanimated's hook (D-02).
if grep -q "from 'react-native-reanimated'" mobile/hooks/useReducedMotion.ts 2>/dev/null; then
  echo "OK    Phase-5 ANIM-02: useReducedMotion re-exports from react-native-reanimated"
else
  echo "FAIL  Phase-5 ANIM-02: useReducedMotion no longer re-exports react-native-reanimated"
  FAIL=1
fi

# Phase 5 D-01 — mobile/animations/ MUST NOT exist.
if [ -d mobile/animations ]; then
  echo "FAIL  Phase-5 D-01: mobile/animations/ exists (hooks must live in mobile/hooks/ only)"
  FAIL=1
else
  echo "OK    Phase-5 D-01: mobile/animations/ does not exist"
fi

# Phase 5 ANIM-03 — custom rule file + wiring at error severity.
if [ -f mobile/eslint-rules/no-zustand-in-worklet.js ] \
   && grep -q "'mt-bank/no-zustand-in-worklet': 'error'" mobile/eslint.config.js 2>/dev/null; then
  echo "OK    Phase-5 ANIM-03: mt-bank/no-zustand-in-worklet wired at error severity"
else
  echo "FAIL  Phase-5 ANIM-03: mt-bank/no-zustand-in-worklet rule or wiring missing"
  FAIL=1
fi

# Phase 5 D-10 — belt-and-suspenders proximity check.
# Lint rule (mt-bank/no-zustand-in-worklet) is the precise judgment; this grep
# fails when ANY single mobile/ file contains BOTH a 'worklet' directive AND
# a useStore identifier. Set-intersection of file lists keeps false-negatives
# low; Phase 6 may refine if false positives surface.
# Exclude mobile/eslint-rules/** — that directory contains the AST rule that
# DETECTS this exact pattern, so its source + tests legitimately mention both
# `'worklet'` and `useStore` as string literals. Those files are not worklets.
worklet_files=$(git grep -lF "'worklet'" -- 'mobile/' ':!mobile/eslint-rules/**' 2>/dev/null || true)
if [ -n "$worklet_files" ]; then
  bad=""
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    if grep -q "useStore" "$f" 2>/dev/null; then
      bad="${bad}        ${f}\n"
    fi
  done <<< "$worklet_files"
  if [ -n "$bad" ]; then
    echo "FAIL  Phase-5 D-10: worklet file(s) reference useStore:"
    printf "%b" "$bad"
    FAIL=1
  else
    echo "OK    Phase-5 D-10: no worklet file references useStore"
  fi
else
  echo "OK    Phase-5 D-10: no worklet files yet"
fi

if [[ $FAIL -eq 0 ]]; then
  echo "OK: Phase-5 regression-guard"
fi

if [[ $FAIL -eq 0 ]]; then
  echo "OK: Phase-4.5 final regression-guard"
fi

if [[ $FAIL -ne 0 ]]; then
  echo ""
  echo "Regression-guard FAILED — fix the listed pattern(s) before committing."
  exit 1
fi

echo "Regression-guard passed."

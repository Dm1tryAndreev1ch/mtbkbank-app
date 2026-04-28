#!/usr/bin/env bash
# CI-06: Bundle scanner — detects leaked secrets and PII in built APK/bundle.
# Usage: bash scripts/bundle-scanner.sh <path-to-apk-or-bundle>
#
# Exit 0 = clean. Exit 1 = leaked strings found.

set -euo pipefail

ARTIFACT="${1:-}"
if [ -z "$ARTIFACT" ] || [ ! -f "$ARTIFACT" ]; then
  echo "Usage: bundle-scanner.sh <artifact>"
  exit 1
fi

FAILED=0
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

echo "══════════════════════════════════════════════════"
echo "  Bundle Scanner — $ARTIFACT"
echo "══════════════════════════════════════════════════"

# Extract text strings from the artifact (strings works on APKs, JARs, JS bundles)
strings "$ARTIFACT" > "$TMPDIR/strings.txt" 2>/dev/null || true

check_pattern() {
  local label="$1"
  local pattern="$2"

  if grep -qE "$pattern" "$TMPDIR/strings.txt" 2>/dev/null; then
    echo "❌  LEAKED: $label  (pattern: $pattern)"
    FAILED=1
  else
    echo "✅  CLEAN: $label"
  fi
}

# ── Secrets that must never appear in the bundle ──────────────────────────
check_pattern "JWT_SECRET value"           'JWT_SECRET\s*=\s*[^=]'
check_pattern "EAS_SECRET value"           'EAS_SECRET\s*=\s*[^=]'
check_pattern "SENTRY_AUTH_TOKEN value"    'SENTRY_AUTH_TOKEN\s*=\s*[^=]'
check_pattern "EXPO_TOKEN value"           'EXPO_TOKEN\s*=\s*[^=]'
check_pattern "POSTGRES_PASSWORD value"    'POSTGRES_PASSWORD\s*=\s*[^=]'

# ── PII fields that must not leak ─────────────────────────────────────────
check_pattern "pin field in payload"       '"pin"\s*:'
check_pattern "password field in payload"  '"password"\s*:'
check_pattern "cardNumber field"           '"cardNumber"\s*:'
check_pattern "refreshToken field"         '"refreshToken"\s*:'
check_pattern "Authorization header value" 'Authorization:\s*Bearer\s+[A-Za-z0-9._-]{20,}'

# ── EXPO_PUBLIC_* — only allowed public vars, not internal config ──────────
# Allowed: EXPO_PUBLIC_API_URL, EXPO_PUBLIC_SENTRY_DSN
# Forbidden: any other EXPO_PUBLIC_* that looks like it carries secrets
if grep -oE 'EXPO_PUBLIC_[A-Z_]+' "$TMPDIR/strings.txt" 2>/dev/null \
     | grep -vE '^EXPO_PUBLIC_(API_URL|SENTRY_DSN)$' \
     | grep . ; then
  echo "❌  LEAKED: unexpected EXPO_PUBLIC_* variable in bundle"
  FAILED=1
else
  echo "✅  CLEAN: EXPO_PUBLIC_* whitelist OK"
fi

echo "══════════════════════════════════════════════════"

if [ "$FAILED" = "1" ]; then
  echo "Bundle scanner FAILED — secrets or PII found in artifact."
  exit 1
fi

echo "Bundle scanner PASSED."

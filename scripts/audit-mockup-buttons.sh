#!/usr/bin/env bash
# Audits mobile/app/ for empty/no-op onPress patterns + raw async onPress on
# unwrapped touchables (Phase-4 D-07 / D-08).
#
# "Raw" = `<TouchableOpacity|Pressable ... onPress={async ...}>` directly. ActionButton
# is the SOLE permitted async-onPress consumer (single-flight + offline-aware
# + rate-limit-aware) per UX-04.
#
# Reports matches without exiting non-zero — safe for ad-hoc developer use.
# CI hard-gate is in scripts/regression-guard.sh.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== Mockup-button audit (Phase-4 D-07) ==="
echo "--- Empty onPress in mobile/app/ ---"
git grep -nP 'onPress=\{\s*\(\s*\)\s*=>\s*(\{\s*\}|undefined)\s*\}' -- 'mobile/app/' || echo "(none)"
echo "--- Raw async onPress on TouchableOpacity/Pressable in mobile/app/ (must use ActionButton) ---"
git grep -znP '<(TouchableOpacity|Pressable)\b[^>]*onPress=\{\s*async\s' -- 'mobile/app/' || echo "(none)"

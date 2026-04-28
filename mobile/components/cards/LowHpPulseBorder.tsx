/**
 * Phase 06-05 P05-T1 — LowHpPulseBorder overlay (Gray Area E).
 *
 * Renders a pulsing red border around a card when health/maxHealth < 0.30.
 * At/above the threshold the component returns `null` so it imposes zero
 * cost on healthy cards.
 *
 * Motion contract (06-UI-SPEC):
 *   withRepeat(
 *     withSequence(
 *       withTiming(1.0, { duration: 600 }),
 *       withTiming(0.6, { duration: 600 }),
 *     ), -1, true
 *   )
 *
 * Reduced-motion (06-CONTEXT — D-02): renders a static fully-opaque border;
 * `withRepeat` is never invoked. The animated path is fully bypassed.
 *
 * Worklet discipline (CLAUDE.md + Phase-5 D-07 ESLint):
 *   - NO Zustand-store import.
 *   - NO `runOnJS` — the loop has no JS-thread bridge per-frame.
 *   - Single `register(useSharedValue(...))` SV; cancelled on unmount.
 *
 * Threshold gate is a JS-side render guard so the SV is only allocated for
 * cards that actually need the pulse.
 */
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useCancellableAnimation } from '../../hooks/useCancellableAnimation';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { BorderRadius } from '../../constants/theme';

// Hard-coded #ef4444 — same destructive red used by ConfirmDialog primary
// button. Kept literal here to avoid pulling the full theme hook into a
// purely visual overlay (no theme-aware contrast required for a low-HP red).
const ERROR_RED = '#ef4444';

// Render-time threshold gate (06-PATTERNS): only mount the animated path
// when the card is actually low-HP.
const LOW_HP_THRESHOLD = 0.30;

interface Props {
  health: number;
  maxHealth: number;
}

export function LowHpPulseBorder({ health, maxHealth }: Props): React.ReactElement | null {
  const safeMax = Math.max(1, maxHealth);
  const ratio = health / safeMax;
  const reducedMotion = useReducedMotion();

  // Hooks must be called unconditionally — but registering an SV that we
  // never animate is harmless (cancelAnimation on unmount is a no-op).
  const register = useCancellableAnimation();
  const opacity = register(useSharedValue(1));

  useEffect(() => {
    if (reducedMotion) return;
    if (ratio >= LOW_HP_THRESHOLD) return;
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.6, { duration: 600, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
  }, [reducedMotion, ratio]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  // Threshold gate (must come AFTER hooks to keep hook order stable across
  // renders that cross the 30% boundary).
  if (ratio >= LOW_HP_THRESHOLD) return null;

  if (reducedMotion) {
    // D-02 reduced-motion fallback: static red border at full opacity.
    return (
      <View
        testID="low-hp-pulse-border"
        pointerEvents="none"
        style={[styles.border, { borderColor: ERROR_RED }]}
      />
    );
  }

  return (
    <Animated.View
      testID="low-hp-pulse-border"
      pointerEvents="none"
      style={[styles.border, { borderColor: ERROR_RED }, animatedStyle]}
    />
  );
}

export default LowHpPulseBorder;

const styles = StyleSheet.create({
  border: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 2,
    borderRadius: BorderRadius.base,
  },
});

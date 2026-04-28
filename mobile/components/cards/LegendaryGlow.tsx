/**
 * Phase 06-03 D-05 — LegendaryGlow overlay.
 *
 * LEGENDARY-tier reveal: pulsing aura behind the card. Two looped shared
 * values drive scale (1.0 ↔ 1.05) and opacity (0.5 ↔ 0.9) with offset
 * curves, producing a subtle gold breath.
 *
 * Worklet discipline (CLAUDE.md + Phase-5 D-07 ESLint):
 *   - NO Zustand-store import.
 *   - NO JS-thread bridge per-frame (loop has no completion side-effect).
 *   - Two `register(useSharedValue(...))` SVs; adjacency satisfied for both.
 */
import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import type { useCancellableAnimation } from '../../hooks/useCancellableAnimation';

interface Props {
  color: string;
  register: ReturnType<typeof useCancellableAnimation>;
}

export function LegendaryGlow({ color, register }: Props) {
  const scale = register(useSharedValue(1));
  const opacity = register(useSharedValue(0.6));

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.95, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.9, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.5, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.glow,
        { backgroundColor: color, shadowColor: color },
        glowStyle,
      ]}
    />
  );
}

export default LegendaryGlow;

const styles = StyleSheet.create({
  glow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 24,
  },
});

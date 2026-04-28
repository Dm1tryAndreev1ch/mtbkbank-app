/**
 * Phase 06-03 D-03 — RareShimmer overlay.
 *
 * Subtle animated highlight sweep over the card surface for RARE-tier reveals.
 * The sweep is implemented as a translated `LinearGradient` clipped by an
 * `overflow: 'hidden'` parent (the card's outer wrapper already has
 * `overflow: 'hidden'`), so the gradient appears to sweep across the card
 * border/face without bleeding outside.
 *
 * `@react-native-masked-view/masked-view` is intentionally NOT used (it is
 * not in `mobile/package.json`); the fallback is the translateX gradient.
 *
 * Worklet discipline (CLAUDE.md + Phase-5 D-07 ESLint):
 *   - NO Zustand-store import.
 *   - NO JS-thread bridge per-frame (loop has no completion side-effect).
 *   - Single `register(useSharedValue(...))` SV; adjacency satisfied for
 *     the regression-guard belt-check (Phase-6 D-02).
 */
import React, { useEffect } from 'react';
import { StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import type { useCancellableAnimation } from '../../hooks/useCancellableAnimation';

const { width } = Dimensions.get('window');
const CARD_W = Math.min(width, 320);

interface Props {
  color: string;
  register: ReturnType<typeof useCancellableAnimation>;
}

export function RareShimmer({ color, register }: Props) {
  const sweepX = register(useSharedValue(-CARD_W));

  useEffect(() => {
    sweepX.value = withRepeat(
      withTiming(CARD_W, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
  }, []);

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: sweepX.value }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.clip]}
    >
      <Animated.View style={[styles.sweepWrap, sweepStyle]}>
        <LinearGradient
          colors={[
            'rgba(255,255,255,0)',
            // Subtle mid-band, tinted by rarity color.
            `${color}66`,
            'rgba(255,255,255,0)',
          ]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.sweep}
        />
      </Animated.View>
    </Animated.View>
  );
}

export default RareShimmer;

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
    borderRadius: 24,
  },
  sweepWrap: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: CARD_W,
  },
  sweep: {
    flex: 1,
    width: '100%',
    opacity: 0.85,
  },
});

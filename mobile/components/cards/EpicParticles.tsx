/**
 * Phase 06-03 D-04 — EpicParticles overlay.
 *
 * EPIC-tier reveal: 10 particles drift outward in a bezier-style arc around
 * the card stage. Single shared `progress` value drives every particle's
 * `useAnimatedStyle` via per-particle JS-side closure config (RESEARCH
 * Open Question 1 RESOLVED → single-SV variant; Pitfall 3 — never call
 * `useSharedValue` inside a loop or `useMemo`).
 *
 * PARTICLE_COUNT is locked at 10 (D-04 perf budget).
 *
 * Worklet discipline (CLAUDE.md + Phase-5 D-07 ESLint):
 *   - NO Zustand-store import.
 *   - NO JS-thread bridge per-frame (loop has no completion side-effect).
 *   - Single `register(useSharedValue(...))` SV; adjacency satisfied.
 */
import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  Easing,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import type { useCancellableAnimation } from '../../hooks/useCancellableAnimation';

const PARTICLE_COUNT = 10;

interface Props {
  color: string;
  register: ReturnType<typeof useCancellableAnimation>;
}

interface ParticleConfig {
  angle: number;
  radius: number;
  phaseOffset: number;
}

interface ParticleProps {
  config: ParticleConfig;
  progress: SharedValue<number>;
  color: string;
}

function Particle({ config, progress, color }: ParticleProps) {
  const style = useAnimatedStyle(() => {
    // Closure over JS-side const config — safe (Pitfall 3 specifically warns
    // against capturing Zustand selectors here, NOT plain JS objects).
    const { angle, radius, phaseOffset } = config;
    // Phase-shifted [0,1) progress so particles do not all reset together.
    const local = (progress.value + phaseOffset) % 1;
    const x = interpolate(local, [0, 1], [0, Math.cos(angle) * radius], Extrapolation.CLAMP);
    const y = interpolate(local, [0, 1], [0, Math.sin(angle) * radius], Extrapolation.CLAMP);
    // Fade out as particle drifts; quick fade-in from 0..0.2 for soft start.
    const opacity = interpolate(local, [0, 0.2, 1], [0, 1, 0], Extrapolation.CLAMP);
    const scale = interpolate(local, [0, 1], [0.6, 1.4], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [{ translateX: x }, { translateY: y }, { scale }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.particle, { backgroundColor: color, shadowColor: color }, style]}
    />
  );
}

export function EpicParticles({ color, register }: Props) {
  const progress = register(useSharedValue(0));

  const particles = useMemo<ParticleConfig[]>(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
        angle: (Math.PI * 2 * i) / PARTICLE_COUNT + Math.random() * 0.3,
        radius: 80 + Math.random() * 40,
        phaseOffset: Math.random(),
      })),
    [],
  );

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.out(Easing.cubic) }),
      -1,
      false,
    );
  }, []);

  return (
    <View pointerEvents="none" style={styles.center}>
      {particles.map((cfg, i) => (
        <Particle key={i} config={cfg} progress={progress} color={color} />
      ))}
    </View>
  );
}

export default EpicParticles;

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  particle: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 6,
  },
});

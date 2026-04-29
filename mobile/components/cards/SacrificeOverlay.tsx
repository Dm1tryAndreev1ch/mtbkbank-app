/**
 * Phase 06-05 P05-T2 — SacrificeOverlay (Gray Area E).
 *
 * Two-phase orchestrator:
 *   PHASE 'CONFIRM'   → renders ConfirmDialog with Russian copy.
 *                       Cancel → onDismiss(); Confirm → enter ANIMATING.
 *   PHASE 'ANIMATING' → single master `timeline` SV driven by withSequence:
 *                         (1) source shrink   1.0 → 0.4   (200ms)
 *                         (2) particles bezier flow        (800ms)
 *                         (3) target HP bar fill 0 → 1     (500ms)
 *                         (4) "+N HP" fly-up + completion   (300ms)
 *                       The JS-thread completion bridge is wired ONLY to
 *                       the LAST withTiming's callback (exactly once).
 *
 * Reduced-motion (06-CONTEXT D-02): skip animation entirely; show success
 * Toast and call onComplete synchronously on confirm.
 *
 * Worklet discipline (CLAUDE.md + Phase-5 D-07 ESLint):
 *   - NO Zustand-store reads inside any worklet.
 *     `useStore.getState().toast.show(...)` is called from the JS-thread
 *     confirm handler, NOT from `useAnimatedStyle` / `withTiming` callbacks.
 *   - SVs registered via useCancellableAnimation; cancelled on unmount.
 *   - runOnJS appears exactly once, on the final stage.
 *
 * Per 06-PATTERNS §"SacrificeOverlay.tsx (NEW — Gray Area E)" and 06-UI-SPEC
 * §"Copywriting Contract" (Russian sacrifice strings preserved verbatim).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  runOnJS,
  interpolate,
  Easing,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import { ConfirmDialog } from '../ConfirmDialog';
import { useCancellableAnimation } from '../../hooks/useCancellableAnimation';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useStore } from '../../stores/useStore';
import { Spacing } from '../../constants/theme';

const PARTICLE_COUNT = 10;

// withSequence stage boundaries on the master timeline:
//   0 → 1   shrink         (200ms)
//   1 → 2   particles      (800ms)
//   2 → 3   HP bar fill    (500ms)
//   3 → 4   "+N HP" fly-up (300ms) + onComplete
const STAGE_SHRINK_END = 1;
const STAGE_PARTICLES_END = 2;
const STAGE_HP_END = 3;
const STAGE_FLYUP_END = 4;

/**
 * fix: расширен интерфейс — принимаем userCard-объект с вложенным
 * collectionCard, либо уже нормализованный объект с полем name.
 * cards.tsx передаёт selectedCard напрямую (userCard), у которого
 * name живёт в collectionCard.name, а не на верхнем уровне.
 */
export interface SourceCard {
  id: string;
  /** Отображаемое имя карты. Если не задано напрямую — берём из collectionCard. */
  name?: string;
  collectionCard?: {
    name?: string;
    brandName?: string;
  };
}

export interface TargetCard {
  id: string;
}

export interface SacrificeOverlayProps {
  visible: boolean;
  sourceCard: SourceCard | null;
  targetCard: TargetCard | null;
  healAmount: number;
  onDismiss?: () => void;
  onComplete: () => void;
}

interface ParticleConfig {
  cx1: number;
  cy1: number;
  cx2: number;
  cy2: number;
  endX: number;
  endY: number;
  delay: number;
}

interface ParticleProps {
  config: ParticleConfig;
  timeline: SharedValue<number>;
}

function Particle({ config, timeline }: ParticleProps) {
  const style = useAnimatedStyle(() => {
    const raw = interpolate(
      timeline.value,
      [STAGE_SHRINK_END, STAGE_PARTICLES_END],
      [0, 1],
      Extrapolation.CLAMP,
    );
    const local = interpolate(raw, [config.delay, 1], [0, 1], Extrapolation.CLAMP);
    const t = local;
    const inv = 1 - t;
    const x =
      3 * inv * inv * t * config.cx1 +
      3 * inv * t * t * config.cx2 +
      t * t * t * config.endX;
    const y =
      3 * inv * inv * t * config.cy1 +
      3 * inv * t * t * config.cy2 +
      t * t * t * config.endY;
    const opacity = interpolate(local, [0, 0.15, 0.85, 1], [0, 1, 1, 0], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [{ translateX: x }, { translateY: y }],
    };
  });

  return (
    <Animated.View pointerEvents="none" style={[styles.particle, style]} />
  );
}

/** Нормализует имя карты: name → collectionCard.name → collectionCard.brandName → '?' */
function resolveCardName(card: SourceCard): string {
  return (
    card.name ??
    card.collectionCard?.name ??
    card.collectionCard?.brandName ??
    '?'
  );
}

export function SacrificeOverlay({
  visible,
  sourceCard,
  targetCard: _targetCard,
  healAmount,
  onDismiss,
  onComplete,
}: SacrificeOverlayProps) {
  const reducedMotion = useReducedMotion();
  const register = useCancellableAnimation();

  const timeline = register(useSharedValue(0));
  const [phase, setPhase] = useState<'CONFIRM' | 'ANIMATING'>('CONFIRM');

  useEffect(() => {
    if (visible) {
      timeline.value = 0;
      setPhase('CONFIRM');
    }
  }, [visible]);

  const particles = useMemo<ParticleConfig[]>(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, i) => {
        const angle = (Math.PI * 2 * i) / PARTICLE_COUNT;
        const endX = Math.cos(angle) * 120;
        const endY = Math.sin(angle) * 120;
        return {
          cx1: Math.cos(angle + 0.6) * 40,
          cy1: Math.sin(angle + 0.6) * 40 - 20,
          cx2: Math.cos(angle - 0.4) * 80,
          cy2: Math.sin(angle - 0.4) * 80,
          endX,
          endY,
          delay: (i % 5) * 0.06,
        };
      }),
    [],
  );

  const sourceStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      timeline.value,
      [0, STAGE_SHRINK_END],
      [1, 0.4],
      Extrapolation.CLAMP,
    );
    const opacity = interpolate(
      timeline.value,
      [STAGE_SHRINK_END, STAGE_PARTICLES_END],
      [1, 0],
      Extrapolation.CLAMP,
    );
    return { transform: [{ scale }], opacity };
  });

  const hpBarStyle = useAnimatedStyle(() => {
    const fill = interpolate(
      timeline.value,
      [STAGE_PARTICLES_END, STAGE_HP_END],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return { transform: [{ scaleX: fill }] };
  });

  const flyUpStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      timeline.value,
      [STAGE_HP_END, STAGE_FLYUP_END],
      [0, -40],
      Extrapolation.CLAMP,
    );
    const opacity = interpolate(
      timeline.value,
      [STAGE_HP_END, STAGE_HP_END + 0.2, STAGE_FLYUP_END],
      [0, 1, 0],
      Extrapolation.CLAMP,
    );
    return { opacity, transform: [{ translateY }] };
  });

  const handleConfirm = () => {
    if (reducedMotion) {
      useStore.getState().toast.show(`+${healAmount} HP`, 'success');
      onComplete();
      return;
    }

    setPhase('ANIMATING');

    timeline.value = withSequence(
      withTiming(STAGE_SHRINK_END, {
        duration: 200,
        easing: Easing.in(Easing.cubic),
      }),
      withTiming(STAGE_PARTICLES_END, {
        duration: 800,
        easing: Easing.out(Easing.cubic),
      }),
      withTiming(STAGE_HP_END, {
        duration: 500,
        easing: Easing.inOut(Easing.ease),
      }),
      withTiming(
        STAGE_FLYUP_END,
        { duration: 300, easing: Easing.out(Easing.quad) },
        (finished) => {
          'worklet';
          if (finished) runOnJS(onComplete)();
        },
      ),
    );
  };

  const handleDismiss = () => {
    if (phase === 'CONFIRM') {
      onDismiss?.();
    }
  };

  if (!visible) return null;

  if (phase === 'CONFIRM') {
    if (!sourceCard) return null;

    // fix: используем resolveCardName чтобы получить имя из collectionCard
    // когда cards.tsx передаёт userCard-объект без top-level name.
    const displayName = resolveCardName(sourceCard);

    return (
      <ConfirmDialog
        visible
        onDismiss={handleDismiss}
        title={`Пожертвовать карту «${displayName}»?`}
        message={`Цель восстановит +${healAmount} HP.`}
        confirmLabel="Пожертвовать"
        cancelLabel="Отмена"
        suppressDismissOnConfirm
        confirmButton={{ onPress: handleConfirm }}
        isDestructive
      />
    );
  }

  return (
    <View pointerEvents="none" style={styles.overlay} testID="sacrifice-animating">
      <View style={styles.stage}>
        <Animated.View style={[styles.sourceCard, sourceStyle]} />

        <View style={styles.particleField} pointerEvents="none">
          {particles.map((cfg, i) => (
            <Particle key={i} config={cfg} timeline={timeline} />
          ))}
        </View>

        <View style={styles.hpBarTrack}>
          <Animated.View style={[styles.hpBarFill, hpBarStyle]} />
        </View>

        <Animated.View style={[styles.flyUpWrap, flyUpStyle]}>
          <Text style={styles.flyUpText}>{`+${healAmount} HP`}</Text>
        </Animated.View>
      </View>
    </View>
  );
}

export default SacrificeOverlay;

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#00000080',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  stage: {
    width: 240,
    height: 320,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceCard: {
    width: 140,
    height: 200,
    borderRadius: 16,
    backgroundColor: '#ef4444',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 12,
  },
  particleField: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  particle: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fbbf24',
    shadowColor: '#fbbf24',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 6,
  },
  hpBarTrack: {
    position: 'absolute',
    bottom: Spacing.lg,
    left: 0,
    right: 0,
    height: 8,
    backgroundColor: '#1e293b',
    borderRadius: 4,
    overflow: 'hidden',
  },
  hpBarFill: {
    width: '100%',
    height: '100%',
    backgroundColor: '#22c55e',
    transformOrigin: 'left',
  },
  flyUpWrap: {
    position: 'absolute',
    top: Spacing.lg,
  },
  flyUpText: {
    fontSize: 28,
    fontFamily: 'Manrope-ExtraBold',
    color: '#22c55e',
    textShadowColor: '#000',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    letterSpacing: -0.3,
  },
});

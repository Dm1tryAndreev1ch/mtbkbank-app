import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Pressable } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSpring, withDelay, withSequence,
  interpolate, Extrapolation, runOnJS, cancelAnimation, type SharedValue,
} from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Fonts, Spacing, BorderRadius, Shadows, getRarityName } from '../constants/theme';
import { useThemeColor } from '../hooks/useThemeColor';
import { useCancellableAnimation } from '../hooks/useCancellableAnimation';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { RareShimmer } from './cards/RareShimmer';
import { EpicParticles } from './cards/EpicParticles';
import { LegendaryGlow } from './cards/LegendaryGlow';

const { width } = Dimensions.get('window');

interface CardDropRevealProps {
  card: any;
  onDismiss: () => void;
  onEquip?: () => void;
}

type Phase = 'IDLE' | 'DROP' | 'REVEAL' | 'DONE';

const triggerHaptics = (rarityType: string) => {
  if (rarityType === 'LEGENDARY') {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } else if (rarityType === 'EPIC') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  } else if (rarityType === 'RARE') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
};

/**
 * D-08 reduced-motion branch — static fade-in front face + rarity border + actions
 * + single haptic at mount. No orb/flip/burst/overlays. Information parity preserved
 * (rarity name, badge, brand all visible).
 */
function ReducedMotionReveal({ card, onDismiss, onEquip }: CardDropRevealProps) {
  const colors = useThemeColor();
  const c = card?.collectionCard || card;
  const rarity = c?.rarity || 'COMMON';

  const rarityColor = (() => {
    switch (rarity) {
      case 'COMMON': return colors.rarityCommon;
      case 'RARE': return colors.rarityRare;
      case 'EPIC': return colors.rarityEpic;
      case 'LEGENDARY': return colors.rarityLegendary;
      default: return colors.rarityCommon;
    }
  })();

  useEffect(() => {
    triggerHaptics(rarity);
  }, []);

  return (
    <Pressable
      testID="card-drop-reveal-root"
      onPress={onDismiss}
      style={[StyleSheet.absoluteFill, styles.container, { backgroundColor: 'rgba(0,0,0,0.85)' }]}
    >
      <View style={styles.centerStage}>
        <Text style={[styles.celebrationText, { color: rarityColor }]}>
          {rarity === 'LEGENDARY' ? 'ЛЕГЕНДАРНАЯ КАРТА!' : rarity === 'EPIC' ? 'ЭПИЧЕСКАЯ КАРТА!' : 'НОВАЯ КАРТА!'}
        </Text>
        <View testID="card-front" style={[styles.cardWrapper]}>
          <View style={[styles.cardSurface, { borderColor: rarityColor, backgroundColor: colors.surfaceContainerLowest }]}>
            <View style={[styles.glowOverlay, { backgroundColor: rarityColor }]} />
            <View style={[styles.rarityBadge, { backgroundColor: rarityColor }]}>
              <Text style={styles.rarityBadgeText}>{getRarityName(rarity)}</Text>
            </View>
            <View style={styles.cardItemIcon}>
              <MaterialIcons name={(c?.brandIcon as any) || 'style'} size={48} color={rarityColor} />
            </View>
            <Text style={styles.cardName}>{c?.name || 'Неизвестно'}</Text>
            <Text style={styles.cardBrand}>{c?.brandName || 'Банк'}</Text>
            <View style={styles.cardStats}>
              <View style={styles.statRow}>
                <MaterialIcons name="favorite" size={14} color="#22c55e" />
                <Text style={styles.statText}>100%</Text>
              </View>
              <View style={styles.statRow}>
                <MaterialIcons name="percent" size={14} color={colors.primary} />
                <Text style={styles.statText}>{c?.cashbackPercent || 0}%</Text>
              </View>
            </View>
          </View>
        </View>
        <View style={styles.actionsContainer}>
          <Text style={styles.instructionText}>Эта карта добавлена в вашу коллекцию.</Text>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary }]}
            onPress={() => { if (onEquip) onEquip(); else onDismiss(); }}
          >
            <Text style={styles.buttonText}>Экипировать сейчас</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary, { borderColor: colors.outlineVariant }]}
            onPress={onDismiss}
          >
            <Text style={[styles.buttonText, { color: colors.onSurface }]}>Закрыть</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Pressable>
  );
}

export default function CardDropReveal({ card, onDismiss, onEquip }: CardDropRevealProps) {
  const colors = useThemeColor();
  const reducedMotion = useReducedMotion();

  // D-02 — leak-prevention seatbelt; cancelAnimation fires on unmount.
  const register = useCancellableAnimation();

  // 10 SVs registered with adjacency on the same line (Phase-6 D-02).
  const bgOpacity         = register(useSharedValue(0));
  const orbTranslateY     = register(useSharedValue(200));
  const orbScale          = register(useSharedValue(0.1));
  const cardRotateY       = register(useSharedValue(0)); // 0 to 1
  const cardScale         = register(useSharedValue(0.2));
  const cardTranslateY    = register(useSharedValue(100));
  const burstOpacity      = register(useSharedValue(0));
  const burstScale        = register(useSharedValue(0.5));
  const detailsOpacity    = register(useSharedValue(0));
  const detailsTranslateY = register(useSharedValue(20));

  const [phase, setPhase] = useState<Phase>('IDLE');
  const phaseRef = useRef<Phase>('IDLE');
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const c = card?.collectionCard || card;
  const rarity: string = c?.rarity || 'COMMON';

  const getRarityCol = (r: string) => {
    switch (r) {
      case 'COMMON': return colors.rarityCommon;
      case 'RARE': return colors.rarityRare;
      case 'EPIC': return colors.rarityEpic;
      case 'LEGENDARY': return colors.rarityLegendary;
      default: return colors.rarityCommon;
    }
  };

  const rarityColor = getRarityCol(rarity);

  // D-01 — worklet timeline; setPhase + triggerHaptics fire ONLY at completion via runOnJS.
  // Reduced-motion path skips this effect entirely (early-return below).
  useEffect(() => {
    if (reducedMotion) return;

    setPhase('DROP');

    // Stage 1 — orbital rise (0.0s -> 0.5s)
    bgOpacity.value = withTiming(1, { duration: 500 });
    orbTranslateY.value = withTiming(0, { duration: 600 });
    orbScale.value = withSpring(1, { damping: 12 });
    cardTranslateY.value = withTiming(0, { duration: 600 });
    cardScale.value = withSpring(0.8, { damping: 14 });

    // Stage 2 — flip reveal (delay 600ms). Both SVs use withDelay(600, ...).
    cardRotateY.value = withDelay(600, withSpring(1, { damping: 14, stiffness: 60 }, (finished) => {
      'worklet';
      if (finished) runOnJS(setPhase)('REVEAL');
    }));
    cardScale.value = withDelay(600, withSequence(
      withTiming(1.1, { duration: 300 }),
      withSpring(1, { damping: 10 }),
    ));

    // Stage 3 — burst (delay 1200ms); haptic fires once at burst peak.
    burstOpacity.value = withDelay(1200, withSequence(
      withTiming(1, { duration: 200 }, (finished) => {
        'worklet';
        if (finished) runOnJS(triggerHaptics)(rarity);
      }),
      withTiming(0, { duration: 500 }),
    ));
    burstScale.value = withDelay(1200, withTiming(2.5, { duration: 400 }));

    // Stage 4 — details (delay 1600ms); transitions to DONE at completion.
    detailsOpacity.value = withDelay(1600, withTiming(1, { duration: 400 }, (finished) => {
      'worklet';
      if (finished) runOnJS(setPhase)('DONE');
    }));
    detailsTranslateY.value = withDelay(1600, withTiming(0, { duration: 400 }));
  }, [reducedMotion]);

  // D-07 skip handler — fast-forward during DROP/REVEAL; dismiss during DONE.
  // Each SV is cancelled individually to avoid storing an array of SharedValues
  // in a ref, which causes "Tried to modify key N" worklet mutation warnings.
  const handleSkip = useCallback(() => {
    const cur = phaseRef.current;
    if (cur === 'DONE') {
      onDismiss();
      return;
    }
    // Cancel all in-flight animations individually.
    cancelAnimation(bgOpacity);
    cancelAnimation(orbTranslateY);
    cancelAnimation(orbScale);
    cancelAnimation(cardRotateY);
    cancelAnimation(cardScale);
    cancelAnimation(cardTranslateY);
    cancelAnimation(burstOpacity);
    cancelAnimation(burstScale);
    cancelAnimation(detailsOpacity);
    cancelAnimation(detailsTranslateY);
    // Jump to final state.
    bgOpacity.value = 1;
    cardRotateY.value = 1;
    cardScale.value = 1;
    cardTranslateY.value = 0;
    orbTranslateY.value = 0;
    orbScale.value = 1;
    detailsOpacity.value = 1;
    detailsTranslateY.value = 0;
    // Fire burst + haptic once.
    burstOpacity.value = withSequence(
      withTiming(1, { duration: 80 }),
      withTiming(0, { duration: 200 }),
    );
    burstScale.value = withTiming(2.5, { duration: 200 });
    triggerHaptics(rarity);
    setPhase('DONE');
  }, [onDismiss, rarity]);

  if (reducedMotion) {
    return <ReducedMotionReveal card={card} onDismiss={onDismiss} onEquip={onEquip} />;
  }

  const bgStyle = useAnimatedStyle(() => ({
    opacity: bgOpacity.value,
    backgroundColor: 'rgba(0,0,0,0.85)',
  }));

  const cardContainerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: cardTranslateY.value },
      { scale: cardScale.value },
    ],
  }));

  const cardFrontStyle = useAnimatedStyle(() => {
    const rotate = interpolate(cardRotateY.value, [0, 1], [180, 360], Extrapolation.CLAMP);
    return {
      transform: [{ perspective: 1000 }, { rotateY: `${rotate}deg` }],
      backfaceVisibility: 'hidden',
    };
  });

  const cardBackStyle = useAnimatedStyle(() => {
    const rotate = interpolate(cardRotateY.value, [0, 1], [0, 180], Extrapolation.CLAMP);
    return {
      transform: [{ perspective: 1000 }, { rotateY: `${rotate}deg` }],
      backfaceVisibility: 'hidden',
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
    };
  });

  const burstStyle = useAnimatedStyle(() => ({
    opacity: burstOpacity.value,
    transform: [{ scale: burstScale.value }],
  }));

  const detailsStyle = useAnimatedStyle(() => ({
    opacity: detailsOpacity.value,
    transform: [{ translateY: detailsTranslateY.value }],
  }));

  return (
    <Pressable
      testID="card-drop-reveal-root"
      onPress={handleSkip}
      style={[StyleSheet.absoluteFill, styles.container]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, bgStyle]} />

      <Animated.View style={[styles.burstEffect, { backgroundColor: rarityColor }, burstStyle]} />

      <View style={styles.centerStage} pointerEvents="box-none">
        {phase === 'DONE' && (
          <Animated.Text style={[styles.celebrationText, { color: rarityColor }, detailsStyle]}>
            {rarity === 'LEGENDARY' ? 'ЛЕГЕНДАРНАЯ КАРТА!' : rarity === 'EPIC' ? 'ЭПИЧЕСКАЯ КАРТА!' : 'НОВАЯ КАРТА!'}
          </Animated.Text>
        )}

        <Animated.View testID="card-stage" style={[styles.cardWrapper, cardContainerStyle]}>
          {/* Back of Card */}
          <Animated.View style={[styles.cardSurface, styles.cardBack, { borderColor: colors.outlineVariant }, cardBackStyle]}>
            <MaterialIcons name="monetization-on" size={64} color={colors.outlineVariant} />
          </Animated.View>

          {/* Front of Card */}
          <Animated.View testID="card-front" style={[styles.cardSurface, { borderColor: rarityColor, backgroundColor: colors.surfaceContainerLowest }, cardFrontStyle]}>
            <View style={[styles.glowOverlay, { backgroundColor: rarityColor }]} />

            <View style={[styles.rarityBadge, { backgroundColor: rarityColor }]}>
              <Text style={styles.rarityBadgeText}>{getRarityName(rarity)}</Text>
            </View>

            <View style={styles.cardItemIcon}>
              <MaterialIcons name={(c?.brandIcon as any) || 'style'} size={48} color={rarityColor} />
            </View>

            <Text style={styles.cardName}>{c?.name || 'Неизвестно'}</Text>
            <Text style={styles.cardBrand}>{c?.brandName || 'Банк'}</Text>

            <View style={styles.cardStats}>
              <View style={styles.statRow}>
                <MaterialIcons name="favorite" size={14} color="#22c55e" />
                <Text style={styles.statText}>100%</Text>
              </View>
              <View style={styles.statRow}>
                <MaterialIcons name="percent" size={14} color={colors.primary} />
                <Text style={styles.statText}>{c?.cashbackPercent || 0}%</Text>
              </View>
            </View>

            {/* D-09 — rarity-tier overlays mounted conditionally; Common mounts none. */}
            {rarity === 'RARE' && <RareShimmer color={rarityColor} register={register} />}
            {rarity === 'EPIC' && <EpicParticles color={rarityColor} register={register} />}
            {rarity === 'LEGENDARY' && <LegendaryGlow color={rarityColor} register={register} />}
          </Animated.View>
        </Animated.View>

        <Animated.View style={[styles.actionsContainer, detailsStyle]}>
          <Text style={styles.instructionText}>Эта карта добавлена в вашу коллекцию.</Text>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary }]}
            onPress={() => { if (onEquip) onEquip(); else onDismiss(); }}
          >
            <Text style={styles.buttonText}>Экипировать сейчас</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary, { borderColor: colors.outlineVariant }]}
            onPress={onDismiss}
          >
            <Text style={[styles.buttonText, { color: colors.onSurface }]}>Закрыть</Text>
          </TouchableOpacity>
        </Animated.View>

      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    zIndex: 9999,
    elevation: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerStage: {
    width: width,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  burstEffect: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 40,
    elevation: 20,
  },
  celebrationText: {
    fontSize: 24,
    fontFamily: 'Manrope-ExtraBold',
    textAlign: 'center',
    marginBottom: 40,
    letterSpacing: -0.5,
    textTransform: 'uppercase',
  },
  cardWrapper: {
    width: 220,
    height: 320,
    position: 'relative',
  },
  cardSurface: {
    width: '100%',
    height: '100%',
    borderRadius: BorderRadius.xl,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
    ...Shadows.xl,
    overflow: 'hidden',
  },
  cardBack: {
    backgroundColor: '#1E293B',
  },
  glowOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 6,
    opacity: 0.8,
  },
  rarityBadge: {
    position: 'absolute',
    top: 12, left: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  rarityBadgeText: {
    fontSize: 10,
    fontFamily: 'Manrope-ExtraBold',
    color: '#131313',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  cardItemIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(128,128,128,0.1)',
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center', marginVertical: 12,
  },
  cardName: {
    fontSize: 20, fontFamily: 'Manrope-ExtraBold', color: '#fff', textAlign: 'center',
  },
  cardBrand: {
    fontSize: 14, color: '#94a3b8', textAlign: 'center', fontFamily: 'Manrope-Medium', marginTop: 4,
  },
  cardStats: {
    flexDirection: 'row', justifyContent: 'space-around', width: '100%',
    marginTop: 'auto', paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)',
  },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statText: { fontSize: 14, fontFamily: 'Manrope-Bold', color: '#cbd5e1' },

  actionsContainer: {
    marginTop: 60,
    width: '100%',
    gap: Spacing.md,
  },
  instructionText: {
    color: '#94a3b8',
    fontFamily: 'Manrope-Medium',
    textAlign: 'center',
    marginBottom: 8,
  },
  button: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    ...Shadows.md,
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 2,
  },
  buttonText: {
    color: '#fff',
    fontFamily: 'Manrope-ExtraBold',
    fontSize: 16,
  },
});

// Suppress unused import warning for Fonts (kept for future extensions / parity).
void Fonts;

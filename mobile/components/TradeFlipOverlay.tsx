// ANIM-08 — synchronized trade animation overlay.
// SENDER: card-flip-OUT (rotateY 0 → 90, disappears)
// RECIPIENT: card-flip-IN (rotateY -90 → 0, appears)
//
// ANIM-10 compliance: when useReducedMotion() is true the flip is replaced
// by a simple opacity fade. No motion blocks completion.
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  runOnJS,
} from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useThemeColor } from '../hooks/useThemeColor';
import { BorderRadius, Shadows } from '../constants/theme';
import type { TradeAnimPayload } from '../hooks/useTradeAnimationListener';

interface Props {
  payload: TradeAnimPayload;
  onDone: () => void;
}

export function TradeFlipOverlay({ payload, onDone }: Props) {
  const colors = useThemeColor();
  const reducedMotion = useReducedMotion();

  const opacity = useSharedValue(0);
  const rotateY = useSharedValue(payload.role === 'SENDER' ? 0 : -90);
  const cardScale = useSharedValue(0.9);

  useEffect(() => {
    if (reducedMotion) {
      // ANIM-10: fade-only path — no flip, no spring.
      opacity.value = withSequence(
        withTiming(1, { duration: 250 }),
        withDelay(
          1200,
          withTiming(0, { duration: 250 }, (done) => {
            'worklet';
            if (done) runOnJS(onDone)();
          }),
        ),
      );
      return;
    }

    // Full animation path.
    opacity.value = withTiming(1, { duration: 200 });
    cardScale.value = withTiming(1, { duration: 300 });

    if (payload.role === 'SENDER') {
      // Flip OUT: card rotates away (0 → 90 deg).
      rotateY.value = withDelay(
        400,
        withTiming(90, { duration: 450 }, (done) => {
          'worklet';
          if (done) runOnJS(onDone)();
        }),
      );
    } else {
      // Flip IN: card rotates into view (-90 → 0 deg).
      rotateY.value = withDelay(
        400,
        withTiming(0, { duration: 450 }, (done) => {
          'worklet';
          if (done) runOnJS(onDone)();
        }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bgStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1000 },
      { rotateY: `${rotateY.value}deg` },
      { scale: cardScale.value },
    ],
  }));

  const card =
    payload.role === 'SENDER' ? payload.outgoingCard : payload.incomingCard;

  return (
    <Pressable
      onPress={onDone}
      style={[StyleSheet.absoluteFill, styles.root]}
      testID="trade-flip-overlay"
    >
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.backdrop, bgStyle]}
      />
      <View style={styles.center}>
        <Text style={[styles.label, { color: colors.onBackground ?? '#fff' }]}>
          {payload.role === 'SENDER' ? '🃏 Карта отправлена' : '🎉 Карта получена!'}
        </Text>
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: colors.surfaceContainerLowest ?? colors.surface,
              borderColor: colors.primary,
            },
            cardStyle,
          ]}
        >
          <MaterialIcons
            name={(card?.brandIcon as any) ?? 'style'}
            size={48}
            color={colors.primary}
          />
          <Text style={[styles.cardName, { color: colors.onSurface ?? colors.text }]}>
            {card?.name ?? '—'}
          </Text>
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    zIndex: 9998,
    elevation: 9998,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.75)' },
  center: { alignItems: 'center', gap: 24 },
  label: {
    fontSize: 22,
    fontFamily: 'Manrope-ExtraBold',
    textAlign: 'center',
  },
  card: {
    width: 200,
    height: 280,
    borderRadius: BorderRadius.xl ?? 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 16,
    ...Shadows.xl ?? Shadows.lg,
  },
  cardName: {
    fontSize: 18,
    fontFamily: 'Manrope-Bold',
    textAlign: 'center',
  },
});

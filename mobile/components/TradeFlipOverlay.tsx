// ANIM-08 — synchronized trade animation overlay.
// SENDER: card-flip-OUT (rotateY 0 → 90, disappears)
// RECIPIENT: card-flip-IN (rotateY -90 → 0, appears)
//
// ANIM-10 compliance: when useReducedMotion() is true the flip is replaced
// by a simple opacity fade. No motion blocks completion.
//
// Worklets note: `payload` is a Zustand-derived object that Reanimated
// serialises for the UI thread. To avoid "Tried to modify key N of an
// object which has been passed to a worklet" warnings, all fields are
// snapshotted into local consts before being used in shared-value init
// or JSX. The original prop object is never mutated after that point.
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

  // Snapshot payload fields into local consts BEFORE any shared-value
  // initialisation so Reanimated never sees a mutation on the frozen object.
  const role = payload.role;
  const card = role === 'SENDER' ? payload.outgoingCard : payload.incomingCard;
  const cardName = card?.name ?? '—';
  const cardIcon = (card?.brandIcon as any) ?? 'style';
  const label = role === 'SENDER' ? '🃏 Карта отправлена' : '🎉 Карта получена!';
  const initialRotateY = role === 'SENDER' ? 0 : -90;

  const opacity = useSharedValue(0);
  const rotateY = useSharedValue(initialRotateY);
  const cardScale = useSharedValue(0.9);

  useEffect(() => {
    if (reducedMotion) {
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

    opacity.value = withTiming(1, { duration: 200 });
    cardScale.value = withTiming(1, { duration: 300 });

    if (role === 'SENDER') {
      rotateY.value = withDelay(
        400,
        withTiming(90, { duration: 450 }, (done) => {
          'worklet';
          if (done) runOnJS(onDone)();
        }),
      );
    } else {
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
          {label}
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
            name={cardIcon}
            size={48}
            color={colors.primary}
          />
          <Text style={[styles.cardName, { color: colors.onSurface ?? colors.onBackground }]}>
            {cardName}
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

// Plan 04-01 D-04 — Skeleton compound (Card/Row/Avatar/Text). Reanimated 4
// shimmer worklet; reduced-motion gate via useReducedMotion (Phase-5 stub).
// Worklet does NOT import useStore (CLAUDE.md lock).
import React, { useEffect } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { Spacing, BorderRadius } from '../constants/theme';
import { useThemeColor } from '../hooks/useThemeColor';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface SkeletonBaseProps {
  style?: ViewStyle | ViewStyle[];
  width?: number | string;
  height?: number;
  radius?: number;
}

function SkeletonBase({ style, width, height = 16, radius = BorderRadius.sm }: SkeletonBaseProps) {
  const colors = useThemeColor();
  const reduced = useReducedMotion();
  const x = useSharedValue(0);

  useEffect(() => {
    if (!reduced) {
      x.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.linear }), -1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [0, 0.5, 1], [0.4, 0.8, 0.4]),
  }));

  return (
    <View
      style={[
        {
          width: width as any,
          height,
          borderRadius: radius,
          backgroundColor: colors.surfaceContainerHigh,
          overflow: 'hidden',
        },
        style as any,
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: colors.surfaceContainerHighest },
          shimmerStyle,
        ]}
      />
    </View>
  );
}

function SkeletonCard({ style }: { style?: ViewStyle }) {
  return <SkeletonBase style={style} width="100%" height={96} radius={BorderRadius.base} />;
}
function SkeletonRow({ style }: { style?: ViewStyle }) {
  return <SkeletonBase style={style} width="100%" height={16} />;
}
function SkeletonAvatar({ style }: { style?: ViewStyle }) {
  return <SkeletonBase style={style} width={40} height={40} radius={20} />;
}
function SkeletonText({ style, width = '70%' }: { style?: ViewStyle; width?: number | string }) {
  return <SkeletonBase style={style} width={width} height={14} />;
}

export const Skeleton = Object.assign(SkeletonBase, {
  Card: SkeletonCard,
  Row: SkeletonRow,
  Avatar: SkeletonAvatar,
  Text: SkeletonText,
});

export default Skeleton;

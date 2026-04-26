// Plan 04-01 D-09 — OfflineBanner. Sticky red banner while offline; on
// transition false→true shows "Связь восстановлена" success toast for 3s.
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Fonts, Spacing } from '../constants/theme';
import { useStore } from '../stores/useStore';

const BANNER_HEIGHT = 32;

export function OfflineBanner() {
  const isOnline = useStore((s) => s.network.isOnline);
  const prevOnline = useRef(isOnline);
  const ty = useSharedValue(isOnline ? -BANNER_HEIGHT * 2 : 0);

  useEffect(() => {
    if (!isOnline) {
      ty.value = withSpring(0, { damping: 18, stiffness: 200 });
    } else {
      ty.value = withTiming(-BANNER_HEIGHT * 2, { duration: 200 });
    }
    if (prevOnline.current === false && isOnline === true) {
      try {
        useStore.getState().toast.show('Связь восстановлена', 'success', {
          key: 'net_restored',
          autoDismissMs: 3000,
        });
      } catch {
        // best-effort
      }
    }
    prevOnline.current = isOnline;
  }, [isOnline]);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }));

  if (isOnline && prevOnline.current === isOnline) return null;

  return (
    <Animated.View
      style={[styles.banner, animStyle]}
      pointerEvents="none"
      accessibilityLiveRegion="polite"
    >
      <Text style={styles.text}>Нет связи с сервером</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#ef4444',
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  text: {
    color: '#ffffff',
    fontSize: Fonts.sizes.md,
    fontFamily: 'Manrope-Medium',
  },
});

export default OfflineBanner;

// Plan 04-01 D-01/D-02 — Toast + ToastHost. Auto-dismiss 4s; tap-to-dismiss;
// driven by useStore.toast.queue. Russian copy; ALERT_CONFIG palette extracted
// from AppAlert.tsx (success/error/warning/info; confirm migrated to ConfirmDialog).
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Fonts, Spacing, BorderRadius } from '../constants/theme';
import { useStore, ToastEntry, ToastType } from '../stores/useStore';

type ToastConfigEntry = {
  icon: keyof typeof MaterialIcons.glyphMap;
  bgColor: string;
  lightBg: string;
  darkBg: string;
  haptic: Haptics.NotificationFeedbackType | null;
};

export const TOAST_CONFIG: Record<ToastType, ToastConfigEntry> = {
  success: {
    icon: 'check-circle',
    bgColor: '#22c55e',
    lightBg: '#f0fdf4',
    darkBg: '#052e16',
    haptic: Haptics.NotificationFeedbackType.Success,
  },
  error: {
    icon: 'cancel',
    bgColor: '#ef4444',
    lightBg: '#fef2f2',
    darkBg: '#2d0a0a',
    haptic: Haptics.NotificationFeedbackType.Error,
  },
  warning: {
    icon: 'warning',
    bgColor: '#f59e0b',
    lightBg: '#fffbeb',
    darkBg: '#2d1a00',
    haptic: Haptics.NotificationFeedbackType.Warning,
  },
  info: {
    icon: 'info',
    bgColor: '#3b82f6',
    lightBg: '#eff6ff',
    darkBg: '#0a1628',
    haptic: null,
  },
};

const DEFAULT_AUTO_DISMISS_MS = 4000;

export interface ToastProps {
  entry: ToastEntry;
  onDismiss: (key: string) => void;
}

export function Toast({ entry, onDismiss }: ToastProps) {
  const config = TOAST_CONFIG[entry.type];
  const opacity = useSharedValue(0);
  const ty = useSharedValue(-20);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 220 });
    ty.value = withSpring(0, { damping: 14, stiffness: 220, mass: 0.8 });
    if (config.haptic) {
      Haptics.notificationAsync(config.haptic).catch(() => undefined);
    }
    const ms = entry.autoDismissMs ?? DEFAULT_AUTO_DISMISS_MS;
    const t = setTimeout(() => onDismiss(entry.key), ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: ty.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.toast,
        { backgroundColor: config.lightBg, borderColor: config.bgColor },
        cardStyle,
      ]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Pressable
        style={styles.pressable}
        onPress={() => onDismiss(entry.key)}
        accessibilityLabel="Закрыть уведомление"
      >
        <MaterialIcons name={config.icon as any} size={20} color={config.bgColor} />
        <View style={styles.body}>
          <Text style={[styles.message, { color: config.darkBg }]} numberOfLines={4}>
            {entry.message}
          </Text>
          {entry.type === 'error' && entry.requestId ? (
            <Text style={[styles.requestId, { color: config.bgColor }]}>
              {`Код запроса: ${entry.requestId}`}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function ToastHost() {
  const queue = useStore((s) => s.toast.queue);
  const hide = useStore((s) => s.toast.hide);
  return (
    <View pointerEvents="box-none" style={styles.host}>
      {queue.map((entry) => (
        <Toast key={entry.key} entry={entry} onDismiss={hide} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 48,
    left: Spacing.base,
    right: Spacing.base,
    zIndex: 9999,
    gap: Spacing.sm,
  },
  toast: {
    borderRadius: BorderRadius.base,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  pressable: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  message: {
    fontSize: Fonts.sizes.md,
    fontFamily: 'Manrope-Medium',
    lineHeight: 21,
  },
  requestId: {
    fontSize: Fonts.sizes.sm,
    fontFamily: 'Manrope-Medium',
  },
});

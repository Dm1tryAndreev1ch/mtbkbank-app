import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
  Pressable,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Fonts, Spacing, BorderRadius } from '../constants/theme';

export type AppAlertType = 'success' | 'error' | 'warning' | 'info' | 'confirm';

export interface AppAlertButton {
  text: string;
  onPress?: () => void;
}

export interface AppAlertProps {
  visible: boolean;
  type?: AppAlertType;
  title: string;
  message?: string;
  /** Primary / confirm button */
  confirmButton?: AppAlertButton;
  /** Cancel button (shown only for `confirm` type) */
  cancelButton?: AppAlertButton;
  /** Called when the alert is dismissed by any means */
  onDismiss: () => void;
  /** Auto-close after N ms (not for `confirm` type) */
  autoDismissMs?: number;
  colors: any;
}

const ALERT_CONFIG: Record<
  AppAlertType,
  {
    icon: string;
    bgColor: string;
    lightBg: string;
    darkBg: string;
    haptic: Haptics.NotificationFeedbackType | null;
  }
> = {
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
  confirm: {
    icon: 'help-outline',
    bgColor: '#8b5cf6',
    lightBg: '#f5f3ff',
    darkBg: '#1a0a2e',
    haptic: null,
  },
};

const { width } = Dimensions.get('window');

/** Пульсирующее кольцо при появлении иконки */
const PulseRing = ({ color }: { color: string }) => {
  const scale = useSharedValue(0.8);
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    scale.value = withSpring(1.35, { damping: 8, stiffness: 80, mass: 0.8 });
    opacity.value = withTiming(0, { duration: 600 });
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: 88,
          height: 88,
          borderRadius: 44,
          borderWidth: 2.5,
          borderColor: color,
        },
        style,
      ]}
    />
  );
};

/** Частицы для success-алерта */
const Particle = ({ delay, color }: { delay: number; color: string }) => {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0);

  useEffect(() => {
    const rx = (Math.random() - 0.5) * 120;
    const ry = -(Math.random() * 80 + 40);
    const timer = setTimeout(() => {
      opacity.value = withTiming(1, { duration: 200 });
      scale.value = withSpring(1);
      tx.value = withTiming(rx, { duration: 800 });
      ty.value = withTiming(ry, { duration: 800 });
      const fadeTimer = setTimeout(() => {
        opacity.value = withTiming(0, { duration: 400 });
      }, 500);
      return () => clearTimeout(fadeTimer);
    }, delay);
    return () => clearTimeout(timer);
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[{ position: 'absolute' }, style]}>
      <Text style={{ color, fontSize: 12 }}>✦</Text>
    </Animated.View>
  );
};

export default function AppAlert({
  visible,
  type = 'info',
  title,
  message,
  confirmButton,
  cancelButton,
  onDismiss,
  autoDismissMs,
  colors,
}: AppAlertProps) {
  const config = ALERT_CONFIG[type];
  const isDark = colors.isDark || colors.background === '#0f1117';
  const isConfirm = type === 'confirm';

  const scale = useSharedValue(0.7);
  const opacity = useSharedValue(0);
  const ty = useSharedValue(30);

  // Тактильный отклик при появлении
  useEffect(() => {
    if (visible && config.haptic) {
      Haptics.notificationAsync(config.haptic).catch(() => {});
    }
  }, [visible]);

  // Анимация появления / скрытия
  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 220 });
      scale.value = withSpring(1, { damping: 14, stiffness: 220, mass: 0.8 });
      ty.value = withSpring(0, { damping: 14, stiffness: 220 });
    } else {
      opacity.value = withTiming(0, { duration: 160 });
      scale.value = withTiming(0.88, { duration: 160 });
      ty.value = withTiming(16, { duration: 160 });
    }
  }, [visible]);

  // Авто-закрытие
  useEffect(() => {
    if (visible && autoDismissMs && !isConfirm) {
      const t = setTimeout(onDismiss, autoDismissMs);
      return () => clearTimeout(t);
    }
  }, [visible, autoDismissMs, isConfirm]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: ty.value }],
    opacity: opacity.value,
  }));

  if (!visible) return null;

  const confirmLabel = confirmButton?.text ?? (isConfirm ? 'Подтвердить' : 'Понятно');
  const cancelLabel = cancelButton?.text ?? 'Отмена';
  const borderColor = `${config.bgColor}40`;

  return (
    <Modal
      transparent
      visible={visible}
      statusBarTranslucent
      animationType="none"
      accessibilityViewIsModal
      onRequestClose={isConfirm ? undefined : onDismiss}
    >
      {/* Backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, overlayStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={isConfirm ? undefined : onDismiss}
          accessibilityLabel="Закрыть"
        />
      </Animated.View>

      {/* Card */}
      <View style={styles.center} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: isDark ? colors.surfaceContainerLow ?? '#1a1a2e' : '#ffffff',
              borderColor,
              shadowColor: config.bgColor,
            },
            cardStyle,
          ]}
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
        >
          {/* Акцентная полоска */}
          <View style={[styles.topBar, { backgroundColor: config.bgColor }]} />

          {/* Иконка */}
          <View style={styles.iconArea}>
            <PulseRing color={config.bgColor} />
            {type === 'success' &&
              [0, 100, 200, 300].map((d, i) => (
                <Particle key={i} delay={d} color={config.bgColor} />
              ))}
            <View style={[styles.iconCircle, { backgroundColor: `${config.bgColor}20` }]}>
              <View style={[styles.iconInner, { backgroundColor: `${config.bgColor}30` }]}>
                <MaterialIcons name={config.icon as any} size={36} color={config.bgColor} />
              </View>
            </View>
          </View>

          {/* Заголовок */}
          <Text
            style={[styles.title, { color: isDark ? '#ffffff' : '#0f172a' }]}
            accessibilityRole="header"
          >
            {title}
          </Text>

          {/* Сообщение */}
          {!!message && (
            <Text style={[styles.message, { color: isDark ? '#94a3b8' : '#64748b' }]}>
              {message}
            </Text>
          )}

          {/* Разделитель */}
          <View
            style={[styles.divider, { backgroundColor: isDark ? '#ffffff12' : '#0000000a' }]}
          />

          {/* Кнопки */}
          {isConfirm ? (
            <View style={styles.btnRow}>
              <TouchableOpacity
                style={[
                  styles.btnBase,
                  styles.btnCancel,
                  {
                    backgroundColor: isDark ? '#ffffff12' : '#f1f5f9',
                    borderColor: isDark ? '#ffffff20' : '#e2e8f0',
                  },
                ]}
                onPress={() => { cancelButton?.onPress?.(); onDismiss(); }}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={cancelLabel}
              >
                <Text style={[styles.btnCancelText, { color: isDark ? '#94a3b8' : '#64748b' }]}>
                  {cancelLabel}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btnBase, styles.btnPrimary, { backgroundColor: config.bgColor }]}
                onPress={() => { confirmButton?.onPress?.(); onDismiss(); }}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={confirmLabel}
              >
                <MaterialIcons name="check" size={18} color="#fff" />
                <Text style={styles.btnPrimaryText}>{confirmLabel}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.btnSingle, { backgroundColor: config.bgColor }]}
              onPress={() => { confirmButton?.onPress?.(); onDismiss(); }}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
            >
              <Text style={styles.btnSingleText}>{confirmLabel}</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: '#00000070' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 28,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.25,
    shadowRadius: 40,
    elevation: 20,
    paddingBottom: Spacing.xl,
  },
  topBar: { height: 4, width: '100%' },
  iconArea: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing.base,
    height: 96,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontFamily: 'Manrope-ExtraBold',
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  message: {
    fontSize: 14,
    fontFamily: 'Manrope-Medium',
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: Spacing.xl,
    marginBottom: 4,
  },
  divider: {
    height: 1,
    marginHorizontal: Spacing.xl,
    marginVertical: Spacing.lg,
    borderRadius: 1,
  },
  btnRow: { flexDirection: 'row', gap: 10, paddingHorizontal: Spacing.xl },
  btnBase: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: BorderRadius.base,
    gap: 6,
  },
  btnCancel: { borderWidth: 1.5 },
  btnCancelText: { fontFamily: 'Manrope-Bold', fontSize: 15 },
  btnPrimary: {},
  btnPrimaryText: { color: '#fff', fontFamily: 'Manrope-ExtraBold', fontSize: 15 },
  btnSingle: {
    marginHorizontal: Spacing.xl,
    paddingVertical: 14,
    borderRadius: BorderRadius.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSingleText: {
    color: '#fff',
    fontFamily: 'Manrope-ExtraBold',
    fontSize: 16,
    letterSpacing: 0.2,
  },
});

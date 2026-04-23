import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
  Pressable,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  FadeIn,
  ZoomIn,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Fonts, Spacing, BorderRadius } from '../constants/theme';

export type AppAlertType = 'success' | 'error' | 'warning' | 'info' | 'confirm';

export interface AppAlertProps {
  visible: boolean;
  type?: AppAlertType;
  title: string;
  message?: string;
  buttonText?: string;
  cancelText?: string;
  onClose: () => void;
  onConfirm?: () => void;
  colors: any;
}

const ALERT_CONFIG = {
  success: {
    icon: 'check-circle',
    gradient: ['#22c55e', '#16a34a'],
    bgColor: '#22c55e',
    lightBg: '#f0fdf4',
    darkBg: '#052e16',
    particles: ['✦', '✦', '✦', '✦'],
  },
  error: {
    icon: 'cancel',
    gradient: ['#ef4444', '#dc2626'],
    bgColor: '#ef4444',
    lightBg: '#fef2f2',
    darkBg: '#2d0a0a',
    particles: [],
  },
  warning: {
    icon: 'warning',
    gradient: ['#f59e0b', '#d97706'],
    bgColor: '#f59e0b',
    lightBg: '#fffbeb',
    darkBg: '#2d1a00',
    particles: [],
  },
  info: {
    icon: 'info',
    gradient: ['#3b82f6', '#2563eb'],
    bgColor: '#3b82f6',
    lightBg: '#eff6ff',
    darkBg: '#0a1628',
    particles: [],
  },
  confirm: {
    icon: 'help',
    gradient: ['#8b5cf6', '#7c3aed'],
    bgColor: '#8b5cf6',
    lightBg: '#f5f3ff',
    darkBg: '#1a0a2e',
    particles: [],
  },
} as const;

const { width } = Dimensions.get('window');

// Анимированная частица
const Particle = ({ delay, color }: { delay: number; color: string }) => {
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0);

  useEffect(() => {
    const randomX = (Math.random() - 0.5) * 120;
    const randomY = -(Math.random() * 80 + 40);

    setTimeout(() => {
      opacity.value = withTiming(1, { duration: 200 });
      scale.value = withSpring(1);
      translateX.value = withTiming(randomX, { duration: 800 });
      translateY.value = withTiming(randomY, { duration: 800 });
      setTimeout(() => {
        opacity.value = withTiming(0, { duration: 400 });
      }, 500);
    }, delay);
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[particleStyles.particle, style]}>
      <Text style={{ color, fontSize: 12 }}>✦</Text>
    </Animated.View>
  );
};

const particleStyles = StyleSheet.create({
  particle: { position: 'absolute' },
});

// Пульсирующее кольцо
const PulseRing = ({ color }: { color: string }) => {
  const scale = useSharedValue(0.8);
  const opacity = useSharedValue(0.6);

  useEffect(() => {
    scale.value = withSpring(1.3, {
      damping: 8,
      stiffness: 80,
      mass: 0.8,
    });
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
          borderWidth: 3,
          borderColor: color,
        },
        style,
      ]}
    />
  );
};

export default function AppAlert({
  visible,
  type = 'info',
  title,
  message,
  buttonText = 'Понятно',
  cancelText = 'Отмена',
  onClose,
  onConfirm,
  colors,
}: AppAlertProps) {
  const config = ALERT_CONFIG[type];
  const isDark = colors.background === '#0f1117' || colors.isDark;

  const scale = useSharedValue(0.7);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(30);

  const cardBg = isDark ? config.darkBg : config.lightBg;
  const borderColor = `${config.bgColor}40`;

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 250 });
      scale.value = withSpring(1, {
        damping: 14,
        stiffness: 200,
        mass: 0.8,
      });
      translateY.value = withSpring(0, {
        damping: 14,
        stiffness: 200,
      });
    } else {
      opacity.value = withTiming(0, { duration: 180 });
      scale.value = withTiming(0.85, { duration: 180 });
      translateY.value = withTiming(20, { duration: 180 });
    }
  }, [visible]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!visible) return null;

  const isConfirm = type === 'confirm';

  return (
    <Modal transparent visible={visible} statusBarTranslucent animationType="none">
      {/* Backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, overlayStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={isConfirm ? undefined : onClose} />
      </Animated.View>

      {/* Card */}
      <View style={styles.center} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: isDark ? colors.surfaceContainerLow || '#1a1a2e' : '#ffffff',
              borderColor,
              shadowColor: config.bgColor,
            },
            cardStyle,
          ]}
        >
          {/* Декоративная полоска сверху */}
          <View style={[styles.topBar, { backgroundColor: config.bgColor }]} />

          {/* Иконка с анимацией */}
          <View style={styles.iconArea}>
            <PulseRing color={config.bgColor} />

            {/* Частицы для success */}
            {type === 'success' &&
              [0, 100, 200, 300].map((delay, i) => (
                <Particle key={i} delay={delay} color={config.bgColor} />
              ))}

            <View style={[styles.iconCircle, { backgroundColor: `${config.bgColor}20` }]}>
              <View style={[styles.iconInner, { backgroundColor: `${config.bgColor}30` }]}>
                <MaterialIcons
                  name={config.icon as any}
                  size={36}
                  color={config.bgColor}
                />
              </View>
            </View>
          </View>

          {/* Текст */}
          <Text
            style={[
              styles.title,
              { color: isDark ? '#ffffff' : '#0f172a' },
            ]}
          >
            {title}
          </Text>

          {message ? (
            <Text
              style={[
                styles.message,
                { color: isDark ? '#94a3b8' : '#64748b' },
              ]}
            >
              {message}
            </Text>
          ) : null}

          {/* Разделитель */}
          <View
            style={[
              styles.divider,
              { backgroundColor: isDark ? '#ffffff12' : '#0000000a' },
            ]}
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
                onPress={onClose}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.btnCancelText,
                    { color: isDark ? '#94a3b8' : '#64748b' },
                  ]}
                >
                  {cancelText}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.btnBase,
                  styles.btnPrimary,
                  { backgroundColor: config.bgColor },
                ]}
                onPress={onConfirm ?? onClose}
                activeOpacity={0.85}
              >
                <MaterialIcons name="check" size={18} color="#fff" />
                <Text style={styles.btnPrimaryText}>{buttonText}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.btnSingle, { backgroundColor: config.bgColor }]}
              onPress={onClose}
              activeOpacity={0.85}
            >
              <Text style={styles.btnSingleText}>{buttonText}</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: '#00000070',
  },
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
  topBar: {
    height: 4,
    width: '100%',
  },
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
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: Spacing.xl,
  },
  btnBase: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: BorderRadius.base,
    gap: 6,
  },
  btnCancel: {
    borderWidth: 1.5,
  },
  btnCancelText: {
    fontFamily: 'Manrope-Bold',
    fontSize: 15,
  },
  btnPrimary: {},
  btnPrimaryText: {
    color: '#fff',
    fontFamily: 'Manrope-ExtraBold',
    fontSize: 15,
  },
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
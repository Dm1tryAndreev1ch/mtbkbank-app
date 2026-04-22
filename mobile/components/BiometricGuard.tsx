import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { useStore } from '../stores/useStore';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, {
  FadeIn, FadeOut,
  useSharedValue, useAnimatedStyle,
  withTiming, withSequence,
} from 'react-native-reanimated';
import { Fonts, Spacing, BorderRadius, Shadows } from '../constants/theme';
import { useThemeColor } from '../hooks/useThemeColor';

/**
 * Простая и предсказуемая версия биометрического гуарда:
 * - один запрос биометрии при старте, если есть токен
 * - при успехе: isUnlocked = true и больше не спрашиваем
 * - при неудаче: остаёмся на экране, есть кнопка "Повторить"
 *
 * НЕТ логики AppState, чтобы избежать циклов при переходах inactive/active.
 */
export default function BiometricGuard({ children }: { children: React.ReactNode }) {
  const { token } = useStore();
  const [tokenChecked, setTokenChecked] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [biometricType, setBiometricType] = useState<string>('');
  const colors = useThemeColor();
  const s = useMemo(() => mk(colors), [colors]);

  const lockScale = useSharedValue(1);
  const lockStyle = useAnimatedStyle(() => ({ transform: [{ scale: lockScale.value }] }));
  const shakeX = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }));

  const triggerShake = () => {
    shakeX.value = withSequence(
      withTiming(-10, { duration: 60 }), withTiming(10, { duration: 60 }),
      withTiming(-8, { duration: 60 }), withTiming(8, { duration: 60 }),
      withTiming(0, { duration: 60 }),
    );
  };

  const authenticate = async () => {
    if (isChecking) return;
    setIsChecking(true);
    setFailed(false);

    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) {
        setIsUnlocked(true);
        return;
      }

      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) setBiometricType('face');
      else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) setBiometricType('fingerprint');
      else setBiometricType('pin');

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Войдите в MTBank',
        fallbackLabel: 'Использовать ПИН-код',
        cancelLabel: 'Отмена',
        disableDeviceFallback: false,
      });

      if (result.success) {
        lockScale.value = withSequence(
          withTiming(1.2, { duration: 150 }),
          withTiming(0.9, { duration: 100 }),
          withTiming(1.0, { duration: 100 }),
        );
        setTimeout(() => setIsUnlocked(true), 250);
      } else {
        setFailed(true);
        triggerShake();
      }
    } catch {
      // В случае ошибки не блокируем пользователя навсегда
      setIsUnlocked(true);
    } finally {
      setIsChecking(false);
    }
  };

  // Стартовая проверка: есть ли токен в хранилище
  useEffect(() => {
    SecureStore.getItemAsync('token')
      .then(t => {
        setTokenChecked(true);
        if (t) authenticate();
      })
      .catch(() => setTokenChecked(true));
  }, []);

  // Пока не знаем есть ли токен — ничего не блокируем
  if (!tokenChecked) return <>{children}</>;
  // Нет токена или уже разблокировано — не показываем биометрию
  if (!token || isUnlocked) return <>{children}</>;

  const iconName = biometricType === 'face' ? 'face'
    : biometricType === 'fingerprint' ? 'fingerprint'
    : 'lock-outline';

  return (
    <>
      <View style={[StyleSheet.absoluteFill, { opacity: 0 }]} pointerEvents="none">
        {children}
      </View>
      <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={s.overlay}>
        <View style={s.card}>
          <Animated.View style={[s.iconWrap, lockStyle, shakeStyle]}>
            <MaterialIcons name={iconName as any} size={56} color={colors.primary} />
          </Animated.View>
          <Text style={s.title}>MTBank</Text>
          <Text style={s.subtitle}>
            {isChecking ? 'Проверка...'
              : failed ? 'Не удалось подтвердить личность'
              : biometricType === 'face' ? 'Подтвердите лицом'
              : biometricType === 'fingerprint' ? 'Приложите палец'
              : 'Введите ПИН-код'}
          </Text>
          <TouchableOpacity
            style={[s.btn, isChecking && s.btnDisabled]}
            onPress={authenticate}
            disabled={isChecking}
            activeOpacity={0.8}
          >
            <MaterialIcons name={failed ? 'refresh' : iconName as any} size={20} color={colors.onPrimary} />
            <Text style={s.btnText}>
              {isChecking ? 'Подождите...' : failed ? 'Повторить' : 'Войти'}
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </>
  );
}

const mk = (C: any) => StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.background,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  card: {
    backgroundColor: C.surfaceContainerLowest,
    borderRadius: BorderRadius.xl,
    padding: Spacing['2xl'],
    alignItems: 'center',
    width: '80%',
    borderWidth: 1,
    borderColor: C.transparentBorder,
    ...Shadows.lg,
    gap: Spacing.base,
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: C.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: Fonts.sizes['2xl'],
    fontFamily: 'Manrope-ExtraBold',
    color: C.onSurface,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: Fonts.sizes.base,
    fontFamily: 'Manrope-Medium',
    color: C.onSurfaceVariant,
    textAlign: 'center',
  },
  btn: {
    backgroundColor: C.primary,
    borderRadius: BorderRadius.base,
    paddingVertical: Spacing.base,
    paddingHorizontal: Spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    ...Shadows.primary,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: {
    fontSize: Fonts.sizes.base,
    fontFamily: 'Manrope-ExtraBold',
    color: C.onPrimary,
  },
});

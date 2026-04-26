// mobile/components/BootError.tsx
//
// D-04 — Russian boot-failure screen. Two buttons: «Повторить» retries hydrate, «Выйти» clears
// tokens and routes to /login (escape hatch for corrupted SecureStore). No animations — Phase 5+.
//
// Pure prop-driven render: no Zustand reads, no tokenStore calls, no Reanimated worklets.

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Fonts, Spacing, BorderRadius, Shadows } from '../constants/theme';
import { useThemeColor } from '../hooks/useThemeColor';

interface Props {
  onRetry: () => void;
  onExit: () => void;
}

export default function BootError({ onRetry, onExit }: Props) {
  const colors = useThemeColor();
  const s = useMemo(() => mk(colors), [colors]);

  return (
    <View style={s.root} testID="boot-error">
      <View style={s.card}>
        <View style={s.iconWrap}>
          <MaterialIcons name="error-outline" size={56} color={colors.primary} />
        </View>
        <Text style={s.title}>Не удалось загрузить сессию</Text>
        <Text style={s.subtitle}>Проверьте интернет-соединение или войдите заново</Text>
        <View style={s.buttonRow}>
          <TouchableOpacity
            style={s.primaryBtn}
            onPress={onRetry}
            activeOpacity={0.8}
            testID="boot-error-retry"
            accessibilityLabel="Повторить"
          >
            <MaterialIcons name="refresh" size={20} color={colors.onPrimary} />
            <Text style={s.primaryBtnText}>Повторить</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.secondaryBtn}
            onPress={onExit}
            activeOpacity={0.8}
            testID="boot-error-exit"
            accessibilityLabel="Выйти"
          >
            <Text style={s.secondaryBtnText}>Выйти</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const mk = (C: any) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: C.background,
      alignItems: 'center',
      justifyContent: 'center',
      padding: Spacing.lg,
    },
    card: {
      backgroundColor: C.surfaceContainerLowest,
      borderRadius: BorderRadius.lg,
      padding: Spacing.xl,
      alignItems: 'center',
      maxWidth: 360,
      width: '100%',
      borderWidth: 1,
      borderColor: C.transparentBorder,
      ...Shadows.md,
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
      textAlign: 'center',
      letterSpacing: -0.5,
    },
    subtitle: {
      fontSize: Fonts.sizes.base,
      fontFamily: 'Manrope-Medium',
      color: C.onSurfaceVariant,
      textAlign: 'center',
      marginBottom: Spacing.sm,
    },
    buttonRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
      width: '100%',
      marginTop: Spacing.sm,
    },
    primaryBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.xs,
      backgroundColor: C.primary,
      paddingVertical: Spacing.base,
      paddingHorizontal: Spacing.md,
      borderRadius: BorderRadius.base,
      ...Shadows.primary,
    },
    primaryBtnText: {
      fontSize: Fonts.sizes.base,
      fontFamily: 'Manrope-ExtraBold',
      color: C.onPrimary,
    },
    secondaryBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
      paddingVertical: Spacing.base,
      paddingHorizontal: Spacing.md,
      borderRadius: BorderRadius.base,
      borderWidth: 1,
      borderColor: C.outline,
    },
    secondaryBtnText: {
      fontSize: Fonts.sizes.base,
      fontFamily: 'Manrope-ExtraBold',
      color: C.onSurface,
    },
  });

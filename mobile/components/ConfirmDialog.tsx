// Plan 04-01 D-03 — ConfirmDialog. Extracted from AppAlert.tsx `type='confirm'`
// branch. Destructive primary button (#ef4444) when isDestructive; cancel
// label "Отмена" by default. Manrope-ExtraBold primary; Manrope-Medium cancel.
// Reanimated 4 enter/exit verbatim from AppAlert.
import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Fonts, Spacing, BorderRadius } from '../constants/theme';

export interface ConfirmDialogButton {
  onPress?: () => void;
}

export interface ConfirmDialogProps {
  visible: boolean;
  onDismiss: () => void;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmButton?: ConfirmDialogButton;
  cancelButton?: ConfirmDialogButton;
  isDestructive?: boolean;
  /**
   * Когда true — кнопка подтверждения НЕ вызывает onDismiss автоматически.
   * Используется для сценариев, где подтверждение запускает собственный флоу
   * (анимацию, async-операцию) и управляет закрытием самостоятельно.
   * По умолчанию false (обратная совместимость).
   */
  suppressDismissOnConfirm?: boolean;
}

export function ConfirmDialog({
  visible,
  onDismiss,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Отмена',
  confirmButton,
  cancelButton,
  isDestructive = true,
  suppressDismissOnConfirm = false,
}: ConfirmDialogProps) {
  const scale = useSharedValue(0.7);
  const opacity = useSharedValue(0);
  const ty = useSharedValue(30);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: ty.value }],
    opacity: opacity.value,
  }));

  if (!visible) return null;

  const primaryBg = isDestructive ? '#ef4444' : '#4F8EF7';

  return (
    <Modal transparent visible={visible} statusBarTranslucent animationType="none" accessibilityViewIsModal>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, overlayStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityLabel="Закрыть" />
      </Animated.View>
      <View style={styles.center} pointerEvents="box-none">
        <Animated.View
          style={[styles.card, cardStyle]}
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
        >
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          {!!message && <Text style={styles.message}>{message}</Text>}
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.btnBase, styles.btnCancel]}
              onPress={() => {
                cancelButton?.onPress?.();
                onDismiss();
              }}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
              testID="confirm-dialog-cancel"
            >
              <Text style={styles.btnCancelText}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnBase, styles.btnPrimary, { backgroundColor: primaryBg }]}
              onPress={() => {
                confirmButton?.onPress?.();
                // fix: если suppressDismissOnConfirm=true — НЕ вызываем onDismiss,
                // чтобы не сбросить phase/state до завершения флоу (например,
                // SacrificeOverlay управляет закрытием через onComplete).
                if (!suppressDismissOnConfirm) {
                  onDismiss();
                }
              }}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
              testID="confirm-dialog-confirm"
            >
              <Text style={styles.btnPrimaryText}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
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
    backgroundColor: '#ffffff',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.25,
    shadowRadius: 40,
    elevation: 20,
  },
  title: {
    fontSize: 20,
    fontFamily: 'Manrope-ExtraBold',
    textAlign: 'center',
    color: '#0f172a',
    letterSpacing: -0.3,
    marginBottom: Spacing.sm,
  },
  message: {
    fontSize: 14,
    fontFamily: 'Manrope-Medium',
    textAlign: 'center',
    lineHeight: 21,
    color: '#64748b',
    marginBottom: Spacing.lg,
  },
  btnRow: { flexDirection: 'row', gap: Spacing.sm },
  btnBase: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: BorderRadius.base,
  },
  btnCancel: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
  },
  btnCancelText: {
    fontFamily: 'Manrope-Medium',
    fontSize: 15,
    color: '#64748b',
    letterSpacing: 0.2,
  },
  btnPrimary: {},
  btnPrimaryText: {
    color: '#fff',
    fontFamily: 'Manrope-ExtraBold',
    fontSize: 15,
    letterSpacing: 0.2,
  },
});

export default ConfirmDialog;

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  TouchableWithoutFeedback, Keyboard
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useStore } from '../stores/useStore';
import { Colors, Fonts, Spacing, BorderRadius, Shadows } from '../constants/theme';
import { MaterialIcons } from '@expo/vector-icons';

export default function LoginScreen() {
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { isLoading, loadAll } = useStore();

  const submitLogin = async (p: string, code: string) => {
    if (isSubmitting) return;
    if (!p || code.length !== 4) {
      setError('Введите телефон и 4-значный ПИН');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      // Routing on success is owned by BootGate (Plan 02-07): tokenStore.subscribe
      // (Plan 02-05) flips useStore.isAuthed false→true and BootGate's routing
      // useEffect (deps [state, isAuthed, onboarded]) replaces to /(tabs).
      // login.tsx MUST NOT call router.replace — that would race with BootGate.
      const success = await useStore.getState().login(p, code);
      if (success) {
        loadAll();
      } else {
        setError('Неверный телефон или ПИН-код');
        setPin('');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogin = () => submitLogin(phone, pin);

  const handlePinInput = (digit: string) => {
    if (isSubmitting) return;
    Keyboard.dismiss();
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      if (newPin.length === 4) {
        // Synchronous submit. isSubmitting guards re-entry on rapid taps.
        submitLogin(phone, newPin);
      }
    }
  };

  const handlePinDelete = () => {
    Keyboard.dismiss();
    setPin(pin.slice(0, -1));
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' }}>
            <View style={styles.tabs}>
              <View style={[styles.tab, styles.tabActive]}>
                <Text style={[styles.tabText, styles.tabTextActive]}>Вход</Text>
              </View>
              <TouchableOpacity style={styles.tab} onPress={() => router.push('/register')}>
                <Text style={styles.tabText}>Регистрация</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.logoArea}>
              <View style={styles.logoIcon}>
                <MaterialIcons name="account-balance" size={40} color={Colors.onPrimary} />
              </View>
              <Text style={styles.logoText}>MT-Банк</Text>
            </View>

            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>НОМЕР ТЕЛЕФОНА</Text>
              <TextInput
                style={styles.phoneInput}
                value={phone}
                onChangeText={setPhone}
                placeholder="+7 (900) 123-45-67"
                keyboardType="phone-pad"
                placeholderTextColor={Colors.outlineVariant}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
              />
            </View>

            <View style={styles.pinSection}>
              <Text style={styles.inputLabel}>ПИН-КОД</Text>
              <View style={styles.pinDots}>
                {[0, 1, 2, 3].map((i) => (
                  <View
                    key={i}
                    style={[
                      styles.pinDot,
                      pin.length > i && styles.pinDotFilled,
                    ]}
                  />
                ))}
              </View>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.numpad}>
              {[
                ['1', '2', '3'],
                ['4', '5', '6'],
                ['7', '8', '9'],
                ['', '0', 'del'],
              ].map((row, ri) => (
                <View key={ri} style={styles.numpadRow}>
                  {row.map((digit, di) => (
                    <TouchableOpacity
                      key={di}
                      style={[
                        styles.numpadKey,
                        digit === '' && styles.numpadKeyEmpty,
                      ]}
                      onPress={() => {
                        if (digit === 'del') handlePinDelete();
                        else if (digit !== '') handlePinInput(digit);
                      }}
                      disabled={digit === ''}
                    >
                      {digit === 'del' ? (
                        <MaterialIcons name="backspace" size={24} color={Colors.onSurfaceVariant} />
                      ) : (
                        <Text style={styles.numpadKeyText}>{digit}</Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.loginButton, pin.length < 4 && styles.loginButtonDisabled]}
              onPress={handleLogin}
              disabled={pin.length < 4 || isLoading || isSubmitting}
            >
              {isLoading || isSubmitting ? (
                <ActivityIndicator color={Colors.onPrimary} />
              ) : (
                <Text style={styles.loginButtonText}>Войти</Text>
              )}
            </TouchableOpacity>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { flex: 1, paddingHorizontal: Spacing.xl, justifyContent: 'center', alignItems: 'center' },
  tabs: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: 360,
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: BorderRadius.full,
    padding: 4,
    marginBottom: Spacing.lg,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: BorderRadius.full,
  },
  tabActive: { backgroundColor: Colors.primary },
  tabText: {
    fontSize: Fonts.sizes.sm,
    fontFamily: 'Manrope-Bold',
    color: Colors.onSurfaceVariant,
  },
  tabTextActive: { color: Colors.onPrimary },
  logoArea: { alignItems: 'center', marginBottom: Spacing['3xl'] },
  logoIcon: {
    width: 80, height: 80, borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.base, ...Shadows.primary,
  },
  logoText: { fontSize: Fonts.sizes['3xl'], fontWeight: Fonts.weights.extrabold, color: Colors.onSurface, letterSpacing: -1 },
  inputSection: { width: '100%', marginBottom: Spacing.xl },
  inputLabel: { fontSize: Fonts.sizes.xs, fontWeight: Fonts.weights.bold, color: Colors.primary, letterSpacing: 2, marginBottom: Spacing.sm },
  phoneInput: {
    backgroundColor: Colors.surfaceContainerLowest, borderRadius: BorderRadius.base,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    fontSize: Fonts.sizes.lg, fontWeight: Fonts.weights.semibold,
    color: Colors.onSurface, ...Shadows.sm,
  },
  pinSection: { alignItems: 'center', marginBottom: Spacing.lg },
  pinDots: { flexDirection: 'row', gap: Spacing.base },
  pinDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.surfaceContainerHigh, borderWidth: 2, borderColor: Colors.outlineVariant },
  pinDotFilled: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  error: { color: Colors.error, fontSize: Fonts.sizes.sm, fontWeight: Fonts.weights.bold, marginBottom: Spacing.base },
  numpad: { width: '100%', maxWidth: 280, marginBottom: Spacing.xl },
  numpadRow: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.base, marginBottom: Spacing.sm },
  numpadKey: { width: 72, height: 56, borderRadius: BorderRadius.base, backgroundColor: Colors.surfaceContainerLowest, alignItems: 'center', justifyContent: 'center', ...Shadows.sm },
  numpadKeyEmpty: { backgroundColor: 'transparent', shadowOpacity: 0, elevation: 0 },
  numpadKeyText: { fontSize: Fonts.sizes.xl, fontWeight: Fonts.weights.bold, color: Colors.onSurface },
  loginButton: { width: '100%', backgroundColor: Colors.primary, borderRadius: BorderRadius.full, paddingVertical: Spacing.base, alignItems: 'center', ...Shadows.primary },
  loginButtonDisabled: { opacity: 0.5 },
  loginButtonText: { fontSize: Fonts.sizes.base, fontWeight: Fonts.weights.extrabold, color: Colors.onPrimary, letterSpacing: 2, textTransform: 'uppercase' },
});

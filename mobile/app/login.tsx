import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useStore } from '../stores/useStore';
import { Colors, Fonts, Spacing, BorderRadius, Shadows } from '../constants/theme';
import { MaterialIcons } from '@expo/vector-icons';

export default function LoginScreen() {
  const [phone, setPhone] = useState('+79001234567');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const { login, isLoading, loadAll } = useStore();

  const handleLogin = async () => {
    if (!phone || pin.length !== 4) {
      setError('Введите телефон и 4-значный ПИН');
      return;
    }
    setError('');
    const success = await login(phone, pin);
    if (success) {
      loadAll();
      router.replace('/(tabs)');
    } else {
      setError('Неверный телефон или ПИН-код');
    }
  };

  const handlePinInput = (digit: string) => {
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      if (newPin.length === 4) {
        setTimeout(() => {
          setPhone(phone);
          // Auto-submit on 4 digits
        }, 100);
      }
    }
  };

  const handlePinDelete = () => {
    setPin(pin.slice(0, -1));
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        {/* Logo area */}
        <View style={styles.logoArea}>
          <View style={styles.logoIcon}>
            <MaterialIcons name="account-balance" size={40} color={Colors.onPrimary} />
          </View>
          <Text style={styles.logoText}>MT-Банк</Text>
          <Text style={styles.logoSubtext}>HALVA VAULT</Text>
        </View>

        {/* Phone input */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>НОМЕР ТЕЛЕФОНА</Text>
          <TextInput
            style={styles.phoneInput}
            value={phone}
            onChangeText={setPhone}
            placeholder="+7 (900) 123-45-67"
            keyboardType="phone-pad"
            placeholderTextColor={Colors.outlineVariant}
          />
        </View>

        {/* PIN dots */}
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

        {/* Error */}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Numpad */}
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

        {/* Login button */}
        <TouchableOpacity
          style={[styles.loginButton, pin.length < 4 && styles.loginButtonDisabled]}
          onPress={handleLogin}
          disabled={pin.length < 4 || isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={Colors.onPrimary} />
          ) : (
            <Text style={styles.loginButtonText}>Войти</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.hint}>
          Тест: +79001234567 / ПИН: 1234
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoArea: {
    alignItems: 'center',
    marginBottom: Spacing['3xl'],
  },
  logoIcon: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.base,
    ...Shadows.primary,
  },
  logoText: {
    fontSize: Fonts.sizes['3xl'],
    fontWeight: Fonts.weights.extrabold,
    color: Colors.onSurface,
    letterSpacing: -1,
  },
  logoSubtext: {
    fontSize: Fonts.sizes.xs,
    fontWeight: Fonts.weights.bold,
    color: Colors.primary,
    letterSpacing: 4,
    marginTop: Spacing.xs,
  },
  inputSection: {
    width: '100%',
    marginBottom: Spacing.xl,
  },
  inputLabel: {
    fontSize: Fonts.sizes.xs,
    fontWeight: Fonts.weights.bold,
    color: Colors.primary,
    letterSpacing: 2,
    marginBottom: Spacing.sm,
  },
  phoneInput: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: BorderRadius.base,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    fontSize: Fonts.sizes.lg,
    fontWeight: Fonts.weights.semibold,
    color: Colors.onSurface,
    ...Shadows.sm,
  },
  pinSection: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  pinDots: {
    flexDirection: 'row',
    gap: Spacing.base,
  },
  pinDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.surfaceContainerHigh,
    borderWidth: 2,
    borderColor: Colors.outlineVariant,
  },
  pinDotFilled: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  error: {
    color: Colors.error,
    fontSize: Fonts.sizes.sm,
    fontWeight: Fonts.weights.bold,
    marginBottom: Spacing.base,
  },
  numpad: {
    width: '100%',
    maxWidth: 280,
    marginBottom: Spacing.xl,
  },
  numpadRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.base,
    marginBottom: Spacing.sm,
  },
  numpadKey: {
    width: 72,
    height: 56,
    borderRadius: BorderRadius.base,
    backgroundColor: Colors.surfaceContainerLowest,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
  },
  numpadKeyEmpty: {
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  numpadKeyText: {
    fontSize: Fonts.sizes.xl,
    fontWeight: Fonts.weights.bold,
    color: Colors.onSurface,
  },
  loginButton: {
    width: '100%',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.base,
    alignItems: 'center',
    ...Shadows.primary,
  },
  loginButtonDisabled: {
    opacity: 0.5,
  },
  loginButtonText: {
    fontSize: Fonts.sizes.base,
    fontWeight: Fonts.weights.extrabold,
    color: Colors.onPrimary,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  hint: {
    marginTop: Spacing.base,
    fontSize: Fonts.sizes.xs,
    color: Colors.outlineVariant,
  },
});

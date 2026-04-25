import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Keyboard,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useStore } from '../stores/useStore';
import { Colors, Fonts, Spacing, BorderRadius, Shadows } from '../constants/theme';
import { MaterialIcons } from '@expo/vector-icons';

function formatPanGroups(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, 19);
  return d.replace(/(.{4})/g, '$1 ').trim();
}

export default function RegisterScreen() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [cardDisplay, setCardDisplay] = useState('');
  const [phone, setPhone] = useState('+7');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const { register, isLoading, loadAll } = useStore();

  const onCardChange = (t: string) => {
    const d = t.replace(/\D/g, '').slice(0, 19);
    setCardDisplay(formatPanGroups(d));
  };

  const submit = useCallback(async () => {
    const fn = firstName.trim();
    const ln = lastName.trim();
    const pan = cardDisplay.replace(/\D/g, '');
    const p = phone.trim();
    if (!fn || !ln) {
      setError('Введите имя и фамилию');
      return;
    }
    if (pan.length < 13) {
      setError('Введите полный номер карты');
      return;
    }
    if (!p || p.replace(/\D/g, '').length < 10) {
      setError('Введите номер телефона');
      return;
    }
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      setError('Введите 4-значный ПИН-код');
      return;
    }
    setError('');
    const res = await register({
      firstName: fn,
      lastName: ln,
      cardNumber: pan,
      phone: p,
      pin,
    });
    if (res.ok) {
      loadAll();
      router.replace('/');
    } else {
      setError(res.error);
      setPin('');
    }
  }, [firstName, lastName, cardDisplay, phone, pin, register, loadAll]);

  const handlePinInput = (digit: string) => {
    Keyboard.dismiss();
    if (pin.length < 4) {
      const next = pin + digit;
      setPin(next);
    }
  };

  const handlePinDelete = () => {
    Keyboard.dismiss();
    setPin(pin.slice(0, -1));
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.tabs}>
              <TouchableOpacity style={styles.tab} onPress={() => router.replace('/login')}>
                <Text style={styles.tabText}>Вход</Text>
              </TouchableOpacity>
              <View style={[styles.tab, styles.tabActive]}>
                <Text style={[styles.tabText, styles.tabTextActive]}>Регистрация</Text>
              </View>
            </View>

            <View style={styles.logoArea}>
              <View style={styles.logoIcon}>
                <MaterialIcons name="person-add" size={36} color={Colors.onPrimary} />
              </View>
              <Text style={styles.logoText}>Новый аккаунт</Text>
            </View>

            <View style={styles.row}>
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={styles.inputLabel}>ИМЯ</Text>
                <TextInput
                  style={styles.textInput}
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="Иван"
                  placeholderTextColor={Colors.outlineVariant}
                  autoCapitalize="words"
                />
              </View>
              <View style={{ width: Spacing.sm }} />
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={styles.inputLabel}>ФАМИЛИЯ</Text>
                <TextInput
                  style={styles.textInput}
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Иванов"
                  placeholderTextColor={Colors.outlineVariant}
                  autoCapitalize="words"
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.inputLabel}>НОМЕР КАРТЫ</Text>
              <TextInput
                style={styles.textInput}
                value={cardDisplay}
                onChangeText={onCardChange}
                placeholder="0000 0000 0000 0000"
                placeholderTextColor={Colors.outlineVariant}
                keyboardType="number-pad"
                maxLength={23}
              />
              <Text style={styles.hintSmall}>
                13–19 цифр, действительная контрольная сумма (например 4242 4242 4242 4242)
              </Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.inputLabel}>ТЕЛЕФОН</Text>
              <TextInput
                style={styles.textInput}
                value={phone}
                onChangeText={setPhone}
                placeholder="+7 900 123-45-67"
                placeholderTextColor={Colors.outlineVariant}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.pinSection}>
              <Text style={styles.inputLabel}>ПИН-КОД (4 ЦИФРЫ)</Text>
              <View style={styles.pinDots}>
                {[0, 1, 2, 3].map((i) => (
                  <View
                    key={i}
                    style={[styles.pinDot, pin.length > i && styles.pinDotFilled]}
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
                      style={[styles.numpadKey, digit === '' && styles.numpadKeyEmpty]}
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
              style={[styles.primaryBtn, isLoading && styles.primaryBtnDisabled]}
              onPress={submit}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={Colors.onPrimary} />
              ) : (
                <Text style={styles.primaryBtnText}>Создать аккаунт</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  scroll: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing['3xl'],
    paddingTop: Spacing.sm,
  },
  tabs: {
    flexDirection: 'row',
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
  tabActive: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    fontSize: Fonts.sizes.sm,
    fontFamily: 'Manrope-Bold',
    color: Colors.onSurfaceVariant,
  },
  tabTextActive: { color: Colors.onPrimary },
  logoArea: { alignItems: 'center', marginBottom: Spacing.xl },
  logoIcon: {
    width: 72,
    height: 72,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
    ...Shadows.primary,
  },
  logoText: {
    fontSize: Fonts.sizes['2xl'],
    fontFamily: 'Manrope-ExtraBold',
    color: Colors.onSurface,
    letterSpacing: -0.5,
  },
  row: { flexDirection: 'row', marginBottom: Spacing.base },
  field: { marginBottom: Spacing.base },
  inputLabel: {
    fontSize: Fonts.sizes.xs,
    fontFamily: 'Manrope-Bold',
    color: Colors.primary,
    letterSpacing: 2,
    marginBottom: Spacing.sm,
  },
  textInput: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: BorderRadius.base,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    fontSize: Fonts.sizes.base,
    fontFamily: 'Manrope-SemiBold',
    color: Colors.onSurface,
    ...Shadows.sm,
  },
  hintSmall: {
    marginTop: 6,
    fontSize: 11,
    fontFamily: 'Manrope-Medium',
    color: Colors.outlineVariant,
    lineHeight: 15,
  },
  pinSection: { alignItems: 'center', marginBottom: Spacing.md },
  pinDots: { flexDirection: 'row', gap: Spacing.base },
  pinDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.surfaceContainerHigh,
    borderWidth: 2,
    borderColor: Colors.outlineVariant,
  },
  pinDotFilled: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  error: {
    color: Colors.error,
    fontSize: Fonts.sizes.sm,
    fontFamily: 'Manrope-Bold',
    marginBottom: Spacing.base,
    textAlign: 'center',
  },
  numpad: { width: '100%', maxWidth: 280, alignSelf: 'center', marginBottom: Spacing.lg },
  numpadRow: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.base, marginBottom: Spacing.sm },
  numpadKey: {
    width: 68,
    height: 52,
    borderRadius: BorderRadius.base,
    backgroundColor: Colors.surfaceContainerLowest,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
  },
  numpadKeyEmpty: { backgroundColor: 'transparent', shadowOpacity: 0, elevation: 0 },
  numpadKeyText: { fontSize: Fonts.sizes.lg, fontFamily: 'Manrope-Bold', color: Colors.onSurface },
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.base,
    alignItems: 'center',
    ...Shadows.primary,
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: {
    fontSize: Fonts.sizes.base,
    fontFamily: 'Manrope-ExtraBold',
    color: Colors.onPrimary,
    letterSpacing: 1,
  },
});

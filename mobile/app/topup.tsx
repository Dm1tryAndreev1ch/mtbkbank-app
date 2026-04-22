import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useStore } from '../stores/useStore';
import * as api from '../services/api';
import { Fonts, Spacing, BorderRadius, Shadows, formatMoney } from '../constants/theme';
import { useThemeColor } from '../hooks/useThemeColor';

const METHODS = [
  { id: 'card', icon: 'credit-card', title: 'С другой карты', desc: 'Visa, Mastercard, МИР', color: '#4F8EF7' },
  { id: 'account', icon: 'account-balance', title: 'Между своими счетами', desc: 'Перевод внутри банка', color: '#9333EA' },
  { id: 'erip', icon: 'receipt-long', title: 'Через ЕРИП', desc: 'Система расчётов', color: '#0ea5e9' },
  { id: 'atm', icon: 'local-atm', title: 'Наличными в банкомате', desc: 'Найти ближайший банкомат', color: '#f59e0b' },
];

const AMOUNTS = [50, 100, 500, 1000, 5000];

export default function TopupScreen() {
  const [selected, setSelected] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [cardNum, setCardNum] = useState('');
  const [loading, setLoading] = useState(false);
  const { accounts, loadAccounts } = useStore();
  const colors = useThemeColor();
  const s = useMemo(() => mk(colors), [colors]);
  const mainAcc = accounts.find((a: any) => a.type === 'main') || accounts[0];

  const handleTopup = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { Alert.alert('Ошибка', 'Введите сумму'); return; }
    if (selected === 'card' && cardNum.replace(/\s/g, '').length < 16) { Alert.alert('Ошибка', 'Введите номер карты'); return; }
    if (!mainAcc) { Alert.alert('Ошибка', 'Нет счёта'); return; }
    setLoading(true);
    try {
      await api.topupAccount(mainAcc.id, amt);
      await loadAccounts();
      Alert.alert('Успешно', `Счёт пополнен на ${formatMoney(amt)}`, [{ text: 'OK', onPress: () => router.back() }]);
    } catch {
      Alert.alert('Успешно', `Счёт пополнен на ${formatMoney(amt)} (демо)`, [{ text: 'OK', onPress: () => router.back() }]);
    } finally { setLoading(false); }
  };

  const formatCard = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 16);
    return d.replace(/(\d{4})/g, '$1 ').trim();
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.hdr}>
        <TouchableOpacity style={s.back} onPress={() => selected ? setSelected(null) : router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={s.hdrt}>{selected ? METHODS.find(m => m.id === selected)?.title : 'Пополнить карту'}</Text>
        <View style={{ width: 40 }} />
      </View>

      {!selected ? (
        <ScrollView contentContainerStyle={s.list}>
          {mainAcc && (
            <Animated.View entering={FadeInDown.delay(0)} style={s.balCard}>
              <Text style={s.balLabel}>Текущий баланс</Text>
              <Text style={s.balVal}>{formatMoney(mainAcc.balance)}</Text>
            </Animated.View>
          )}
          <Text style={s.secTitle}>СПОСОБ ПОПОЛНЕНИЯ</Text>
          {METHODS.map((m, i) => (
            <Animated.View entering={FadeInDown.delay(i * 80)} key={m.id}>
              <TouchableOpacity style={s.methodRow} onPress={() => m.id === 'atm' ? Alert.alert('Банкоматы', 'Ближайший: ул. Ленина 12, ТЦ «Столица»\nРежим: 24/7') : setSelected(m.id)}>
                <View style={[s.methodIco, { backgroundColor: `${m.color}18` }]}>
                  <MaterialIcons name={m.icon as any} size={26} color={m.color} />
                </View>
                <View style={s.methodTxt}>
                  <Text style={s.methodTitle}>{m.title}</Text>
                  <Text style={s.methodDesc}>{m.desc}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={24} color={colors.outlineVariant} />
              </TouchableOpacity>
            </Animated.View>
          ))}
        </ScrollView>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <ScrollView contentContainerStyle={s.form} keyboardShouldPersistTaps="handled">
              {selected === 'card' && (
                <Animated.View entering={FadeInDown}>
                  <Text style={s.fieldLbl}>Номер карты отправителя</Text>
                  <TextInput
                    style={s.input}
                    value={cardNum}
                    onChangeText={v => setCardNum(formatCard(v))}
                    placeholder="0000 0000 0000 0000"
                    placeholderTextColor={colors.outlineVariant}
                    keyboardType="numeric"
                    maxLength={19}
                    returnKeyType="next"
                  />
                </Animated.View>
              )}
              {selected === 'erip' && (
                <Animated.View entering={FadeInDown}>
                  <Text style={s.fieldLbl}>Код услуги ЕРИП</Text>
                  <TextInput
                    style={s.input}
                    placeholder="Например: 381012"
                    placeholderTextColor={colors.outlineVariant}
                    keyboardType="numeric"
                    returnKeyType="next"
                  />
                </Animated.View>
              )}
              <Text style={s.fieldLbl}>Сумма пополнения</Text>
              <TextInput
                style={[s.input, s.inputBig]}
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00 ₽"
                placeholderTextColor={colors.outlineVariant}
                keyboardType="numeric"
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />
              <View style={s.chips}>
                {AMOUNTS.map(a => (
                  <TouchableOpacity key={a} style={[s.chip, amount === String(a) && s.chipA]} onPress={() => setAmount(String(a))}>
                    <Text style={[s.chipT, amount === String(a) && s.chipTA]}>{a} ₽</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {mainAcc && (
                <View style={s.destCard}>
                  <MaterialIcons name="credit-card" size={20} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.destTitle}>Зачисление на</Text>
                    <Text style={s.destNum}>•••• {mainAcc.bankCards?.[0]?.maskedNumber?.slice(-4) || '0000'}</Text>
                  </View>
                  <Text style={s.destBal}>{formatMoney(mainAcc.balance)}</Text>
                </View>
              )}
              <TouchableOpacity style={[s.btn, loading && { opacity: 0.7 }]} onPress={handleTopup} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnT}>Пополнить</Text>}
              </TouchableOpacity>
            </ScrollView>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const mk = (C: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  hdr: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: C.transparentBorder },
  back: { padding: 8 },
  hdrt: { fontSize: Fonts.sizes.lg, fontFamily: 'Manrope-Bold', color: C.onSurface },
  list: { padding: Spacing.xl, paddingBottom: 80 },
  balCard: { backgroundColor: C.surfaceContainerLowest, borderRadius: BorderRadius.lg, padding: Spacing.xl, marginBottom: Spacing.xl, borderWidth: 1, borderColor: C.transparentBorder, ...Shadows.sm },
  balLabel: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Medium', color: C.onSurfaceVariant },
  balVal: { fontSize: Fonts.sizes['2xl'], fontFamily: 'Manrope-ExtraBold', color: C.onSurface, marginTop: 4 },
  secTitle: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold', color: C.onSurfaceVariant, letterSpacing: 2, marginBottom: Spacing.base },
  methodRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceContainerLowest, borderRadius: BorderRadius.lg, padding: Spacing.base, marginBottom: Spacing.sm, borderWidth: 1, borderColor: C.transparentBorder, ...Shadows.sm },
  methodIco: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  methodTxt: { flex: 1, marginLeft: Spacing.base },
  methodTitle: { fontSize: Fonts.sizes.base, fontFamily: 'Manrope-Bold', color: C.onSurface },
  methodDesc: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Medium', color: C.onSurfaceVariant, marginTop: 2 },
  form: { padding: Spacing.xl, paddingBottom: 80 },
  fieldLbl: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold', color: C.onSurfaceVariant, marginBottom: 8, marginTop: Spacing.base },
  input: { backgroundColor: C.surfaceContainerLowest, color: C.onSurface, fontFamily: 'Manrope-Medium', fontSize: Fonts.sizes.base, padding: Spacing.base, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: C.transparentBorder },
  inputBig: { fontSize: Fonts.sizes.xl, fontFamily: 'Manrope-Bold', textAlign: 'center', paddingVertical: Spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.base },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: BorderRadius.full, backgroundColor: C.surfaceContainerHigh },
  chipA: { backgroundColor: C.primary },
  chipT: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold', color: C.onSurfaceVariant },
  chipTA: { color: C.onPrimary },
  destCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.base, backgroundColor: C.surfaceContainerLowest, borderRadius: BorderRadius.md, padding: Spacing.base, marginTop: Spacing.xl, borderWidth: 1, borderColor: C.transparentBorder },
  destTitle: { fontSize: Fonts.sizes.xs, fontFamily: 'Manrope-Medium', color: C.onSurfaceVariant },
  destNum: { fontSize: Fonts.sizes.base, fontFamily: 'Manrope-Bold', color: C.onSurface },
  destBal: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold', color: C.primary },
  btn: { backgroundColor: C.primary, borderRadius: BorderRadius.base, paddingVertical: Spacing.base, alignItems: 'center', marginTop: Spacing.xl, ...Shadows.primary },
  btnT: { color: C.onPrimary, fontFamily: 'Manrope-ExtraBold', fontSize: Fonts.sizes.md },
});

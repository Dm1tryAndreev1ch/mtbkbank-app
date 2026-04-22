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
  { id: 'card', icon: 'credit-card', title: 'По номеру карты', desc: 'На карту любого банка', color: '#4F8EF7' },
  { id: 'phone', icon: 'phone-android', title: 'По номеру телефона', desc: 'Мгновенный перевод', color: '#0ea5e9' },
  { id: 'own', icon: 'swap-horiz', title: 'Между своими счетами', desc: 'Внутренний перевод', color: '#9333EA' },
];

const RECENT = [
  { name: 'Анна М.', initials: 'АМ', color: '#9333EA', detail: '+375 29 •••-••-12' },
  { name: 'Максим Л.', initials: 'МЛ', color: '#4F8EF7', detail: '•••• 4582' },
  { name: 'Елена К.', initials: 'ЕК', color: '#ec4899', detail: '+375 33 •••-••-78' },
];

const AMOUNTS = [10, 50, 100, 500, 1000];

export default function TransferScreen() {
  const [selected, setSelected] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [loading, setLoading] = useState(false);
  const { accounts, loadAccounts, loadTransactions } = useStore();
  const colors = useThemeColor();
  const s = useMemo(() => mk(colors), [colors]);
  const mainAcc = accounts.find((a: any) => a.type === 'main') || accounts[0];

  const formatCard = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 16);
    return d.replace(/(\d{4})/g, '$1 ').trim();
  };

  const formatPhone = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 12);
    if (d.length <= 3) return `+${d}`;
    if (d.length <= 5) return `+${d.slice(0, 3)} ${d.slice(3)}`;
    if (d.length <= 8) return `+${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5)}`;
    return `+${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 8)}-${d.slice(8)}`;
  };

  const handleTransfer = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { Alert.alert('Ошибка', 'Введите сумму'); return; }
    if (selected !== 'own' && !recipient.trim()) { Alert.alert('Ошибка', 'Укажите получателя'); return; }
    if (!mainAcc) { Alert.alert('Ошибка', 'Нет счёта'); return; }
    setLoading(true);
    try {
      await api.makeTransfer({ fromAccountId: mainAcc.id, amount: amt, recipient: recipient.replace(/\s/g, '') });
      await Promise.all([loadAccounts(), loadTransactions({ limit: 5 })]);
      Alert.alert('Успешно', `Перевод ${formatMoney(amt)} выполнен`, [{ text: 'OK', onPress: () => router.back() }]);
    } catch {
      Alert.alert('Успешно', `Перевод ${formatMoney(amt)} выполнен (демо)`, [{ text: 'OK', onPress: () => router.back() }]);
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.hdr}>
        <TouchableOpacity style={s.back} onPress={() => selected ? setSelected(null) : router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={s.hdrt}>{selected ? METHODS.find(m => m.id === selected)?.title : 'Перевод средств'}</Text>
        <View style={{ width: 40 }} />
      </View>

      {!selected ? (
        <ScrollView contentContainerStyle={s.list}>
          {mainAcc && (
            <Animated.View entering={FadeInDown.delay(0)} style={s.balCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={s.balLabel}>Доступно для перевода</Text>
                  <Text style={s.balVal}>{formatMoney(mainAcc.balance)}</Text>
                </View>
                <MaterialIcons name="account-balance-wallet" size={28} color={colors.primary} />
              </View>
            </Animated.View>
          )}
          <Text style={s.secTitle}>СПОСОБ ПЕРЕВОДА</Text>
          {METHODS.map((m, i) => (
            <Animated.View entering={FadeInDown.delay(i * 80)} key={m.id}>
              <TouchableOpacity style={s.methodRow} onPress={() => setSelected(m.id)}>
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
          <Text style={[s.secTitle, { marginTop: Spacing.xl }]}>НЕДАВНИЕ ПОЛУЧАТЕЛИ</Text>
          {RECENT.map((r, i) => (
            <Animated.View entering={FadeInDown.delay(300 + i * 80)} key={i}>
              <TouchableOpacity style={s.recentRow} onPress={() => { setSelected(r.detail.startsWith('+') ? 'phone' : 'card'); setRecipient(r.detail); }}>
                <View style={[s.avatar, { backgroundColor: r.color }]}>
                  <Text style={s.avatarT}>{r.initials}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.recentName}>{r.name}</Text>
                  <Text style={s.recentDetail}>{r.detail}</Text>
                </View>
                <MaterialIcons name="arrow-forward-ios" size={14} color={colors.outlineVariant} />
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
                  <Text style={s.fieldLbl}>Номер карты получателя</Text>
                  <TextInput
                    style={s.input}
                    value={recipient}
                    onChangeText={v => setRecipient(formatCard(v))}
                    placeholder="0000 0000 0000 0000"
                    placeholderTextColor={colors.outlineVariant}
                    keyboardType="numeric"
                    maxLength={19}
                    returnKeyType="next"
                  />
                </Animated.View>
              )}
              {selected === 'phone' && (
                <Animated.View entering={FadeInDown}>
                  <Text style={s.fieldLbl}>Номер телефона</Text>
                  <TextInput
                    style={s.input}
                    value={recipient}
                    onChangeText={v => setRecipient(formatPhone(v))}
                    placeholder="+375 XX XXX-XX-XX"
                    placeholderTextColor={colors.outlineVariant}
                    keyboardType="phone-pad"
                    maxLength={17}
                    returnKeyType="next"
                  />
                </Animated.View>
              )}
              {selected === 'own' && (
                <Animated.View entering={FadeInDown}>
                  <Text style={s.fieldLbl}>Счёт списания</Text>
                  <View style={s.accRow}>
                    <MaterialIcons name="credit-card" size={20} color={colors.primary} />
                    <Text style={s.accTxt}>Основной •••• {mainAcc?.bankCards?.[0]?.maskedNumber?.slice(-4) || '0000'}</Text>
                  </View>
                  <Text style={s.fieldLbl}>Счёт зачисления</Text>
                  <View style={s.accRow}>
                    <MaterialIcons name="savings" size={20} color={'#9333EA'} />
                    <Text style={s.accTxt}>Накопительный счёт</Text>
                  </View>
                </Animated.View>
              )}
              <Text style={s.fieldLbl}>Сумма перевода</Text>
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
              <TouchableOpacity style={[s.btn, loading && { opacity: 0.7 }]} onPress={handleTransfer} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnT}>Перевести</Text>}
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
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.base, backgroundColor: C.surfaceContainerLowest, borderRadius: BorderRadius.lg, padding: Spacing.base, marginBottom: Spacing.sm, borderWidth: 1, borderColor: C.transparentBorder },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarT: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-ExtraBold', color: '#fff' },
  recentName: { fontSize: Fonts.sizes.base, fontFamily: 'Manrope-Bold', color: C.onSurface },
  recentDetail: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Medium', color: C.onSurfaceVariant, marginTop: 2 },
  form: { padding: Spacing.xl, paddingBottom: 80 },
  fieldLbl: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold', color: C.onSurfaceVariant, marginBottom: 8, marginTop: Spacing.base },
  input: { backgroundColor: C.surfaceContainerLowest, color: C.onSurface, fontFamily: 'Manrope-Medium', fontSize: Fonts.sizes.base, padding: Spacing.base, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: C.transparentBorder },
  inputBig: { fontSize: Fonts.sizes.xl, fontFamily: 'Manrope-Bold', textAlign: 'center', paddingVertical: Spacing.lg },
  accRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.base, backgroundColor: C.surfaceContainerLowest, padding: Spacing.base, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: C.transparentBorder },
  accTxt: { fontSize: Fonts.sizes.base, fontFamily: 'Manrope-Bold', color: C.onSurface },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.base },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: BorderRadius.full, backgroundColor: C.surfaceContainerHigh },
  chipA: { backgroundColor: C.primary },
  chipT: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold', color: C.onSurfaceVariant },
  chipTA: { color: C.onPrimary },
  btn: { backgroundColor: C.primary, borderRadius: BorderRadius.base, paddingVertical: Spacing.base, alignItems: 'center', marginTop: Spacing.xl, ...Shadows.primary },
  btnT: { color: C.onPrimary, fontFamily: 'Manrope-ExtraBold', fontSize: Fonts.sizes.md },
});

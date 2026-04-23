import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, ScrollView, KeyboardAvoidingView,
  Platform, Keyboard, TouchableWithoutFeedback
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useStore } from '../stores/useStore';
import * as api from '../services/api';
import { Fonts, Spacing, BorderRadius, Shadows, formatMoney } from '../constants/theme';
import { useThemeColor } from '../hooks/useThemeColor';
import AppAlert from '../components/AppAlert';        // ← импорт компонента
import { useAppAlert } from '../hooks/useAppAlert';   // ← импорт хука

const CATEGORIES = [
  {
    id: 'mobile', icon: 'phone-iphone', title: 'Мобильная связь',
    desc: 'A1, МТС, life:)', color: '#4F8EF7',
    services: [
      { name: 'A1 (velcom)', icon: 'signal-cellular-alt' },
      { name: 'МТС', icon: 'cell-tower' },
      { name: 'life:)', icon: 'phone-android' },
    ]
  },
  {
    id: 'utilities', icon: 'home', title: 'ЖКУ и коммуналка',
    desc: 'Свет, вода, газ, отопление', color: '#f59e0b',
    services: [
      { name: 'Электричество', icon: 'bolt' },
      { name: 'Водоснабжение', icon: 'water-drop' },
      { name: 'Газоснабжение', icon: 'local-fire-department' },
      { name: 'Отопление', icon: 'thermostat' },
    ]
  },
  {
    id: 'internet', icon: 'wifi', title: 'Интернет и ТВ',
    desc: 'Провайдеры, подписки', color: '#0ea5e9',
    services: [
      { name: 'Белтелеком', icon: 'router' },
      { name: 'A1 Интернет', icon: 'language' },
      { name: 'МТС Домашний', icon: 'tv' },
    ]
  },
  {
    id: 'fines', icon: 'gavel', title: 'Штрафы и налоги',
    desc: 'ГАИ, налоговая', color: '#ef4444',
    services: [
      { name: 'Штрафы ГАИ', icon: 'directions-car' },
      { name: 'Налоги', icon: 'receipt' },
      { name: 'Госпошлины', icon: 'account-balance' },
    ]
  },
  {
    id: 'education', icon: 'school', title: 'Образование',
    desc: 'Школы, вузы, курсы', color: '#9333EA',
    services: [
      { name: 'Оплата обучения', icon: 'menu-book' },
      { name: 'Детский сад', icon: 'child-care' },
    ]
  },
];

export default function PaymentScreen() {
  const [selected, setSelected] = useState<any>(null);
  const [service, setService]   = useState<any>(null);
  const [amount, setAmount]     = useState('');
  const [account, setAccount]   = useState('');
  const [loading, setLoading]   = useState(false);
  const [search, setSearch]     = useState('');

  // ↓ одна строка вместо кучи useState для алертов
  const alert = useAppAlert();

  const { accounts, loadAccounts } = useStore();
  const colors = useThemeColor();
  const s = useMemo(() => mk(colors), [colors]);
  const mainAcc = accounts.find((a: any) => a.type === 'main') || accounts[0];

  const filtered = search
    ? CATEGORIES.filter(c =>
        c.title.toLowerCase().includes(search.toLowerCase()) ||
        c.desc.toLowerCase().includes(search.toLowerCase())
      )
    : CATEGORIES;

  // ↓ чистый handlePay без boilerplate
  const handlePay = async () => {
    const amt = Number(amount);

    if (!account.trim()) {
      alert.error('Проверьте данные', 'Введите номер лицевого счёта');
      return;
    }
    if (!amt || amt <= 0) {
      alert.error('Неверная сумма', 'Введите сумму больше нуля');
      return;
    }
    if (!mainAcc) {
      alert.error('Нет счёта', 'Не найден счёт для списания средств');
      return;
    }

    setLoading(true);
    try {
      await api.makePayment({
        accountId: mainAcc.id,
        amount: amt,
        category: selected?.title || 'Оплата',
        merchant: service?.name || selected?.title,
      });
      await loadAccounts();
      alert.success(
        'Платёж выполнен! 🎉',
        `${formatMoney(amt)} успешно списано со счёта`,
        () => router.back(),   // ← вызовется после закрытия алерта
      );
    } catch (e: any) {
      const message = e?.response?.data?.error || 'Не удалось выполнить платеж. Попробуйте позже.';
      alert.error('Платёж не выполнен', message);
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    if (service) { setService(null); setAmount(''); setAccount(''); }
    else if (selected) setSelected(null);
    else router.back();
  };

  const headerTitle = service
    ? service.name
    : selected
      ? selected.title
      : 'Платежи';

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* ─── Шапка ─────────────────────────────── */}
      <View style={s.hdr}>
        <TouchableOpacity style={s.back} onPress={goBack}>
          <MaterialIcons name="arrow-back" size={24} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={s.hdrt} numberOfLines={1}>{headerTitle}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* ─── Список категорий ───────────────────── */}
      {!selected ? (
        <ScrollView
          contentContainerStyle={s.list}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.searchBar}>
            <MaterialIcons name="search" size={22} color={colors.onSurfaceVariant} />
            <TextInput
              style={s.searchInput}
              placeholder="Найти услугу..."
              placeholderTextColor={colors.outlineVariant}
              value={search}
              onChangeText={setSearch}
            />
          </View>

          <Text style={s.secTitle}>КАТЕГОРИИ УСЛУГ</Text>

          {filtered.map((c, i) => (
            <Animated.View entering={FadeInDown.delay(i * 70)} key={c.id}>
              <TouchableOpacity style={s.catRow} onPress={() => setSelected(c)}>
                <View style={[s.catIco, { backgroundColor: `${c.color}18` }]}>
                  <MaterialIcons name={c.icon as any} size={26} color={c.color} />
                </View>
                <View style={s.catTxt}>
                  <Text style={s.catTitle}>{c.title}</Text>
                  <Text style={s.catDesc}>{c.desc}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={24} color={colors.outlineVariant} />
              </TouchableOpacity>
            </Animated.View>
          ))}

          {filtered.length === 0 && (
            <Text style={s.empty}>Ничего не найдено</Text>
          )}
        </ScrollView>

      /* ─── Список услуг ─────────────────────────── */
      ) : !service ? (
        <ScrollView contentContainerStyle={s.list}>
          <Text style={s.secTitle}>ВЫБЕРИТЕ УСЛУГУ</Text>
          {selected.services.map((sv: any, i: number) => (
            <Animated.View entering={FadeInDown.delay(i * 70)} key={i}>
              <TouchableOpacity style={s.svcRow} onPress={() => setService(sv)}>
                <View style={[s.svcIco, { backgroundColor: `${selected.color}18` }]}>
                  <MaterialIcons name={sv.icon as any} size={22} color={selected.color} />
                </View>
                <Text style={s.svcName}>{sv.name}</Text>
                <MaterialIcons name="chevron-right" size={24} color={colors.outlineVariant} />
              </TouchableOpacity>
            </Animated.View>
          ))}
        </ScrollView>

      /* ─── Форма оплаты ─────────────────────────── */
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <ScrollView
              contentContainerStyle={s.form}
              keyboardShouldPersistTaps="handled"
            >
              <View style={s.svcHeader}>
                <View style={[s.svcIcoBig, { backgroundColor: `${selected.color}18` }]}>
                  <MaterialIcons name={service.icon as any} size={32} color={selected.color} />
                </View>
                <Text style={s.svcTitle}>{service.name}</Text>
                <Text style={s.svcCat}>{selected.title}</Text>
              </View>

              <Text style={s.fieldLbl}>Номер лицевого счёта</Text>
              <TextInput
                style={s.input}
                value={account}
                onChangeText={setAccount}
                placeholder="Введите номер счёта"
                placeholderTextColor={colors.outlineVariant}
                keyboardType="numeric"
                returnKeyType="next"
              />

              <Text style={s.fieldLbl}>Сумма оплаты</Text>
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

              {mainAcc && (
                <View style={s.fromCard}>
                  <MaterialIcons name="credit-card" size={20} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.fromLbl}>Списание с</Text>
                    <Text style={s.fromNum}>
                      •••• {mainAcc.bankCards?.[0]?.maskedNumber?.slice(-4) || '0000'}
                    </Text>
                  </View>
                  <Text style={s.fromBal}>{formatMoney(mainAcc.balance)}</Text>
                </View>
              )}

              <TouchableOpacity
                style={[s.btn, loading && { opacity: 0.7 }]}
                onPress={handlePay}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.btnT}>Оплатить</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      )}

      {/* ─── Алерт — одна строка в конце ──────────── */}
      <AppAlert {...alert.props} colors={colors} />
    </SafeAreaView>
  );
}

const mk = (C: any) => StyleSheet.create({
  root:        { flex: 1, backgroundColor: C.background },
  hdr:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: C.transparentBorder },
  back:        { padding: 8 },
  hdrt:        { fontSize: Fonts.sizes.lg, fontFamily: 'Manrope-Bold', color: C.onSurface, flex: 1, textAlign: 'center' },
  list:        { padding: Spacing.xl, paddingBottom: 80 },
  searchBar:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: C.surfaceContainerLow, borderRadius: BorderRadius.base, paddingHorizontal: Spacing.base, paddingVertical: 4, borderWidth: 1, borderColor: C.transparentBorder, marginBottom: Spacing.xl },
  searchInput: { flex: 1, fontSize: Fonts.sizes.base, color: C.onSurface, paddingVertical: Spacing.md, fontFamily: 'Manrope-Medium' },
  secTitle:    { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold', color: C.onSurfaceVariant, letterSpacing: 2, marginBottom: Spacing.base },
  catRow:      { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceContainerLowest, borderRadius: BorderRadius.lg, padding: Spacing.base, marginBottom: Spacing.sm, borderWidth: 1, borderColor: C.transparentBorder, ...Shadows.sm },
  catIco:      { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  catTxt:      { flex: 1, marginLeft: Spacing.base },
  catTitle:    { fontSize: Fonts.sizes.base, fontFamily: 'Manrope-Bold', color: C.onSurface },
  catDesc:     { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Medium', color: C.onSurfaceVariant, marginTop: 2 },
  svcRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.base, backgroundColor: C.surfaceContainerLowest, borderRadius: BorderRadius.lg, padding: Spacing.base, marginBottom: Spacing.sm, borderWidth: 1, borderColor: C.transparentBorder },
  svcIco:      { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  svcName:     { flex: 1, fontSize: Fonts.sizes.base, fontFamily: 'Manrope-Bold', color: C.onSurface },
  empty:       { textAlign: 'center', color: C.onSurfaceVariant, marginTop: Spacing['2xl'], fontFamily: 'Manrope-Medium' },
  form:        { padding: Spacing.xl, paddingBottom: 80 },
  svcHeader:   { alignItems: 'center', marginBottom: Spacing.xl },
  svcIcoBig:   { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.base },
  svcTitle:    { fontSize: Fonts.sizes.xl, fontFamily: 'Manrope-ExtraBold', color: C.onSurface },
  svcCat:      { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Medium', color: C.onSurfaceVariant, marginTop: 4 },
  fieldLbl:    { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold', color: C.onSurfaceVariant, marginBottom: 8, marginTop: Spacing.base },
  input:       { backgroundColor: C.surfaceContainerLowest, color: C.onSurface, fontFamily: 'Manrope-Medium', fontSize: Fonts.sizes.base, padding: Spacing.base, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: C.transparentBorder },
  inputBig:    { fontSize: Fonts.sizes.xl, fontFamily: 'Manrope-Bold', textAlign: 'center', paddingVertical: Spacing.lg },
  fromCard:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.base, backgroundColor: C.surfaceContainerLowest, borderRadius: BorderRadius.md, padding: Spacing.base, marginTop: Spacing.xl, borderWidth: 1, borderColor: C.transparentBorder },
  fromLbl:     { fontSize: Fonts.sizes.xs, fontFamily: 'Manrope-Medium', color: C.onSurfaceVariant },
  fromNum:     { fontSize: Fonts.sizes.base, fontFamily: 'Manrope-Bold', color: C.onSurface },
  fromBal:     { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold', color: C.primary },
  btn:         { backgroundColor: C.primary, borderRadius: BorderRadius.base, paddingVertical: Spacing.base, alignItems: 'center', marginTop: Spacing.xl, ...Shadows.primary },
  btnT:        { color: C.onPrimary, fontFamily: 'Manrope-ExtraBold', fontSize: Fonts.sizes.md },
});

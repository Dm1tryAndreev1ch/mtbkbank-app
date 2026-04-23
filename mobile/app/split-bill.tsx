import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown, FadeOutUp, Layout } from 'react-native-reanimated';
import { useStore } from '../stores/useStore';
import * as api from '../services/api';
import { Fonts, Spacing, BorderRadius, Shadows, formatMoney } from '../constants/theme';
import { useThemeColor } from '../hooks/useThemeColor';

type SplitMode = 'equal' | 'custom';
type Participant = { id: string; phone: string; name?: string; resolving: boolean; error?: string; share: string };

const genId = () => Math.random().toString(36).slice(2);

export default function SplitBillScreen() {
  const params = useLocalSearchParams<{ amount?: string; txTitle?: string }>();
  const colors = useThemeColor();
  const s = useMemo(() => mk(colors), [colors]);
  const { accounts, loadAccounts, loadTransactions } = useStore();

  const [totalAmount, setTotalAmount] = useState(params.amount ? String(Math.abs(Number(params.amount))) : '');
  const [mode, setMode] = useState<SplitMode>('equal');
  const [participants, setParticipants] = useState<Participant[]>([
    { id: genId(), phone: '', resolving: false, share: '' },
  ]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string[]>([]);

  const mainAcc = accounts.find((a: any) => a.type === 'main') || accounts[0];
  const total = Number(totalAmount) || 0;
  const perPerson = mode === 'equal' && participants.length > 0
    ? Math.round((total / participants.length) * 100) / 100
    : 0;

  // ---------- participant helpers ----------
  const updateParticipant = useCallback((id: string, patch: Partial<Participant>) => {
    setParticipants(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
  }, []);

  const addParticipant = () =>
    setParticipants(prev => [...prev, { id: genId(), phone: '', resolving: false, share: '' }]);

  const removeParticipant = (id: string) =>
    setParticipants(prev => prev.filter(p => p.id !== id));

  const formatPhone = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 12);
    if (d.length <= 3) return `+${d}`;
    if (d.length <= 5) return `+${d.slice(0,3)} ${d.slice(3)}`;
    if (d.length <= 8) return `+${d.slice(0,3)} ${d.slice(3,5)} ${d.slice(5)}`;
    return `+${d.slice(0,3)} ${d.slice(3,5)} ${d.slice(5,8)}-${d.slice(8)}`;
  };

  const handlePhoneBlur = async (id: string, raw: string) => {
    const clean = raw.replace(/[\s\-+]/g, '');
    if (!/^\d{10,12}$/.test(clean)) return;
    updateParticipant(id, { resolving: true, error: undefined, name: undefined });
    try {
      const { data } = await api.resolveRecipient(clean);
      updateParticipant(id, { resolving: false, name: data.user.name });
    } catch (e: any) {
      updateParticipant(id, { resolving: false, error: 'Не найден' });
    }
  };

  // ---------- custom mode sum validation ----------
  const customTotal = participants.reduce((s, p) => s + (Number(p.share) || 0), 0);
  const customLeft = Math.round((total - customTotal) * 100) / 100;

  const getShare = (p: Participant): number =>
    mode === 'equal' ? perPerson : Number(p.share) || 0;

  // ---------- send ----------
  const handleSend = async () => {
    if (!total || total <= 0) { Alert.alert('Ошибка', 'Введите сумму'); return; }
    if (!mainAcc) { Alert.alert('Ошибка', 'Нет счёта'); return; }
    if (mode === 'custom' && Math.abs(customLeft) > 0.01) {
      Alert.alert('Ошибка', `Распределите всю сумму. Остаток: ${formatMoney(customLeft)}`); return;
    }

    const valid = participants.filter(p => p.name && getShare(p) > 0);
    if (!valid.length) { Alert.alert('Ошибка', 'Добавьте хотя бы одного найденного участника'); return; }

    setSending(true);
    const successes: string[] = [];
    const failures: string[] = [];

    for (const p of valid) {
      try {
        await api.makeTransfer({
          fromAccountId: mainAcc.id,
          recipient: p.phone.replace(/[\s\-+]/g, ''),
          amount: getShare(p),
          description: `Разделение счёта: ${params.txTitle || 'операция'}`,
        });
        successes.push(p.name!);
      } catch (e: any) {
        failures.push(p.name!);
      }
    }

    setSending(false);
    await Promise.all([loadAccounts(), loadTransactions()]);
    setSent(successes);

    const msg = successes.length
      ? `Переведено: ${successes.join(', ')}` + (failures.length ? `\nОшибка: ${failures.join(', ')}` : '')
      : `Не удалось выполнить переводы: ${failures.join(', ')}`;

    Alert.alert(successes.length ? '✅ Готово' : '❌ Ошибка', msg, [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* Header */}
      <View style={s.hdr}>
        <TouchableOpacity style={s.back} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={s.hdrt}>Разделить счёт</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

            {/* Total amount */}
            <Text style={s.label}>Общая сумма</Text>
            {params.txTitle ? <Text style={s.txTitle}>{params.txTitle}</Text> : null}
            <TextInput
              style={[s.input, s.inputBig]}
              value={totalAmount}
              onChangeText={setTotalAmount}
              placeholder="0.00"
              placeholderTextColor={colors.outlineVariant}
              keyboardType="numeric"
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />

            {/* Mode selector */}
            <View style={s.modeRow}>
              {(['equal', 'custom'] as SplitMode[]).map(m => (
                <TouchableOpacity
                  key={m}
                  style={[s.modeBtn, mode === m && s.modeBtnA]}
                  onPress={() => setMode(m)}
                >
                  <MaterialIcons
                    name={m === 'equal' ? 'people' : 'tune'}
                    size={16}
                    color={mode === m ? colors.onPrimary : colors.onSurfaceVariant}
                  />
                  <Text style={[s.modeBtnT, mode === m && s.modeBtnTA]}>
                    {m === 'equal' ? 'Поровну' : 'Произвольно'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Per-person hint (equal mode) */}
            {mode === 'equal' && total > 0 && participants.length > 0 && (
              <Animated.View entering={FadeInDown} style={s.hintCard}>
                <MaterialIcons name="info-outline" size={16} color={colors.primary} />
                <Text style={s.hintText}>
                  {formatMoney(perPerson)} с человека · {participants.length} участник{participants.length === 1 ? '' : participants.length < 5 ? 'а' : 'ов'}
                </Text>
              </Animated.View>
            )}

            {/* Custom mode remaining */}
            {mode === 'custom' && total > 0 && (
              <Animated.View entering={FadeInDown} style={[s.hintCard, Math.abs(customLeft) > 0.01 && { borderColor: colors.error }]}>
                <MaterialIcons
                  name={Math.abs(customLeft) < 0.01 ? 'check-circle' : 'warning-amber'}
                  size={16}
                  color={Math.abs(customLeft) < 0.01 ? '#22c55e' : colors.error}
                />
                <Text style={[s.hintText, { color: Math.abs(customLeft) < 0.01 ? '#22c55e' : colors.error }]}>
                  {Math.abs(customLeft) < 0.01 ? 'Сумма распределена' : `Остаток: ${formatMoney(customLeft)}`}
                </Text>
              </Animated.View>
            )}

            {/* Participants */}
            <Text style={[s.label, { marginTop: Spacing.xl }]}>Участники</Text>

            {participants.map((p, idx) => (
              <Animated.View
                key={p.id}
                entering={FadeInDown.delay(idx * 60)}
                exiting={FadeOutUp}
                layout={Layout.springify()}
                style={s.pCard}
              >
                <View style={s.pRow}>
                  <View style={s.pNum}>
                    <Text style={s.pNumT}>{idx + 1}</Text>
                  </View>

                  <View style={{ flex: 1, gap: Spacing.sm }}>
                    <TextInput
                      style={s.input}
                      value={p.phone}
                      onChangeText={v => updateParticipant(p.id, { phone: formatPhone(v), name: undefined, error: undefined })}
                      onBlur={() => handlePhoneBlur(p.id, p.phone)}
                      placeholder="+375 XX XXX-XX-XX"
                      placeholderTextColor={colors.outlineVariant}
                      keyboardType="phone-pad"
                      maxLength={17}
                    />

                    {mode === 'custom' && (
                      <TextInput
                        style={s.input}
                        value={p.share}
                        onChangeText={v => updateParticipant(p.id, { share: v })}
                        placeholder="Сумма"
                        placeholderTextColor={colors.outlineVariant}
                        keyboardType="numeric"
                        returnKeyType="done"
                      />
                    )}
                  </View>

                  {participants.length > 1 && (
                    <TouchableOpacity style={s.removeBtn} onPress={() => removeParticipant(p.id)}>
                      <MaterialIcons name="remove-circle-outline" size={22} color={colors.error} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Resolve status */}
                {p.resolving && (
                  <View style={s.statusRow}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={s.statusTxt}>Поиск...</Text>
                  </View>
                )}
                {p.name && !p.resolving && (
                  <View style={s.statusRow}>
                    <MaterialIcons name="check-circle" size={15} color="#22c55e" />
                    <Text style={[s.statusTxt, { color: '#22c55e' }]}>
                      {p.name}{mode === 'equal' && total > 0 ? ` · ${formatMoney(perPerson)}` : ''}
                    </Text>
                  </View>
                )}
                {p.error && !p.resolving && (
                  <View style={s.statusRow}>
                    <MaterialIcons name="error-outline" size={15} color={colors.error} />
                    <Text style={[s.statusTxt, { color: colors.error }]}>{p.error}</Text>
                  </View>
                )}
              </Animated.View>
            ))}

            {/* Add participant */}
            <TouchableOpacity style={s.addBtn} onPress={addParticipant}>
              <MaterialIcons name="person-add" size={20} color={colors.primary} />
              <Text style={s.addBtnT}>Добавить участника</Text>
            </TouchableOpacity>

            {/* Summary */}
            {total > 0 && (
              <View style={s.summaryCard}>
                <View style={s.summaryRow}>
                  <Text style={s.summaryLabel}>Итого к переводу</Text>
                  <Text style={s.summaryVal}>{formatMoney(participants.filter(p => p.name).reduce((a, p) => a + getShare(p), 0))}</Text>
                </View>
                <View style={s.summaryRow}>
                  <Text style={s.summaryLabel}>Участников найдено</Text>
                  <Text style={s.summaryVal}>{participants.filter(p => p.name).length} / {participants.length}</Text>
                </View>
              </View>
            )}

            {/* Send button */}
            <TouchableOpacity
              style={[s.btn, sending && { opacity: 0.6 }]}
              onPress={handleSend}
              disabled={sending}
            >
              {sending
                ? <ActivityIndicator color="#fff" />
                : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <MaterialIcons name="send" size={20} color="#fff" />
                    <Text style={s.btnT}>Отправить переводы</Text>
                  </View>
                )
              }
            </TouchableOpacity>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const mk = (C: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  hdr: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: C.transparentBorder,
  },
  back: { padding: 8 },
  hdrt: { fontSize: Fonts.sizes.lg, fontFamily: 'Manrope-Bold', color: C.onSurface },
  scroll: { padding: Spacing.xl, paddingBottom: 100 },
  label: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold', color: C.onSurfaceVariant, marginBottom: 8 },
  txTitle: {
    fontSize: Fonts.sizes.base, fontFamily: 'Manrope-SemiBold', color: C.onSurface,
    marginBottom: 8,
  },
  input: {
    backgroundColor: C.surfaceContainerLowest, color: C.onSurface,
    fontFamily: 'Manrope-Medium', fontSize: Fonts.sizes.base,
    padding: Spacing.base, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: C.transparentBorder,
  },
  inputBig: {
    fontSize: Fonts.sizes.xl, fontFamily: 'Manrope-Bold',
    textAlign: 'center', paddingVertical: Spacing.lg, marginBottom: Spacing.base,
  },
  modeRow: {
    flexDirection: 'row', backgroundColor: C.surfaceContainerHigh,
    borderRadius: BorderRadius.base, padding: 4, gap: 4, marginBottom: Spacing.base,
  },
  modeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: BorderRadius.md, gap: 6,
  },
  modeBtnA: { backgroundColor: C.primary, ...Shadows.primary },
  modeBtnT: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold', color: C.onSurfaceVariant },
  modeBtnTA: { color: C.onPrimary },
  hintCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.surfaceContainerLowest, borderRadius: BorderRadius.md,
    padding: Spacing.base, marginBottom: Spacing.base,
    borderWidth: 1, borderColor: C.transparentBorder,
  },
  hintText: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold', color: C.primary },
  pCard: {
    backgroundColor: C.surfaceContainerLowest, borderRadius: BorderRadius.xl,
    padding: Spacing.base, marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: C.transparentBorder, ...Shadows.sm,
    gap: Spacing.sm,
  },
  pRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  pNum: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginTop: 12,
  },
  pNumT: { fontSize: Fonts.sizes.xs, fontFamily: 'Manrope-ExtraBold', color: C.onPrimary },
  removeBtn: { padding: 8, marginTop: 8 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 36 },
  statusTxt: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Medium', color: C.onSurfaceVariant },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: Spacing.base, borderRadius: BorderRadius.lg,
    borderWidth: 1.5, borderColor: C.primary, borderStyle: 'dashed',
    marginBottom: Spacing.xl, marginTop: Spacing.sm,
  },
  addBtnT: { fontSize: Fonts.sizes.base, fontFamily: 'Manrope-Bold', color: C.primary },
  summaryCard: {
    backgroundColor: C.surfaceContainerLowest, borderRadius: BorderRadius.xl,
    padding: Spacing.base, marginBottom: Spacing.xl,
    borderWidth: 1, borderColor: C.transparentBorder, gap: Spacing.sm,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Medium', color: C.onSurfaceVariant },
  summaryVal: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-ExtraBold', color: C.onSurface },
  btn: {
    backgroundColor: C.primary, borderRadius: BorderRadius.base,
    paddingVertical: Spacing.base, alignItems: 'center', ...Shadows.primary,
  },
  btnT: { color: C.onPrimary, fontFamily: 'Manrope-ExtraBold', fontSize: Fonts.sizes.md },
});

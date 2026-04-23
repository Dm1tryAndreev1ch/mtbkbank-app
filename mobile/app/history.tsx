import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Modal, Animated, Dimensions, PanResponder, Share, Alert,
  ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Fonts, Spacing, BorderRadius, Shadows, formatMoney } from '../constants/theme';
import { useThemeColor } from '../hooks/useThemeColor';
import { useStore } from '../stores/useStore';

const SHEET_H = Dimensions.get('window').height * 0.72;

function TransactionSheet({ tx, onClose, colors }: { tx: any; onClose: () => void; colors: any }) {
  const s = useMemo(() => sheetStyles(colors), [colors]);
  const slideY = useRef(new Animated.Value(SHEET_H)).current;
  const lastY = useRef(0);

  useEffect(() => {
    Animated.spring(slideY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 220 }).start();
  }, []);

  const dismiss = useCallback(() => {
    Animated.timing(slideY, { toValue: SHEET_H, duration: 220, useNativeDriver: true }).start(onClose);
  }, [onClose]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6,
      onPanResponderMove: (_, g) => { if (g.dy > 0) slideY.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 90 || g.vy > 0.8) dismiss();
        else Animated.spring(slideY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 220 }).start();
      },
    })
  ).current;

  if (!tx) return null;

  const isPositive = tx.type === 'TRANSFER_IN' || tx.type === 'TOPUP';
  const sign = isPositive ? '+' : '-';
  const amtColor = isPositive ? colors.primary : colors.onSurface;

  const rows = [
    { label: 'Дата', value: new Date(tx.createdAt).toLocaleString('ru-RU', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' }) },
    { label: 'Тип', value: typeLabel(tx.type) },
    { label: 'Категория', value: tx.category || '—' },
    { label: 'Статус', value: 'Успешно ✓', valueColor: '#22c55e' },
    tx.description ? { label: 'Описание', value: tx.description } : null,
  ].filter(Boolean) as { label: string; value: string; valueColor?: string }[];

  const handleShare = async () => {
    try {
      await Share.share({
        message: `MT-Bank операция\n${tx.merchant || 'Операция'}\n${sign}${formatMoney(tx.amount)}\n${new Date(tx.createdAt).toLocaleString('ru-RU')}`,
      });
    } catch {}
  };

  const handleSplit = () => {
    dismiss();
    setTimeout(() => {
      router.push({ pathname: '/split-bill', params: { amount: tx.amount, txTitle: tx.merchant || 'Операция' } });
    }, 260);
  };

  return (
    <Modal transparent animationType="none" onRequestClose={dismiss}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={dismiss} />
      <Animated.View style={[s.sheet, { transform: [{ translateY: slideY }] }]}>
        <View {...pan.panHandlers}>
          <View style={s.handle} />
        </View>

        {/* Icon + amount */}
        <View style={s.top}>
          <View style={[s.iconCircle, { backgroundColor: isPositive ? `${colors.primary}18` : colors.surfaceContainerHigh }]}>
            <MaterialIcons
              name={(tx.merchantIcon as any) || (isPositive ? 'arrow-downward' : 'shopping-bag')}
              size={30}
              color={isPositive ? colors.primary : colors.onSurfaceVariant}
            />
          </View>
          <Text style={s.merchant}>{tx.merchant || (isPositive ? 'Пополнение' : 'Операция')}</Text>
          <Text style={[s.amount, { color: amtColor }]}>{sign}{formatMoney(tx.amount)}</Text>
        </View>

        {/* Detail rows */}
        <View style={s.card}>
          {rows.map((r, i) => (
            <View key={i} style={[s.row, i < rows.length - 1 && s.rowBorder]}>
              <Text style={s.rowLabel}>{r.label}</Text>
              <Text style={[s.rowValue, r.valueColor ? { color: r.valueColor } : {}]}>{r.value}</Text>
            </View>
          ))}
        </View>

        {/* Actions */}
        <View style={s.actions}>
          <TouchableOpacity style={s.actBtn} onPress={handleShare}>
            <View style={s.actIco}><MaterialIcons name="share" size={22} color={colors.primary} /></View>
            <Text style={s.actLbl}>Поделиться</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.actBtn} onPress={handleSplit}>
            <View style={[s.actIco, { backgroundColor: '#9333EA18' }]}>
              <MaterialIcons name="group" size={22} color="#9333EA" />
            </View>
            <Text style={[s.actLbl, { color: '#9333EA' }]}>Разделить{`\n`}счёт</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.actBtn}
            onPress={() => { dismiss(); setTimeout(() => router.push({ pathname: '/transfer', params: { amount: tx.amount } }), 260); }}>
            <View style={s.actIco}><MaterialIcons name="sync-alt" size={22} color={colors.primary} /></View>
            <Text style={s.actLbl}>Повторить</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

function typeLabel(type: string) {
  const map: Record<string, string> = {
    PURCHASE: 'Покупка', TRANSFER_OUT: 'Исходящий перевод', TRANSFER_IN: 'Входящий перевод',
    TOPUP: 'Пополнение', PAYMENT: 'Платёж', TRANSFER: 'Перевод',
  };
  return map[type] || type;
}

export default function HistoryScreen() {
  const { transactions, loadTransactions } = useStore();
  const colors = useThemeColor();
  const s = useMemo(() => mk(colors), [colors]);
  const [search, setSearch] = useState('');
  const [selectedTx, setSelectedTx] = useState<any>(null);

  useEffect(() => { loadTransactions(); }, []);

  const historyGroups = useMemo(() => {
    const groups: { [key: string]: { group: string; count: string; items: any[] } } = {};
    const sorted = [...transactions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const filtered = search.trim()
      ? sorted.filter(t => (t.merchant || t.type).toLowerCase().includes(search.toLowerCase()))
      : sorted;

    filtered.forEach(t => {
      const date = new Date(t.createdAt);
      const today = new Date();
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      let groupKey = date.toDateString() === today.toDateString() ? 'Сегодня'
        : date.toDateString() === yesterday.toDateString() ? 'Вчера'
        : date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

      if (!groups[groupKey]) groups[groupKey] = { group: groupKey, count: '0', items: [] };
      const isPositive = t.type === 'TRANSFER_IN' || t.type === 'TOPUP';
      groups[groupKey].items.push({
        id: t.id, raw: t,
        title: t.merchant || (isPositive ? 'Пополнение' : 'Операция'),
        subtitle: `${t.category || 'Операции'} • ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`,
        amount: `${isPositive ? '+' : '-'} ${formatMoney(t.amount)}`,
        iconType: t.merchantIcon ? 'icon' : isPositive ? 'icon_down' : 'icon_bag',
        merchantIcon: t.merchantIcon,
        positive: isPositive,
      });
    });

    const result = Object.values(groups);
    result.forEach(g => {
      const n = g.items.length;
      g.count = `${n} ${n === 1 ? 'ОПЕРАЦИЯ' : n < 5 ? 'ОПЕРАЦИИ' : 'ОПЕРАЦИЙ'}`;
    });
    return result;
  }, [transactions, search]);

  const renderIcon = (item: any) => {
    if (item.iconType === 'icon_down') return (
      <View style={[s.iconCircle, { backgroundColor: colors.primaryFixed }]}>
        <MaterialIcons name="arrow-downward" size={24} color={colors.primary} />
      </View>
    );
    return (
      <View style={s.iconCircle}>
        <MaterialIcons name={(item.merchantIcon as any) || 'shopping-bag'} size={24}
          color={item.positive ? colors.primary : colors.onSurfaceVariant} />
      </View>
    );
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.iconBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>История операций</Text>
        <View style={s.headerRight}>
          <TouchableOpacity style={s.iconBtn}>
            <MaterialIcons name="calendar-today" size={22} color={colors.onSurfaceVariant} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={s.searchContainer}>
          <MaterialIcons name="search" size={20} color={colors.outline} style={s.searchIconLeft} />
          <TextInput
            placeholder="Поиск по операциям" placeholderTextColor={colors.outlineVariant}
            style={s.searchInput} value={search} onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <MaterialIcons name="close" size={20} color={colors.outline} />
            </TouchableOpacity>
          )}
        </View>

        {historyGroups.length === 0 && (
          <View style={s.emptyState}>
            <MaterialIcons name="receipt-long" size={48} color={colors.outlineVariant} />
            <Text style={s.emptyTitle}>Операций не найдено</Text>
            <Text style={s.emptySubtitle}>{search ? 'Попробуйте изменить запрос' : 'Здесь появятся ваши транзакции'}</Text>
          </View>
        )}

        {historyGroups.map((group, index) => (
          <View key={index} style={s.groupContainer}>
            <View style={s.groupHeader}>
              <Text style={s.groupTitle}>{group.group}</Text>
              <Text style={s.groupCount}>{group.count}</Text>
            </View>
            <View style={s.groupItems}>
              {group.items.map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={s.itemContainer}
                  activeOpacity={0.7}
                  onPress={() => setSelectedTx(item.raw)}
                >
                  <View style={s.itemLeft}>
                    {renderIcon(item)}
                    <View style={s.itemTexts}>
                      <Text style={s.itemTitle}>{item.title}</Text>
                      <Text style={s.itemSubtitle}>{item.subtitle}</Text>
                    </View>
                  </View>
                  <View style={s.itemRight}>
                    <Text style={[s.itemAmount, item.positive && { color: colors.primary }]}>{item.amount}</Text>
                    <MaterialIcons name="chevron-right" size={16} color={colors.outlineVariant} style={{ marginTop: 2 }} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      {selectedTx && (
        <TransactionSheet
          tx={selectedTx}
          colors={colors}
          onClose={() => setSelectedTx(null)}
        />
      )}
    </SafeAreaView>
  );
}

const sheetStyles = (C: any) => StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: SHEET_H, backgroundColor: C.background,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingBottom: 32, ...Shadows.lg,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: C.outlineVariant, alignSelf: 'center', marginTop: 12, marginBottom: 8,
  },
  top: { alignItems: 'center', paddingVertical: Spacing.lg, paddingHorizontal: Spacing.xl },
  iconCircle: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.base,
  },
  merchant: {
    fontSize: Fonts.sizes.base, fontFamily: 'Manrope-Bold',
    color: C.onSurfaceVariant, marginBottom: 4,
  },
  amount: { fontSize: Fonts.sizes['2xl'], fontFamily: 'Manrope-ExtraBold', color: C.onSurface },
  card: {
    marginHorizontal: Spacing.xl, backgroundColor: C.surfaceContainerLowest,
    borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: C.transparentBorder,
    overflow: 'hidden', ...Shadows.sm,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.base },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: C.transparentBorder },
  rowLabel: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Medium', color: C.onSurfaceVariant },
  rowValue: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold', color: C.onSurface, maxWidth: '62%', textAlign: 'right' },
  actions: {
    flexDirection: 'row', justifyContent: 'space-around',
    marginTop: Spacing.xl, paddingHorizontal: Spacing.xl,
  },
  actBtn: { alignItems: 'center', gap: 8, flex: 1 },
  actIco: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: C.surfaceContainerHigh,
    alignItems: 'center', justifyContent: 'center',
  },
  actLbl: {
    fontSize: Fonts.sizes.xs, fontFamily: 'Manrope-Bold',
    color: C.primary, textAlign: 'center',
  },
});

const mk = (C: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: C.transparentBorder, backgroundColor: C.background,
  },
  headerTitle: { flex: 1, fontSize: Fonts.sizes.lg, fontFamily: 'Manrope-Bold', color: C.onSurface, textAlign: 'center' },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { padding: 8 },
  scrollContent: { paddingBottom: Spacing['4xl'], paddingTop: Spacing.lg },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceContainerLow,
    marginHorizontal: Spacing.base, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.base, height: 48, marginBottom: Spacing.xl,
    borderWidth: 1, borderColor: C.transparentBorder,
  },
  searchIconLeft: { marginRight: Spacing.sm },
  searchInput: { flex: 1, fontSize: Fonts.sizes.md, color: C.onSurface, fontFamily: 'Manrope-Medium' },
  emptyState: { alignItems: 'center', paddingTop: Spacing['4xl'], paddingHorizontal: Spacing['2xl'] },
  emptyTitle: { fontSize: Fonts.sizes.base, fontFamily: 'Manrope-Bold', color: C.onSurface, marginTop: Spacing.base },
  emptySubtitle: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Medium', color: C.onSurfaceVariant, marginTop: Spacing.xs, textAlign: 'center' },
  groupContainer: { marginBottom: Spacing.xl },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: Spacing.base, marginBottom: Spacing.md },
  groupTitle: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold', textTransform: 'uppercase', letterSpacing: 1, color: C.onSurfaceVariant },
  groupCount: { fontSize: Fonts.sizes.xs, fontFamily: 'Manrope-Medium', color: C.onSurfaceVariant, opacity: 0.6 },
  groupItems: { paddingHorizontal: Spacing.base, gap: Spacing.sm },
  itemContainer: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: C.surfaceContainerLowest, padding: Spacing.md,
    borderRadius: BorderRadius.xl, ...Shadows.sm, borderWidth: 1, borderColor: C.transparentBorder,
  },
  itemLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  iconCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.surfaceContainerHighest, alignItems: 'center', justifyContent: 'center' },
  itemTexts: { flex: 1 },
  itemTitle: { fontSize: Fonts.sizes.md, fontFamily: 'Manrope-Bold', color: C.onSurface, marginBottom: 2 },
  itemSubtitle: { fontSize: Fonts.sizes.xs, fontFamily: 'Manrope-Medium', color: C.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 0.5 },
  itemRight: { alignItems: 'flex-end', justifyContent: 'center', gap: 2 },
  itemAmount: { fontSize: Fonts.sizes.md, fontFamily: 'Manrope-Bold', color: C.onSurface },
});

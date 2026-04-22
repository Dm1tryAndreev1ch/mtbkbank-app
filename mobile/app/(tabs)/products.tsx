import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useStore } from '../../stores/useStore';
import { Colors, Fonts, Spacing, BorderRadius, Shadows, formatMoney } from '../../constants/theme';

export default function ProductsScreen() {
  const { accounts, loadAccounts, user, unreadCount } = useStore();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { loadAccounts(); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAccounts();
    setRefreshing(false);
  }, []);

  const accountIcons: Record<string, string> = {
    main: 'account-balance-wallet',
    savings: 'savings',
    currency: 'currency-exchange',
  };

  const accountNames: Record<string, string> = {
    main: 'Главный счёт',
    savings: 'Накопительный',
    currency: 'Валютный',
  };

  const totalBalance = accounts
    .filter((a: any) => a.currency === 'RUB')
    .reduce((sum: number, a: any) => sum + a.balance, 0);

  // Mock plans data (would come from API)
  const plans = [
    { name: 'Premium Vault', icon: 'workspace-premium', status: 'Активен', period: 'до 24 мар 2026', color: Colors.primary },
    { name: 'Travel Plus', icon: 'flight', status: 'Активен', period: 'до 12 июн 2026', color: Colors.tertiary },
  ];

  // Mock installments
  const installments = [
    { name: 'MacBook Pro M3', merchant: 'М.Видео', paid: 8, total: 12, monthly: 14200, remaining: 56800, icon: 'laptop-mac' },
    { name: 'iPhone 16 Pro', merchant: 'Apple Store', paid: 3, total: 24, monthly: 5400, remaining: 113400, icon: 'phone-iphone' },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.brandLabel}>VAULT PORTFOLIO</Text>
            <Text style={styles.pageTitle}>Продукты</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.bellBtn} onPress={() => router.push('/notifications')}>
              <MaterialIcons name="notifications-none" size={24} color={Colors.onSurfaceVariant} />
              {unreadCount > 0 && <View style={styles.bellDot} />}
            </TouchableOpacity>
            <TouchableOpacity style={styles.mbBadge} onPress={() => router.push('/(tabs)/cards')}>
              <Text style={styles.mbBadgeLabel}>MB</Text>
              <Text style={styles.mbBadgeValue}>{(user?.mbPoints || 0).toLocaleString('ru-RU')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Total Balance */}
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Общий баланс</Text>
          <Text style={styles.totalValue}>{formatMoney(totalBalance)}</Text>
          <View style={styles.totalTrend}>
            <MaterialIcons name="trending-up" size={16} color={Colors.primary} />
            <Text style={styles.totalTrendText}>+2.4% за месяц</Text>
          </View>
        </View>

        {/* Accounts */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Счета</Text>
          <View style={styles.accountsList}>
            {accounts.map((acc: any) => (
              <TouchableOpacity key={acc.id} style={styles.accountCard} onPress={() => Alert.alert('Счет', 'Детали счета скоро появятся')}>
                <View style={styles.accountLeft}>
                  <View style={styles.accountIcon}>
                    <MaterialIcons
                      name={(accountIcons[acc.type] || 'account-balance') as any}
                      size={24}
                      color={Colors.primary}
                    />
                  </View>
                  <View>
                    <Text style={styles.accountName}>{acc.name || accountNames[acc.type] || acc.type}</Text>
                    <Text style={styles.accountType}>
                      {acc.currency === 'RUB' ? 'Рубли' : acc.currency === 'USD' ? 'Доллары' : acc.currency}
                    </Text>
                  </View>
                </View>
                <View style={styles.accountRight}>
                  <Text style={styles.accountBalance}>
                    {formatMoney(acc.balance, acc.currency === 'USD' ? '$' : '₽')}
                  </Text>
                  <MaterialIcons name="chevron-right" size={20} color={Colors.outlineVariant} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Active Plans */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Активные планы</Text>
          <View style={styles.plansGrid}>
            {plans.map((plan, i) => (
              <View key={i} style={styles.planCard}>
                <View style={[styles.planIcon, { backgroundColor: `${plan.color}15` }]}>
                  <MaterialIcons name={plan.icon as any} size={28} color={plan.color} />
                </View>
                <Text style={styles.planName}>{plan.name}</Text>
                <View style={styles.planBadge}>
                  <View style={styles.planDot} />
                  <Text style={styles.planStatus}>{plan.status}</Text>
                </View>
                <Text style={styles.planPeriod}>{plan.period}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Installments */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Рассрочки</Text>
            <TouchableOpacity onPress={() => Alert.alert('Рассрочки', 'Открытие всех рассрочек')}>
              <Text style={styles.viewAll}>Все</Text>
            </TouchableOpacity>
          </View>
          {installments.map((inst, i) => {
            const progress = inst.paid / inst.total;
            return (
              <View key={i} style={styles.installmentCard}>
                <View style={styles.installmentHeader}>
                  <View style={styles.installmentLeft}>
                    <View style={styles.installmentIcon}>
                      <MaterialIcons name={inst.icon as any} size={24} color={Colors.onSurfaceVariant} />
                    </View>
                    <View>
                      <Text style={styles.installmentName}>{inst.name}</Text>
                      <Text style={styles.installmentMerchant}>{inst.merchant}</Text>
                    </View>
                  </View>
                  <Text style={styles.installmentMonthly}>₽ {inst.monthly.toLocaleString('ru-RU')}/мес</Text>
                </View>
                <View style={styles.installmentProgress}>
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
                  </View>
                  <View style={styles.progressLabels}>
                    <Text style={styles.progressPaid}>{inst.paid} из {inst.total} платежей</Text>
                    <Text style={styles.progressRemaining}>Осталось ₽ {inst.remaining.toLocaleString('ru-RU')}</Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { paddingBottom: 120 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: Spacing.xl, paddingTop: Spacing.xl, paddingBottom: Spacing.base,
  },
  brandLabel: {
    fontSize: Fonts.sizes.xs, fontWeight: Fonts.weights.bold, color: Colors.primary,
    letterSpacing: 3, marginBottom: 4,
  },
  pageTitle: {
    fontSize: Fonts.sizes['3xl'], fontWeight: Fonts.weights.extrabold,
    color: Colors.onSurface, letterSpacing: -0.5,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  bellBtn: { position: 'relative', padding: 8 },
  bellDot: {
    position: 'absolute', top: 8, right: 8, width: 8, height: 8,
    borderRadius: 4, backgroundColor: Colors.error,
  },
  mbBadge: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.full,
    paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row',
    alignItems: 'center', gap: 8, ...Shadows.primary,
  },
  mbBadgeLabel: {
    fontSize: Fonts.sizes.xs, fontWeight: Fonts.weights.bold, color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1,
  },
  mbBadgeValue: {
    fontSize: Fonts.sizes.sm, fontWeight: Fonts.weights.extrabold, color: Colors.onPrimary,
  },
  totalCard: {
    marginHorizontal: Spacing.base, padding: Spacing.xl,
    backgroundColor: Colors.surfaceContainerLowest, borderRadius: BorderRadius.lg,
    alignItems: 'center', ...Shadows.md,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
  },
  totalLabel: {
    fontSize: Fonts.sizes.sm, color: Colors.onSurfaceVariant, fontWeight: Fonts.weights.medium,
  },
  totalValue: {
    fontSize: Fonts.sizes['4xl'], fontWeight: Fonts.weights.extrabold,
    color: Colors.onSurface, letterSpacing: -1, marginTop: 4,
  },
  totalTrend: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8,
    backgroundColor: 'rgba(79,142,247,0.1)', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  totalTrendText: {
    fontSize: Fonts.sizes.sm, fontWeight: Fonts.weights.bold, color: Colors.primary,
  },
  section: { paddingHorizontal: Spacing.base, marginTop: Spacing['2xl'] },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    marginBottom: Spacing.base,
  },
  sectionTitle: {
    fontSize: Fonts.sizes.xl, fontWeight: Fonts.weights.bold, color: Colors.onSurface,
    marginBottom: Spacing.base,
  },
  viewAll: { fontSize: Fonts.sizes.sm, fontWeight: Fonts.weights.bold, color: Colors.primary, marginBottom: Spacing.base },
  accountsList: { gap: Spacing.sm },
  accountCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLowest, padding: Spacing.xl,
    borderRadius: BorderRadius.base, ...Shadows.sm,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)',
  },
  accountLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.base },
  accountIcon: {
    width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(79,142,247,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  accountName: { fontSize: Fonts.sizes.base, fontWeight: Fonts.weights.bold, color: Colors.onSurface },
  accountType: { fontSize: Fonts.sizes.sm, color: Colors.onSurfaceVariant, marginTop: 2 },
  accountRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  accountBalance: { fontSize: Fonts.sizes.base, fontWeight: Fonts.weights.extrabold, color: Colors.onSurface },
  plansGrid: { flexDirection: 'row', gap: Spacing.base },
  planCard: {
    flex: 1, backgroundColor: Colors.surfaceContainerLowest, borderRadius: BorderRadius.lg,
    padding: Spacing.xl, gap: Spacing.sm, ...Shadows.sm,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)',
  },
  planIcon: {
    width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
  },
  planName: { fontSize: Fonts.sizes.base, fontWeight: Fonts.weights.bold, color: Colors.onSurface },
  planBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  planDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e' },
  planStatus: { fontSize: Fonts.sizes.sm, fontWeight: Fonts.weights.bold, color: '#22c55e' },
  planPeriod: { fontSize: Fonts.sizes.sm, color: Colors.onSurfaceVariant },
  installmentCard: {
    backgroundColor: Colors.surfaceContainerLowest, borderRadius: BorderRadius.base,
    padding: Spacing.xl, marginBottom: Spacing.base, ...Shadows.sm,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)',
  },
  installmentHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: Spacing.base,
  },
  installmentLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.base },
  installmentIcon: {
    width: 48, height: 48, borderRadius: 14, backgroundColor: Colors.surfaceContainerHigh,
    alignItems: 'center', justifyContent: 'center',
  },
  installmentName: { fontSize: Fonts.sizes.base, fontWeight: Fonts.weights.bold, color: Colors.onSurface },
  installmentMerchant: { fontSize: Fonts.sizes.sm, color: Colors.onSurfaceVariant, marginTop: 2 },
  installmentMonthly: { fontSize: Fonts.sizes.md, fontWeight: Fonts.weights.bold, color: Colors.onSurfaceVariant },
  installmentProgress: { gap: Spacing.sm },
  progressBarBg: {
    width: '100%', height: 8, backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: 4, overflow: 'hidden',
  },
  progressBarFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 4 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  progressPaid: { fontSize: Fonts.sizes.sm, fontWeight: Fonts.weights.bold, color: Colors.primary },
  progressRemaining: { fontSize: Fonts.sizes.sm, color: Colors.onSurfaceVariant },
});

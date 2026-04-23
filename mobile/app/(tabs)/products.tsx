import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useStore } from '../../stores/useStore';
import { useThemeColor } from '../../hooks/useThemeColor';
import { Fonts, Spacing, BorderRadius, Shadows, formatMoney } from '../../constants/theme';

export default function ProductsScreen() {
  const { accounts, loadAccounts, user, unreadCount } = useStore();
  const colors = useThemeColor();
  const s = useMemo(() => mk(colors), [colors]);

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

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={s.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.brandLabel}>VAULT PORTFOLIO</Text>
            <Text style={s.pageTitle}>Продукты</Text>
          </View>
          <View style={s.headerRight}>
            <TouchableOpacity style={s.bellBtn} onPress={() => router.push('/notifications')}>
              <MaterialIcons name="notifications-none" size={24} color={colors.onSurfaceVariant} />
              {unreadCount > 0 && <View style={s.bellDot} />}
            </TouchableOpacity>
            <TouchableOpacity style={s.mbBadge} onPress={() => router.push('/(tabs)/cards')}>
              <Text style={s.mbBadgeLabel}>MB</Text>
              <Text style={s.mbBadgeValue}>{(user?.mbPoints || 0).toLocaleString('ru-RU')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Total Balance */}
        <View style={s.totalCard}>
          <Text style={s.totalLabel}>Общий баланс</Text>
          <Text style={s.totalValue}>{formatMoney(totalBalance)}</Text>
        </View>

        {/* Accounts */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Счета</Text>
          <View style={s.accountsList}>
            {accounts.map((acc: any) => (
              <View
                key={acc.id}
                style={s.accountCard}
              >
                <View style={s.accountLeft}>
                  <View style={s.accountIcon}>
                    <MaterialIcons
                      name={(accountIcons[acc.type] || 'account-balance') as any}
                      size={24}
                      color={colors.primary}
                    />
                  </View>
                  <View>
                    <Text style={s.accountName}>{acc.name || accountNames[acc.type] || acc.type}</Text>
                    <Text style={s.accountType}>
                      {acc.currency === 'RUB' ? 'Рубли' : acc.currency === 'USD' ? 'Доллары' : acc.currency}
                    </Text>
                  </View>
                </View>
                <View style={s.accountRight}>
                  <Text style={s.accountBalance}>
                    {formatMoney(acc.balance, acc.currency === 'USD' ? '$' : '₽')}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const mk = (C: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: C.background,
    },
    scrollContent: { paddingBottom: 120 },

    // Header
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      paddingHorizontal: Spacing.xl,
      paddingTop: Spacing.xl,
      paddingBottom: Spacing.base,
    },
    brandLabel: {
      fontSize: Fonts.sizes.xs,
      fontFamily: 'Manrope-ExtraBold',
      color: C.primary,
      letterSpacing: 3,
      marginBottom: 4,
    },
    pageTitle: {
      fontSize: Fonts.sizes['3xl'],
      fontFamily: 'Manrope-ExtraBold',
      color: C.onSurface,
      letterSpacing: -0.5,
    },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    bellBtn: { position: 'relative', padding: 8 },
    bellDot: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: C.error,
    },
    mbBadge: {
      backgroundColor: C.primary,
      borderRadius: BorderRadius.full,
      paddingHorizontal: 16,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      ...Shadows.primary,
    },
    mbBadgeLabel: {
      fontSize: Fonts.sizes.xs,
      fontFamily: 'Manrope-ExtraBold',
      color: 'rgba(255,255,255,0.7)',
      letterSpacing: 1,
    },
    mbBadgeValue: {
      fontSize: Fonts.sizes.sm,
      fontFamily: 'Manrope-ExtraBold',
      color: C.onPrimary,
    },

    // Total Card
    totalCard: {
      marginHorizontal: Spacing.base,
      padding: Spacing.xl,
      backgroundColor: C.surfaceContainerLowest,
      borderRadius: BorderRadius.lg,
      alignItems: 'center',
      ...Shadows.md,
      borderWidth: 1,
      borderColor: C.transparentBorder,
    },
    totalLabel: {
      fontSize: Fonts.sizes.sm,
      fontFamily: 'Manrope-Medium',
      color: C.onSurfaceVariant,
    },
    totalValue: {
      fontSize: Fonts.sizes['4xl'],
      fontFamily: 'Manrope-ExtraBold',
      color: C.onSurface,
      letterSpacing: -1,
      marginTop: 4,
    },

    // Sections
    section: {
      paddingHorizontal: Spacing.base,
      marginTop: Spacing['2xl'],
    },
    sectionTitle: {
      fontSize: Fonts.sizes.xl,
      fontFamily: 'Manrope-Bold',
      color: C.onSurface,
      marginBottom: Spacing.base,
    },

    // Accounts
    accountsList: { gap: Spacing.sm },
    accountCard: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: C.surfaceContainerLowest,
      padding: Spacing.xl,
      borderRadius: BorderRadius.base,
      ...Shadows.sm,
      borderWidth: 1,
      borderColor: C.transparentBorder,
    },
    accountLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.base },
    accountIcon: {
      width: 52,
      height: 52,
      borderRadius: 16,
      backgroundColor: `${C.primary}12`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    accountName: {
      fontSize: Fonts.sizes.base,
      fontFamily: 'Manrope-Bold',
      color: C.onSurface,
    },
    accountType: {
      fontSize: Fonts.sizes.sm,
      fontFamily: 'Manrope-Medium',
      color: C.onSurfaceVariant,
      marginTop: 2,
    },
    accountRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    accountBalance: {
      fontSize: Fonts.sizes.base,
      fontFamily: 'Manrope-ExtraBold',
      color: C.onSurface,
    },
  });

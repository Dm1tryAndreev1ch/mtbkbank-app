import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Fonts, Spacing, BorderRadius, Shadows, formatMoney } from '../constants/theme';
import { useThemeColor } from '../hooks/useThemeColor';
import { useStore } from '../stores/useStore';

export default function HistoryScreen() {
  const { transactions, loadTransactions } = useStore();
  const colors = useThemeColor();
  const s = useMemo(() => mk(colors), [colors]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadTransactions();
  }, []);

  const historyGroups = useMemo(() => {
    const groups: { [key: string]: { group: string; count: string; items: any[] } } = {};

    const sorted = [...transactions].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const filtered = search.trim()
      ? sorted.filter(t =>
          (t.merchant || t.type).toLowerCase().includes(search.toLowerCase())
        )
      : sorted;

    filtered.forEach(t => {
      const date = new Date(t.createdAt);
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      let groupKey = '';
      if (date.toDateString() === today.toDateString()) {
        groupKey = 'Сегодня';
      } else if (date.toDateString() === yesterday.toDateString()) {
        groupKey = 'Вчера';
      } else {
        groupKey = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
      }

      if (!groups[groupKey]) {
        groups[groupKey] = { group: groupKey, count: '0', items: [] };
      }

      const isPositive = t.type === 'TRANSFER_IN' || t.type === 'TOPUP';

      groups[groupKey].items.push({
        id: t.id,
        title: t.merchant || (isPositive ? 'Пополнение' : 'Операция'),
        subtitle: `${t.category || 'Операции'} • ${date.toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
        })}`,
        amount: `${isPositive ? '+' : '-'} ${formatMoney(t.amount)}`,
        iconType: t.merchantIcon ? 'icon' : isPositive ? 'icon_down' : 'icon_bag',
        merchantIcon: t.merchantIcon,
        positive: isPositive,
      });
    });

    const result = Object.values(groups);
    result.forEach(g => {
      g.count = `${g.items.length} ${
        g.items.length === 1
          ? 'ОПЕРАЦИЯ'
          : g.items.length < 5
          ? 'ОПЕРАЦИИ'
          : 'ОПЕРАЦИЙ'
      }`;
    });

    return result;
  }, [transactions, search]);

  const renderIcon = (item: any) => {
    if (item.iconType === 'icon_down') {
      return (
        <View style={[s.iconCircle, { backgroundColor: colors.primaryFixed }]}>
          <MaterialIcons name="arrow-downward" size={24} color={colors.primary} />
        </View>
      );
    }
    if (item.iconType === 'icon_play') {
      return (
        <View style={s.iconCircle}>
          <MaterialIcons name="smart-display" size={24} color={colors.primary} />
        </View>
      );
    }
    return (
      <View style={s.iconCircle}>
        <MaterialIcons
          name={(item.merchantIcon as any) || 'shopping-bag'}
          size={24}
          color={item.positive ? colors.primary : colors.onSurfaceVariant}
        />
      </View>
    );
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
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

      <ScrollView
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Search Input */}
        <View style={s.searchContainer}>
          <MaterialIcons name="search" size={20} color={colors.outline} style={s.searchIconLeft} />
          <TextInput
            placeholder="Поиск по операциям"
            placeholderTextColor={colors.outlineVariant}
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <MaterialIcons name="close" size={20} color={colors.outline} />
            </TouchableOpacity>
          )}
        </View>

        {/* Empty state */}
        {historyGroups.length === 0 && (
          <View style={s.emptyState}>
            <MaterialIcons name="receipt-long" size={48} color={colors.outlineVariant} />
            <Text style={s.emptyTitle}>Операций не найдено</Text>
            <Text style={s.emptySubtitle}>
              {search ? 'Попробуйте изменить запрос' : 'Здесь появятся ваши транзакции'}
            </Text>
          </View>
        )}

        {/* Transactions List */}
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
                >
                  <View style={s.itemLeft}>
                    {renderIcon(item)}
                    <View style={s.itemTexts}>
                      <Text style={s.itemTitle}>{item.title}</Text>
                      <Text style={s.itemSubtitle}>{item.subtitle}</Text>
                    </View>
                  </View>
                  <View style={s.itemRight}>
                    <Text
                      style={[
                        s.itemAmount,
                        item.positive && { color: colors.primary },
                      ]}
                    >
                      {item.amount}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
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
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: C.transparentBorder,
      backgroundColor: C.background,
    },
    headerTitle: {
      flex: 1,
      fontSize: Fonts.sizes.lg,
      fontFamily: 'Manrope-Bold',
      color: C.onSurface,
      textAlign: 'center',
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    iconBtn: {
      padding: 8,
    },
    scrollContent: {
      paddingBottom: Spacing['4xl'],
      paddingTop: Spacing.lg,
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.surfaceContainerLow,
      marginHorizontal: Spacing.base,
      borderRadius: BorderRadius.lg,
      paddingHorizontal: Spacing.base,
      height: 48,
      marginBottom: Spacing.xl,
      borderWidth: 1,
      borderColor: C.transparentBorder,
    },
    searchIconLeft: {
      marginRight: Spacing.sm,
    },
    searchInput: {
      flex: 1,
      fontSize: Fonts.sizes.md,
      color: C.onSurface,
      fontFamily: 'Manrope-Medium',
    },
    emptyState: {
      alignItems: 'center',
      paddingTop: Spacing['4xl'],
      paddingHorizontal: Spacing['2xl'],
    },
    emptyTitle: {
      fontSize: Fonts.sizes.base,
      fontFamily: 'Manrope-Bold',
      color: C.onSurface,
      marginTop: Spacing.base,
    },
    emptySubtitle: {
      fontSize: Fonts.sizes.sm,
      fontFamily: 'Manrope-Medium',
      color: C.onSurfaceVariant,
      marginTop: Spacing.xs,
      textAlign: 'center',
    },
    groupContainer: {
      marginBottom: Spacing.xl,
    },
    groupHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      paddingHorizontal: Spacing.base,
      marginBottom: Spacing.md,
    },
    groupTitle: {
      fontSize: Fonts.sizes.sm,
      fontFamily: 'Manrope-Bold',
      textTransform: 'uppercase',
      letterSpacing: 1,
      color: C.onSurfaceVariant,
    },
    groupCount: {
      fontSize: Fonts.sizes.xs,
      fontFamily: 'Manrope-Medium',
      color: C.onSurfaceVariant,
      opacity: 0.6,
    },
    groupItems: {
      paddingHorizontal: Spacing.base,
      gap: Spacing.sm,
    },
    itemContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: C.surfaceContainerLowest,
      padding: Spacing.md,
      borderRadius: BorderRadius.xl,
      ...Shadows.sm,
      borderWidth: 1,
      borderColor: C.transparentBorder,
    },
    itemLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      flex: 1,
    },
    iconCircle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: C.surfaceContainerHighest,
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemTexts: {
      flex: 1,
    },
    itemTitle: {
      fontSize: Fonts.sizes.md,
      fontFamily: 'Manrope-Bold',
      color: C.onSurface,
      marginBottom: 2,
    },
    itemSubtitle: {
      fontSize: Fonts.sizes.xs,
      fontFamily: 'Manrope-Medium',
      color: C.onSurfaceVariant,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    itemRight: {
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
    itemAmount: {
      fontSize: Fonts.sizes.md,
      fontFamily: 'Manrope-Bold',
      color: C.onSurface,
    },
  });

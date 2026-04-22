import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, Fonts, Spacing, BorderRadius, Shadows, formatMoney } from '../constants/theme';
import { useStore } from '../stores/useStore';

export default function HistoryScreen() {
  const { transactions, loadTransactions } = useStore();
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadTransactions();
  }, []);

  const historyGroups = useMemo(() => {
    const groups: { [key: string]: { group: string; count: string; items: any[] } } = {};
    
    // Sort transactions by date descending
    const sorted = [...transactions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Filter by search
    const filtered = search.trim() 
      ? sorted.filter(t => (t.merchant || t.type).toLowerCase().includes(search.toLowerCase()))
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
        subtitle: `${t.category || 'Операции'} • ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`,
        amount: `${isPositive ? '+' : '-'} ${formatMoney(t.amount)}`,
        iconType: t.merchantIcon ? 'icon' : (isPositive ? 'icon_down' : 'icon_bag'),
        merchantIcon: t.merchantIcon,
        positive: isPositive,
      });
    });

    const result = Object.values(groups);
    result.forEach(g => {
      g.count = `${g.items.length} ${g.items.length === 1 ? 'ОПЕРАЦИЯ' : (g.items.length < 5 ? 'ОПЕРАЦИИ' : 'ОПЕРАЦИЙ')}`;
    });
    
    return result;
  }, [transactions, search]);

  const renderIcon = (item: any) => {
    if (item.iconType === 'icon') {
      return (
        <View style={styles.iconCircle}>
          <MaterialIcons name={(item.merchantIcon as any) || 'shopping-bag'} size={24} color={item.positive ? Colors.primary : Colors.onSurfaceVariant} />
        </View>
      );
    }
    if (item.iconType === 'icon_down') {
      return (
        <View style={[styles.iconCircle, { backgroundColor: Colors.primaryFixed }]}>
          <MaterialIcons name="arrow-downward" size={24} color={Colors.primary} />
        </View>
      );
    }
    if (item.iconType === 'icon_play') {
      return (
        <View style={styles.iconCircle}>
          <MaterialIcons name="smart-display" size={24} color={Colors.primary} />
        </View>
      );
    }
    if (item.iconType === 'icon_bag') {
      return (
        <View style={styles.iconCircle}>
          <MaterialIcons name="shopping-bag" size={24} color={Colors.onSurfaceVariant} />
        </View>
      );
    }
    return null;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={Colors.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>История операций</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.iconBtn}>
            <MaterialIcons name="search" size={24} color={Colors.onSurfaceVariant} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn}>
            <MaterialIcons name="calendar-today" size={24} color={Colors.onSurfaceVariant} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Search Input */}
        <View style={styles.searchContainer}>
          <MaterialIcons name="search" size={20} color={Colors.outline} style={styles.searchIconLeft} />
          <TextInput
            placeholder="Поиск по операциям"
            placeholderTextColor={Colors.outlineVariant}
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
          />
          <TouchableOpacity style={styles.searchIconRight}>
            <MaterialIcons name="tune" size={24} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Transactions List */}
        {historyGroups.map((group, index) => (
          <View key={index} style={styles.groupContainer}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupTitle}>{group.group}</Text>
              <Text style={styles.groupCount}>{group.count}</Text>
            </View>
            <View style={styles.groupItems}>
              {group.items.map(item => (
                <TouchableOpacity key={item.id} style={styles.itemContainer} activeOpacity={0.7}>
                  <View style={styles.itemLeft}>
                    {renderIcon(item)}
                    <View style={styles.itemTexts}>
                      <Text style={styles.itemTitle}>{item.title}</Text>
                      <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
                    </View>
                  </View>
                  <View style={styles.itemRight}>
                    <Text style={[styles.itemAmount, item.positive && { color: Colors.primary }]}>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    backgroundColor: 'rgba(255,255,255,0.85)',
    zIndex: 10,
    ...Shadows.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: Fonts.family,
    fontWeight: '700',
    color: Colors.onSurface,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
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
    backgroundColor: Colors.surfaceContainerLow,
    marginHorizontal: Spacing.base,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.base,
    height: 48,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  searchIconLeft: {
    marginRight: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: Fonts.sizes.md,
    color: Colors.onSurface,
    fontFamily: Fonts.family,
  },
  searchIconRight: {
    marginLeft: Spacing.sm,
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
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: Colors.onSurfaceVariant,
    opacity: 0.8,
  },
  groupCount: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.onSurfaceVariant,
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
    backgroundColor: Colors.surfaceContainerLowest,
    padding: Spacing.md,
    borderRadius: BorderRadius.xl,
    ...Shadows.sm,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.02)',
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
    backgroundColor: Colors.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.surfaceContainerHighest,
  },
  itemTexts: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.onSurface,
    marginBottom: 2,
  },
  itemSubtitle: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.onSurfaceVariant,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  itemRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  itemAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.onSurface,
  },
});

import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Switch, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useStore } from '../../stores/useStore';
import * as api from '../../services/api';
import { PieChart } from 'react-native-chart-kit';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, FadeIn } from 'react-native-reanimated';
import { Fonts, Spacing, BorderRadius, Shadows, formatMoney } from '../../constants/theme';
import { useThemeColor } from '../../hooks/useThemeColor';

const screenWidth = Dimensions.get('window').width;

const SkeletonPulse = ({ style, colors }: { style: any, colors: any }) => {
  const opacity = useSharedValue(0.3);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.7, { duration: 800 }), -1, true);
  }, []);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[style, animatedStyle, { backgroundColor: colors.transparentBorder }]} />;
};

const PERIODS = [
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
  { id: 'year', label: 'Год' },
];

export default function AnalyticsScreen() {
  const { user, subscriptions, limits, loadSubscriptions, loadLimits, unreadCount } = useStore();
  const [analytics, setAnalytics] = useState<any>(null);
  const [period, setPeriod] = useState('month');
  const [loading, setLoading] = useState(true);

  const colors = useThemeColor();
  const styles = useMemo(() => getStyles(colors), [colors]);

  useEffect(() => {
    loadSubscriptions();
    loadLimits();
  }, []);

  useEffect(() => {
    setLoading(true);
    api.getAnalytics(period).then(({ data }) => {
      setAnalytics(data);
      setLoading(false);
    }).catch(() => {
      setAnalytics({
        totalSpent: 45200,
        breakdown: [
          { category: 'Супермаркеты', amount: 15000 },
          { category: 'Переводы', amount: 12000 },
          { category: 'Рестораны', amount: 8200 },
          { category: 'Развлечения', amount: 10000 },
        ]
      });
      setLoading(false);
    });
  }, [period]);

  const categoryColors = [colors.primary, colors.primaryContainer, colors.secondaryContainer, colors.tertiaryFixed, '#9333EA'];

  const chartData = analytics?.breakdown?.map((cat: any, index: number) => ({
    name: cat.category,
    population: cat.amount,
    color: categoryColors[index % categoryColors.length],
    legendFontColor: colors.onSurfaceVariant,
    legendFontSize: 12,
  })) || [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header Bar */}
        <View style={styles.headerBar}>
          <TouchableOpacity style={styles.bellBtn} onPress={() => router.push('/notifications')}>
            <MaterialIcons name="notifications-none" size={24} color={colors.onSurfaceVariant} />
            {unreadCount > 0 && <View style={styles.bellDot} />}
          </TouchableOpacity>
          <TouchableOpacity style={styles.mbBadge} onPress={() => router.push('/(tabs)/cards')}>
            <Text style={styles.mbLabel}>MB</Text>
            <Text style={styles.mbText}>{(user?.mbPoints || 0).toLocaleString('ru-RU')}</Text>
          </TouchableOpacity>
        </View>

        {/* Period Selector */}
        <View style={styles.periodSelectorGrid}>
          {PERIODS.map((p) => (
            <TouchableOpacity 
              key={p.id} 
              style={[styles.periodTab, period === p.id && styles.periodTabActive]}
              onPress={() => setPeriod(p.id)}
            >
              <Text style={[styles.periodTabText, period === p.id && styles.periodTabTextActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Chart Section */}
        <View style={styles.donutSection}>
          <Text style={styles.totalSpentLabel}>Всего потрачено</Text>
          {loading ? (
             <SkeletonPulse style={{ width: 140, height: 40, borderRadius: 8, marginTop: 8 }} colors={colors} />
          ) : (
            <Text style={styles.donutAmount}>
              ₽ {analytics ? Math.round(analytics.totalSpent).toLocaleString('ru-RU') : '0'}
            </Text>
          )}

          {loading ? (
            <SkeletonPulse style={{ width: screenWidth - 64, height: 220, borderRadius: 120, marginVertical: 20 }} colors={colors} />
          ) : chartData.length > 0 ? (
            <Animated.View entering={FadeIn} style={styles.chartContainer}>
              <PieChart
                data={chartData}
                width={screenWidth - 32}
                height={220}
                chartConfig={{
                  backgroundColor: colors.surface,
                  backgroundGradientFrom: colors.surface,
                  backgroundGradientTo: colors.surface,
                  color: (opacity = 1) => `rgba(100, 100, 100, ${opacity})`,
                }}
                accessor={"population"}
                backgroundColor={"transparent"}
                paddingLeft={"15"}
                center={[10, 0]}
                absolute
              />
            </Animated.View>
          ) : (
            <Text style={styles.emptyChartText}>Нет данных за этот период</Text>
          )}
        </View>

        {/* Category Legend Detail Grid */}
        <View style={styles.legendGrid}>
          {loading ? (
             Array.from({ length: 4 }).map((_, i) => (
              <SkeletonPulse key={i} style={[styles.legendItem, { height: 64, borderWidth: 0 }]} colors={colors} />
             ))
          ) : (
            (analytics?.breakdown || []).slice(0, 4).map((cat: any, i: number) => {
              const percentage = analytics.totalSpent > 0 ? (cat.amount / analytics.totalSpent) * 100 : 0;
              return (
                <View key={cat.category} style={styles.legendItem}>
                  <View style={styles.legendHeader}>
                     <View style={[styles.legendDot, { backgroundColor: categoryColors[i % categoryColors.length] }]} />
                     <Text style={styles.legendCategory} numberOfLines={1}>{cat.category}</Text>
                  </View>
                  <View style={styles.legendStats}>
                    <Text style={styles.legendAmount}>₽ {Math.round(cat.amount).toLocaleString('ru-RU')}</Text>
                    <Text style={styles.legendPercent}>{percentage.toFixed(1)}%</Text>
                  </View>
                </View>
              )
            })
          )}
        </View>

        {/* Subscriptions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Подписки</Text>
            <Text style={styles.sectionBadge}>
              {subscriptions.filter((s: any) => s.isActive).length} активных
            </Text>
          </View>
          <View style={styles.subsList}>
            {subscriptions.length === 0 ? (
              <Text style={styles.emptyText}>У вас нет подписок</Text>
            ) : subscriptions.map((sub: any) => (
              <View key={sub.id} style={styles.subItem}>
                <View style={styles.subLeft}>
                  <View style={styles.subIcon}>
                    <MaterialIcons name={(sub.icon as any) || 'subscriptions'} size={24} color={colors.primary} />
                  </View>
                  <View>
                    <Text style={styles.subName}>{sub.name}</Text>
                    <Text style={styles.subDetail}>
                      Списание {new Date(sub.nextPayment).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} • ₽ {sub.amount}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={sub.isActive}
                  trackColor={{ false: colors.surfaceContainerHigh, true: colors.primary }}
                  thumbColor={colors.surfaceContainerLowest}
                  onValueChange={async (val) => {
                    await api.toggleSubscription(sub.id, val);
                    loadSubscriptions();
                  }}
                />
              </View>
            ))}
          </View>
        </View>

        {/* Spending Limits */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Лимиты трат</Text>
            <TouchableOpacity onPress={() => router.push('/account')}>
              <MaterialIcons name="settings" size={20} color={colors.onSurfaceVariant} />
            </TouchableOpacity>
          </View>
          <View style={styles.limitsCard}>
            {limits.length === 0 ? (
               <Text style={styles.emptyText}>Лимиты не установлены</Text>
            ) : limits.map((limit: any, i: number) => {
              const progress = limit.limitAmount > 0 ? Math.min(limit.spentAmount / limit.limitAmount, 1) : 0;
              const isWarning = progress > 0.8;
              return (
                <View key={limit.id} style={styles.limitItem}>
                  <View style={styles.limitHeader}>
                    <Text style={styles.limitCategory}>{limit.category}</Text>
                    <Text style={[styles.limitAmounts, isWarning && { color: colors.error }]}>
                      ₽ {Math.round(limit.spentAmount).toLocaleString('ru-RU')} / ₽ {Math.round(limit.limitAmount).toLocaleString('ru-RU')}
                    </Text>
                  </View>
                  <View style={styles.limitBarBg}>
                    <View style={[
                      styles.limitBarFill,
                      { width: `${progress * 100}%` },
                      isWarning && { backgroundColor: colors.error },
                    ]} />
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (Colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { paddingBottom: 120, paddingTop: Spacing.base },
  headerBar: {
    flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center',
    paddingHorizontal: Spacing.base, gap: Spacing.sm, marginBottom: Spacing.base,
  },
  bellBtn: { position: 'relative', padding: 8 },
  bellDot: {
    position: 'absolute', top: 8, right: 8, width: 8, height: 8,
    borderRadius: 4, backgroundColor: Colors.error,
  },
  mbBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
    flexDirection: 'row', alignItems: 'center', gap: 6, ...Shadows.primary,
  },
  mbLabel: { fontSize: Fonts.sizes.xs, fontFamily: 'Manrope-Bold', color: '#ffffff', letterSpacing: 1 },
  mbText: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-ExtraBold', color: '#ffffff' },
  
  periodSelectorGrid: {
    flexDirection: 'row',
    marginHorizontal: Spacing.base,
    backgroundColor: Colors.surfaceContainerHigh,
    padding: 4,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.base,
  },
  periodTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: BorderRadius.sm,
  },
  periodTabActive: {
    backgroundColor: Colors.surfaceContainerLowest,
    ...Shadows.sm,
  },
  periodTabText: {
    fontFamily: 'Manrope-Medium',
    color: Colors.onSurfaceVariant,
    fontSize: Fonts.sizes.sm,
  },
  periodTabTextActive: {
    fontFamily: 'Manrope-Bold',
    color: Colors.onSurface,
  },

  donutSection: { alignItems: 'center', paddingVertical: Spacing.base, backgroundColor: Colors.surfaceContainerLowest, marginHorizontal: Spacing.base, borderRadius: BorderRadius.lg, ...Shadows.sm, borderWidth: 1, borderColor: Colors.transparentBorder },
  chartContainer: { alignItems: 'center', justifyContent: 'center' },
  
  totalSpentLabel: { fontSize: Fonts.sizes.sm, color: Colors.onSurfaceVariant, fontFamily: 'Manrope-Medium', marginTop: Spacing.base },
  donutAmount: {
    fontSize: Fonts.sizes['4xl'], fontFamily: 'Manrope-ExtraBold',
    color: Colors.onSurface, marginTop: 4,
  },
  emptyChartText: { color: Colors.onSurfaceVariant, fontFamily: 'Manrope-Medium', marginTop: 40, marginBottom: 40 },

  legendGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, width: '100%', marginTop: Spacing.base
  },
  legendItem: {
    flex: 1, minWidth: '45%', gap: Spacing.sm,
    backgroundColor: Colors.surfaceContainerLowest, padding: Spacing.base,
    borderRadius: BorderRadius.base, borderWidth: 1, borderColor: Colors.transparentBorder,
  },
  legendHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendCategory: { fontSize: Fonts.sizes.sm, color: Colors.onSurfaceVariant, fontFamily: 'Manrope-Medium', flexShrink: 1 },
  legendStats: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 2 },
  legendAmount: { fontSize: Fonts.sizes.md, fontFamily: 'Manrope-Bold', color: Colors.onSurface },
  legendPercent: { fontSize: Fonts.sizes.xs, fontFamily: 'Manrope-Bold', color: Colors.primary },

  section: { paddingHorizontal: Spacing.base, marginTop: Spacing.xl },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    marginBottom: Spacing.base,
  },
  sectionTitle: { fontSize: Fonts.sizes.xl, fontFamily: 'Manrope-Bold', letterSpacing: -0.3, color: Colors.onSurface },
  sectionBadge: {
    fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold',
    color: Colors.primary, textTransform: 'uppercase', letterSpacing: 1,
  },
  subsList: { gap: Spacing.sm },
  subItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLowest, padding: Spacing.base,
    borderRadius: BorderRadius.base, borderWidth: 1, borderColor: Colors.transparentBorder,
  },
  subLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.base },
  subIcon: {
    width: 48, height: 48, borderRadius: 12, backgroundColor: Colors.transparentBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  subName: { fontSize: Fonts.sizes.base, fontFamily: 'Manrope-Bold', color: Colors.onSurface },
  subDetail: { fontSize: Fonts.sizes.sm, color: Colors.onSurfaceVariant, fontFamily: 'Manrope-Medium' },

  limitsCard: {
    backgroundColor: Colors.surfaceContainerLowest, borderRadius: BorderRadius.lg,
    padding: Spacing.xl, gap: Spacing.xl, borderWidth: 1, borderColor: Colors.transparentBorder,
    ...Shadows.sm,
  },
  limitItem: { gap: Spacing.sm },
  limitHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  limitCategory: { fontSize: Fonts.sizes.md, fontFamily: 'Manrope-Bold', color: Colors.onSurface },
  limitAmounts: { fontSize: Fonts.sizes.md, fontFamily: 'Manrope-Medium', color: Colors.onSurfaceVariant },
  limitBarBg: {
    width: '100%', height: 8, backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: 4, overflow: 'hidden',
  },
  limitBarFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 4 },

  emptyText: { color: Colors.onSurfaceVariant, fontFamily: 'Manrope-Medium', textAlign: 'center', padding: Spacing.xl }
});

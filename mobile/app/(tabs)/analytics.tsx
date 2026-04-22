import React, { useCallback, useState, useMemo, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Switch, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useStore } from '../../stores/useStore';
import * as api from '../../services/api';
import { PieChart } from 'react-native-chart-kit';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, FadeIn } from 'react-native-reanimated';
import { Fonts, Spacing, BorderRadius, Shadows, formatMoney, toMaterialIconName } from '../../constants/theme';
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

  const fetchAnalytics = useCallback((p: string) => {
    setLoading(true);
    api.getAnalytics(p).then(({ data }) => {
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
  }, []);

  // Обновляем при каждом входе на экран
  useFocusEffect(
    useCallback(() => {
      fetchAnalytics(period);
      loadSubscriptions();
      loadLimits();
    }, [period])
  );

  // Обновляем при смене периода
  useEffect(() => {
    fetchAnalytics(period);
  }, [period]);

  const categoryColors = [colors.primary, colors.primaryContainer, colors.secondaryContainer, colors.tertiaryFixed, '#9333EA', '#f59e0b', '#ef4444', '#0ea5e9'];

  const chartData = analytics?.breakdown?.map((cat: any, index: number) => ({
    name: '', // пустое имя — легенда рисуется своя, не через PieChart
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
            <Text style={styles.mbLabel} allowFontScaling={false}>MB</Text>
            <Text style={styles.mbText} allowFontScaling={false}>{(user?.mbPoints || 0).toLocaleString('ru-RU')}</Text>
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
              <Text
                style={[styles.periodTabText, period === p.id && styles.periodTabTextActive]}
                allowFontScaling={false}
                numberOfLines={1}
              >
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Chart Section */}
        <View style={styles.donutSection}>
          <Text style={styles.totalSpentLabel} allowFontScaling={false}>Всего потрачено</Text>
          {loading ? (
            <SkeletonPulse style={{ width: 140, height: 40, borderRadius: 8, marginTop: 8 }} colors={colors} />
          ) : (
            <Text style={styles.donutAmount} allowFontScaling={false}>
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
                accessor="population"
                backgroundColor="transparent"
                paddingLeft="0"
                center={[0, 0]}
                absolute
                hasLegend={false}
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
            (analytics?.breakdown || []).map((cat: any, i: number) => {
              const percentage = analytics.totalSpent > 0 ? (cat.amount / analytics.totalSpent) * 100 : 0;
              return (
                <View key={cat.category} style={styles.legendItem}>
                  <View style={styles.legendHeader}>
                    <View style={[styles.legendDot, { backgroundColor: categoryColors[i % categoryColors.length] }]} />
                    <Text
                      style={styles.legendCategory}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      allowFontScaling={false}
                    >
                      {cat.category}
                    </Text>
                  </View>
                  <View style={styles.legendStats}>
                    <Text style={styles.legendAmount} allowFontScaling={false} numberOfLines={1}>
                      ₽ {Math.round(cat.amount).toLocaleString('ru-RU')}
                    </Text>
                    <Text style={styles.legendPercent} allowFontScaling={false}>
                      {percentage.toFixed(1)}%
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Subscriptions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle} allowFontScaling={false}>Подписки</Text>
            <Text style={styles.sectionBadge} allowFontScaling={false}>
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
                    <MaterialIcons name={toMaterialIconName(sub.icon) as any} size={24} color={colors.primary} />
                  </View>
                  <View style={styles.subTextWrap}>
                    <Text style={styles.subName} numberOfLines={1} allowFontScaling={false}>{sub.name}</Text>
                    <Text style={styles.subDetail} numberOfLines={1} allowFontScaling={false}>
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
            <Text style={styles.sectionTitle} allowFontScaling={false}>Лимиты трат</Text>
            <TouchableOpacity onPress={() => router.push('/account')}>
              <MaterialIcons name="settings" size={20} color={colors.onSurfaceVariant} />
            </TouchableOpacity>
          </View>
          <View style={styles.limitsCard}>
            {limits.length === 0 ? (
              <Text style={styles.emptyText}>Лимиты не установлены</Text>
            ) : limits.map((limit: any) => {
              const progress = limit.limitAmount > 0 ? Math.min(limit.spentAmount / limit.limitAmount, 1) : 0;
              const isWarning = progress > 0.8;
              return (
                <View key={limit.id} style={styles.limitItem}>
                  <View style={styles.limitHeader}>
                    <Text style={styles.limitCategory} numberOfLines={1} allowFontScaling={false}>
                      {limit.category}
                    </Text>
                    <Text
                      style={[styles.limitAmounts, isWarning && { color: colors.error }]}
                      allowFontScaling={false}
                      numberOfLines={1}
                    >
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
    flex: 1, paddingVertical: 8, paddingHorizontal: 4,
    alignItems: 'center', borderRadius: BorderRadius.sm, overflow: 'hidden',
  },
  periodTabActive: { backgroundColor: Colors.surfaceContainerLowest, ...Shadows.sm },
  periodTabText: {
    fontFamily: 'Manrope-Medium', color: Colors.onSurfaceVariant,
    fontSize: Fonts.sizes.sm, includeFontPadding: false,
  },
  periodTabTextActive: { fontFamily: 'Manrope-Bold', color: Colors.onSurface },

  donutSection: {
    alignItems: 'center', paddingVertical: Spacing.base,
    backgroundColor: Colors.surfaceContainerLowest,
    marginHorizontal: Spacing.base, borderRadius: BorderRadius.lg,
    ...Shadows.sm, borderWidth: 1, borderColor: Colors.transparentBorder,
  },
  chartContainer: { alignItems: 'center', justifyContent: 'center' },
  totalSpentLabel: {
    fontSize: Fonts.sizes.sm, color: Colors.onSurfaceVariant,
    fontFamily: 'Manrope-Medium', marginTop: Spacing.base,
  },
  donutAmount: {
    fontSize: Fonts.sizes['4xl'], fontFamily: 'Manrope-ExtraBold',
    color: Colors.onSurface, marginTop: 4,
  },
  emptyChartText: {
    color: Colors.onSurfaceVariant, fontFamily: 'Manrope-Medium',
    marginTop: 40, marginBottom: 40,
  },

  legendGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, marginTop: Spacing.base,
  },
  legendItem: {
    flex: 1, minWidth: '45%', maxWidth: '50%', gap: Spacing.sm,
    backgroundColor: Colors.surfaceContainerLowest,
    padding: Spacing.base, borderRadius: BorderRadius.base,
    borderWidth: 1, borderColor: Colors.transparentBorder, overflow: 'hidden',
  },
  legendHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, overflow: 'hidden' },
  legendDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  legendCategory: {
    fontSize: Fonts.sizes.sm, color: Colors.onSurfaceVariant,
    fontFamily: 'Manrope-Medium', flex: 1, includeFontPadding: false,
  },
  legendStats: {
    flexDirection: 'row', alignItems: 'flex-end',
    justifyContent: 'space-between', marginTop: 2, gap: 4,
  },
  legendAmount: {
    fontSize: Fonts.sizes.md, fontFamily: 'Manrope-Bold',
    color: Colors.onSurface, flexShrink: 1, includeFontPadding: false,
  },
  legendPercent: {
    fontSize: Fonts.sizes.xs, fontFamily: 'Manrope-Bold',
    color: Colors.primary, flexShrink: 0, includeFontPadding: false,
  },

  section: { paddingHorizontal: Spacing.base, marginTop: Spacing.xl },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    marginBottom: Spacing.base,
  },
  sectionTitle: {
    fontSize: Fonts.sizes.xl, fontFamily: 'Manrope-Bold',
    letterSpacing: -0.3, color: Colors.onSurface,
  },
  sectionBadge: {
    fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold',
    color: Colors.primary, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  subsList: { gap: Spacing.sm },
  subItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLowest, padding: Spacing.base,
    borderRadius: BorderRadius.base, borderWidth: 1, borderColor: Colors.transparentBorder,
    gap: Spacing.sm,
  },
  subLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.base, flex: 1, overflow: 'hidden' },
  subTextWrap: { flex: 1, overflow: 'hidden' },
  subIcon: {
    width: 48, height: 48, borderRadius: 12, backgroundColor: Colors.transparentBorder,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  subName: {
    fontSize: Fonts.sizes.base, fontFamily: 'Manrope-Bold',
    color: Colors.onSurface, includeFontPadding: false,
  },
  subDetail: {
    fontSize: Fonts.sizes.sm, color: Colors.onSurfaceVariant,
    fontFamily: 'Manrope-Medium', includeFontPadding: false,
  },

  limitsCard: {
    backgroundColor: Colors.surfaceContainerLowest, borderRadius: BorderRadius.lg,
    padding: Spacing.xl, gap: Spacing.xl, borderWidth: 1,
    borderColor: Colors.transparentBorder, ...Shadows.sm,
  },
  limitItem: { gap: Spacing.sm },
  limitHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', gap: Spacing.sm,
  },
  limitCategory: {
    fontSize: Fonts.sizes.md, fontFamily: 'Manrope-Bold',
    color: Colors.onSurface, flex: 1, includeFontPadding: false,
  },
  limitAmounts: {
    fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Medium',
    color: Colors.onSurfaceVariant, flexShrink: 0, includeFontPadding: false,
  },
  limitBarBg: {
    width: '100%', height: 8, backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: 4, overflow: 'hidden',
  },
  limitBarFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 4 },

  emptyText: {
    color: Colors.onSurfaceVariant, fontFamily: 'Manrope-Medium',
    textAlign: 'center', padding: Spacing.xl,
  },
});

import React, { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Switch, Dimensions, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useStore } from '../../stores/useStore';
import * as api from '../../services/api';
import { PieChart } from 'react-native-chart-kit';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, FadeIn } from 'react-native-reanimated';
import { Fonts, Spacing, BorderRadius, Shadows, toMaterialIconName } from '../../constants/theme';
import { useThemeColor } from '../../hooks/useThemeColor';

const screenWidth = Dimensions.get('window').width;

const SkeletonPulse = ({ style, colors }: { style: any; colors: any }) => {
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

const CATEGORY_COLORS = ['#4F8EF7', '#9333EA', '#0ea5e9', '#f59e0b', '#ef4444', '#22c55e', '#ec4899', '#14b8a6'];

export default function AnalyticsScreen() {
  const { user, subscriptions, limits, loadSubscriptions, loadLimits, unreadCount } = useStore();
  const [analytics, setAnalytics] = useState<any>(null);
  const [period, setPeriod] = useState('month');
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  // Optimistic subscription state for toggle rollback
  const [localSubs, setLocalSubs] = useState<any[]>([]);

  const abortRef = useRef<AbortController | null>(null);

  const colors = useThemeColor();
  const styles = useMemo(() => getStyles(colors), [colors]);

  // Keep localSubs in sync with store when subscriptions change
  useEffect(() => {
    setLocalSubs(subscriptions);
  }, [subscriptions]);

  const fetchAnalytics = useCallback((p: string) => {
    // Cancel any in-flight request for the previous period
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setFetchError(false);

    api.getAnalytics(p)
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        setAnalytics(data);
        setLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setAnalytics(null);
        setFetchError(true);
        setLoading(false);
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchAnalytics(period);
      loadSubscriptions();
      loadLimits();
      return () => {
        // Cancel pending request when screen loses focus
        if (abortRef.current) abortRef.current.abort();
      };
    }, [period, fetchAnalytics])
  );

  const breakdown: any[] = analytics?.breakdown || [];

  const chartWidth = screenWidth - Spacing.base * 4;
  const piePaddingLeftNum = Math.max(0, Math.round((chartWidth - 160) / 2));
  const piePaddingLeft = String(isNaN(piePaddingLeftNum) ? 0 : piePaddingLeftNum);

  const chartData = breakdown.map((cat, index) => ({
    name: ' ',
    population: cat.amount,
    color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
    legendFontColor: colors.onSurfaceVariant,
    legendFontSize: 12,
  }));

  const handleToggleSubscription = async (subId: string, currentValue: boolean) => {
    const newValue = !currentValue;
    // Optimistic update
    setLocalSubs(prev => prev.map(s => s.id === subId ? { ...s, isActive: newValue } : s));
    try {
      await api.toggleSubscription(subId, newValue);
      loadSubscriptions();
    } catch {
      // Rollback on failure
      setLocalSubs(prev => prev.map(s => s.id === subId ? { ...s, isActive: currentValue } : s));
      Alert.alert('Ошибка', 'Не удалось изменить статус подписки');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Header */}
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
        <View style={styles.periodRow}>
          {PERIODS.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.periodTab, period === p.id && styles.periodTabActive]}
              onPress={() => setPeriod(p.id)}
            >
              <Text style={[styles.periodTabText, period === p.id && styles.periodTabTextActive]} allowFontScaling={false}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Chart Card */}
        <View style={styles.chartCard}>
          <Text style={styles.totalLabel} allowFontScaling={false}>Всего потрачено</Text>
          {loading
            ? <SkeletonPulse style={{ width: 160, height: 38, borderRadius: 8, marginTop: 6, marginBottom: 4, alignSelf: 'center' }} colors={colors} />
            : <Text style={styles.totalAmount} allowFontScaling={false} adjustsFontSizeToFit numberOfLines={1}>₽ {analytics ? Math.round(analytics.totalSpent).toLocaleString('ru-RU') : '0'}</Text>
          }

          {loading ? (
            <SkeletonPulse style={{ width: 200, height: 200, borderRadius: 100, marginVertical: 16, alignSelf: 'center' }} colors={colors} />
          ) : fetchError ? (
            <View style={styles.errorState}>
              <MaterialIcons name="cloud-off" size={40} color={colors.error} />
              <Text style={[styles.errorText, { color: colors.error }]}>Не удалось загрузить данные</Text>
              <TouchableOpacity onPress={() => fetchAnalytics(period)} style={[styles.retryBtn, { borderColor: colors.primary }]}>
                <Text style={[styles.retryBtnText, { color: colors.primary }]}>Повторить</Text>
              </TouchableOpacity>
            </View>
          ) : chartData.length > 0 ? (
            <Animated.View entering={FadeIn} style={styles.pieWrap}>
              <PieChart
                data={chartData}
                width={chartWidth}
                height={200}
                chartConfig={{
                  color: (opacity = 1) => `rgba(100,100,100,${opacity})`,
                  backgroundGradientFrom: colors.surfaceContainerLowest,
                  backgroundGradientTo: colors.surfaceContainerLowest,
                  backgroundColor: colors.surfaceContainerLowest,
                }}
                accessor="population"
                backgroundColor="transparent"
                paddingLeft={piePaddingLeft}
                absolute
                hasLegend={false}
              />
            </Animated.View>
          ) : (
            <Text style={styles.emptyChart}>Нет данных за этот период</Text>
          )}

          <View style={styles.legendDivider} />
          <Text style={styles.legendTitle} allowFontScaling={false}>Категории</Text>

          <View style={styles.legendGrid}>
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonPulse key={i} style={styles.legendItem} colors={colors} />
                ))
              : breakdown.map((cat, i) => {
                  const pct = analytics?.totalSpent > 0
                    ? (cat.amount / analytics.totalSpent) * 100
                    : 0;
                  return (
                    <View key={cat.category} style={styles.legendItem}>
                      <View style={styles.legendRow}>
                        <View style={[styles.legendDot, { backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }]} />
                        <Text style={styles.legendCat} numberOfLines={1} allowFontScaling={false}>{cat.category}</Text>
                      </View>
                      <Text style={styles.legendAmt} numberOfLines={1} allowFontScaling={false}>₽ {Math.round(cat.amount).toLocaleString('ru-RU')}</Text>
                      <Text style={styles.legendPct} allowFontScaling={false}>{pct.toFixed(1)}%</Text>
                    </View>
                  );
                })
            }
          </View>
        </View>

        {/* Subscriptions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle} allowFontScaling={false}>Подписки</Text>
            <Text style={styles.sectionBadge} allowFontScaling={false}>
              {localSubs.filter((s: any) => s.isActive).length} активных
            </Text>
          </View>
          <View style={styles.subsList}>
            {localSubs.length === 0
              ? <Text style={styles.emptyText}>У вас нет подписок</Text>
              : localSubs.map((sub: any) => (
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
                    onValueChange={() => handleToggleSubscription(sub.id, sub.isActive)}
                  />
                </View>
              ))
            }
          </View>
        </View>

        {/* Limits */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle} allowFontScaling={false}>Лимиты трат</Text>
            <TouchableOpacity
              style={styles.gearBtn}
              onPress={() => router.push('/limits')}
              accessibilityLabel="Настроить лимиты"
            >
              <MaterialIcons name="settings" size={20} color={colors.primary} />
              <Text style={[styles.gearLabel, { color: colors.primary }]}>Настроить</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.limitsCard}>
            {limits.length === 0
              ? <Text style={styles.emptyText}>Лимиты не установлены</Text>
              : limits.map((limit: any) => {
                const progress = limit.limitAmount > 0 ? Math.min(limit.spentAmount / limit.limitAmount, 1) : 0;
                const warn = progress > 0.8;
                return (
                  <View key={limit.id} style={styles.limitItem}>
                    <View style={styles.limitHeader}>
                      <Text style={styles.limitCat} numberOfLines={1} allowFontScaling={false}>{limit.category}</Text>
                      <Text style={[styles.limitAmts, warn && { color: colors.error }]} allowFontScaling={false} numberOfLines={1}>
                        ₽ {Math.round(limit.spentAmount).toLocaleString('ru-RU')} / ₽ {Math.round(limit.limitAmount).toLocaleString('ru-RU')}
                      </Text>
                    </View>
                    <View style={styles.limitBarBg}>
                      <View style={[styles.limitBarFill, { width: `${progress * 100}%` }, warn && { backgroundColor: colors.error }]} />
                    </View>
                  </View>
                );
              })
            }
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (C: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  scrollContent: { paddingBottom: 120, paddingTop: Spacing.base },

  headerBar: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: Spacing.base, gap: Spacing.sm, marginBottom: Spacing.base },
  bellBtn: { position: 'relative', padding: 8 },
  bellDot: { position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: C.error },
  mbBadge: { backgroundColor: C.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 6, ...Shadows.primary },
  mbLabel: { fontSize: Fonts.sizes.xs, fontFamily: 'Manrope-Bold', color: '#fff', letterSpacing: 1 },
  mbText: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-ExtraBold', color: '#fff' },

  periodRow: { flexDirection: 'row', marginHorizontal: Spacing.base, backgroundColor: C.surfaceContainerHigh, padding: 4, borderRadius: BorderRadius.md, marginBottom: Spacing.base },
  periodTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: BorderRadius.sm },
  periodTabActive: { backgroundColor: C.surfaceContainerLowest, ...Shadows.sm },
  periodTabText: { fontFamily: 'Manrope-Medium', color: C.onSurfaceVariant, fontSize: Fonts.sizes.sm },
  periodTabTextActive: { fontFamily: 'Manrope-Bold', color: C.onSurface },

  chartCard: {
    marginHorizontal: Spacing.base,
    backgroundColor: C.surfaceContainerLowest,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base,
    paddingHorizontal: Spacing.base,
    borderWidth: 1,
    borderColor: C.transparentBorder,
    ...Shadows.sm,
  },
  totalLabel: { fontSize: Fonts.sizes.sm, color: C.onSurfaceVariant, fontFamily: 'Manrope-Medium', marginTop: Spacing.sm, textAlign: 'center' },
  totalAmount: { fontSize: Fonts.sizes['2xl'], fontFamily: 'Manrope-ExtraBold', color: C.onSurface, textAlign: 'center', marginTop: 4, marginBottom: 4 },
  pieWrap: { alignItems: 'center', overflow: 'hidden' },
  emptyChart: { color: C.onSurfaceVariant, fontFamily: 'Manrope-Medium', textAlign: 'center', paddingVertical: 40 },
  errorState: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  errorText: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold', textAlign: 'center' },
  retryBtn: { borderWidth: 1, borderRadius: BorderRadius.full, paddingHorizontal: 20, paddingVertical: 8 },
  retryBtnText: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold' },

  legendDivider: { height: 1, backgroundColor: C.transparentBorder, marginVertical: Spacing.base },
  legendTitle: { fontSize: Fonts.sizes.xs, fontFamily: 'Manrope-Bold', color: C.onSurfaceVariant, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: Spacing.sm },

  legendGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  legendItem: {
    flexBasis: '47%', flexGrow: 0, flexShrink: 0,
    backgroundColor: C.surfaceContainerHigh,
    padding: Spacing.sm, borderRadius: BorderRadius.base, gap: 2, minHeight: 72,
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  legendDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  legendCat: { fontSize: Fonts.sizes.xs, color: C.onSurfaceVariant, fontFamily: 'Manrope-Medium', flex: 1 },
  legendAmt: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold', color: C.onSurface, marginTop: 2 },
  legendPct: { fontSize: Fonts.sizes.xs, fontFamily: 'Manrope-Bold', color: C.primary },

  section: { paddingHorizontal: Spacing.base, marginTop: Spacing.xl },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.base },
  sectionTitle: { fontSize: Fonts.sizes.xl, fontFamily: 'Manrope-Bold', letterSpacing: -0.3, color: C.onSurface },
  sectionBadge: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold', color: C.primary, textTransform: 'uppercase', letterSpacing: 0.5 },

  gearBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    backgroundColor: `${C.primary}14`,
  },
  gearLabel: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold' },

  subsList: { gap: Spacing.sm },
  subItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.surfaceContainerLowest, padding: Spacing.base, borderRadius: BorderRadius.base, borderWidth: 1, borderColor: C.transparentBorder, gap: Spacing.sm },
  subLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.base, flex: 1, overflow: 'hidden' },
  subTextWrap: { flex: 1, overflow: 'hidden' },
  subIcon: { width: 48, height: 48, borderRadius: 12, backgroundColor: C.transparentBorder, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  subName: { fontSize: Fonts.sizes.base, fontFamily: 'Manrope-Bold', color: C.onSurface },
  subDetail: { fontSize: Fonts.sizes.sm, color: C.onSurfaceVariant, fontFamily: 'Manrope-Medium' },

  limitsCard: { backgroundColor: C.surfaceContainerLowest, borderRadius: BorderRadius.lg, padding: Spacing.xl, gap: Spacing.xl, borderWidth: 1, borderColor: C.transparentBorder, ...Shadows.sm },
  limitItem: { gap: Spacing.sm },
  limitHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm },
  limitCat: { fontSize: Fonts.sizes.md, fontFamily: 'Manrope-Bold', color: C.onSurface, flex: 1, minWidth: 0 },
  limitAmts: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Medium', color: C.onSurfaceVariant, flexShrink: 0, maxWidth: '55%' },
  limitBarBg: { width: '100%', height: 8, backgroundColor: C.surfaceContainerHigh, borderRadius: 4, overflow: 'hidden' },
  limitBarFill: { height: '100%', backgroundColor: C.primary, borderRadius: 4 },

  emptyText: { color: C.onSurfaceVariant, fontFamily: 'Manrope-Medium', textAlign: 'center', padding: Spacing.xl },
});

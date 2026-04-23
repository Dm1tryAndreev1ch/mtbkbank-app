import React, { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Switch, Dimensions, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSpring, withRepeat, withSequence,
  Easing, interpolate, FadeIn, FadeInDown, SlideInRight,
} from 'react-native-reanimated';
import { useThemeStore } from '../../stores/themeStore';
import { useAuthStore } from '../../stores/authStore';
import { api } from '../../services/api';
import { formatMoney } from '../../constants/theme';
import { toMaterialIconName } from '../../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Period = 'week' | 'month' | 'year';

interface CategoryBreakdown {
  category: string;
  amount: number;
  count: number;
  icon: string;
  color: string;
}

interface Subscription {
  merchant: string;
  amount: number;
  nextPayment: string;
  icon: string;
}

interface SpendingLimit {
  category: string;
  limitAmount: number;
  spentAmount: number;
  icon: string;
}

interface Analytics {
  totalSpent: number;
  transactionCount: number;
  avgTransaction: number;
  breakdown: CategoryBreakdown[];
  subscriptions: Subscription[];
  limits: SpendingLimit[];
  topMerchant: string | null;
  savingsRate: number;
}

const PERIOD_LABELS: Record<Period, string> = { week: 'Неделя', month: 'Месяц', year: 'Год' };

const AnimatedBar = ({ value, maxValue, color, delay = 0 }: { value: number; maxValue: number; color: string; delay?: number }) => {
  const width = useSharedValue(0);
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  useEffect(() => {
    width.value = withTiming(pct, { duration: 600, easing: Easing.out(Easing.cubic) });
  }, [pct]);
  const style = useAnimatedStyle(() => ({ width: `${width.value}%` as any }));
  return (
    <View style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden', flex: 1 }}>
      <Animated.View style={[{ height: '100%', backgroundColor: color, borderRadius: 3 }, style]} />
    </View>
  );
};

export default function AnalyticsScreen() {
  const { colors } = useThemeStore();
  const { token } = useAuthStore();
  const [period, setPeriod] = useState<Period>('month');
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'overview' | 'categories' | 'subscriptions' | 'limits'>('overview');

  const s = useMemo(() => styles(colors), [colors]);

  const fetchAnalytics = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.getAnalytics(p);
      setAnalytics(data);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Не удалось загрузить аналитику');
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchAnalytics(period);
    }, [period, fetchAnalytics])
  );

  const maxCatAmount = useMemo(
    () => (analytics?.breakdown?.length ? Math.max(...analytics.breakdown.map((c) => c.amount)) : 1),
    [analytics]
  );

  const totalCatAmount = useMemo(
    () => analytics?.breakdown?.reduce((sum, c) => sum + c.amount, 0) || 0,
    [analytics]
  );

  const catColors = ['#4F8EF7', '#9333EA', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#f97316', '#8b5cf6'];

  const renderOverview = () => (
    <Animated.View entering={FadeInDown.duration(400)}>
      <View style={s.overviewGrid}>
        <View style={[s.overviewCard, { flex: 1 }]}>
          <MaterialIcons name="trending-down" size={18} color="#ef4444" />
          <Text style={s.overviewLabel}>Расходы</Text>
          {loading
            ? <View style={s.skeleton} />
            : <Text style={s.totalAmount} allowFontScaling={false} adjustsFontSizeToFit numberOfLines={1}>Br {analytics ? Math.round(analytics.totalSpent).toLocaleString('ru-RU') : '0'}</Text>}
        </View>
        <View style={[s.overviewCard, { flex: 1 }]}>
          <MaterialIcons name="receipt-long" size={18} color={colors.primary} />
          <Text style={s.overviewLabel}>Транзакций</Text>
          {loading
            ? <View style={s.skeleton} />
            : <Text style={s.overviewValue}>{analytics?.transactionCount ?? 0}</Text>}
        </View>
      </View>
      <View style={s.overviewGrid}>
        <View style={[s.overviewCard, { flex: 1 }]}>
          <MaterialIcons name="calculate" size={18} color="#f59e0b" />
          <Text style={s.overviewLabel}>Средний чек</Text>
          {loading
            ? <View style={s.skeleton} />
            : <Text style={s.overviewValue}>{formatMoney(analytics?.avgTransaction ?? 0)}</Text>}
        </View>
        <View style={[s.overviewCard, { flex: 1 }]}>
          <MaterialIcons name="store" size={18} color="#10b981" />
          <Text style={s.overviewLabel}>Топ магазин</Text>
          {loading
            ? <View style={s.skeleton} />
            : <Text style={s.overviewValue} numberOfLines={1}>{analytics?.topMerchant ?? '—'}</Text>}
        </View>
      </View>
    </Animated.View>
  );

  const renderCategories = () => {
    if (!analytics?.breakdown?.length) {
      return <View style={s.emptyState}><MaterialIcons name="pie-chart" size={40} color={colors.onSurfaceVariant} /><Text style={s.emptyText}>Нет данных за этот период</Text></View>;
    }
    return (
      <Animated.View entering={FadeInDown.duration(400)}>
        {analytics.breakdown.map((cat, i) => (
          <Animated.View key={cat.category} entering={SlideInRight.delay(i * 60).duration(400)} style={s.catRow}>
            <View style={[s.catIcon, { backgroundColor: `${catColors[i % catColors.length]}22` }]}>
              <MaterialIcons name={toMaterialIconName(cat.icon) as any} size={18} color={catColors[i % catColors.length]} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={s.catName}>{cat.category}</Text>
                <Text style={s.legendAmt} numberOfLines={1} allowFontScaling={false}>Br {Math.round(cat.amount).toLocaleString('ru-RU')}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <AnimatedBar value={cat.amount} maxValue={maxCatAmount} color={catColors[i % catColors.length]} delay={i * 60} />
                <Text style={s.catPct}>{totalCatAmount > 0 ? Math.round((cat.amount / totalCatAmount) * 100) : 0}%</Text>
              </View>
            </View>
          </Animated.View>
        ))}
      </Animated.View>
    );
  };

  const renderSubscriptions = () => {
    if (!analytics?.subscriptions?.length) {
      return <View style={s.emptyState}><MaterialIcons name="repeat" size={40} color={colors.onSurfaceVariant} /><Text style={s.emptyText}>Регулярных платежей не обнаружено</Text></View>;
    }
    return (
      <Animated.View entering={FadeInDown.duration(400)}>
        {analytics.subscriptions.map((sub, i) => (
          <View key={i} style={s.subRow}>
            <View style={s.subIcon}>
              <MaterialIcons name={toMaterialIconName(sub.icon) as any} size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.subName}>{sub.merchant}</Text>
              <Text style={s.subMeta}>
                Списание {new Date(sub.nextPayment).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} • Br {sub.amount}
              </Text>
            </View>
          </View>
        ))}
      </Animated.View>
    );
  };

  const renderLimits = () => {
    if (!analytics?.limits?.length) {
      return <View style={s.emptyState}><MaterialIcons name="speed" size={40} color={colors.onSurfaceVariant} /><Text style={s.emptyText}>Лимиты не установлены</Text></View>;
    }
    return (
      <Animated.View entering={FadeInDown.duration(400)}>
        {analytics.limits.map((limit, i) => {
          const pct = limit.limitAmount > 0 ? (limit.spentAmount / limit.limitAmount) * 100 : 0;
          const color = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#10b981';
          return (
            <View key={i} style={s.limitRow}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={s.limitName}>{limit.category}</Text>
                <Text style={[s.limitPct, { color }]}>{Math.round(pct)}%</Text>
              </View>
              <AnimatedBar value={limit.spentAmount} maxValue={limit.limitAmount} color={color} />
              <Text style={s.limitAmts}>
                Br {Math.round(limit.spentAmount).toLocaleString('ru-RU')} / Br {Math.round(limit.limitAmount).toLocaleString('ru-RU')}
              </Text>
            </View>
          );
        })}
      </Animated.View>
    );
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Text style={s.title}>Аналитика</Text>
        <View style={s.periodRow}>
          {(['week', 'month', 'year'] as Period[]).map((p) => (
            <TouchableOpacity
              key={p}
              style={[s.periodBtn, period === p && s.periodBtnActive]}
              onPress={() => setPeriod(p)}
              activeOpacity={0.7}
            >
              <Text style={[s.periodLabel, period === p && s.periodLabelActive]}>{PERIOD_LABELS[p]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={s.tabRow}>
        {(['overview', 'categories', 'subscriptions', 'limits'] as const).map((sec) => {
          const icons = { overview: 'dashboard', categories: 'pie-chart', subscriptions: 'repeat', limits: 'speed' } as const;
          const labels = { overview: 'Обзор', categories: 'Категории', subscriptions: 'Подписки', limits: 'Лимиты' };
          return (
            <TouchableOpacity
              key={sec}
              style={[s.tabBtn, activeSection === sec && s.tabBtnActive]}
              onPress={() => setActiveSection(sec)}
              activeOpacity={0.7}
            >
              <MaterialIcons name={icons[sec]} size={16} color={activeSection === sec ? colors.primary : colors.onSurfaceVariant} />
              <Text style={[s.tabLabel, activeSection === sec && { color: colors.primary }]}>{labels[sec]}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {error ? (
          <View style={s.emptyState}>
            <MaterialIcons name="error-outline" size={40} color="#ef4444" />
            <Text style={[s.emptyText, { color: '#ef4444' }]}>{error}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={() => fetchAnalytics(period)}>
              <Text style={s.retryLabel}>Повторить</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {activeSection === 'overview' && renderOverview()}
            {activeSection === 'categories' && renderCategories()}
            {activeSection === 'subscriptions' && renderSubscriptions()}
            {activeSection === 'limits' && renderLimits()}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  title: { fontSize: 24, fontWeight: '700', color: colors.onSurface, marginBottom: 12 },
  periodRow: { flexDirection: 'row', backgroundColor: colors.surfaceContainer, borderRadius: 12, padding: 3, gap: 2 },
  periodBtn: { flex: 1, paddingVertical: 6, borderRadius: 10, alignItems: 'center' },
  periodBtnActive: { backgroundColor: colors.surface },
  periodLabel: { fontSize: 13, fontWeight: '500', color: colors.onSurfaceVariant },
  periodLabelActive: { color: colors.onSurface, fontWeight: '600' },
  tabRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 4 },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 10, gap: 2 },
  tabBtnActive: { backgroundColor: `${colors.primary}15` },
  tabLabel: { fontSize: 10, fontWeight: '500', color: colors.onSurfaceVariant },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32, gap: 12 },
  overviewGrid: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  overviewCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 14, gap: 4 },
  overviewLabel: { fontSize: 11, color: colors.onSurfaceVariant, fontWeight: '500', marginTop: 2 },
  overviewValue: { fontSize: 18, fontWeight: '700', color: colors.onSurface },
  totalAmount: { fontSize: 20, fontWeight: '800', color: colors.onSurface },
  skeleton: { height: 20, borderRadius: 6, backgroundColor: colors.surfaceContainerHigh, width: '60%', marginTop: 4 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 14, padding: 12, marginBottom: 8 },
  catIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  catName: { fontSize: 13, fontWeight: '600', color: colors.onSurface },
  legendAmt: { fontSize: 13, fontWeight: '700', color: colors.onSurface },
  catPct: { fontSize: 11, fontWeight: '600', color: colors.onSurfaceVariant, width: 30, textAlign: 'right' },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 14, padding: 12, marginBottom: 8 },
  subIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: `${colors.primary}20`, alignItems: 'center', justifyContent: 'center' },
  subName: { fontSize: 13, fontWeight: '600', color: colors.onSurface },
  subMeta: { fontSize: 11, color: colors.onSurfaceVariant, marginTop: 2 },
  limitRow: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 8 },
  limitName: { fontSize: 13, fontWeight: '600', color: colors.onSurface },
  limitPct: { fontSize: 13, fontWeight: '700' },
  limitAmts: { fontSize: 11, color: colors.onSurfaceVariant, marginTop: 6 },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 14, color: colors.onSurfaceVariant, textAlign: 'center' },
  retryBtn: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 8, backgroundColor: colors.primary, borderRadius: 10 },
  retryLabel: { color: '#fff', fontWeight: '600', fontSize: 14 },
});

import React, { useEffect, useCallback, useState, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, FlatList, Dimensions, NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useStore } from '../../stores/useStore';
import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming,
  withSequence, FadeIn, Easing,
} from 'react-native-reanimated';
import { Fonts, Spacing, BorderRadius, Shadows, formatMoney, toMaterialIconName, getRarityColor } from '../../constants/theme';
import { useThemeColor } from '../../hooks/useThemeColor';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CAROUSEL_ITEM_WIDTH = SCREEN_WIDTH * 0.72;
const CAROUSEL_ITEM_HEIGHT = 120;
const DECK_WIDGET_WIDTH = SCREEN_WIDTH * 0.24;

// ─── Skeleton ────────────────────────────────────────────────────────────────
const SkeletonPulse = ({ style, colors }: { style: any; colors: any }) => {
  const opacity = useSharedValue(0.3);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.7, { duration: 800 }), -1, true);
  }, []);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[style, animatedStyle, { backgroundColor: colors.transparentBorder }]} />;
};

// ─── MB Badge ─────────────────────────────────────────────────────────────────
const MbBadge = ({ mbPoints, onPress, styles }: { mbPoints: number; onPress: () => void; styles: any }) => {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1.0, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, []);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <Animated.View style={[styles.mbBadge, animatedStyle]}>
        <Text style={styles.mbText}>MB</Text>
        <Text style={styles.mbPoints}>{mbPoints.toLocaleString('ru-RU')}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
};

// ─── Promo Carousel ───────────────────────────────────────────────────────────
const PROMOS = [
  {
    id: '1',
    title: 'Кэшбэк до 10%',
    subtitle: 'С легендарной картой на любые покупки',
    bg: ['#4F8EF7', '#1E40AF'],
    icon: 'stars' as const,
  },
  {
    id: '2',
    title: 'Магазин карточек',
    subtitle: 'Купи редкую карту за MB-баллы',
    bg: ['#9333ea', '#6b21a8'],
    icon: 'style' as const,
  },
  {
    id: '3',
    title: 'Ежедневные квесты',
    subtitle: 'Выполняй и получай бонусные карты',
    bg: ['#fdcf49', '#d97706'],
    icon: 'emoji-events' as const,
  },
  {
    id: '4',
    title: 'Обмен картами',
    subtitle: 'Торгуй с друзьями и собирай колоду мечты',
    bg: ['#10b981', '#065f46'],
    icon: 'swap-horiz' as const,
  },
];

const PromoCarousel = ({ styles, colors }: { styles: any; colors: any }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const flatRef = useRef<FlatList>(null);

  // auto-scroll
  useEffect(() => {
    const timer = setInterval(() => {
      const next = (activeIndex + 1) % PROMOS.length;
      flatRef.current?.scrollToIndex({ index: next, animated: true });
      setActiveIndex(next);
    }, 3500);
    return () => clearInterval(timer);
  }, [activeIndex]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / CAROUSEL_ITEM_WIDTH);
    if (idx >= 0 && idx < PROMOS.length) setActiveIndex(idx);
  };

  return (
    <View>
      <FlatList
        ref={flatRef}
        data={PROMOS}
        keyExtractor={item => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={CAROUSEL_ITEM_WIDTH + 12}
        decelerationRate="fast"
        contentContainerStyle={{ paddingRight: 8 }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.88}
            style={[styles.promoCard, { width: CAROUSEL_ITEM_WIDTH }]}
            onPress={() => router.push('/(tabs)/cards')}
          >
            {/* gradient simulation via two overlapping views */}
            <View style={[StyleSheet.absoluteFill, { backgroundColor: item.bg[0], borderRadius: BorderRadius.base }]} />
            <View style={[StyleSheet.absoluteFill, {
              backgroundColor: item.bg[1], borderRadius: BorderRadius.base,
              opacity: 0.55, top: '40%',
            }]} />
            <View style={styles.promoContent}>
              <View style={styles.promoIconWrap}>
                <MaterialIcons name={item.icon} size={26} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.promoTitle}>{item.title}</Text>
                <Text style={styles.promoSubtitle}>{item.subtitle}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color="rgba(255,255,255,0.7)" />
            </View>
          </TouchableOpacity>
        )}
      />
      {/* dots */}
      <View style={styles.promoDots}>
        {PROMOS.map((_, i) => (
          <View key={i} style={[styles.promoDot, i === activeIndex && styles.promoDotActive]} />
        ))}
      </View>
    </View>
  );
};

// ─── Deck Fan Widget ──────────────────────────────────────────────────────────
const RARITY_ICON: Record<string, any> = {
  LEGENDARY: 'auto-awesome',
  EPIC: 'flash-on',
  RARE: 'water-drop',
  COMMON: 'circle',
};

const DeckFanWidget = ({ decks, styles, colors }: { decks: any[]; styles: any; colors: any }) => {
  const activeDeck = decks.find((d: any) => d.isActive) || decks[0];
  const cards: any[] = activeDeck?.deckCards?.map((dc: any) => dc.userCard).filter(Boolean) || [];
  const totalCashback = cards.reduce((sum: number, c: any) =>
    sum + (c?.collectionCard?.cashbackPercent || 0), 0);

  // fan angles for up to 5 cards
  const ANGLES = [-18, -9, 0, 9, 18];
  const OFFSETS = [20, 10, 0, 10, 20]; // vertical offset per position

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={styles.deckWidget}
      onPress={() => router.push('/(tabs)/cards')}
    >
      {/* Fan */}
      <View style={styles.fanContainer}>
        {cards.length === 0 ? (
          <View style={styles.fanEmpty}>
            <MaterialIcons name="style" size={28} color={colors.onSurfaceVariant} />
          </View>
        ) : (
          cards.slice(0, 5).map((card: any, i: number) => {
            const rarity = card?.collectionCard?.rarity || 'COMMON';
            const color = getRarityColor(rarity);
            const angle = ANGLES[i] ?? 0;
            const offset = OFFSETS[i] ?? 0;
            return (
              <View
                key={card.id || i}
                style={[
                  styles.fanCard,
                  {
                    backgroundColor: color,
                    transform: [{ rotate: `${angle}deg` }, { translateY: offset }],
                    zIndex: i === 2 ? 10 : 5 - Math.abs(i - 2),
                    left: i * 8,
                  },
                ]}
              >
                <MaterialIcons name={RARITY_ICON[rarity] || 'circle'} size={14} color="#fff" />
              </View>
            );
          })
        )}
      </View>

      {/* Label */}
      <View style={styles.deckInfo}>
        <Text style={styles.deckLabel}>МОЯ КОЛОДА</Text>
        {activeDeck ? (
          <>
            <Text style={styles.deckName} numberOfLines={1}>{activeDeck.name}</Text>
            <Text style={styles.deckCashback}>
              {totalCashback > 0 ? `+${totalCashback.toFixed(1)}%` : 'нет карт'}
            </Text>
          </>
        ) : (
          <Text style={styles.deckName}>Нет колоды</Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { user, accounts, transactions, decks, loadAccounts, loadTransactions, loadUser, loadDecks, cardDesign, unreadCount } = useStore();
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const colors = useThemeColor();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const DESIGNS = [
    { id: 'default', name: 'Premium (Default)', colors: [colors.primary, colors.primaryContainer] },
    { id: 'dark', name: 'Sovereign Wealth', colors: ['#2a2a2a', '#0e0e0e'] },
    { id: 'gold', name: 'Gold Edition', colors: ['#d4af37', '#b8860b'] },
    { id: 'game_epic', name: 'Epic Gamer', colors: ['#9333ea', '#6b21a8'] },
    { id: 'game_legendary', name: 'Legendary', colors: ['#f59e0b', '#d97706'] },
  ];

  useEffect(() => {
    const init = async () => {
      await Promise.all([loadAccounts(), loadTransactions({ limit: 5 }), loadDecks()]);
      setInitialLoading(false);
    };
    init();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadUser(), loadAccounts(), loadTransactions({ limit: 5 }), loadDecks()]);
    setRefreshing(false);
  }, []);

  const mainAccount = accounts.find((a: any) => a.type === 'main');
  const mainCard = mainAccount?.bankCards?.[0];

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Доброе утро';
    if (h < 18) return 'Добрый день';
    return 'Добрый вечер';
  };

  const firstName = user?.name?.split(' ')[0] || 'Пользователь';
  const currentDesign = DESIGNS.find(d => d.id === cardDesign) || DESIGNS[0];

  const maskCardNumber = (num?: string) => {
    if (!num) return '•••• •••• •••• 0000';
    const last4 = num.replace(/\s+/g, '').slice(-4) || '0000';
    return `•••• •••• •••• ${last4}`;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl tintColor={colors.primary} refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={styles.greetingSmall}>{getGreeting()},</Text>
            <Text style={styles.greeting} numberOfLines={1}>{firstName}</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.bellBtn} onPress={() => router.push('/notifications')}>
              <MaterialIcons name="notifications-none" size={24} color={colors.onSurface} />
              {unreadCount > 0 && <View style={styles.bellDot} />}
            </TouchableOpacity>
            <MbBadge mbPoints={user?.mbPoints || 0} onPress={() => router.push('/(tabs)/cards')} styles={styles} />
          </View>
        </View>

        {/* Bank Card */}
        <View style={styles.cardWrapper}>
          <TouchableOpacity activeOpacity={0.9} onPress={() => router.push('/card-details')}>
            <View style={styles.cardContainer}>
              <BlurView intensity={32} tint="dark" style={styles.glassCard}>
                <View style={styles.cardPattern} />
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={styles.cardLabel}>{currentDesign.name.toUpperCase()}</Text>
                    {initialLoading ? (
                      <SkeletonPulse style={{ width: 120, height: 32, borderRadius: 8, marginTop: 8 }} colors={colors} />
                    ) : (
                      <Text style={styles.cardBalance}>
                        {mainAccount ? formatMoney(mainAccount.balance) : '0.00 ₽'}
                      </Text>
                    )}
                  </View>
                  <MaterialIcons name="contactless" size={32} color="rgba(255,255,255,0.8)" />
                </View>
                <View style={styles.cardFooter}>
                  <Text style={styles.cardNumber}>{maskCardNumber(mainCard?.maskedNumber)}</Text>
                </View>
                <View style={styles.cardBottom}>
                  <View>
                    <Text style={styles.cardSmallLabel}>ДЕРЖАТЕЛЬ КАРТЫ</Text>
                    <Text style={styles.cardHolder}>{user?.name?.toUpperCase() || 'ПОЛЬЗОВАТЕЛЬ'}</Text>
                  </View>
                  <View style={styles.cardBrand}>
                    <View style={styles.brandCircle1} />
                    <View style={styles.brandCircle2} />
                  </View>
                </View>
              </BlurView>
            </View>
          </TouchableOpacity>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>БЫСТРЫЕ ДЕЙСТВИЯ</Text>
          <View style={styles.actionsGrid}>
            {[
              { icon: 'qr-code-scanner', label: 'QR', route: '/qr' },
              { icon: 'add', label: 'Пополнить', route: '/topup' },
              { icon: 'swap-horiz', label: 'Перевести', route: '/transfer' },
              { icon: 'payment', label: 'Оплатить', route: '/payment' },
            ].map((action, i) => (
              <TouchableOpacity key={i} style={styles.actionItem} onPress={() => router.push(action.route as any)}>
                <View style={styles.actionIcon}>
                  <MaterialIcons name={action.icon as any} size={28} color={colors.onPrimary} />
                </View>
                <Text style={styles.actionLabel}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── NEW: Promo Carousel + Deck Fan Widget ── */}
        <View style={styles.promoRow}>
          {/* Carousel takes ~72% width */}
          <View style={{ flex: 1 }}>
            <Text style={[styles.sectionTitle, { marginBottom: Spacing.base }]}>
              АКЦИИ
            </Text>
            <PromoCarousel styles={styles} colors={colors} />
          </View>

          {/* Deck widget takes ~24% width */}
          <View style={styles.deckWidgetWrap}>
            <Text style={[styles.sectionTitle, { marginBottom: Spacing.base, textAlign: 'center' }]}>
              КОЛОДА
            </Text>
            <DeckFanWidget decks={decks} styles={styles} colors={colors} />
          </View>
        </View>

        {/* Recent Operations */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>ПОСЛЕДНИЕ ОПЕРАЦИИ</Text>
            <TouchableOpacity onPress={() => router.push('/history')}>
              <Text style={styles.viewAll}>Все</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.transactionList}>
            {initialLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <SkeletonPulse key={i} style={styles.transactionSkeleton} colors={colors} />
              ))
            ) : transactions.length > 0 ? (
              transactions.slice(0, 5).map((t: any, i: number) => (
                <Animated.View entering={FadeIn.delay(i * 100)} key={t.id || i} style={styles.transactionItem}>
                  <View style={styles.transactionLeft}>
                    <View style={[styles.transactionIcon, t.type === 'TRANSFER_IN' && { backgroundColor: `${colors.primary}15` }]}>
                      <MaterialIcons
                        name={toMaterialIconName(t.merchantIcon) as any}
                        size={20}
                        color={t.type === 'TRANSFER_IN' ? colors.primary : colors.onSurfaceVariant}
                      />
                    </View>
                    <View>
                      <Text style={styles.transactionName}>{t.merchant || 'Операция'}</Text>
                      <Text style={styles.transactionDate}>
                        {new Date(t.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  </View>
                  <Text style={[
                    styles.transactionAmount,
                    (t.type === 'TRANSFER_IN' || t.type === 'TOPUP') ? { color: colors.primary } : {},
                  ]}>
                    {t.type === 'TRANSFER_IN' || t.type === 'TOPUP' ? '+' : '-'} {formatMoney(t.amount)}
                  </Text>
                </Animated.View>
              ))
            ) : (
              <Text style={styles.emptyText}>Нет операций</Text>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const getStyles = (Colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { paddingBottom: 120 },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: Spacing.xl, paddingTop: Spacing.xl, paddingBottom: Spacing.base,
  },
  greetingSmall: { fontSize: Fonts.sizes.md, fontWeight: Fonts.weights.medium, color: Colors.onSurfaceVariant, marginBottom: 2, fontFamily: 'Manrope-Medium' },
  greeting: { fontSize: Fonts.sizes['2xl'], fontWeight: Fonts.weights.extrabold, color: Colors.onSurface, letterSpacing: -0.5, fontFamily: 'Manrope-ExtraBold' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  bellBtn: { position: 'relative', padding: 8 },
  bellDot: { position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.error },
  mbBadge: { backgroundColor: Colors.primary, borderRadius: BorderRadius.full, paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8, ...Shadows.primary },
  mbText: { fontSize: Fonts.sizes.xs, fontFamily: 'Manrope-Bold', color: '#ffffff', letterSpacing: 1 },
  mbPoints: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-ExtraBold', color: '#ffffff' },

  // Bank card
  cardWrapper: { marginHorizontal: Spacing.base, borderRadius: BorderRadius.base, overflow: 'hidden', backgroundColor: 'rgba(42,42,42,0.4)', borderWidth: 1, borderColor: Colors.transparentBorder },
  cardContainer: { height: 220, width: '100%' },
  glassCard: { flex: 1, padding: Spacing.xl, justifyContent: 'space-between' },
  cardPattern: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.1, backgroundColor: '#ffffff' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardLabel: { fontSize: Fonts.sizes.xs, fontFamily: 'Manrope-Medium', color: 'rgba(255,255,255,0.7)', letterSpacing: 2 },
  cardBalance: { fontSize: Fonts.sizes['2xl'], fontFamily: 'Manrope-Bold', color: Colors.onPrimary, marginTop: 4 },
  cardFooter: { marginTop: Spacing.base },
  cardNumber: { fontSize: Fonts.sizes.lg, fontFamily: 'Manrope-Medium', color: Colors.onPrimary, letterSpacing: 3 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  cardSmallLabel: { fontSize: 9, color: 'rgba(255,255,255,0.6)', fontFamily: 'Manrope-Bold', letterSpacing: 1 },
  cardHolder: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-SemiBold', color: Colors.onPrimary, letterSpacing: 1 },
  cardBrand: { width: 64, height: 40, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.15)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  brandCircle1: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.error, opacity: 0.9, marginRight: -8 },
  brandCircle2: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.secondaryContainer, opacity: 0.9 },

  // Sections
  section: { paddingHorizontal: Spacing.base, marginTop: Spacing['2xl'] },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: Spacing.sm, marginBottom: Spacing.base },
  sectionTitle: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold', color: Colors.onSurfaceVariant, letterSpacing: 2, textTransform: 'uppercase' },
  viewAll: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold', color: Colors.primary },

  // Quick actions
  actionsGrid: { flexDirection: 'row', justifyContent: 'space-around', marginTop: Spacing.base },
  actionItem: { alignItems: 'center', gap: Spacing.sm },
  actionIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', ...Shadows.primary },
  actionLabel: { fontSize: 12, fontFamily: 'Manrope-Bold', color: Colors.onSurface },

  // ── Promo row ──────────────────────────────────────────────────────────────
  promoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: Spacing['2xl'],
    paddingHorizontal: Spacing.base,
    gap: Spacing.base,
  },

  // Promo carousel card
  promoCard: {
    height: CAROUSEL_ITEM_HEIGHT,
    borderRadius: BorderRadius.base,
    marginRight: 12,
    overflow: 'hidden',
    justifyContent: 'center',
    ...Shadows.primary,
  },
  promoContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.base,
  },
  promoIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoTitle: { fontSize: Fonts.sizes.base, fontFamily: 'Manrope-ExtraBold', color: '#fff' },
  promoSubtitle: { fontSize: Fonts.sizes.xs, fontFamily: 'Manrope-Medium', color: 'rgba(255,255,255,0.8)', marginTop: 2, flexWrap: 'wrap' },
  promoDots: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 10 },
  promoDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.transparentBorder },
  promoDotActive: { backgroundColor: Colors.primary, width: 16 },

  // ── Deck widget ────────────────────────────────────────────────────────────
  deckWidgetWrap: {
    width: DECK_WIDGET_WIDTH,
    alignItems: 'center',
  },
  deckWidget: {
    width: DECK_WIDGET_WIDTH,
    minHeight: CAROUSEL_ITEM_HEIGHT + 30,
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: BorderRadius.base,
    borderWidth: 1,
    borderColor: Colors.transparentBorder,
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: 6,
    ...Shadows.sm,
    gap: Spacing.sm,
  },
  fanContainer: {
    width: 72,
    height: 64,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  fanCard: {
    position: 'absolute',
    width: 32,
    height: 46,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    ...Shadows.sm,
  },
  fanEmpty: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deckInfo: { alignItems: 'center', gap: 2, paddingHorizontal: 4 },
  deckLabel: { fontSize: 8, fontFamily: 'Manrope-Bold', color: Colors.onSurfaceVariant, letterSpacing: 1.5, textTransform: 'uppercase' },
  deckName: { fontSize: 10, fontFamily: 'Manrope-Bold', color: Colors.onSurface, textAlign: 'center' },
  deckCashback: { fontSize: 12, fontFamily: 'Manrope-ExtraBold', color: Colors.primary },

  // Transactions
  transactionList: { gap: Spacing.sm },
  transactionSkeleton: { height: 72, borderRadius: BorderRadius.base, backgroundColor: Colors.surfaceContainer },
  transactionItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, backgroundColor: Colors.surfaceContainerLowest, borderRadius: BorderRadius.base, ...Shadows.sm, borderWidth: 1, borderColor: Colors.transparentBorder },
  transactionLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.base, flex: 1 },
  transactionIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.transparentBorder, alignItems: 'center', justifyContent: 'center' },
  transactionName: { fontSize: 15, fontFamily: 'Manrope-Bold', color: Colors.onSurface },
  transactionDate: { fontSize: Fonts.sizes.sm, color: Colors.onSurfaceVariant, marginTop: 2, fontFamily: 'Manrope-Medium' },
  transactionAmount: { fontSize: Fonts.sizes.base, fontFamily: 'Manrope-ExtraBold', color: Colors.onSurface },
  emptyText: { textAlign: 'center', color: Colors.outlineVariant, padding: Spacing['2xl'], fontSize: Fonts.sizes.md, fontFamily: 'Manrope-Medium' },
});
import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Modal,
  ActivityIndicator, Animated, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useStore } from '../../stores/useStore';
import * as apiClient from '../../services/api';
import {
  Fonts, Spacing, BorderRadius, Shadows,
  getRarityName, toMaterialIconName,
} from '../../constants/theme';
import Animated2, { FadeIn } from 'react-native-reanimated';
import { useThemeColor } from '../../hooks/useThemeColor';
import { LinearGradient } from 'expo-linear-gradient';
import { ActionButton } from '../../components/ActionButton';

type Rarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';

interface CollectionCard {
  id: string;
  name: string;
  rarity: Rarity;
  cashbackPercent: number;
  description?: string;
  brandName?: string;
  brandIcon?: string;
  maxHealth: number;
  mbPrice?: number;
  isActive: boolean;
}

const RARITY_GRADIENTS: Record<Rarity, [string, string, string]> = {
  COMMON:    ['#4b5563', '#374151', '#1f2937'],
  RARE:      ['#1d4ed8', '#2563eb', '#1e40af'],
  EPIC:      ['#7c3aed', '#6d28d9', '#4c1d95'],
  LEGENDARY: ['#b45309', '#d97706', '#92400e'],
};

const RARITY_BADGE_COLORS: Record<Rarity, string> = {
  COMMON: '#9ca3af', RARE: '#60a5fa', EPIC: '#a78bfa', LEGENDARY: '#fbbf24',
};

const DEFAULT_PRICES: Record<Rarity, number> = {
  COMMON: 300, RARE: 800, EPIC: 1500, LEGENDARY: 3500,
};

function formatTimer(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

function LegendaryGlow() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, []);
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.5] });
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { borderRadius: BorderRadius.base, backgroundColor: '#fbbf24', opacity }]}
      pointerEvents="none"
    />
  );
}

interface ShopCardItemProps {
  card: CollectionCard;
  purchased: boolean;
  canAfford: boolean;
  onBuy: (card: CollectionCard) => void;
}

function ShopCardItem({ card, purchased, canAfford, onBuy }: ShopCardItemProps) {
  const gradient = RARITY_GRADIENTS[card.rarity];
  const badgeColor = RARITY_BADGE_COLORS[card.rarity];
  const isLegendary = card.rarity === 'LEGENDARY';
  const price = card.mbPrice ?? DEFAULT_PRICES[card.rarity];
  const initials = (card.brandName ?? card.name)
    .split(' ').slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? '').join('');

  return (
    <View style={shopStyles.cardWrap}>
      <LinearGradient colors={gradient} style={shopStyles.cardGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        {isLegendary && <LegendaryGlow />}
        <View style={[shopStyles.rarityBadge, { backgroundColor: badgeColor }]}>
          <Text style={shopStyles.rarityBadgeText}>{getRarityName(card.rarity).toUpperCase()}</Text>
        </View>
        <View style={shopStyles.brandIconWrap}>
          <View style={[shopStyles.brandCircle, { borderColor: badgeColor }]}>
            {card.brandIcon ? (
              <MaterialIcons name={toMaterialIconName(card.brandIcon) as any} size={32} color={badgeColor} />
            ) : (
              <Text style={[shopStyles.initialsText, { color: badgeColor }]}>{initials}</Text>
            )}
          </View>
        </View>
        <Text style={shopStyles.cardName} numberOfLines={1}>{card.brandName ?? card.name}</Text>
        <View style={shopStyles.cashbackRow}>
          <MaterialIcons name="percent" size={12} color="rgba(255,255,255,0.9)" />
          <Text style={shopStyles.cashbackText}>{card.cashbackPercent}% кэшбэк</Text>
        </View>
        {purchased ? (
          <View style={shopStyles.purchasedBadge}>
            <MaterialIcons name="check-circle" size={14} color="#22c55e" />
            <Text style={shopStyles.purchasedText}>Куплено</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[shopStyles.buyBtn, !canAfford && shopStyles.buyBtnDisabled]}
            onPress={() => onBuy(card)}
            disabled={!canAfford}
            activeOpacity={0.8}
          >
            <Text style={shopStyles.buyBtnText}>{price.toLocaleString('ru-RU')} MB</Text>
          </TouchableOpacity>
        )}
      </LinearGradient>
      {purchased && <View style={shopStyles.purchasedOverlay} />}
    </View>
  );
}

const shopStyles = StyleSheet.create({
  cardWrap: { width: '47%', borderRadius: BorderRadius.base, overflow: 'hidden', ...Shadows.md },
  cardGradient: { padding: Spacing.md, gap: 6, minHeight: 210, borderRadius: BorderRadius.base, overflow: 'hidden' },
  rarityBadge: { position: 'absolute', top: 8, right: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: BorderRadius.full },
  rarityBadgeText: { fontSize: 7, fontFamily: 'Manrope-ExtraBold', color: '#fff', letterSpacing: 0.5 },
  brandIconWrap: { alignItems: 'center', marginTop: 20, marginBottom: 4 },
  brandCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  initialsText: { fontSize: 22, fontFamily: 'Manrope-ExtraBold' },
  cardName: { fontSize: Fonts.sizes.md, fontFamily: 'Manrope-ExtraBold', color: '#fff', textAlign: 'center' },
  cashbackRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  cashbackText: { fontSize: 10, fontFamily: 'Manrope-Bold', color: 'rgba(255,255,255,0.85)' },
  buyBtn: { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: BorderRadius.full, paddingVertical: 8, alignItems: 'center', marginTop: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  buyBtnDisabled: { backgroundColor: 'rgba(0,0,0,0.3)', borderColor: 'rgba(255,255,255,0.1)' },
  buyBtnText: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-ExtraBold', color: '#fff' },
  purchasedBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 4, paddingVertical: 6, backgroundColor: 'rgba(34,197,94,0.2)', borderRadius: BorderRadius.full },
  purchasedText: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold', color: '#22c55e' },
  purchasedOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: BorderRadius.base },
});

// ─── ShopTab ──────────────────────────────────────────────────────────────────

const REFRESH_HOURS = 8;
const FORCE_REFRESH_COST = 500;
const SHOP_SLOT_COUNT = 6;

function ShopTab({
  userPoints,
  onPurchaseSuccess,
  colors,
  inventoryCollectionIds,
}: {
  userPoints: number;
  onPurchaseSuccess: (newMbPoints: number) => void;
  colors: any;
  inventoryCollectionIds: Set<string>;
}) {
  const [allCards, setAllCards] = useState<CollectionCard[]>([]);
  const [shopCards, setShopCards] = useState<CollectionCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  // IDs of collectionCards purchased this session (derives "Куплено" badge)
  const [sessionPurchasedIds, setSessionPurchasedIds] = useState<Set<string>>(new Set());
  const [nextRefresh, setNextRefresh] = useState<Date>(() => {
    const d = new Date(); d.setHours(d.getHours() + REFRESH_HOURS); return d;
  });
  const [timerMs, setTimerMs] = useState(0);
  const [filterRarity, setFilterRarity] = useState<Rarity | null>(null);
  const [confirmCard, setConfirmCard] = useState<CollectionCard | null>(null);
  const [successCard, setSuccessCard] = useState<CollectionCard | null>(null);
  const successAnim = useRef(new Animated.Value(0)).current;

  // Load ALL collection cards from backend (all rarities)
  const loadShopCards = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.getCollection(); // no rarity filter → all
      setAllCards(data ?? []);
      rollFromPool(data ?? []);
    } catch {
      Alert.alert('Ошибка', 'Не удалось загрузить карты магазина');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadShopCards(); }, []);

  function rollFromPool(pool: CollectionCard[]) {
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    setShopCards(shuffled.slice(0, SHOP_SLOT_COUNT));
    setSessionPurchasedIds(new Set());
  }

  // Timer tick
  useEffect(() => {
    const tick = () => setTimerMs(Math.max(0, nextRefresh.getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextRefresh]);

  // Auto-refresh when timer expires
  useEffect(() => {
    if (timerMs === 0 && allCards.length > 0) {
      const d = new Date(); d.setHours(d.getHours() + REFRESH_HOURS);
      setNextRefresh(d);
      rollFromPool(allCards);
    }
  }, [timerMs]);

  const handleForceRefresh = () => {
    if (userPoints < FORCE_REFRESH_COST) {
      Alert.alert('Недостаточно MB', `Нужно ${FORCE_REFRESH_COST} MB для обновления`);
      return;
    }
    Alert.alert(
      'Обновить магазин?',
      `Стоимость: ${FORCE_REFRESH_COST} MB. Текущие карты будут заменены.`,
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Обновить', onPress: () => {
          onPurchaseSuccess(userPoints - FORCE_REFRESH_COST);
          const d = new Date(); d.setHours(d.getHours() + REFRESH_HOURS);
          setNextRefresh(d);
          rollFromPool(allCards);
        }},
      ]
    );
  };

  const handleBuy = (card: CollectionCard) => setConfirmCard(card);

  const handleConfirmBuy = async () => {
    if (!confirmCard || buying) return;
    setConfirmCard(null);
    setBuying(true);
    try {
      const { data } = await apiClient.buyCard(confirmCard.id);
      // data = { userCard, mbPoints, price }
      setSessionPurchasedIds((prev) => new Set([...prev, confirmCard.id]));
      onPurchaseSuccess(data.mbPoints); // sync MB balance to parent
      setSuccessCard(confirmCard);
      successAnim.setValue(0);
      Animated.spring(successAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 7 }).start(
        () => setTimeout(() => setSuccessCard(null), 1800)
      );
    } catch (err: any) {
      Alert.alert('Ошибка', err?.response?.data?.error || 'Не удалось купить карту');
    } finally {
      setBuying(false);
    }
  };

  // A card is "purchased" if bought this session OR already in inventory
  const isPurchased = (card: CollectionCard) =>
    sessionPurchasedIds.has(card.id) || inventoryCollectionIds.has(card.id);

  const filteredCards = filterRarity
    ? shopCards.filter((c) => c.rarity === filterRarity)
    : shopCards;

  const FILTERS: Array<{ key: Rarity | null; label: string; color: string }> = [
    { key: null,        label: 'Все',          color: colors.primary },
    { key: 'COMMON',    label: 'Обычные',       color: '#9ca3af' },
    { key: 'RARE',      label: 'Редкие',        color: '#60a5fa' },
    { key: 'EPIC',      label: 'Эпические',     color: '#a78bfa' },
    { key: 'LEGENDARY', label: 'Легендарные',   color: '#fbbf24' },
  ];

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.onSurfaceVariant, fontFamily: 'Manrope-Medium', fontSize: Fonts.sizes.sm }}>
          Загрузка магазина...
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {buying && (
        <View style={shopTabStyles.buyingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={shopTabStyles.buyingText}>Покупка...</Text>
        </View>
      )}

      <View style={shopTabStyles.header}>
        <View>
          <Text style={shopTabStyles.headerTitle}>Магазин карт</Text>
          <Text style={[shopTabStyles.points, { color: colors.primary }]}>
            Баланс: {userPoints.toLocaleString('ru-RU')} MB
          </Text>
        </View>
        <TouchableOpacity
          style={[shopTabStyles.refreshBtn, { borderColor: colors.primary }]}
          onPress={handleForceRefresh}
          activeOpacity={0.8}
        >
          <MaterialIcons name="refresh" size={14} color={colors.primary} />
          <Text style={[shopTabStyles.refreshBtnText, { color: colors.primary }]}>
            {FORCE_REFRESH_COST} MB
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[shopTabStyles.timerRow, { backgroundColor: colors.surfaceContainerHigh }]}>
        <MaterialIcons name="schedule" size={14} color={colors.onSurfaceVariant} />
        <Text style={[shopTabStyles.timerText, { color: colors.onSurfaceVariant }]}>
          Обновление через: {formatTimer(timerMs)}
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={shopTabStyles.filterScroll} contentContainerStyle={{ paddingHorizontal: Spacing.base, gap: 8 }}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={String(f.key)}
            onPress={() => setFilterRarity(f.key)}
            style={[
              shopTabStyles.filterChip,
              filterRarity === f.key && { backgroundColor: f.color, borderColor: f.color },
              filterRarity !== f.key && { borderColor: colors.outlineVariant },
            ]}
          >
            <Text style={[shopTabStyles.filterChipText, { color: filterRarity === f.key ? '#fff' : colors.onSurfaceVariant }]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={shopTabStyles.grid}>
        {filteredCards.length === 0 ? (
          <View style={shopTabStyles.emptyState}>
            <MaterialIcons name="storefront" size={48} color={colors.outlineVariant} />
            <Text style={[shopTabStyles.emptyText, { color: colors.onSurfaceVariant }]}>Нет карт этой редкости</Text>
          </View>
        ) : filteredCards.map((card) => (
          <ShopCardItem
            key={card.id}
            card={card}
            purchased={isPurchased(card)}
            canAfford={userPoints >= (card.mbPrice ?? DEFAULT_PRICES[card.rarity])}
            onBuy={handleBuy}
          />
        ))}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Confirm Modal */}
      <Modal visible={!!confirmCard} transparent animationType="fade">
        <View style={shopTabStyles.modalOverlay}>
          {confirmCard && (() => {
            const price = confirmCard.mbPrice ?? DEFAULT_PRICES[confirmCard.rarity];
            const initials = (confirmCard.brandName ?? confirmCard.name)
              .split(' ').slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? '').join('');
            return (
              <View style={[shopTabStyles.confirmBox, { backgroundColor: colors.surfaceContainerLowest }]}>
                <LinearGradient
                  colors={RARITY_GRADIENTS[confirmCard.rarity]}
                  style={shopTabStyles.confirmCardPreview}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                >
                  {confirmCard.rarity === 'LEGENDARY' && <LegendaryGlow />}
                  <View style={[shopStyles.brandCircle, { width: 72, height: 72, borderRadius: 36, borderColor: RARITY_BADGE_COLORS[confirmCard.rarity] }]}>
                    {confirmCard.brandIcon ? (
                      <MaterialIcons name={toMaterialIconName(confirmCard.brandIcon) as any} size={36} color={RARITY_BADGE_COLORS[confirmCard.rarity]} />
                    ) : (
                      <Text style={[shopStyles.initialsText, { color: RARITY_BADGE_COLORS[confirmCard.rarity], fontSize: 26 }]}>{initials}</Text>
                    )}
                  </View>
                  <Text style={shopTabStyles.confirmCardName}>{confirmCard.brandName ?? confirmCard.name}</Text>
                  <View style={[shopTabStyles.rarityPill, { backgroundColor: RARITY_BADGE_COLORS[confirmCard.rarity] }]}>
                    <Text style={shopTabStyles.rarityPillText}>{getRarityName(confirmCard.rarity)}</Text>
                  </View>
                </LinearGradient>
                <Text style={[shopTabStyles.confirmTitle, { color: colors.onSurface }]}>Купить карту?</Text>
                <Text style={[shopTabStyles.confirmBonus, { color: colors.onSurfaceVariant }]}>
                  {confirmCard.cashbackPercent}% кэшбэк у {confirmCard.brandName ?? confirmCard.name}
                </Text>
                <Text style={[shopTabStyles.confirmPrice, { color: colors.primary }]}>
                  {price.toLocaleString('ru-RU')} MB
                </Text>
                <View style={shopTabStyles.confirmBtns}>
                  <TouchableOpacity
                    style={[shopTabStyles.confirmCancelBtn, { borderColor: colors.outlineVariant }]}
                    onPress={() => setConfirmCard(null)}
                  >
                    <Text style={[shopTabStyles.confirmCancelText, { color: colors.onSurfaceVariant }]}>Отмена</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[shopTabStyles.confirmBuyBtn, { backgroundColor: colors.primary }]}
                    onPress={handleConfirmBuy}
                  >
                    <Text style={shopTabStyles.confirmBuyText}>Купить за {price.toLocaleString('ru-RU')} MB</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })()}
        </View>
      </Modal>

      {/* Success overlay */}
      {successCard && (() => {
        const initials = (successCard.brandName ?? successCard.name)
          .split(' ').slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? '').join('');
        return (
          <Animated.View
            style={[
              shopTabStyles.successOverlay,
              {
                opacity: successAnim,
                transform: [{ scale: successAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
              },
            ]}
            pointerEvents="none"
          >
            <View style={[shopStyles.brandCircle, { width: 80, height: 80, borderRadius: 40, borderColor: RARITY_BADGE_COLORS[successCard.rarity] }]}>
              {successCard.brandIcon ? (
                <MaterialIcons name={toMaterialIconName(successCard.brandIcon) as any} size={40} color={RARITY_BADGE_COLORS[successCard.rarity]} />
              ) : (
                <Text style={[shopStyles.initialsText, { color: RARITY_BADGE_COLORS[successCard.rarity], fontSize: 28 }]}>{initials}</Text>
              )}
            </View>
            <Text style={shopTabStyles.successTitle}>Карта добавлена!</Text>
            <Text style={shopTabStyles.successSub}>«{successCard.brandName ?? successCard.name}» теперь в вашей коллекции</Text>
          </Animated.View>
        );
      })()}
    </View>
  );
}

const shopTabStyles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: Spacing.base, paddingTop: Spacing.base, paddingBottom: Spacing.sm },
  headerTitle: { fontSize: Fonts.sizes.xl, fontFamily: 'Manrope-ExtraBold', color: '#fff' },
  points: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold', marginTop: 2 },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: BorderRadius.full, paddingHorizontal: 12, paddingVertical: 6 },
  refreshBtnText: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold' },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: Spacing.base, borderRadius: BorderRadius.sm, paddingHorizontal: 12, paddingVertical: 6, marginBottom: Spacing.sm },
  timerText: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold' },
  filterScroll: { marginBottom: Spacing.sm, flexGrow: 0 },
  filterChip: { borderWidth: 1, borderRadius: BorderRadius.full, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: 'transparent' },
  filterChipText: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.base, gap: Spacing.sm },
  emptyState: { width: '100%', alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyText: { fontSize: Fonts.sizes.base, fontFamily: 'Manrope-Bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: Spacing.xl },
  confirmBox: { borderRadius: BorderRadius.xl, overflow: 'hidden', ...Shadows.xl },
  confirmCardPreview: { padding: Spacing.xl, alignItems: 'center', gap: 10 },
  confirmCardName: { fontSize: Fonts.sizes.xl, fontFamily: 'Manrope-ExtraBold', color: '#fff', textAlign: 'center' },
  rarityPill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: BorderRadius.full },
  rarityPillText: { fontSize: 10, fontFamily: 'Manrope-ExtraBold', color: '#fff', textTransform: 'uppercase', letterSpacing: 1 },
  confirmTitle: { fontSize: Fonts.sizes.xl, fontFamily: 'Manrope-ExtraBold', textAlign: 'center', paddingTop: Spacing.base },
  confirmBonus: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Medium', textAlign: 'center', paddingHorizontal: Spacing.xl },
  confirmPrice: { fontSize: Fonts.sizes['2xl'], fontFamily: 'Manrope-ExtraBold', textAlign: 'center', paddingBottom: Spacing.sm },
  confirmBtns: { flexDirection: 'row', gap: 10, padding: Spacing.base },
  confirmCancelBtn: { flex: 1, borderWidth: 1, borderRadius: BorderRadius.base, paddingVertical: 14, alignItems: 'center' },
  confirmCancelText: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold' },
  confirmBuyBtn: { flex: 2, borderRadius: BorderRadius.base, paddingVertical: 14, alignItems: 'center' },
  confirmBuyText: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-ExtraBold', color: '#fff' },
  successOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.82)', alignItems: 'center', justifyContent: 'center', gap: 16, zIndex: 999 },
  successTitle: { fontSize: Fonts.sizes['2xl'], fontFamily: 'Manrope-ExtraBold', color: '#22c55e' },
  successSub: { fontSize: Fonts.sizes.base, fontFamily: 'Manrope-Medium', color: 'rgba(255,255,255,0.75)', textAlign: 'center', paddingHorizontal: 32 },
  buyingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', gap: 12, zIndex: 1000 },
  buyingText: { color: '#fff', fontFamily: 'Manrope-Bold', fontSize: Fonts.sizes.base },
});

// ════════════════════════════════════════════════════════════════════════════════
// Main CardsScreen
// ════════════════════════════════════════════════════════════════════════════════

export default function CardsScreen() {
  const { user, cards, decks, quests, loadCards, loadDecks, loadQuests, loadUser, unreadCount } = useStore();
  const [activeTab, setActiveTab] = useState<'deck' | 'shop'>('deck');
  const [filter, setFilter] = useState<string | null>(null);

  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [pickerModalVisible, setPickerModalVisible] = useState(false);

  const [sacrificeStep, setSacrificeStep] = useState<'idle' | 'pick_target'>('idle');
  const [sacrificeSource, setSacrificeSource] = useState<any>(null);
  const [isSacrificing, setIsSacrificing] = useState(false);

  const [selectedCard, setSelectedCard] = useState<any>(null);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);
  const [isEquipping, setIsEquipping] = useState(false);

  const [localPoints, setLocalPoints] = useState<number>(user?.mbPoints ?? 0);
  useEffect(() => { setLocalPoints(user?.mbPoints ?? 0); }, [user?.mbPoints]);

  const colors = useThemeColor();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const getRarityCol = (rarity: string) => {
    switch (rarity) {
      case 'COMMON': return colors.rarityCommon;
      case 'RARE': return colors.rarityRare;
      case 'EPIC': return colors.rarityEpic;
      case 'LEGENDARY': return colors.rarityLegendary;
      default: return colors.rarityCommon;
    }
  };

  useEffect(() => { loadCards(); loadDecks(); loadQuests(); }, []);

  // Set of collectionCard IDs already owned by the user — used by ShopTab
  // to mark cards as already purchased even before this session
  const inventoryCollectionIds = useMemo<Set<string>>(
    () => new Set(cards.map((c: any) => c.collectionCardId as string)),
    [cards]
  );

  const activeDeck = decks.find((d: any) => d.isActive);

  const equippedCardIds: Set<string> = useMemo(() => {
    if (!activeDeck) return new Set();
    return new Set((activeDeck.deckCards ?? []).map((dc: any) => dc.userCard?.id));
  }, [activeDeck]);

  const getCurrentCardIds = (): string[] => {
    if (!activeDeck) return [];
    return [...(activeDeck.deckCards ?? [])]
      .sort((a: any, b: any) => a.slotIndex - b.slotIndex)
      .map((dc: any) => dc.userCard?.id)
      .filter(Boolean);
  };

  const handleEquipCard = async (card: any, slotIndex: number) => {
    if (!activeDeck) return;
    setPickerModalVisible(false);
    setIsEquipping(true);
    try {
      const newIds = getCurrentCardIds().filter((id) => id !== card.id);
      newIds.push(card.id);
      await apiClient.updateDeck(activeDeck.id, { cardIds: newIds });
      await loadDecks();
    } catch (e: any) {
      Alert.alert('Ошибка', e?.response?.data?.error || 'Не удалось добавить карту');
    } finally {
      setIsEquipping(false); setSelectedSlotIndex(null);
    }
  };

  const handleRemoveCard = async (card: any) => {
    if (!activeDeck) return;
    Alert.alert('Убрать из колоды?', `Убрать «${card.collectionCard.name}» из активной колоды?`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Убрать', style: 'destructive', onPress: async () => {
        setIsEquipping(true);
        try {
          await apiClient.updateDeck(activeDeck.id, { cardIds: getCurrentCardIds().filter((id) => id !== card.id) });
          await loadDecks();
        } catch (e: any) {
          Alert.alert('Ошибка', e?.response?.data?.error || 'Не удалось убрать карту');
        } finally { setIsEquipping(false); }
      }},
    ]);
  };

  const handleSlotTap = (slotCard: any, index: number) => {
    if (slotCard) { handleRemoveCard(slotCard); }
    else { setSelectedSlotIndex(index); setPickerModalVisible(true); }
  };

  const handleStartSacrifice = (sacrificeCard: any) => {
    setDetailModalVisible(false);
    setSacrificeSource(sacrificeCard);
    setSacrificeStep('pick_target');
  };

  const handleConfirmSacrifice = async (targetCard: any) => {
    if (!sacrificeSource) return;
    Alert.alert(
      '⚡ Жертвоприношение',
      `Карта «${sacrificeSource.collectionCard.name}» будет уничтожена, а «${targetCard.collectionCard.name}» восстановит здоровье. Продолжить?`,
      [
        { text: 'Отмена', style: 'cancel', onPress: () => setSacrificeStep('idle') },
        { text: 'Пожертвовать', style: 'destructive', onPress: async () => {
          setSacrificeStep('idle');
          setIsSacrificing(true);
          try {
            const res = await apiClient.sacrificeCard(sacrificeSource.id, targetCard.id);
            await loadCards(); await loadDecks();
            Alert.alert('✅ Успешно!', `«${targetCard.collectionCard.name}» восстановила ${res.data.healAmount} HP → теперь ${res.data.newHealth}%`);
          } catch (e: any) {
            Alert.alert('Ошибка', e?.response?.data?.error || 'Не удалось провести жертвоприношение');
          } finally { setIsSacrificing(false); setSacrificeSource(null); }
        }},
      ]
    );
  };

  const sacrificeTargetCards = useMemo(() => {
    if (!sacrificeSource) return [];
    return cards.filter((c: any) => c.id !== sacrificeSource.id && c.health < c.collectionCard.maxHealth);
  }, [cards, sacrificeSource]);

  const filteredCards = filter ? cards.filter((c: any) => c.collectionCard.rarity === filter) : cards;
  const availableCards = cards.filter((c: any) => !equippedCardIds.has(c.id));

  const deckCashbackChips = useMemo(() => {
    if (!activeDeck?.deckCards?.length) return [];
    return [...(activeDeck.deckCards as any[])]
      .sort((a, b) => a.slotIndex - b.slotIndex)
      .filter((dc) => dc.userCard?.collectionCard)
      .map((dc) => ({
        id: dc.userCard.id,
        brand: dc.userCard.collectionCard.brandName ?? dc.userCard.collectionCard.name,
        percent: dc.userCard.collectionCard.cashbackPercent,
        rarity: dc.userCard.collectionCard.rarity,
      }));
  }, [activeDeck]);

  // Called by ShopTab after a successful purchase
  const handlePurchaseSuccess = useCallback((newMbPoints: number) => {
    setLocalPoints(newMbPoints);
    loadCards();  // refresh inventory so the new card appears immediately
    loadUser();   // sync user.mbPoints in global store
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ── Top header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.brandLabel}>КОЛЛЕКЦИЯ КАРТОЧЕК</Text>
          <Text style={styles.pageTitle}>Моя колода</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.mbBadge}>
            <Text style={styles.mbBadgeText}>MB {localPoints.toLocaleString('ru-RU')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.bellBtn} onPress={() => router.push('/notifications')}>
            <MaterialIcons name="notifications-none" size={24} color={colors.onSurfaceVariant} />
            {unreadCount > 0 && <View style={styles.bellDot} />}
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Tab switcher ── */}
      <View style={styles.tabSwitcher}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'deck' && { backgroundColor: colors.primary }]}
          onPress={() => setActiveTab('deck')}
        >
          <MaterialIcons name="style" size={16} color={activeTab === 'deck' ? colors.onPrimary : colors.onSurfaceVariant} />
          <Text style={[styles.tabBtnText, { color: activeTab === 'deck' ? colors.onPrimary : colors.onSurfaceVariant }]}>Колода</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'shop' && { backgroundColor: colors.primary }]}
          onPress={() => setActiveTab('shop')}
        >
          <MaterialIcons name="storefront" size={16} color={activeTab === 'shop' ? colors.onPrimary : colors.onSurfaceVariant} />
          <Text style={[styles.tabBtnText, { color: activeTab === 'shop' ? colors.onPrimary : colors.onSurfaceVariant }]}>Магазин</Text>
        </TouchableOpacity>
      </View>

      {/* ── SHOP TAB ── */}
      {activeTab === 'shop' && (
        <ShopTab
          userPoints={localPoints}
          onPurchaseSuccess={handlePurchaseSuccess}
          colors={colors}
          inventoryCollectionIds={inventoryCollectionIds}
        />
      )}

      {/* ── DECK TAB ── */}
      {activeTab === 'deck' && (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

          {activeDeck ? (
            <Animated2.View entering={FadeIn} style={styles.deckSection}>
              <Text style={styles.deckName}>{activeDeck.name}</Text>

              {deckCashbackChips.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cashbackChipsRow} contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
                  {deckCashbackChips.map((chip) => {
                    const rarityColor = getRarityCol(chip.rarity);
                    return (
                      <View key={chip.id} style={[styles.cashbackChip, { borderColor: rarityColor, backgroundColor: rarityColor + '18' }]}>
                        <Text style={[styles.cashbackChipBrand, { color: rarityColor }]} numberOfLines={1}>{chip.brand}</Text>
                        <Text style={[styles.cashbackChipPct, { color: rarityColor }]}>{chip.percent}%</Text>
                      </View>
                    );
                  })}
                </ScrollView>
              )}

              {(isEquipping || isSacrificing) && (
                <View style={styles.deckLoadingOverlay}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.deckLoadingText}>{isSacrificing ? 'Жертвоприношение...' : 'Обновление колоды...'}</Text>
                </View>
              )}

              <View style={[styles.deckGrid, (isEquipping || isSacrificing) && { opacity: 0.4 }]}>
                {[0, 1, 2, 3, 4].map((slot) => {
                  const deckCard = activeDeck.deckCards?.find((dc: any) => dc.slotIndex === slot) ?? activeDeck.deckCards?.[slot];
                  if (deckCard) {
                    const card = deckCard.userCard;
                    const rarityColor = getRarityCol(card.collectionCard.rarity);
                    const iconName = toMaterialIconName(card.collectionCard.brandIcon);
                    return (
                      <TouchableOpacity key={slot} activeOpacity={0.8} disabled={isEquipping || isSacrificing}
                        onPress={() => handleSlotTap(card, slot)}
                        style={[styles.deckSlot, styles.deckSlotFilled, { borderColor: rarityColor }]}
                      >
                        <View style={[styles.deckSlotGlow, { backgroundColor: rarityColor }]} />
                        <View style={styles.removeHint}><MaterialIcons name="close" size={10} color={colors.onSurfaceVariant} /></View>
                        <View style={styles.deckSlotBody}>
                          <MaterialIcons name={iconName as any} size={28} color={rarityColor} />
                          <Text style={styles.deckSlotName} numberOfLines={1}>{card.collectionCard.name}</Text>
                          <Text style={[styles.deckSlotRarity, { color: rarityColor }]}>{getRarityName(card.collectionCard.rarity)}</Text>
                        </View>
                        <View style={styles.healthBarContainer}>
                          <View style={[styles.healthBarFill, { width: `${card.health}%`, backgroundColor: card.health > 50 ? '#22c55e' : card.health > 25 ? '#eab308' : colors.error }]} />
                        </View>
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity key={slot} activeOpacity={0.7} disabled={isEquipping || isSacrificing}
                      onPress={() => handleSlotTap(null, slot)} style={[styles.deckSlot, styles.deckSlotEmpty]}
                    >
                      <MaterialIcons name="add" size={28} color={colors.outlineVariant} />
                      <Text style={styles.emptySlotText}>Экипировать</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Animated2.View>
          ) : (
            <View style={styles.deckSection}>
              <Text style={[styles.emptyStateText, { marginVertical: Spacing.xl }]}>У вас нет активной колоды.</Text>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ежедневные задания</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.questScroll}>
              {quests.length === 0 ? (
                <Text style={[styles.emptyStateText, { marginHorizontal: Spacing.base }]}>На сегодня заданий нет</Text>
              ) : quests.map((q: any) => (
                <View key={q.id} style={styles.questCard}>
                  <View style={styles.questIconRow}>
                    <View style={styles.questIcon}>
                      <MaterialIcons name={toMaterialIconName(q.quest?.icon) as any} size={24} color={colors.primary} />
                    </View>
                    <Text style={styles.questReward}>+{q.quest?.rewardMB || 0} MB</Text>
                  </View>
                  <Text style={styles.questTitle}>{q.quest?.title || 'Задание'}</Text>
                  <Text style={styles.questDesc} numberOfLines={2}>{q.quest?.description || ''}</Text>
                  {q.completed && !q.claimed ? (
                    <ActionButton
                      label="Забрать"
                      endpointKey={`claimQuest:${q.id}`}
                      onPress={async () => {
                        await apiClient.claimQuest(q.id);
                        loadQuests();
                        loadUser();
                      }}
                    />
                  ) : q.claimed ? (
                    <View style={styles.completedBadge}>
                      <MaterialIcons name="check-circle" size={14} color="#22c55e" />
                      <Text style={styles.completedText}>Выполнено</Text>
                    </View>
                  ) : (
                    <View style={styles.progressRow}>
                      <View style={styles.progressBar}>
                        <View style={[styles.progressFill, { width: `${((q.progress || 0) / (q.target || 1)) * 100}%` }]} />
                      </View>
                      <Text style={styles.progressText}>{q.progress || 0}/{q.target || 1}</Text>
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity onPress={() => router.push('/collection')} style={styles.actionRowBtn}>
              <MaterialIcons name="auto-awesome-mosaic" size={20} color={colors.primary} />
              <Text style={[styles.actionRowBtnText, { color: colors.primary }]}>Коллекция</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/trade')} style={styles.actionRowBtn}>
              <MaterialIcons name="swap-horiz" size={22} color={colors.primary} />
              <Text style={[styles.actionRowBtnText, { color: colors.primary }]}>Трейды</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Инвентарь</Text>
            <View style={styles.filterRow}>
              {[{ key: null, label: 'Все' }, { key: 'COMMON', label: 'Обычные' }, { key: 'RARE', label: 'Редкие' }, { key: 'EPIC', label: 'Эпические' }, { key: 'LEGENDARY', label: 'Легендарные' }].map((f) => (
                <TouchableOpacity key={f.label} style={[styles.filterTab, filter === f.key && styles.filterTabActive]} onPress={() => setFilter(f.key)}>
                  <Text style={[styles.filterTabText, filter === f.key && styles.filterTabTextActive]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.cardGrid}>
            {filteredCards.map((card: any) => {
              const c = card.collectionCard;
              const rarityColor = getRarityCol(c.rarity);
              const iconName = toMaterialIconName(c.brandIcon);
              const isInDeck = equippedCardIds.has(card.id);
              return (
                <TouchableOpacity key={card.id} activeOpacity={0.8} onPress={() => { setSelectedCard(card); setDetailModalVisible(true); }}
                  style={[styles.cardItem, { borderColor: rarityColor }, isInDeck && styles.cardItemInDeck]}
                >
                  <View style={[styles.cardItemGlow, { backgroundColor: rarityColor }]} />
                  {isInDeck && (
                    <View style={styles.inDeckBadge}>
                      <MaterialIcons name="shield" size={10} color={colors.onPrimary} />
                      <Text style={styles.inDeckBadgeText}>В колоде</Text>
                    </View>
                  )}
                  <View style={[styles.rarityBadge, { backgroundColor: rarityColor }]}>
                    <Text style={styles.rarityBadgeText}>{getRarityName(c.rarity)}</Text>
                  </View>
                  <View style={styles.cardItemIcon}>
                    <MaterialIcons name={iconName as any} size={32} color={rarityColor} />
                  </View>
                  <Text style={styles.cardItemName} numberOfLines={1}>{c.name}</Text>
                  <Text style={styles.cardItemBrand}>{c.brandName}</Text>
                  <View style={styles.cardItemStats}>
                    <View style={styles.statRow}>
                      <MaterialIcons name="favorite" size={12} color={card.health > 50 ? '#22c55e' : colors.error} />
                      <Text style={styles.statText}>{card.health}%</Text>
                    </View>
                    <View style={styles.statRow}>
                      <MaterialIcons name="percent" size={12} color={colors.primary} />
                      <Text style={styles.statText}>{c.cashbackPercent}%</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
            {filteredCards.length === 0 && (
              <View style={styles.emptyContainer}>
                <MaterialIcons name="style" size={48} color={colors.outlineVariant} />
                <Text style={styles.emptyStateText}>Нет карточек</Text>
                <Text style={styles.emptySubtext}>Купите карты в магазине или совершайте покупки!</Text>
              </View>
            )}
          </View>
          <View style={{ height: 120 }} />
        </ScrollView>
      )}

      {/* Picker Modal */}
      <Modal visible={pickerModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Выберите карту</Text>
              <TouchableOpacity onPress={() => setPickerModalVisible(false)}><MaterialIcons name="close" size={24} color={colors.onSurfaceVariant} /></TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
              {availableCards.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: Spacing.xl }}>
                  <MaterialIcons name="style" size={36} color={colors.outlineVariant} />
                  <Text style={[styles.emptyStateText, { marginTop: Spacing.sm }]}>Все карты уже в колоде</Text>
                </View>
              ) : availableCards.map((card: any) => {
                const c = card.collectionCard;
                const rarityColor = getRarityCol(c.rarity);
                return (
                  <TouchableOpacity key={card.id} style={[styles.pickerItem, { borderColor: rarityColor }]}
                    onPress={() => handleEquipCard(card, selectedSlotIndex ?? (activeDeck?.deckCards?.length ?? 0))}
                  >
                    <MaterialIcons name={toMaterialIconName(c.brandIcon) as any} size={32} color={rarityColor} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickerItemName}>{c.name}</Text>
                      <Text style={styles.pickerItemDetails}>Cashback: {c.cashbackPercent}% • HP: {card.health}%</Text>
                    </View>
                    <Text style={[styles.pickerRarity, { color: rarityColor }]}>{getRarityName(c.rarity)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Sacrifice Target Modal */}
      <Modal visible={sacrificeStep === 'pick_target'} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>⚡ Жертвоприношение</Text>
                <Text style={styles.modalSubtitle}>Жертва: {sacrificeSource?.collectionCard?.name}</Text>
              </View>
              <TouchableOpacity onPress={() => { setSacrificeStep('idle'); setSacrificeSource(null); }}>
                <MaterialIcons name="close" size={24} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.sacrificeHint, { color: colors.onSurfaceVariant }]}>Выберите карту, которая получит здоровье:</Text>
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {sacrificeTargetCards.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: Spacing.xl }}>
                  <MaterialIcons name="favorite" size={36} color={colors.outlineVariant} />
                  <Text style={[styles.emptyStateText, { marginTop: Spacing.sm, textAlign: 'center' }]}>Нет карт с недостающим HP</Text>
                </View>
              ) : sacrificeTargetCards.map((card: any) => {
                const c = card.collectionCard;
                const rarityColor = getRarityCol(c.rarity);
                return (
                  <TouchableOpacity key={card.id} style={[styles.pickerItem, { borderColor: rarityColor }]} onPress={() => handleConfirmSacrifice(card)}>
                    <MaterialIcons name={toMaterialIconName(c.brandIcon) as any} size={32} color={rarityColor} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickerItemName}>{c.name}</Text>
                      <Text style={styles.pickerItemDetails}>HP: {card.health}% • Недостаёт: {c.maxHealth - card.health}</Text>
                      <View style={[styles.healthBarContainer, { marginTop: 6, width: '100%' }]}>
                        <View style={[styles.healthBarFill, { width: `${card.health}%`, backgroundColor: card.health > 50 ? '#22c55e' : card.health > 25 ? '#eab308' : colors.error }]} />
                      </View>
                    </View>
                    <Text style={[styles.pickerRarity, { color: rarityColor }]}>{getRarityName(c.rarity)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Card Detail Modal */}
      <Modal visible={detailModalVisible} transparent animationType="fade">
        <View style={styles.modalCenterOverlay}>
          <View style={[styles.detailCardContent, selectedCard && { borderColor: getRarityCol(selectedCard.collectionCard.rarity) }]}>
            {selectedCard && (
              <>
                <View style={styles.detailHeader}>
                  <View style={[styles.rarityBadge, { backgroundColor: getRarityCol(selectedCard.collectionCard.rarity), alignSelf: 'center' }]}>
                    <Text style={styles.rarityBadgeText}>{getRarityName(selectedCard.collectionCard.rarity)}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setDetailModalVisible(false)} style={styles.closeAbsolute}>
                    <MaterialIcons name="close" size={24} color={colors.onSurfaceVariant} />
                  </TouchableOpacity>
                </View>
                <View style={styles.detailIconWrap}>
                  <MaterialIcons name={toMaterialIconName(selectedCard.collectionCard.brandIcon) as any} size={60} color={getRarityCol(selectedCard.collectionCard.rarity)} />
                </View>
                <Text style={styles.detailTitle}>{selectedCard.collectionCard.name}</Text>
                <Text style={styles.detailDesc}>{selectedCard.collectionCard.brandName}</Text>
                <View style={styles.detailStatsBlock}>
                  <View style={styles.detailStat}>
                    <MaterialIcons name="percent" size={18} color={colors.primary} />
                    <Text style={styles.detailStatText}> {selectedCard.collectionCard.cashbackPercent}% у {selectedCard.collectionCard.brandName ?? selectedCard.collectionCard.name}</Text>
                  </View>
                  <View style={styles.detailStat}>
                    <MaterialIcons name="favorite" size={18} color={selectedCard.health > 50 ? '#22c55e' : colors.error} />
                    <Text style={styles.detailStatText}> {selectedCard.health}% Здоровье</Text>
                  </View>
                </View>
                <View style={styles.actionButtonsCol}>
                  {equippedCardIds.has(selectedCard.id) ? (
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.error + '22' }]}
                      onPress={() => { const c = selectedCard; setDetailModalVisible(false); handleRemoveCard(c); }}
                    >
                      <MaterialIcons name="remove-circle-outline" size={20} color={colors.error} />
                      <Text style={[styles.actionBtnText, { color: colors.error }]}>Убрать из колоды</Text>
                    </TouchableOpacity>
                  ) : activeDeck && (activeDeck.deckCards?.length ?? 0) < 5 ? (
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.primary + '22' }]}
                      onPress={() => { const c = selectedCard; const slot = activeDeck.deckCards?.length ?? 0; setDetailModalVisible(false); handleEquipCard(c, slot); }}
                    >
                      <MaterialIcons name="add-circle-outline" size={20} color={colors.primary} />
                      <Text style={[styles.actionBtnText, { color: colors.primary }]}>Добавить в колоду</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.primary }]} onPress={() => handleStartSacrifice(selectedCard)}>
                    <MaterialIcons name="auto-awesome" size={20} color={colors.onPrimary} />
                    <Text style={[styles.actionBtnText, { color: colors.onPrimary }]}>Пожертвовать для HP</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.surfaceContainerHigh }]}
                    onPress={() => { setDetailModalVisible(false); router.push('/trade'); }}
                  >
                    <MaterialIcons name="swap-horiz" size={20} color={colors.onSurface} />
                    <Text style={[styles.actionBtnText, { color: colors.onSurface }]}>Обменять / Подарить</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const getStyles = (Colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { paddingBottom: 120 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bellBtn: { position: 'relative', padding: 8 },
  bellDot: { position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.error },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: Spacing.xl, paddingTop: Spacing.xl, paddingBottom: Spacing.sm },
  brandLabel: { fontSize: Fonts.sizes.xs, fontFamily: 'Manrope-ExtraBold', color: Colors.primary, letterSpacing: 2, marginBottom: 4 },
  pageTitle: { fontSize: Fonts.sizes['3xl'], fontFamily: 'Manrope-ExtraBold', color: Colors.onSurface, letterSpacing: -0.5 },
  mbBadge: { backgroundColor: Colors.secondaryContainer, paddingHorizontal: 12, paddingVertical: 6, borderRadius: BorderRadius.full },
  mbBadgeText: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-ExtraBold', color: '#131313' },
  tabSwitcher: { flexDirection: 'row', marginHorizontal: Spacing.base, marginBottom: Spacing.base, backgroundColor: Colors.surfaceContainerHigh, borderRadius: BorderRadius.full, padding: 4 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: BorderRadius.full },
  tabBtnText: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-ExtraBold' },
  deckSection: { marginHorizontal: Spacing.base, marginTop: Spacing.sm, backgroundColor: Colors.surfaceContainerLowest, borderRadius: BorderRadius.lg, padding: Spacing.xl, ...Shadows.md, borderWidth: 1, borderColor: Colors.transparentBorder },
  deckName: { fontSize: Fonts.sizes.xl, fontFamily: 'Manrope-Bold', color: Colors.onSurface, marginBottom: Spacing.sm },
  cashbackChipsRow: { marginBottom: Spacing.base, flexGrow: 0 },
  cashbackChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: BorderRadius.full, paddingHorizontal: 12, paddingVertical: 5 },
  cashbackChipBrand: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold', maxWidth: 90 },
  cashbackChipPct: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-ExtraBold' },
  deckLoadingOverlay: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: Spacing.sm },
  deckLoadingText: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Medium', color: Colors.onSurfaceVariant },
  deckGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, justifyContent: 'center' },
  deckSlot: { width: '30%', aspectRatio: 0.7, borderRadius: BorderRadius.base, padding: Spacing.sm, flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center' },
  deckSlotFilled: { backgroundColor: Colors.surfaceContainerLow, borderWidth: 2, overflow: 'hidden' },
  deckSlotGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 4, opacity: 0.6 },
  removeHint: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 999, width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  deckSlotBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  deckSlotEmpty: { backgroundColor: Colors.surfaceContainerHigh, borderWidth: 2, borderColor: Colors.outlineVariant, borderStyle: 'dashed' },
  deckSlotName: { fontSize: 10, fontFamily: 'Manrope-Bold', color: Colors.onSurface, textAlign: 'center' },
  deckSlotRarity: { fontSize: 9, fontFamily: 'Manrope-ExtraBold', textTransform: 'uppercase', letterSpacing: 1 },
  healthBarContainer: { width: '90%', height: 4, backgroundColor: Colors.surfaceContainerHigh, borderRadius: 2, overflow: 'hidden', marginBottom: 2 },
  healthBarFill: { height: '100%', borderRadius: 2 },
  emptySlotText: { fontSize: 10, color: Colors.outlineVariant, fontFamily: 'Manrope-Medium', textAlign: 'center' },
  section: { paddingHorizontal: Spacing.base, marginTop: Spacing.xl },
  sectionTitle: { fontSize: Fonts.sizes.xl, fontFamily: 'Manrope-Bold', color: Colors.onSurface, marginBottom: Spacing.base, letterSpacing: -0.3 },
  questScroll: { marginHorizontal: -Spacing.base, paddingHorizontal: Spacing.base },
  questCard: { width: 220, backgroundColor: Colors.surfaceContainerLowest, borderRadius: BorderRadius.base, padding: Spacing.lg, marginRight: Spacing.base, gap: Spacing.sm, borderWidth: 1, borderColor: Colors.transparentBorder, ...Shadows.sm },
  questIconRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  questIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.surfaceContainerLow, alignItems: 'center', justifyContent: 'center' },
  questReward: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-ExtraBold', color: Colors.secondaryContainer },
  questTitle: { fontSize: Fonts.sizes.md, fontFamily: 'Manrope-Bold', color: Colors.onSurface },
  questDesc: { fontSize: Fonts.sizes.sm, color: Colors.onSurfaceVariant, fontFamily: 'Manrope-Medium' },
  claimButton: { backgroundColor: Colors.primary, borderRadius: BorderRadius.full, paddingVertical: 8, alignItems: 'center', ...Shadows.primary, marginTop: 4 },
  claimButtonText: { color: Colors.onPrimary, fontFamily: 'Manrope-Bold', fontSize: Fonts.sizes.sm },
  completedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: 'center', marginTop: 4 },
  completedText: { fontSize: Fonts.sizes.sm, color: '#22c55e', fontFamily: 'Manrope-Bold' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  progressBar: { flex: 1, height: 6, backgroundColor: Colors.surfaceContainerHigh, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 3 },
  progressText: { fontSize: Fonts.sizes.xs, color: Colors.onSurfaceVariant, fontFamily: 'Manrope-Bold' },
  actionsRow: { flexDirection: 'row', paddingHorizontal: Spacing.xl, marginTop: Spacing.xl, marginBottom: Spacing.sm, gap: 12 },
  actionRowBtn: { flex: 1, backgroundColor: Colors.surfaceVariant, padding: Spacing.md, borderRadius: BorderRadius.lg, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  actionRowBtnText: { fontFamily: 'Manrope-Bold', marginLeft: 8 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  filterTab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: BorderRadius.full, backgroundColor: Colors.surfaceContainerLow },
  filterTabActive: { backgroundColor: Colors.primary },
  filterTabText: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold', color: Colors.onSurfaceVariant },
  filterTabTextActive: { color: Colors.onPrimary },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.base, gap: Spacing.base, marginTop: Spacing.base },
  cardItem: { width: '47%', backgroundColor: Colors.surfaceContainerLowest, borderRadius: BorderRadius.base, padding: Spacing.base, gap: 6, borderWidth: 2, overflow: 'hidden', ...Shadows.sm },
  cardItemInDeck: { opacity: 0.75 },
  cardItemGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 4, opacity: 0.7 },
  inDeckBadge: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.primary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: BorderRadius.full },
  inDeckBadgeText: { fontSize: 8, fontFamily: 'Manrope-ExtraBold', color: Colors.onPrimary, textTransform: 'uppercase', letterSpacing: 0.5 },
  rarityBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.full },
  rarityBadgeText: { fontSize: 9, fontFamily: 'Manrope-ExtraBold', color: Colors.onPrimary, textTransform: 'uppercase', letterSpacing: 1 },
  cardItemIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.surfaceContainerLow, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginVertical: 8 },
  cardItemName: { fontSize: Fonts.sizes.md, fontFamily: 'Manrope-Bold', textAlign: 'center', color: Colors.onSurface },
  cardItemBrand: { fontSize: Fonts.sizes.sm, color: Colors.onSurfaceVariant, textAlign: 'center', fontFamily: 'Manrope-Medium' },
  cardItemStats: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.transparentBorder },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold', color: Colors.onSurfaceVariant },
  emptyContainer: { width: '100%', alignItems: 'center', paddingVertical: Spacing['3xl'], gap: Spacing.sm },
  emptyStateText: { fontSize: Fonts.sizes.base, fontFamily: 'Manrope-Bold', color: Colors.onSurfaceVariant, textAlign: 'center' },
  emptySubtext: { fontSize: Fonts.sizes.sm, color: Colors.outlineVariant, textAlign: 'center', fontFamily: 'Manrope-Medium' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.surface, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, padding: Spacing.xl, ...Shadows.lg, paddingBottom: 60 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.base },
  modalTitle: { fontSize: Fonts.sizes.lg, fontFamily: 'Manrope-ExtraBold', color: Colors.onSurface },
  modalSubtitle: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Medium', color: Colors.onSurfaceVariant, marginTop: 2 },
  sacrificeHint: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Medium', marginBottom: Spacing.base },
  pickerItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, backgroundColor: Colors.surfaceContainerLowest, borderRadius: BorderRadius.base, marginBottom: Spacing.sm, borderWidth: 1 },
  pickerItemName: { fontSize: Fonts.sizes.base, fontFamily: 'Manrope-Bold', color: Colors.onSurface },
  pickerItemDetails: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Medium', color: Colors.onSurfaceVariant, marginTop: 4 },
  pickerRarity: { fontSize: 10, fontFamily: 'Manrope-ExtraBold', textTransform: 'uppercase' },
  modalCenterOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: Spacing.xl },
  detailCardContent: { backgroundColor: Colors.surfaceContainerLowest, borderRadius: BorderRadius.xl, padding: Spacing.xl, alignItems: 'center', borderWidth: 2, ...Shadows.lg },
  closeAbsolute: { position: 'absolute', right: 0, top: 0, padding: Spacing.sm },
  detailHeader: { width: '100%', alignItems: 'center', marginBottom: Spacing.lg },
  detailIconWrap: { width: 100, height: 100, borderRadius: 50, backgroundColor: Colors.surfaceContainerLow, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.lg },
  detailTitle: { fontSize: 22, fontFamily: 'Manrope-ExtraBold', color: Colors.onSurface, textAlign: 'center' },
  detailDesc: { fontSize: Fonts.sizes.md, fontFamily: 'Manrope-Medium', color: Colors.onSurfaceVariant, marginTop: 8 },
  detailStatsBlock: { flexDirection: 'row', gap: Spacing.xl, marginVertical: Spacing.xl, flexWrap: 'wrap', justifyContent: 'center' },
  detailStat: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceContainerHigh, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  detailStatText: { fontFamily: 'Manrope-Bold', color: Colors.onSurface, fontSize: Fonts.sizes.sm },
  actionButtonsCol: { width: '100%', gap: Spacing.sm },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: BorderRadius.base, gap: 8 },
  actionBtnText: { fontFamily: 'Manrope-ExtraBold', fontSize: Fonts.sizes.sm },
});

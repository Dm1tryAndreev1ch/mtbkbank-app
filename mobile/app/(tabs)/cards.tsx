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
import Animated2, {
  FadeIn,
  runOnUI,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { ComposedGesture, GestureType } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { useThemeColor } from '../../hooks/useThemeColor';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useCancellableAnimation } from '../../hooks/useCancellableAnimation';
import { LinearGradient } from 'expo-linear-gradient';
import { ActionButton } from '../../components/ActionButton';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DeckSlotRow } from '../../components/cards/DeckSlotRow';
import { InventoryGrid } from '../../components/cards/InventoryGrid';
import { SacrificeOverlay } from '../../components/cards/SacrificeOverlay';
import { GAMIFIED_SPRING, SLOT_LAYOUT } from '../../components/cards/animationConstants';
import { useDeckDragGesture } from '../../components/cards/useDeckDragGesture';

type Rarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';

interface CollectionCard {
  id: string;
  name: string;
  rarity: Rarity;
  cashbackPercent: number;
  description?: string;
  brandName?: string;
  brandIcon?: string;
  maxHealth?: number;
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
  const [sessionPurchasedIds, setSessionPurchasedIds] = useState<Set<string>>(new Set());
  const [nextRefresh, setNextRefresh] = useState<Date>(() => {
    const d = new Date(); d.setHours(d.getHours() + REFRESH_HOURS); return d;
  });
  const [timerMs, setTimerMs] = useState(0);
  const [filterRarity, setFilterRarity] = useState<Rarity | null>(null);
  const [confirmCard, setConfirmCard] = useState<CollectionCard | null>(null);
  const [successCard, setSuccessCard] = useState<CollectionCard | null>(null);
  const successAnim = useRef(new Animated.Value(0)).current;

  const loadShopCards = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.getCollection();
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

  useEffect(() => {
    const tick = () => setTimerMs(Math.max(0, nextRefresh.getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextRefresh]);

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
      setSessionPurchasedIds((prev) => new Set([...prev, confirmCard.id]));
      onPurchaseSuccess(data.mbPoints);
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

  const [sacrificeOverlayVisible, setSacrificeOverlayVisible] = useState(false);
  const [sacrificeTarget, setSacrificeTarget] = useState<any>(null);
  const [sacrificeHealAmount, setSacrificeHealAmount] = useState(0);

  const [selectedCard, setSelectedCard] = useState<any>(null);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);
  const [isEquipping, setIsEquipping] = useState(false);

  // P04 D-13 — ConfirmDialog state for tap-to-remove.
  const [removeConfirmVisible, setRemoveConfirmVisible] = useState(false);
  const [cardToRemove, setCardToRemove] = useState<any>(null);

  const [swappingDeckId, setSwappingDeckId] = useState<string | null>(null);
  const reducedMotion = useReducedMotion();
  const register = useCancellableAnimation();
  const swapOpacity = register(useSharedValue(1));
  const swapAnimStyle = useAnimatedStyle(() => ({ opacity: swapOpacity.value }));

  const dragX = register(useSharedValue(0));
  const dragY = register(useSharedValue(0));
  const dragScale = register(useSharedValue(1));
  const dragOpacity = register(useSharedValue(0));
  const draggingCardIdSV = useSharedValue<string | null>(null);
  const slotRefsRef = useRef<Array<React.RefObject<any> | null>>(
    Array.from({ length: 5 }, () => null),
  );
  const slotEmptySV = register(useSharedValue<boolean[]>([true, true, true, true, true]));
  const dragOverlayStyle = useAnimatedStyle(() => ({
    opacity: dragOpacity.value,
    transform: [
      { translateX: dragX.value },
      { translateY: dragY.value },
      { scale: dragScale.value },
    ],
  }));

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

  const handleRemoveCard = (card: any) => {
    if (!activeDeck) return;
    setCardToRemove(card);
    setRemoveConfirmVisible(true);
  };

  const handleConfirmRemove = async () => {
    const card = cardToRemove;
    if (!activeDeck || !card) return;
    setIsEquipping(true);
    try {
      await apiClient.updateDeck(activeDeck.id, {
        cardIds: getCurrentCardIds().filter((id) => id !== card.id),
      });
      await loadDecks();
    } catch (e: any) {
      const msg = e?.response?.data?.error || 'Не удалось убрать карту';
      try {
        useStore.getState().toast.show(msg, 'error');
      } catch {
        // Toast unavailable in tests — silent fallback.
      }
    } finally {
      setIsEquipping(false);
      setCardToRemove(null);
    }
  };

  const handleSlotTap = (slotCard: any, index: number) => {
    if (slotCard) { handleRemoveCard(slotCard); }
    else { setSelectedSlotIndex(index); setPickerModalVisible(true); }
  };

  const equipCardById = useCallback(async (cardId: string, slotIndex: number) => {
    if (!activeDeck) return;
    const card = (cards as any[]).find((c) => c.id === cardId);
    if (!card) return;
    await handleEquipCard(card, slotIndex);
  }, [activeDeck, cards]);

  const handleSwapActiveDeck = useCallback(async (targetDeckId: string) => {
    if (swappingDeckId) return;
    setSwappingDeckId(targetDeckId);
    try {
      if (reducedMotion) {
        swapOpacity.value = 1;
        await apiClient.activateDeck(targetDeckId);
        await loadDecks();
      } else {
        swapOpacity.value = withTiming(0, { duration: 250 });
        await new Promise((r) => setTimeout(r, 250));
        await apiClient.activateDeck(targetDeckId);
        await loadDecks();
        swapOpacity.value = withTiming(1, { duration: 250 });
      }
    } catch (e: any) {
      swapOpacity.value = 1;
      const msg = e?.response?.data?.error || 'Не удалось сменить колоду';
      try {
        useStore.getState().toast.show(msg, 'error');
      } catch {
        // Toast unavailable in tests — silent.
      }
    } finally {
      setSwappingDeckId(null);
    }
  }, [reducedMotion, swappingDeckId]);

  const cardGestureBuilder = useDeckDragGesture({
    dragX, dragY, dragScale, dragOpacity, draggingCardIdSV, slotEmptySV, slotRefsRef,
    reducedMotion,
    equip: equipCardById,
    onPickup: useCallback(() => { Haptics.selectionAsync().catch(() => {}); }, []),
    onSnap: useCallback(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }, []),
  });
  void GAMIFIED_SPRING;

  const handleSlotMeasured = useCallback((index: number, ref: React.RefObject<any>) => {
    slotRefsRef.current[index] = ref;
  }, []);

  useEffect(() => {
    const next: boolean[] = [false, false, false, false, false];
    for (let i = 0; i < 5; i++) {
      const deckCard = activeDeck?.deckCards?.find((dc: any) => dc.slotIndex === i)
        ?? activeDeck?.deckCards?.[i];
      next[i] = !deckCard?.userCard;
    }
    runOnUI((val: boolean[]) => {
      'worklet';
      slotEmptySV.value = val;
    })(next);
  }, [activeDeck]);

  const handleStartSacrifice = (sacrificeCard: any) => {
    setDetailModalVisible(false);
    setSacrificeSource(sacrificeCard);
    setSacrificeStep('pick_target');
  };

  const handleConfirmSacrifice = (targetCard: any) => {
    if (!sacrificeSource) return;
    const preview = Math.max(0, Math.min(100, 100 - (targetCard.health ?? 0)));
    setSacrificeTarget(targetCard);
    setSacrificeHealAmount(preview);
    setSacrificeStep('idle');
    setSacrificeOverlayVisible(true);
  };

  const runActualSacrifice = async () => {
    const src = sacrificeSource;
    const tgt = sacrificeTarget;
    setSacrificeOverlayVisible(false);
    setSacrificeSource(null);
    setSacrificeTarget(null);
    if (!src || !tgt) return;
    setIsSacrificing(true);
    try {
      const res = await apiClient.sacrificeCard(src.id, tgt.id);
      await loadCards();
      await loadDecks();
      await loadUser();
      const healed = res?.data?.healAmount ?? sacrificeHealAmount;
      useStore.getState().toast.show(`+${healed} HP`, 'success');
    } catch (e: any) {
      const msg = e?.response?.data?.error || 'Не удалось провести жертвоприношение';
      useStore.getState().toast.show(msg, 'error');
    } finally {
      setIsSacrificing(false);
    }
  };

  const sacrificeTargetCards = useMemo(() => {
    if (!sacrificeSource) return [];
    return cards.filter((c: any) => c.id !== sacrificeSource.id && c.health < 100);
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

  const handlePurchaseSuccess = useCallback((newMbPoints: number) => {
    setLocalPoints(newMbPoints);
    loadCards();
    loadUser();
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

              <Animated2.View style={[swapAnimStyle, (isEquipping || isSacrificing) ? { opacity: 0.4 } : undefined]}>
                <DeckSlotRow
                  slots={[0, 1, 2, 3, 4].map((slot) => {
                    const deckCard = activeDeck.deckCards?.find((dc: any) => dc.slotIndex === slot) ?? activeDeck.deckCards?.[slot];
                    const card = deckCard?.userCard;
                    return { cardId: card?.id ?? null, card };
                  })}
                  disabled={isEquipping || isSacrificing}
                  onSlotTap={handleSlotTap}
                  onSlotMeasured={handleSlotMeasured}
                />
              </Animated2.View>

              {decks.length > 1 && (
                <View style={styles.swapCtaRow}>
                  <Text style={styles.swapCtaLabel}>Сменить активную колоду</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {decks.filter((d: any) => !d.isActive).map((deck: any) => (
                      <DeckSwapChip
                        key={deck.id}
                        deck={deck}
                        disabled={!!swappingDeckId || isEquipping || isSacrificing}
                        reducedMotion={reducedMotion}
                        onSwap={() => handleSwapActiveDeck(deck.id)}
                        styles={styles}
                        colors={colors}
                      />
                    ))}
                  </ScrollView>
                </View>
              )}
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

          <InventoryGrid
            cards={filteredCards as any}
            equippedCardIds={equippedCardIds}
            onCardTap={(card) => { setSelectedCard(card); setDetailModalVisible(true); }}
            onSacrifice={(cardId) => {
              const found = (cards as any[]).find((c) => c.id === cardId);
              if (found) {
                handleStartSacrifice(found);
              } else {
                try {
                  useStore.getState().toast.show('Карта не найдена, обновите список', 'error');
                } catch {
                  // toast unavailable — silent
                }
              }
            }}
            cardGestureBuilder={cardGestureBuilder}
            emptyState={
              <View style={styles.emptyContainer}>
                <MaterialIcons name="style" size={48} color={colors.outlineVariant} />
                <Text style={styles.emptyStateText}>Нет карточек</Text>
                <Text style={styles.emptySubtext}>Купите карты в магазине или совершайте покупки!</Text>
              </View>
            }
          />
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
                {/* fix: используем collectionCard.name вместо прямого .name */}
                <Text style={styles.modalSubtitle}>
                  Жертва: {sacrificeSource?.collectionCard?.name ?? sacrificeSource?.name ?? '?'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => { setSacrificeStep('idle'); setSacrificeSource(null); }}>
                <MaterialIcons name="close" size={24} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.sacrificeHint, { color: colors.onSurfaceVariant }]}>Выберите карту, которая получит здоровье:</Text>
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {sacrificeTargetCards.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: Spacing.xl }}>
                  <MaterialIcons name="favorite-border" size={36} color={colors.outlineVariant} />
                  <Text style={[styles.emptyStateText, { marginTop: Spacing.sm }]}>Нет карт, которым нужно лечение</Text>
                </View>
              ) : sacrificeTargetCards.map((card: any) => {
                const c = card.collectionCard;
                const rarityColor = getRarityCol(c.rarity);
                const missing = 100 - (card.health ?? 0);
                return (
                  <TouchableOpacity
                    key={card.id}
                    style={[styles.pickerItem, { borderColor: rarityColor }]}
                    onPress={() => handleConfirmSacrifice(card)}
                  >
                    <MaterialIcons name={toMaterialIconName(c.brandIcon) as any} size={32} color={rarityColor} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickerItemName}>{c.name}</Text>
                      <Text style={styles.pickerItemDetails}>
                        HP: {card.health}% • Недостаёт: {missing}%
                      </Text>
                    </View>
                    <Text style={[styles.pickerRarity, { color: rarityColor }]}>{getRarityName(c.rarity)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* P05-T2 — SacrificeOverlay */}
      {/* fix: sourceCard передаётся как userCard; SacrificeOverlay теперь
          резолвит имя через resolveCardName(collectionCard.name) внутри */}
      <SacrificeOverlay
        visible={sacrificeOverlayVisible}
        sourceCard={sacrificeSource}
        targetCard={sacrificeTarget}
        healAmount={sacrificeHealAmount}
        onDismiss={() => setSacrificeOverlayVisible(false)}
        onComplete={runActualSacrifice}
      />

      {/* P04 D-13 — ConfirmDialog for deck-slot removal */}
      {/* fix: было onCancel (несуществующий проп) → теперь onDismiss закрывает
          диалог и сбрасывает cardToRemove; confirmButton.onPress выполняет
          удаление и закрывает диалог после завершения операции */}
      <ConfirmDialog
        visible={removeConfirmVisible}
        title="Убрать карту из колоды?"
        message={
          cardToRemove
            ? `«${
                cardToRemove.collectionCard?.name ??
                cardToRemove.collectionCard?.brandName ??
                cardToRemove.name ??
                'Карта'
              }» будет снята со слота.`
            : ''
        }
        confirmLabel="Убрать"
        onDismiss={() => {
          setRemoveConfirmVisible(false);
          setCardToRemove(null);
        }}
        confirmButton={{
          onPress: () => {
            setRemoveConfirmVisible(false);
            handleConfirmRemove();
          },
        }}
      />

      {/* Detail Modal */}
      {detailModalVisible && selectedCard && (
        <Modal visible animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { maxHeight: '80%' }]}>
              <View style={styles.modalHeader}>
                {/* fix: имя из collectionCard.name */}
                <Text style={styles.modalTitle}>
                  {selectedCard.collectionCard?.name ?? selectedCard.name ?? '?'}
                </Text>
                <TouchableOpacity onPress={() => setDetailModalVisible(false)}>
                  <MaterialIcons name="close" size={24} color={colors.onSurfaceVariant} />
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} style={{ padding: Spacing.base }}>
                <Text style={[styles.pickerItemDetails, { marginBottom: Spacing.sm }]}>
                  Редкость: {getRarityName(selectedCard.collectionCard?.rarity)}
                </Text>
                <Text style={[styles.pickerItemDetails, { marginBottom: Spacing.sm }]}>
                  HP: {selectedCard.health}%
                </Text>
                <Text style={[styles.pickerItemDetails, { marginBottom: Spacing.sm }]}>
                  Кэшбэк: {selectedCard.collectionCard?.cashbackPercent}%
                </Text>
                {selectedCard.collectionCard?.description && (
                  <Text style={[styles.pickerItemDetails, { marginBottom: Spacing.base }]}>
                    {selectedCard.collectionCard.description}
                  </Text>
                )}
                <TouchableOpacity
                  style={styles.sacrificeBtn}
                  onPress={() => handleStartSacrifice(selectedCard)}
                  activeOpacity={0.82}
                >
                  <MaterialIcons name="whatshot" size={26} color="#fff" />
                  <Text style={styles.sacrificeBtnText}>Принести в жертву</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* Drag overlay */}
      <Animated2.View
        style={[StyleSheet.absoluteFill, dragOverlayStyle]}
        pointerEvents="none"
      >
      </Animated2.View>
    </SafeAreaView>
  );
}

// ─── DeckSwapChip ─────────────────────────────────────────────────────────────

interface DeckSwapChipProps {
  deck: any;
  disabled: boolean;
  reducedMotion: boolean;
  onSwap: () => void;
  styles: any;
  colors: any;
}

function DeckSwapChip({ deck, disabled, reducedMotion, onSwap, styles, colors }: DeckSwapChipProps) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    if (disabled) return;
    if (!reducedMotion) {
      scale.value = withSequence(
        withTiming(0.93, { duration: 80 }),
        withTiming(1, { duration: 120 }),
      );
    }
    onSwap();
  };

  return (
    <Animated2.View style={animStyle}>
      <TouchableOpacity
        style={[styles.swapChip, disabled && { opacity: 0.45 }]}
        onPress={handlePress}
        disabled={disabled}
        activeOpacity={0.75}
      >
        <MaterialIcons name="swap-horiz" size={14} color={colors.onSurfaceVariant} />
        <Text style={[styles.swapChipText, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
          {deck.name}
        </Text>
      </TouchableOpacity>
    </Animated2.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function getStyles(colors: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: Spacing.xs },
    brandLabel: { fontSize: 9, fontFamily: 'Manrope-ExtraBold', color: colors.onSurfaceVariant, letterSpacing: 2, textTransform: 'uppercase' },
    pageTitle: { fontSize: Fonts.sizes.xl, fontFamily: 'Manrope-ExtraBold', color: colors.onSurface, marginTop: 2 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    mbBadge: { backgroundColor: colors.primaryContainer, borderRadius: BorderRadius.full, paddingHorizontal: 12, paddingVertical: 5 },
    mbBadgeText: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-ExtraBold', color: colors.onPrimaryContainer },
    bellBtn: { position: 'relative', padding: 4 },
    bellDot: { position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.error },
    tabSwitcher: { flexDirection: 'row', marginHorizontal: Spacing.base, marginBottom: Spacing.sm, backgroundColor: colors.surfaceContainerHigh, borderRadius: BorderRadius.base, padding: 3 },
    tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: BorderRadius.sm },
    tabBtnText: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold' },
    scrollContent: { paddingBottom: Spacing.xl },
    deckSection: { marginHorizontal: Spacing.base, marginBottom: Spacing.base, backgroundColor: colors.surfaceContainer, borderRadius: BorderRadius.xl, padding: Spacing.base, ...Shadows.md },
    deckName: { fontSize: Fonts.sizes.lg, fontFamily: 'Manrope-ExtraBold', color: colors.onSurface, marginBottom: Spacing.sm },
    cashbackChipsRow: { marginBottom: Spacing.sm, flexGrow: 0 },
    cashbackChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 4 },
    cashbackChipBrand: { fontSize: 11, fontFamily: 'Manrope-Bold', maxWidth: 80 },
    cashbackChipPct: { fontSize: 11, fontFamily: 'Manrope-ExtraBold' },
    deckLoadingOverlay: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: Spacing.xs },
    deckLoadingText: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Medium', color: colors.onSurfaceVariant },
    swapCtaRow: { marginTop: Spacing.sm, gap: 6 },
    swapCtaLabel: { fontSize: Fonts.sizes.xs, fontFamily: 'Manrope-Bold', color: colors.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 0.8 },
    swapChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: BorderRadius.full, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.surfaceContainerHigh },
    swapChipText: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold', maxWidth: 100 },
    section: { marginHorizontal: Spacing.base, marginBottom: Spacing.base },
    sectionTitle: { fontSize: Fonts.sizes.base, fontFamily: 'Manrope-ExtraBold', color: colors.onSurface, marginBottom: Spacing.sm },
    questScroll: { flexGrow: 0 },
    questCard: { width: 200, backgroundColor: colors.surfaceContainer, borderRadius: BorderRadius.lg, padding: Spacing.base, marginRight: Spacing.sm, ...Shadows.sm },
    questIconRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xs },
    questIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryContainer, alignItems: 'center', justifyContent: 'center' },
    questReward: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-ExtraBold', color: colors.primary },
    questTitle: { fontSize: Fonts.sizes.base, fontFamily: 'Manrope-ExtraBold', color: colors.onSurface, marginBottom: 3 },
    questDesc: { fontSize: Fonts.sizes.xs, fontFamily: 'Manrope-Medium', color: colors.onSurfaceVariant, marginBottom: Spacing.sm },
    progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    progressBar: { flex: 1, height: 6, backgroundColor: colors.surfaceContainerHigh, borderRadius: 3, overflow: 'hidden' },
    progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
    progressText: { fontSize: Fonts.sizes.xs, fontFamily: 'Manrope-Bold', color: colors.onSurfaceVariant },
    completedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    completedText: { fontSize: Fonts.sizes.xs, fontFamily: 'Manrope-Bold', color: '#22c55e' },
    actionsRow: { flexDirection: 'row', marginHorizontal: Spacing.base, gap: Spacing.sm, marginBottom: Spacing.base },
    actionRowBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surfaceContainer, borderRadius: BorderRadius.base, padding: Spacing.sm, ...Shadows.sm },
    actionRowBtnText: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold' },
    filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    filterTab: { borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: BorderRadius.full, paddingHorizontal: 12, paddingVertical: 5 },
    filterTabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    filterTabText: { fontSize: Fonts.sizes.xs, fontFamily: 'Manrope-Bold', color: colors.onSurfaceVariant },
    filterTabTextActive: { color: colors.onPrimary },
    emptyContainer: { alignItems: 'center', paddingVertical: Spacing.xl, gap: 8, marginHorizontal: Spacing.base },
    emptyStateText: { fontSize: Fonts.sizes.base, fontFamily: 'Manrope-Bold', color: colors.onSurfaceVariant, textAlign: 'center' },
    emptySubtext: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Medium', color: colors.onSurfaceVariant, textAlign: 'center' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: colors.surfaceContainerLowest, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, paddingTop: Spacing.base, ...Shadows.xl },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.outlineVariant },
    modalTitle: { fontSize: Fonts.sizes.lg, fontFamily: 'Manrope-ExtraBold', color: colors.onSurface },
    modalSubtitle: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Medium', color: colors.onSurfaceVariant, marginTop: 2 },
    sacrificeHint: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Medium' },
    pickerItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.outlineVariant },
    pickerItemName: { fontSize: Fonts.sizes.base, fontFamily: 'Manrope-Bold', color: colors.onSurface },
    pickerItemDetails: { fontSize: Fonts.sizes.xs, fontFamily: 'Manrope-Medium', color: colors.onSurfaceVariant },
    pickerRarity: { fontSize: Fonts.sizes.xs, fontFamily: 'Manrope-ExtraBold' },
    sacrificeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.base,
      backgroundColor: '#ef4444',
      borderRadius: BorderRadius.lg,
      paddingVertical: 20,
      paddingHorizontal: Spacing.xl,
      marginTop: Spacing.lg,
      marginBottom: Spacing.base,
      minHeight: 60,
      ...Shadows.md,
    },
    sacrificeBtnText: {
      fontSize: Fonts.sizes.lg,
      fontFamily: 'Manrope-ExtraBold',
      color: '#fff',
      letterSpacing: 0.3,
    },
  });
}

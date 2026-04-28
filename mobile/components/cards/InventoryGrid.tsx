// Phase 6 P00 — extracted from mobile/app/(tabs)/cards.tsx inventory render
// block (~L821-866). Pure presentational component: receives cards + callbacks
// from the parent. ZERO behavior change vs. the inline code it replaces;
// downstream plans (P04 long-press drag, P05 sacrifice overlay) will wire the
// onLongPressDrag / onSacrifice props to gestures + ConfirmDialog respectively.
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { GestureDetector, type ComposedGesture, type GestureType } from 'react-native-gesture-handler';
import { MaterialIcons } from '@expo/vector-icons';

import { BorderRadius, Fonts, Shadows, Spacing, getRarityName, toMaterialIconName } from '../../constants/theme';
import { useThemeColor } from '../../hooks/useThemeColor';
import { SLOT_LAYOUT } from './animationConstants';
import { LowHpPulseBorder } from './LowHpPulseBorder';

export interface InventoryGridCard {
  id: string;
  health: number;
  pendingExpire?: boolean;
  collectionCard: {
    name: string;
    rarity: string;
    cashbackPercent: number;
    brandName?: string;
    brandIcon?: string;
    /** Optional — falls back to 100 when missing (P05 LowHpPulseBorder gate). */
    maxHealth?: number;
  };
}

export interface InventoryGridProps {
  cards: InventoryGridCard[];
  /** Card ids currently equipped in the active deck — render the "В колоде" badge. */
  equippedCardIds: Set<string>;
  /** Tap-to-open detail (today still triggers the parent's detail modal). */
  onCardTap: (card: any) => void;
  /** P05 hook — wired to <SacrificeOverlay> + ConfirmDialog. No-op in P00. */
  onSacrifice?: (cardId: string) => void;
  /** P04 hook — wired to a LongPress + Pan gesture for drag-to-deck. No-op in P00. */
  onLongPressDrag?: (cardId: string) => void;
  /**
   * P04 hook — parent (cards.tsx) supplies a per-card composed gesture
   * (`Gesture.Simultaneous(longPress, pan)`) that we wrap around each card via
   * <GestureDetector>. Returning `null` skips the wrapper for that card.
   */
  cardGestureBuilder?: (cardId: string) => ComposedGesture | GestureType | null;
  /** Empty-state slot (rendered as a child after the grid when cards.length === 0). */
  emptyState?: React.ReactNode;
}

const RARITY_COLOR_MAP: Record<string, keyof ReturnType<typeof useThemeColor>> = {
  COMMON: 'rarityCommon',
  RARE: 'rarityRare',
  EPIC: 'rarityEpic',
  LEGENDARY: 'rarityLegendary',
};

export function InventoryGrid({
  cards,
  equippedCardIds,
  onCardTap,
  onSacrifice: _onSacrifice,
  onLongPressDrag,
  cardGestureBuilder,
  emptyState,
}: InventoryGridProps) {
  const colors = useThemeColor();

  return (
    <View style={styles.cardGrid}>
      {cards.map((card) => {
        const c = card.collectionCard;
        const rarityKey = RARITY_COLOR_MAP[c.rarity] ?? 'rarityCommon';
        const rarityColor = colors[rarityKey];
        const iconName = toMaterialIconName(c.brandIcon);
        const isInDeck = equippedCardIds.has(card.id);
        const gesture = cardGestureBuilder?.(card.id) ?? null;
        const inner = (
          <Animated.View
            key={card.id}
            layout={SLOT_LAYOUT}
            style={styles.cardItemWrap}
          >
            <TouchableOpacity
              activeOpacity={0.8}
              testID={`inventory-card-${card.id}`}
              onPress={() => onCardTap(card)}
              onLongPress={onLongPressDrag ? () => onLongPressDrag(card.id) : undefined}
              style={[
                styles.cardItem,
                { borderColor: rarityColor, backgroundColor: colors.surfaceContainerLowest },
                isInDeck && styles.cardItemInDeck,
              ]}
            >
              <View style={[styles.cardItemGlow, { backgroundColor: rarityColor }]} />
              {isInDeck && (
                <View style={[styles.inDeckBadge, { backgroundColor: colors.primary }]}>
                  <MaterialIcons name="shield" size={10} color={colors.onPrimary} />
                  <Text style={[styles.inDeckBadgeText, { color: colors.onPrimary }]}>В колоде</Text>
                </View>
              )}
              <View style={[styles.rarityBadge, { backgroundColor: rarityColor }]}>
                <Text style={[styles.rarityBadgeText, { color: colors.onPrimary }]}>{getRarityName(c.rarity)}</Text>
              </View>
              <View style={[styles.cardItemIcon, { backgroundColor: colors.surfaceContainerLow }]}>
                <MaterialIcons name={iconName as any} size={32} color={rarityColor} />
              </View>
              <Text style={[styles.cardItemName, { color: colors.onSurface }]} numberOfLines={1}>{c.name}</Text>
              <Text style={[styles.cardItemBrand, { color: colors.onSurfaceVariant }]}>{c.brandName}</Text>
              <View style={[styles.cardItemStats, { borderTopColor: colors.outlineVariant }]}>
                <View style={styles.statRow}>
                  <MaterialIcons name="favorite" size={12} color={card.health > 50 ? '#22c55e' : colors.error} />
                  <Text style={[styles.statText, { color: colors.onSurfaceVariant }]}>{card.health}%</Text>
                </View>
                <View style={styles.statRow}>
                  <MaterialIcons name="percent" size={12} color={colors.primary} />
                  <Text style={[styles.statText, { color: colors.onSurfaceVariant }]}>{c.cashbackPercent}%</Text>
                </View>
              </View>
              {/* P05-T1 — low-HP pulsing red border overlay (Gray Area E).
                  Returns null when health/maxHealth >= 0.30, so it imposes
                  zero cost on healthy cards. */}
              <LowHpPulseBorder health={card.health} maxHealth={c.maxHealth ?? 100} />
            </TouchableOpacity>
          </Animated.View>
        );
        if (gesture) {
          return (
            <GestureDetector key={card.id} gesture={gesture}>
              {inner}
            </GestureDetector>
          );
        }
        return inner;
      })}
      {cards.length === 0 && emptyState}
    </View>
  );
}

// Styles copied from cards.tsx getStyles() (cardGrid / cardItem* / inDeckBadge* /
// rarityBadge* / statRow / statText). Kept local so this component has no
// styling dependency on the parent screen — same rationale as DeckSlotRow.tsx.
const styles = StyleSheet.create({
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.base,
    gap: Spacing.base,
    marginTop: Spacing.base,
  },
  cardItemWrap: { width: '47%' },
  cardItem: {
    width: '100%',
    borderRadius: BorderRadius.base,
    padding: Spacing.base,
    gap: 6,
    borderWidth: 2,
    overflow: 'hidden',
    ...Shadows.sm,
  },
  cardItemInDeck: { opacity: 0.75 },
  cardItemGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 4, opacity: 0.7 },
  inDeckBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    zIndex: 1,
  },
  inDeckBadgeText: { fontSize: 8, fontFamily: 'Manrope-ExtraBold', textTransform: 'uppercase', letterSpacing: 0.5 },
  rarityBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.full },
  rarityBadgeText: { fontSize: 9, fontFamily: 'Manrope-ExtraBold', textTransform: 'uppercase', letterSpacing: 1 },
  cardItemIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginVertical: 8,
  },
  cardItemName: { fontSize: Fonts.sizes.md, fontFamily: 'Manrope-Bold', textAlign: 'center' },
  cardItemBrand: { fontSize: Fonts.sizes.sm, textAlign: 'center', fontFamily: 'Manrope-Medium' },
  cardItemStats: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 8, paddingTop: 8, borderTopWidth: 1 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold' },
});

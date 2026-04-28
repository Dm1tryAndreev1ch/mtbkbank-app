// Phase 6 P00 — extracted from mobile/app/(tabs)/cards.tsx active-deck render
// block (~L714-748). Pure presentational component: receives slots + callbacks
// from the parent screen. ZERO behavior change vs. the inline code it replaces;
// downstream plans (P03/P04) will wire layout animations + the long-press drag
// gesture by mutating SLOT_LAYOUT consumers and the onSlotMeasured prop.
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';

import { BorderRadius, Fonts, Spacing, getRarityName, toMaterialIconName } from '../../constants/theme';
import { useThemeColor } from '../../hooks/useThemeColor';
import { SLOT_LAYOUT } from './animationConstants';

export interface DeckSlot {
  cardId: string | null;
  card?: any;
}

export interface DeckSlotRowProps {
  slots: DeckSlot[];
  /** Tap an empty slot to open picker, tap a filled slot to remove. */
  onSlotTap: (card: any | null, index: number) => void;
  /** Disabled while parent is mid-mutation (equip / sacrifice in flight). */
  disabled?: boolean;
  /**
   * P04 hook — invoked on slot mount with the Animated.View ref so the
   * parent can call `measure()` from a worklet for drag-snap targeting.
   * No-op in P00.
   */
  onSlotMeasured?: (index: number, ref: React.RefObject<any>) => void;
}

const RARITY_COLOR_MAP: Record<string, keyof ReturnType<typeof useThemeColor>> = {
  COMMON: 'rarityCommon',
  RARE: 'rarityRare',
  EPIC: 'rarityEpic',
  LEGENDARY: 'rarityLegendary',
};

export function DeckSlotRow({ slots, onSlotTap, disabled = false, onSlotMeasured }: DeckSlotRowProps) {
  const colors = useThemeColor();
  const slotRefs = React.useRef<Array<React.RefObject<any>>>(
    Array.from({ length: 5 }, () => React.createRef<any>()),
  );

  // Notify parent of slot refs so P04 can measure() in a worklet.
  React.useEffect(() => {
    if (!onSlotMeasured) return;
    for (let i = 0; i < slotRefs.current.length; i++) {
      onSlotMeasured(i, slotRefs.current[i]);
    }
  }, [onSlotMeasured]);

  // Pad to exactly 5 visual slots (matches existing [0,1,2,3,4].map(...) shape).
  const padded: DeckSlot[] = React.useMemo(() => {
    const out: DeckSlot[] = [];
    for (let i = 0; i < 5; i++) out.push(slots[i] ?? { cardId: null });
    return out;
  }, [slots]);

  return (
    <View style={styles.deckGrid}>
      {padded.map((slot, i) => {
        const stableKey = slot.cardId ?? `empty-${i}`;
        const testID = `deck-slot-${slot.cardId ?? `empty-${i}`}`;

        if (slot.card) {
          const card = slot.card;
          const rarityKey = RARITY_COLOR_MAP[card.collectionCard.rarity] ?? 'rarityCommon';
          const rarityColor = colors[rarityKey];
          const iconName = toMaterialIconName(card.collectionCard.brandIcon);
          return (
            <Animated.View
              key={stableKey}
              ref={slotRefs.current[i]}
              layout={SLOT_LAYOUT}
              testID={testID}
              style={[styles.deckSlot, styles.deckSlotFilled, { borderColor: rarityColor }]}
            >
              <TouchableOpacity
                activeOpacity={0.8}
                disabled={disabled}
                onPress={() => onSlotTap(card, i)}
                style={styles.fill}
              >
                <View style={[styles.deckSlotGlow, { backgroundColor: rarityColor }]} />
                <View style={styles.removeHint}>
                  <MaterialIcons name="close" size={10} color={colors.onSurfaceVariant} />
                </View>
                <View style={styles.deckSlotBody}>
                  <MaterialIcons name={iconName as any} size={28} color={rarityColor} />
                  <Text style={[styles.deckSlotName, { color: colors.onSurface }]} numberOfLines={1}>
                    {card.collectionCard.name}
                  </Text>
                  <Text style={[styles.deckSlotRarity, { color: rarityColor }]}>
                    {getRarityName(card.collectionCard.rarity)}
                  </Text>
                </View>
                <View style={[styles.healthBarContainer, { backgroundColor: colors.surfaceContainerHigh }]}>
                  <View
                    style={[
                      styles.healthBarFill,
                      {
                        width: (`${card.health}%`) as any,
                        backgroundColor:
                          card.health > 50 ? '#22c55e' : card.health > 25 ? '#eab308' : colors.error,
                      },
                    ]}
                  />
                </View>
              </TouchableOpacity>
            </Animated.View>
          );
        }

        return (
          <Animated.View
            key={stableKey}
            ref={slotRefs.current[i]}
            layout={SLOT_LAYOUT}
            testID={testID}
            style={[
              styles.deckSlot,
              styles.deckSlotEmpty,
              { backgroundColor: colors.surfaceContainerHigh, borderColor: colors.outlineVariant },
            ]}
          >
            <TouchableOpacity
              activeOpacity={0.7}
              disabled={disabled}
              onPress={() => onSlotTap(null, i)}
              style={[styles.fill, styles.emptySlotInner]}
            >
              <MaterialIcons name="add" size={28} color={colors.outlineVariant} />
              <Text style={[styles.emptySlotText, { color: colors.outlineVariant }]}>Экипировать</Text>
            </TouchableOpacity>
          </Animated.View>
        );
      })}
    </View>
  );
}

// Styles copied verbatim from cards.tsx getStyles() (deckGrid / deckSlot* / removeHint /
// healthBar* / emptySlotText). Keep in sync if the parent screen ever changes them —
// P00 deliberately duplicates them here so this component has no styling dependency
// on the parent's `styles` object.
const styles = StyleSheet.create({
  deckGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, justifyContent: 'center' },
  deckSlot: {
    width: '30%',
    aspectRatio: 0.7,
    borderRadius: BorderRadius.base,
    padding: Spacing.sm,
    flexDirection: 'column',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deckSlotFilled: { backgroundColor: 'transparent', borderWidth: 2, overflow: 'hidden' },
  deckSlotEmpty: { borderWidth: 2, borderStyle: 'dashed' },
  deckSlotGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 4, opacity: 0.6 },
  removeHint: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 999,
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  deckSlotBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  deckSlotName: { fontSize: 10, fontFamily: 'Manrope-Bold', textAlign: 'center' },
  deckSlotRarity: {
    fontSize: 9,
    fontFamily: 'Manrope-ExtraBold',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  healthBarContainer: { width: '90%', height: 4, borderRadius: 2, overflow: 'hidden', marginBottom: 2 },
  healthBarFill: { height: '100%', borderRadius: 2 },
  emptySlotText: { fontSize: 10, fontFamily: 'Manrope-Medium', textAlign: 'center' },
  fill: {
    width: '100%',
    height: '100%',
    flexDirection: 'column',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  emptySlotInner: { justifyContent: 'center', gap: 6 },
});

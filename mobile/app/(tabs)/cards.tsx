import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Modal
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
import Animated, { FadeIn } from 'react-native-reanimated';
import { useThemeColor } from '../../hooks/useThemeColor';

export default function CardsScreen() {
  const { user, cards, decks, quests, loadCards, loadDecks, loadQuests, loadUser, unreadCount } = useStore();
  const [filter, setFilter] = useState<string | null>(null);

  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [pickerModalVisible, setPickerModalVisible] = useState(false);
  
  const [selectedCard, setSelectedCard] = useState<any>(null);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);

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

  useEffect(() => {
    loadCards();
    loadDecks();
    loadQuests();
  }, []);

  const activeDeck = decks.find((d: any) => d.isActive);
  const filteredCards = filter ? cards.filter((c: any) => c.collectionCard.rarity === filter) : cards;

  const handleSlotTap = (slotCard: any, index: number) => {
    if (slotCard) {
      Alert.alert(
        'Убрать из активной колоды?',
        `Убрать ${slotCard.collectionCard.name}?`,
        [
          { text: 'Отмена', style: 'cancel' },
          {
            text: 'Убрать', style: 'destructive', onPress: () => {
              Alert.alert('Успех', 'Карта убрана (Mock). Обновите бэкенд в Phase 2.');
            }
          }
        ]
      );
    } else {
      setSelectedSlotIndex(index);
      setPickerModalVisible(true);
    }
  };

  const handleEquipCard = (card: any) => {
    setPickerModalVisible(false);
    Alert.alert('Экипировано', `Карта ${card.collectionCard.name} назначена в слот ${selectedSlotIndex! + 1} (Mock)`);
  };

  const handleOpenDetail = (card: any) => {
    setSelectedCard(card);
    setDetailModalVisible(true);
  };

  const handleMockAction = (actionName: string) => {
    setDetailModalVisible(false);
    Alert.alert('В разработке', `Функция "${actionName}" будет доступна позже`);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.brandLabel}>КОЛЛЕКЦИЯ КАРТОЧЕК</Text>
            <Text style={styles.pageTitle}>Моя колода</Text>
          </View>
          <View style={styles.headerRight}>
             <TouchableOpacity style={styles.mbBadge} onPress={() => {}}>
               <Text style={styles.mbBadgeText}>MB {(user?.mbPoints || 0).toLocaleString('ru-RU')}</Text>
             </TouchableOpacity>
            <TouchableOpacity style={styles.bellBtn} onPress={() => router.push('/notifications')}>
              <MaterialIcons name="notifications-none" size={24} color={colors.onSurfaceVariant} />
              {unreadCount > 0 && <View style={styles.bellDot} />}
            </TouchableOpacity>
          </View>
        </View>

        {/* Active Deck */}
        {activeDeck ? (
          <Animated.View entering={FadeIn} style={styles.deckSection}>
            <View style={styles.deckHeader}>
              <Text style={styles.deckName}>{activeDeck.name}</Text>
              <View style={styles.cashbackBadge}>
                <MaterialIcons name="percent" size={14} color={colors.primary} />
                <Text style={styles.cashbackText}>{activeDeck.totalCashback?.toFixed(1) || 0}% Общий Cashback</Text>
              </View>
            </View>
            <View style={styles.deckGrid}>
              {[0, 1, 2, 3, 4].map((slot) => {
                const deckCard = activeDeck.deckCards?.[slot];
                if (deckCard) {
                  const card = deckCard.userCard;
                  const rarityColor = getRarityCol(card.collectionCard.rarity);
                  const iconName = toMaterialIconName(card.collectionCard.brandIcon);
                  return (
                    <TouchableOpacity
                      key={slot}
                      activeOpacity={0.8}
                      onPress={() => handleSlotTap(card, slot)}
                      style={[styles.deckSlot, styles.deckSlotFilled, { borderColor: rarityColor }]}
                    >
                      <View style={[styles.deckSlotGlow, { backgroundColor: rarityColor }]} />

                      {/* Top content — grows to fill available space */}
                      <View style={styles.deckSlotBody}>
                        <MaterialIcons name={iconName as any} size={28} color={rarityColor} />
                        <Text style={styles.deckSlotName} numberOfLines={1}>{card.collectionCard.name}</Text>
                        <Text style={[styles.deckSlotRarity, { color: rarityColor }]}>
                          {getRarityName(card.collectionCard.rarity)}
                        </Text>
                      </View>

                      {/* HP bar — always pinned to bottom */}
                      <View style={styles.healthBarContainer}>
                        <View style={[
                          styles.healthBarFill,
                          {
                            width: `${card.health}%`,
                            backgroundColor: card.health > 50 ? '#22c55e' : card.health > 25 ? '#eab308' : colors.error,
                          },
                        ]} />
                      </View>
                    </TouchableOpacity>
                  );
                }
                return (
                  <TouchableOpacity 
                     key={slot} 
                     activeOpacity={0.7}
                     onPress={() => handleSlotTap(null, slot)}
                     style={[styles.deckSlot, styles.deckSlotEmpty]}
                  >
                    <MaterialIcons name="add" size={28} color={colors.outlineVariant} />
                    <Text style={styles.emptySlotText}>Экипировать</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Animated.View>
        ) : (
          <View style={styles.deckSection}>
             <Text style={[styles.emptyStateText, { marginVertical: Spacing.xl }]}>У вас нет активной колоды.</Text>
          </View>
        )}

        {/* Daily Quests */}
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
                  <TouchableOpacity style={styles.claimButton} onPress={async () => {
                    await apiClient.claimQuest(q.id);
                    loadQuests();
                    loadUser();
                  }}>
                    <Text style={styles.claimButtonText}>Забрать</Text>
                  </TouchableOpacity>
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

        {/* Advanced Actions Row */}
        <View style={{ flexDirection: 'row', paddingHorizontal: Spacing.xl, marginBottom: Spacing.lg, gap: 12 }}>
           <TouchableOpacity 
              onPress={() => router.push('/collection')}
              style={{ flex: 1, backgroundColor: colors.surfaceVariant, padding: Spacing.md, borderRadius: BorderRadius.lg, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}>
              <MaterialIcons name="auto-awesome-mosaic" size={20} color={colors.primary} />
              <Text style={{ color: colors.primary, fontFamily: 'Manrope-Bold', marginLeft: 8 }}>Коллекция</Text>
           </TouchableOpacity>
           
           <TouchableOpacity 
              onPress={() => router.push('/trade')}
              style={{ flex: 1, backgroundColor: colors.surfaceVariant, padding: Spacing.md, borderRadius: BorderRadius.lg, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}>
              <MaterialIcons name="swap-horiz" size={22} color={colors.primary} />
              <Text style={{ color: colors.primary, fontFamily: 'Manrope-Bold', marginLeft: 8 }}>Трейды</Text>
           </TouchableOpacity>
        </View>

        {/* Filter tabs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Инвентарь</Text>
          <View style={styles.filterRow}>
            {[
              { key: null, label: 'Все' },
              { key: 'COMMON', label: 'Обычные' },
              { key: 'RARE', label: 'Редкие' },
              { key: 'EPIC', label: 'Эпические' },
              { key: 'LEGENDARY', label: 'Легендарные' },
            ].map((f) => (
              <TouchableOpacity
                key={f.label}
                style={[styles.filterTab, filter === f.key && styles.filterTabActive]}
                onPress={() => setFilter(f.key)}
              >
                <Text style={[styles.filterTabText, filter === f.key && styles.filterTabTextActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Card Grid */}
        <View style={styles.cardGrid}>
          {filteredCards.map((card: any) => {
            const c = card.collectionCard;
            const rarityColor = getRarityCol(c.rarity);
            const iconName = toMaterialIconName(c.brandIcon);
            return (
              <TouchableOpacity 
                 key={card.id} 
                 activeOpacity={0.8}
                 onPress={() => handleOpenDetail(card)}
                 style={[styles.cardItem, { borderColor: rarityColor }]}
              >
                <View style={[styles.cardItemGlow, { backgroundColor: rarityColor }]} />
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
               <Text style={styles.emptySubtext}>Совершайте покупки, чтобы получить новые карточки!</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Picker Modal */}
      <Modal visible={pickerModalVisible} transparent animationType="slide">
         <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
               <View style={styles.modalHeader}>
                 <Text style={styles.modalTitle}>Выберите карту для Экипировки</Text>
                 <TouchableOpacity onPress={() => setPickerModalVisible(false)}>
                   <MaterialIcons name="close" size={24} color={colors.onSurfaceVariant} />
                 </TouchableOpacity>
               </View>
               <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
                  {cards.length === 0 ? (
                      <Text style={styles.emptyStateText}>Нет доступных карточек</Text>
                  ) : cards.map((card: any) => {
                     const c = card.collectionCard;
                     const rarityColor = getRarityCol(c.rarity);
                     const iconName = toMaterialIconName(c.brandIcon);
                     return (
                        <TouchableOpacity 
                           key={card.id} 
                           style={[styles.pickerItem, { borderColor: rarityColor }]}
                           onPress={() => handleEquipCard(card)}
                        >
                           <MaterialIcons name={iconName as any} size={32} color={rarityColor} />
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
                           <Text style={styles.detailStatText}> {selectedCard.collectionCard.cashbackPercent}% Cashback</Text>
                        </View>
                        <View style={styles.detailStat}>
                           <MaterialIcons name="favorite" size={18} color={selectedCard.health > 50 ? '#22c55e' : colors.error} />
                           <Text style={styles.detailStatText}> {selectedCard.health}% Здоровье</Text>
                        </View>
                    </View>

                    <View style={styles.actionButtonsCol}>
                        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.primary }]} onPress={() => handleMockAction('Жертвоприношение (Sacrifice)')}>
                           <MaterialIcons name="auto-awesome" size={20} color={colors.onPrimary} />
                           <Text style={[styles.actionBtnText, { color: colors.onPrimary }]}>Пожертвовать для HP</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.surfaceContainerHigh }]} onPress={() => handleMockAction('Торговля (Trade)')}>
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
  bellDot: {
    position: 'absolute', top: 8, right: 8, width: 8, height: 8,
    borderRadius: 4, backgroundColor: Colors.error,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: Spacing.xl, paddingTop: Spacing.xl, paddingBottom: Spacing.base,
  },
  brandLabel: {
    fontSize: Fonts.sizes.xs, fontFamily: 'Manrope-ExtraBold', color: Colors.primary,
    letterSpacing: 2, marginBottom: 4,
  },
  pageTitle: {
    fontSize: Fonts.sizes['3xl'], fontFamily: 'Manrope-ExtraBold',
    color: Colors.onSurface, letterSpacing: -0.5,
  },
  mbBadge: {
    backgroundColor: Colors.secondaryContainer, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  mbBadgeText: {
    fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-ExtraBold', color: '#131313',
  },
  deckSection: {
    marginHorizontal: Spacing.base, marginTop: Spacing.base,
    backgroundColor: Colors.surfaceContainerLowest, borderRadius: BorderRadius.lg,
    padding: Spacing.xl, ...Shadows.md, borderWidth: 1, borderColor: Colors.transparentBorder
  },
  deckHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: Spacing.base,
  },
  deckName: { fontSize: Fonts.sizes.xl, fontFamily: 'Manrope-Bold', color: Colors.onSurface },
  cashbackBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(79,142,247,0.1)', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  cashbackText: { fontFamily: 'Manrope-ExtraBold', color: Colors.primary, fontSize: Fonts.sizes.xs },
  deckGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, justifyContent: 'center' },

  // Slot — flex column, space-between так что HP-бар всегда внизу
  deckSlot: {
    width: '30%',
    aspectRatio: 0.7,
    borderRadius: BorderRadius.base,
    padding: Spacing.sm,
    flexDirection: 'column',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deckSlotFilled: {
    backgroundColor: Colors.surfaceContainerLow, borderWidth: 2, overflow: 'hidden',
  },
  deckSlotGlow: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 4, opacity: 0.6,
  },
  // Верхний блок контента — занимает всё свободное место
  deckSlotBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  deckSlotEmpty: {
    backgroundColor: Colors.surfaceContainerHigh, borderWidth: 2,
    borderColor: Colors.outlineVariant, borderStyle: 'dashed',
  },
  deckSlotName: {
    fontSize: 10, fontFamily: 'Manrope-Bold', color: Colors.onSurface, textAlign: 'center',
  },
  deckSlotRarity: { fontSize: 9, fontFamily: 'Manrope-ExtraBold', textTransform: 'uppercase', letterSpacing: 1 },

  // HP-бар — всегда прибит к низу слота
  healthBarContainer: {
    width: '90%',
    height: 4,
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 2,
  },
  healthBarFill: { height: '100%', borderRadius: 2 },

  section: { paddingHorizontal: Spacing.base, marginTop: Spacing.xl },
  sectionTitle: {
    fontSize: Fonts.sizes.xl, fontFamily: 'Manrope-Bold', color: Colors.onSurface,
    marginBottom: Spacing.base, letterSpacing: -0.3
  },
  questScroll: { marginHorizontal: -Spacing.base, paddingHorizontal: Spacing.base },
  questCard: {
    width: 220, backgroundColor: Colors.surfaceContainerLowest, borderRadius: BorderRadius.base,
    padding: Spacing.lg, marginRight: Spacing.base, gap: Spacing.sm,
    borderWidth: 1, borderColor: Colors.transparentBorder, ...Shadows.sm,
  },
  questIconRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  questIcon: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.surfaceContainerLow,
    alignItems: 'center', justifyContent: 'center',
  },
  questReward: {
    fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-ExtraBold', color: Colors.secondaryContainer,
  },
  questTitle: { fontSize: Fonts.sizes.md, fontFamily: 'Manrope-Bold', color: Colors.onSurface },
  questDesc: { fontSize: Fonts.sizes.sm, color: Colors.onSurfaceVariant, fontFamily: 'Manrope-Medium' },
  claimButton: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.full,
    paddingVertical: 8, alignItems: 'center', ...Shadows.primary, marginTop: 4
  },
  claimButtonText: { color: Colors.onPrimary, fontFamily: 'Manrope-Bold', fontSize: Fonts.sizes.sm },
  completedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: 'center', marginTop: 4
  },
  completedText: { fontSize: Fonts.sizes.sm, color: '#22c55e', fontFamily: 'Manrope-Bold' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  progressBar: {
    flex: 1, height: 6, backgroundColor: Colors.surfaceContainerHigh, borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 3 },
  progressText: { fontSize: Fonts.sizes.xs, color: Colors.onSurfaceVariant, fontFamily: 'Manrope-Bold' },

  filterRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm,
  },
  filterTab: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceContainerLow,
  },
  filterTabActive: { backgroundColor: Colors.primary },
  filterTabText: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold', color: Colors.onSurfaceVariant },
  filterTabTextActive: { color: Colors.onPrimary },

  cardGrid: {
    flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.base,
    gap: Spacing.base, marginTop: Spacing.base,
  },
  cardItem: {
    width: '47%', backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: BorderRadius.base, padding: Spacing.base, gap: 6,
    borderWidth: 2, overflow: 'hidden', ...Shadows.sm,
  },
  cardItemGlow: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 4, opacity: 0.7,
  },
  rarityBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  rarityBadgeText: {
    fontSize: 9, fontFamily: 'Manrope-ExtraBold', color: Colors.onPrimary,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  cardItemIcon: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.surfaceContainerLow,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginVertical: 8,
  },
  cardItemName: { fontSize: Fonts.sizes.md, fontFamily: 'Manrope-Bold', textAlign: 'center', color: Colors.onSurface },
  cardItemBrand: {
    fontSize: Fonts.sizes.sm, color: Colors.onSurfaceVariant, textAlign: 'center', fontFamily: 'Manrope-Medium'
  },
  cardItemStats: {
    flexDirection: 'row', justifyContent: 'space-around', marginTop: 8, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: Colors.transparentBorder
  },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold', color: Colors.onSurfaceVariant },

  emptyContainer: {
    width: '100%', alignItems: 'center', paddingVertical: Spacing['3xl'], gap: Spacing.sm,
  },
  emptyStateText: { fontSize: Fonts.sizes.base, fontFamily: 'Manrope-Bold', color: Colors.onSurfaceVariant, textAlign: 'center' },
  emptySubtext: { fontSize: Fonts.sizes.sm, color: Colors.outlineVariant, textAlign: 'center', fontFamily: 'Manrope-Medium' },
  emptySlotText: { fontSize: 10, color: Colors.outlineVariant, fontFamily: 'Manrope-Medium', textAlign: 'center' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: {
     backgroundColor: Colors.surface, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl,
     padding: Spacing.xl, ...Shadows.lg, paddingBottom: 60
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xl },
  modalTitle: { fontSize: Fonts.sizes.lg, fontFamily: 'Manrope-ExtraBold', color: Colors.onSurface },
  pickerItem: {
     flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md,
     backgroundColor: Colors.surfaceContainerLowest, borderRadius: BorderRadius.base,
     marginBottom: Spacing.sm, borderWidth: 1
  },
  pickerItemName: { fontSize: Fonts.sizes.base, fontFamily: 'Manrope-Bold', color: Colors.onSurface },
  pickerItemDetails: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Medium', color: Colors.onSurfaceVariant, marginTop: 4 },
  pickerRarity: { fontSize: 10, fontFamily: 'Manrope-ExtraBold', textTransform: 'uppercase' },

  modalCenterOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: Spacing.xl },
  detailCardContent: {
      backgroundColor: Colors.surfaceContainerLowest, borderRadius: BorderRadius.xl, padding: Spacing.xl,
      alignItems: 'center', borderWidth: 2, ...Shadows.lg
  },
  closeAbsolute: { position: 'absolute', right: 0, top: 0, padding: Spacing.sm },
  detailHeader: { width: '100%', alignItems: 'center', marginBottom: Spacing.lg },
  detailIconWrap: {
      width: 100, height: 100, borderRadius: 50, backgroundColor: Colors.surfaceContainerLow,
      alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.lg
  },
  detailTitle: { fontSize: 22, fontFamily: 'Manrope-ExtraBold', color: Colors.onSurface, textAlign: 'center' },
  detailDesc: { fontSize: Fonts.sizes.md, fontFamily: 'Manrope-Medium', color: Colors.onSurfaceVariant, marginTop: 8 },
  detailStatsBlock: { flexDirection: 'row', gap: Spacing.xl, marginVertical: Spacing.xl },
  detailStat: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceContainerHigh, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  detailStatText: { fontFamily: 'Manrope-Bold', color: Colors.onSurface, fontSize: Fonts.sizes.sm },

  actionButtonsCol: { width: '100%', gap: Spacing.sm },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: BorderRadius.base, gap: 8 },
  actionBtnText: { fontFamily: 'Manrope-ExtraBold', fontSize: Fonts.sizes.sm },
});

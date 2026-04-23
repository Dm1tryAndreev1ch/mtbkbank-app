import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert, Modal, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useStore } from '../../stores/useStore';
import * as api from '../../services/api';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, FadeIn } from 'react-native-reanimated';
import { Fonts, Spacing, BorderRadius, Shadows, formatMoney, toMaterialIconName } from '../../constants/theme';
import { useThemeColor } from '../../hooks/useThemeColor';
import CardDropReveal from '../../components/CardDropReveal';

const CONTACTS = [
  { name: 'Анна М.', initials: 'АМ', color: '#9333EA' },
  { name: 'Максим Л.', initials: 'МЛ', color: '#4F8EF7' },
  { name: 'Елена К.', initials: 'ЕК', color: '#ec4899' },
  { name: 'Юрий В.', initials: 'ЮВ', color: '#0ea5e9' },
];

const SkeletonPulse = ({ style, colors }: { style: any, colors: any }) => {
  const opacity = useSharedValue(0.3);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.7, { duration: 800 }), -1, true);
  }, []);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[style, animatedStyle, { backgroundColor: colors.transparentBorder }]} />;
};

export default function PaymentsScreen() {
  const { user, accounts, unreadCount, loadAccounts } = useStore();
  const [search, setSearch] = useState('');
  const [categories, setCategories] = useState<any[]>([]);
  const [scheduled, setScheduled] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [payAmount, setPayAmount] = useState('');
  const [merchantName, setMerchantName] = useState('');
  const [isPaying, setIsPaying] = useState(false);

  const [droppedCard, setDroppedCard] = useState<any>(null);

  const colors = useThemeColor();
  const styles = useMemo(() => getStyles(colors), [colors]);

  useEffect(() => {
    loadAccounts();
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [catRes, schedRes] = await Promise.all([
        api.getPaymentCategories().catch(() => ({ data: [] })),
        api.getScheduledPayments().catch(() => ({ data: [] }))
      ]);

      setCategories(catRes.data.length ? catRes.data : [
        { id: 1, icon: 'home', name: 'ЖКУ и дом', description: 'Электричество, вода, газ', color: '#b7c8e1' },
        { id: 2, icon: 'wifi', name: 'Связь и интернет', description: 'Оплата провайдера', color: '#508ff8' },
        { id: 3, icon: 'directions-car', name: 'Транспорт', description: 'Штрафы, парковка', color: '#c3c5dc' },
      ]);
      setScheduled(schedRes.data.length ? schedRes.data : [
        { id: 1, name: 'Свет (Энергосбыт)', amount: 1540, nextDate: '202X-05-10T00:00:00.000Z' }
      ]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const openPaymentModal = (category: any) => {
    setSelectedCategory(category);
    setMerchantName(category.name);
    setPayAmount('');
    setModalVisible(true);
  };

  const handleMakePayment = async () => {
    if (!payAmount || isNaN(Number(payAmount)) || Number(payAmount) <= 0) {
      Alert.alert('Ошибка', 'Введите корректную сумму');
      return;
    }
    const mainAccount = accounts.find((a: any) => a.type === 'main') || accounts[0];
    if (!mainAccount) {
      Alert.alert('Ошибка', 'Нет доступного счета');
      return;
    }

    setIsPaying(true);
    try {
      const res = await api.makePayment({
        accountId: mainAccount.id,
        amount: Number(payAmount),
        categoryId: selectedCategory?.id,
        merchant: merchantName
      });

      setModalVisible(false);

      if (res.data?.cardDrop) {
        setDroppedCard(res.data.cardDrop);
      } else {
        Alert.alert('Успешно', 'Платеж успешно проведен');
      }
      loadAccounts();
    } catch (e) {
      setTimeout(() => {
        setModalVisible(false);
        const rand = Math.random();
        if (rand > 0.3) {
          setDroppedCard({
            collectionCard: {
              name: 'Черная Метка',
              brandName: 'Visa Infinite',
              rarity: 'LEGENDARY',
              brandIcon: 'diamond',
              cashbackPercent: 10
            },
            health: 100
          });
        } else {
          Alert.alert('Успешно', 'Оплата прошла без дропа карты (Mock).');
        }
      }, 1000);
    } finally {
      setIsPaying(false);
    }
  };

  const renderSkeletonList = () => (
    <>
      <SkeletonPulse style={styles.categorySkeleton} colors={colors} />
      <SkeletonPulse style={styles.categorySkeleton} colors={colors} />
      <SkeletonPulse style={styles.categorySkeleton} colors={colors} />
    </>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.mbBadge} onPress={() => router.push('/(tabs)/cards')}>
            <MaterialIcons name="monetization-on" size={18} color={'#fdcf49'} />
            <Text style={styles.mbBadgeLabel}>Баллы</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/notifications')}>
            <View style={styles.notifIcon}>
              <MaterialIcons name="notifications-none" size={24} color={colors.onSurfaceVariant} />
              {unreadCount > 0 && <View style={styles.notifDot} />}
            </View>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.searchSection}>
          <View style={styles.searchBar}>
            <MaterialIcons name="search" size={22} color={colors.onSurfaceVariant} />
            <TextInput
              style={styles.searchInput}
              placeholder="Найдите сервисы"
              placeholderTextColor={colors.outlineVariant}
              value={search}
              onChangeText={setSearch}
            />
          </View>
        </View>

        {/* Quick Transfers */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Быстрые переводы</Text>
            <TouchableOpacity onPress={() => Alert.alert('Все контакты', 'В разработке')}>
              <Text style={styles.viewAll}>Все</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.contactsScroll}>
            <TouchableOpacity style={styles.contactItem}>
              <View style={styles.addNewAvatar}>
                <MaterialIcons name="add" size={24} color={colors.primary} />
              </View>
              <Text style={styles.contactName}>Добавить</Text>
            </TouchableOpacity>

            {CONTACTS.map((contact, i) => (
              <TouchableOpacity key={i} style={styles.contactItem}>
                <View style={[styles.contactAvatar, { backgroundColor: contact.color }]}>
                  <Text style={styles.contactInitials}>{contact.initials}</Text>
                </View>
                <Text style={styles.contactName} numberOfLines={1}>{contact.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Payment Categories */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Категории платежей</Text>
          <View style={styles.categoriesList}>
            {loading ? renderSkeletonList() : categories.map((cat, i) => (
              <TouchableOpacity key={cat.id || i} style={styles.categoryRow} activeOpacity={0.7} onPress={() => openPaymentModal(cat)}>
                <View style={styles.categoryLeft}>
                  <View style={[styles.categoryIcon, { backgroundColor: cat.color ? `${cat.color}20` : 'rgba(79,142,247,0.1)' }]}>
                    <MaterialIcons name={toMaterialIconName(cat.icon) as any} size={24} color={cat.color || colors.primary} />
                  </View>
                  <View style={styles.categoryText}>
                    <Text style={styles.categoryLabel}>{cat.name}</Text>
                    <Text style={styles.categoryDesc}>{cat.description}</Text>
                  </View>
                </View>
                <MaterialIcons name="chevron-right" size={24} color={colors.outlineVariant} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Scheduled Payments */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Плановые платежи</Text>
          <View style={styles.scheduledList}>
            {loading ? renderSkeletonList() : scheduled.length > 0 ? scheduled.map((s, i) => (
              <View key={i} style={styles.scheduledRow}>
                <MaterialIcons name="event" size={24} color={colors.onSurfaceVariant} />
                <View style={styles.scheduledDetail}>
                  <Text style={styles.scheduledName}>{s.name}</Text>
                  <Text style={styles.scheduledDate}>Списание: {new Date(s.nextDate).toLocaleDateString('ru-RU')}</Text>
                </View>
                <Text style={styles.scheduledAmount}>{formatMoney(s.amount)}</Text>
              </View>
            )) : (
              <Text style={styles.emptyText}>Нет плановых платежей</Text>
            )}
          </View>
        </View>

      </ScrollView>

      {/* Payment Modal Overlay */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>
              {selectedCategory?.name ?? 'Оплата'}
            </Text>

            <Text style={styles.modalFieldLabel}>Получатель / магазин</Text>
            <TextInput
              style={styles.modalInput}
              value={merchantName}
              onChangeText={setMerchantName}
              placeholder="Название"
              placeholderTextColor={colors.outlineVariant}
            />

            <Text style={styles.modalFieldLabel}>Сумма списания (Br)</Text>
            <TextInput
              style={styles.modalInput}
              value={payAmount}
              onChangeText={setPayAmount}
              placeholder="0.00"
              placeholderTextColor={colors.outlineVariant}
              keyboardType="decimal-pad"
            />

            <TouchableOpacity
              style={[styles.payBtn, isPaying && { opacity: 0.6 }]}
              onPress={handleMakePayment}
              disabled={isPaying}
              activeOpacity={0.8}
            >
              {isPaying
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.payBtnLabel}>Оплатить</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
              <Text style={styles.cancelLabel}>Отмена</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {droppedCard && (
        <CardDropReveal
          card={droppedCard}
          onDismiss={() => setDroppedCard(null)}
        />
      )}
    </SafeAreaView>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingBottom: 100 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
  },
  mbBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.surfaceContainer, borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: 6,
  },
  mbBadgeLabel: { fontSize: Fonts.sizes.sm, color: colors.onSurface, fontFamily: Fonts.family, fontWeight: Fonts.weights.semibold },
  notifIcon: { position: 'relative', padding: 4 },
  notifDot: {
    position: 'absolute', top: 4, right: 4,
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444',
  },
  searchSection: { paddingHorizontal: Spacing.base, marginBottom: Spacing.md },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: colors.surfaceContainer, borderRadius: BorderRadius.base,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
  },
  searchInput: { flex: 1, fontSize: Fonts.sizes.base, color: colors.onSurface, fontFamily: Fonts.family },
  section: { marginBottom: Spacing.lg, paddingHorizontal: Spacing.base },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  sectionTitle: { fontSize: Fonts.sizes.base, fontWeight: Fonts.weights.semibold, color: colors.onSurface, fontFamily: Fonts.family, marginBottom: Spacing.sm },
  viewAll: { fontSize: Fonts.sizes.sm, color: colors.primary, fontFamily: Fonts.family },
  contactsScroll: { gap: Spacing.md, paddingRight: Spacing.base },
  contactItem: { alignItems: 'center', gap: 6, width: 64 },
  addNewAvatar: {
    width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderStyle: 'dashed',
    borderColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  contactAvatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  contactInitials: { fontSize: Fonts.sizes.md, fontWeight: Fonts.weights.bold, color: '#fff', fontFamily: Fonts.family },
  contactName: { fontSize: Fonts.sizes.xs, color: colors.onSurfaceVariant, fontFamily: Fonts.family, textAlign: 'center' },
  categoriesList: { gap: Spacing.sm },
  categoryRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface, borderRadius: BorderRadius.base,
    padding: Spacing.md, ...Shadows.sm,
  },
  categoryLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  categoryIcon: { width: 48, height: 48, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
  categoryText: { gap: 2 },
  categoryLabel: { fontSize: Fonts.sizes.md, fontWeight: Fonts.weights.semibold, color: colors.onSurface, fontFamily: Fonts.family },
  categoryDesc: { fontSize: Fonts.sizes.xs, color: colors.onSurfaceVariant, fontFamily: Fonts.family },
  categorySkeleton: { height: 72, borderRadius: BorderRadius.base, marginBottom: Spacing.sm },
  scheduledList: { gap: Spacing.sm },
  scheduledRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: colors.surface, borderRadius: BorderRadius.base,
    padding: Spacing.md, ...Shadows.sm,
  },
  scheduledDetail: { flex: 1 },
  scheduledName: { fontSize: Fonts.sizes.md, fontWeight: Fonts.weights.medium, color: colors.onSurface, fontFamily: Fonts.family },
  scheduledDate: { fontSize: Fonts.sizes.xs, color: colors.onSurfaceVariant, fontFamily: Fonts.family },
  scheduledAmount: { fontSize: Fonts.sizes.md, fontWeight: Fonts.weights.bold, color: colors.onSurface, fontFamily: Fonts.family },
  emptyText: { fontSize: Fonts.sizes.sm, color: colors.onSurfaceVariant, textAlign: 'center', paddingVertical: Spacing.lg, fontFamily: Fonts.family },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: Spacing.xl, paddingBottom: 40,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: colors.outlineVariant,
    alignSelf: 'center', marginBottom: Spacing.lg,
  },
  modalTitle: { fontSize: Fonts.sizes.lg, fontWeight: Fonts.weights.bold, color: colors.onSurface, fontFamily: Fonts.family, marginBottom: Spacing.lg },
  modalFieldLabel: { fontSize: Fonts.sizes.sm, color: colors.onSurfaceVariant, fontFamily: Fonts.family, marginBottom: 6 },
  modalInput: {
    backgroundColor: colors.surfaceContainer, borderRadius: BorderRadius.sm,
    padding: Spacing.md, fontSize: Fonts.sizes.base, color: colors.onSurface,
    fontFamily: Fonts.family, marginBottom: Spacing.md,
  },
  payBtn: {
    backgroundColor: colors.primary, borderRadius: BorderRadius.sm,
    padding: Spacing.md, alignItems: 'center', marginTop: Spacing.sm,
  },
  payBtnLabel: { fontSize: Fonts.sizes.base, fontWeight: Fonts.weights.bold, color: '#fff', fontFamily: Fonts.family },
  cancelBtn: { padding: Spacing.md, alignItems: 'center', marginTop: Spacing.xs },
  cancelLabel: { fontSize: Fonts.sizes.base, color: colors.onSurfaceVariant, fontFamily: Fonts.family },
});

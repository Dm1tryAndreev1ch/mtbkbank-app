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
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Новый платеж</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} disabled={isPaying}>
                <MaterialIcons name="close" size={24} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalFieldLabel}>Сервис / Получатель</Text>
            <TextInput
              style={styles.modalInput}
              value={merchantName}
              onChangeText={setMerchantName}
              placeholder="Название сервиса"
              placeholderTextColor={colors.outlineVariant}
            />

            <Text style={styles.modalFieldLabel}>Сумма списания (₽)</Text>
            <TextInput
              style={[styles.modalInput, { fontSize: Fonts.sizes.xl, fontFamily: 'Manrope-Bold' }]}
              value={payAmount}
              onChangeText={setPayAmount}
              keyboardType="numeric"
              placeholder="0.00"
              placeholderTextColor={colors.outlineVariant}
            />

            <TouchableOpacity
              style={[styles.modalSubmitBtn, isPaying && { opacity: 0.7 }]}
              activeOpacity={0.8}
              onPress={handleMakePayment}
              disabled={isPaying}
            >
              {isPaying ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalSubmitText}>Оплатить</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 3D Global Gamification Drop Flow */}
      {droppedCard && (
        <CardDropReveal
          card={droppedCard}
          onDismiss={() => setDroppedCard(null)}
          onEquip={() => {
            setDroppedCard(null);
            router.push('/(tabs)/cards');
          }}
        />
      )}

    </SafeAreaView>
  );
}

const getStyles = (Colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { paddingBottom: 120 },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.xl, paddingTop: Spacing.base, paddingBottom: Spacing.sm,
  },
  mbBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceContainerHighest,
  },
  mbBadgeLabel: {
    fontSize: Fonts.sizes.xs, fontFamily: 'Manrope-Bold', color: Colors.onSurface,
    letterSpacing: 2, textTransform: 'uppercase',
  },
  notifIcon: { position: 'relative', padding: 8 },
  notifDot: {
    position: 'absolute', top: 10, right: 10, width: 8, height: 8,
    borderRadius: 4, backgroundColor: Colors.error,
  },

  searchSection: { paddingHorizontal: Spacing.xl, marginBottom: Spacing.xl },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surfaceContainerLow, borderRadius: BorderRadius.base,
    paddingHorizontal: Spacing.base, paddingVertical: 4,
    borderWidth: 1, borderColor: Colors.transparentBorder
  },
  searchInput: {
    flex: 1, fontSize: Fonts.sizes.base, color: Colors.onSurface,
    paddingVertical: Spacing.md, fontFamily: 'Manrope-Medium'
  },

  section: { paddingHorizontal: Spacing.xl, marginBottom: Spacing['2xl'] },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    marginBottom: Spacing.base,
  },
  sectionTitle: {
    fontSize: Fonts.sizes.lg, fontFamily: 'Manrope-Bold', color: Colors.onSurface,
    letterSpacing: -0.3,
  },
  viewAll: {
    fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold', color: Colors.primary,
    letterSpacing: 0.3,
  },

  contactsScroll: { paddingRight: Spacing.xl, gap: Spacing.base },
  contactItem: { alignItems: 'center', gap: Spacing.sm, width: 72 },
  addNewAvatar: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: 'center', justifyContent: 'center',
  },
  contactAvatar: {
    width: 64, height: 64, borderRadius: 20, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  contactInitials: {
    fontSize: Fonts.sizes.lg, fontFamily: 'Manrope-ExtraBold', color: '#ffffff',
  },
  contactName: {
    fontSize: Fonts.sizes.xs, fontFamily: 'Manrope-Medium', color: Colors.onSurfaceVariant,
    letterSpacing: 0.3, textAlign: 'center',
  },

  categoriesList: { gap: Spacing.base, marginTop: Spacing.base },
  categorySkeleton: { height: 80, borderRadius: BorderRadius.lg, marginBottom: 8 },
  categoryRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLowest, borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    borderWidth: 1, borderColor: Colors.transparentBorder, ...Shadows.sm
  },
  categoryLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, flex: 1 },
  categoryIcon: {
    width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  categoryText: { flex: 1 },
  categoryLabel: {
    fontSize: Fonts.sizes.base, fontFamily: 'Manrope-Bold', color: Colors.onSurface,
    letterSpacing: -0.2,
  },
  categoryDesc: {
    fontSize: Fonts.sizes.sm, color: Colors.onSurfaceVariant, marginTop: 2, fontFamily: 'Manrope-Medium'
  },

  scheduledList: { gap: Spacing.base, marginTop: Spacing.base },
  scheduledRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLowest, borderRadius: BorderRadius.base, padding: Spacing.base,
    borderWidth: 1, borderColor: Colors.transparentBorder, ...Shadows.sm
  },
  scheduledDetail: { flex: 1, paddingHorizontal: Spacing.base },
  scheduledName: { fontFamily: 'Manrope-Bold', color: Colors.onSurface, fontSize: Fonts.sizes.base },
  scheduledDate: { fontFamily: 'Manrope-Medium', color: Colors.onSurfaceVariant, fontSize: Fonts.sizes.xs, marginTop: 4 },
  scheduledAmount: { fontFamily: 'Manrope-ExtraBold', color: Colors.primary, fontSize: Fonts.sizes.md },

  emptyText: { fontFamily: 'Manrope-Medium', color: Colors.onSurfaceVariant, textAlign: 'center', marginVertical: Spacing.xl },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end'
  },
  modalContent: {
    backgroundColor: Colors.surface, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.xl, ...Shadows.lg, paddingBottom: 60
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xl
  },
  modalTitle: { fontSize: Fonts.sizes.xl, fontFamily: 'Manrope-ExtraBold', color: Colors.onSurface },
  modalFieldLabel: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold', color: Colors.onSurfaceVariant, marginBottom: 8 },
  modalInput: {
    backgroundColor: Colors.surfaceContainerLowest, color: Colors.onSurface,
    fontFamily: 'Manrope-Medium', padding: Spacing.base, borderRadius: BorderRadius.md,
    marginBottom: Spacing.xl, borderWidth: 1, borderColor: Colors.transparentBorder
  },
  modalSubmitBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.base,
    paddingVertical: Spacing.base, alignItems: 'center', marginTop: Spacing.sm
  },
  modalSubmitText: {
    color: Colors.onPrimary, fontFamily: 'Manrope-ExtraBold', fontSize: Fonts.sizes.md
  }
});

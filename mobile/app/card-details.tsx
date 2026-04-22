import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useStore } from '../stores/useStore';
import { useThemeColor } from '../hooks/useThemeColor';
import { Fonts, Spacing, BorderRadius, Shadows, formatMoney } from '../constants/theme';

const DESIGNS = [
  { id: 'default', name: 'Premium (Default)', colors: ['#4F8EF7', '#2c72d9'] },
  { id: 'dark', name: 'Sovereign Wealth', colors: ['#2a2a2a', '#0e0e0e'] },
  { id: 'gold', name: 'Gold Edition', colors: ['#d4af37', '#b8860b'] },
  { id: 'game_epic', name: 'Epic Gamer', colors: ['#9333ea', '#6b21a8'] },
  { id: 'game_legendary', name: 'Legendary', colors: ['#f59e0b', '#d97706'] },
];

export default function CardDetailsScreen() {
  const { user, accounts, cardDesign, setCardDesign } = useStore();
  const colors = useThemeColor();
  const s = useMemo(() => mk(colors), [colors]);

  const [activeTab, setActiveTab] = useState('Настройки');
  const [isFrozen, setIsFrozen] = useState(false);
  const [isSmsEnabled, setIsSmsEnabled] = useState(true);
  const [isDepositDefault, setIsDepositDefault] = useState(false);
  const [isDefaultCard, setIsDefaultCard] = useState(true);

  const mainAccount = accounts.find((a: any) => a.type === 'main');
  const mainCard = mainAccount?.bankCards?.[0];

  const currentDesign = DESIGNS.find(d => d.id === cardDesign) || DESIGNS[0];
  const isDark = cardDesign === 'dark';

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.iconBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Моя карта</Text>
        <TouchableOpacity style={s.iconBtn} onPress={() => router.push('/notifications')}>
          <MaterialIcons name="notifications-none" size={24} color={colors.onSurfaceVariant} />
          <View style={s.bellDot} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Card Visualization */}
        <View style={s.cardContainer}>
          <LinearGradient
            colors={currentDesign.colors as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              s.glassCard,
              isDark && { borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
            ]}
          >
            <View style={s.cardHeader}>
              <View>
                <Text style={s.cardLabel}>
                  {currentDesign.name.toUpperCase()}
                </Text>
                <Text style={s.cardBalance}>
                  {mainAccount ? formatMoney(mainAccount.balance) : '0.00 ₽'}
                </Text>
              </View>
              <View style={s.nfcBox}>
                <MaterialIcons name="contactless" size={24} color="rgba(255,255,255,0.9)" />
              </View>
            </View>

            <View style={s.cardMain}>
              <Text style={s.cardNumber}>
                {mainCard?.maskedNumber || '•••• •••• •••• 4021'}
              </Text>
              <View style={s.cardFooter}>
                <View>
                  <Text style={s.cardInfoLabel}>CARD HOLDER</Text>
                  <Text style={s.cardInfoValue}>
                    {user?.name?.toUpperCase() || 'ALEXANDER S.'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.cardInfoLabel}>EXPIRES</Text>
                  <Text style={s.cardInfoValue}>09/27</Text>
                </View>
                <View style={s.mastercardLogo}>
                  <View style={s.mcCircle1} />
                  <View style={s.mcCircle2} />
                </View>
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* Quick Actions */}
        <View style={s.actionsContainer}>
          <TouchableOpacity
            style={s.actionItem}
            onPress={() => router.push('/topup')}
          >
            <View style={s.actionBtn}>
              <MaterialIcons name="add" size={24} color={colors.primary} />
            </View>
            <Text style={s.actionLabel}>Пополнить</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.actionItem}
            onPress={() => router.push('/transfer')}
          >
            <View style={s.actionBtn}>
              <MaterialIcons name="send" size={24} color={colors.primary} />
            </View>
            <Text style={s.actionLabel}>Перевести</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.actionItem}
            onPress={() => router.push('/payment')}
          >
            <View style={s.actionBtn}>
              <MaterialIcons name="receipt-long" size={24} color={colors.primary} />
            </View>
            <Text style={s.actionLabel}>Оплатить</Text>
          </TouchableOpacity>
        </View>

        {/* Design Selector */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Сменить дизайн карты</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.designScroll}
          >
            {DESIGNS.map(d => (
              <TouchableOpacity
                key={d.id}
                style={[
                  s.designItem,
                  cardDesign === d.id && s.designItemActive,
                ]}
                onPress={() => setCardDesign(d.id)}
              >
                <LinearGradient
                  colors={d.colors as any}
                  style={[
                    s.designPreview,
                    cardDesign === d.id && { borderColor: colors.primary, borderWidth: 2 },
                  ]}
                />
                <Text
                  style={[
                    s.designName,
                    cardDesign === d.id && { color: colors.primary },
                  ]}
                >
                  {d.name.split(' ')[0]}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Tab Switcher */}
        <View style={s.tabSwitcher}>
          {['Настройки', 'История', 'Информация'].map(tab => (
            <TouchableOpacity
              key={tab}
              style={[s.tabBtn, activeTab === tab && s.tabBtnActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text
                style={[s.tabText, activeTab === tab && { color: colors.primary }]}
              >
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab: Settings */}
        {activeTab === 'Настройки' && (
          <View style={s.settingsList}>
            <TouchableOpacity style={s.settingItem}>
              <View style={s.settingLeft}>
                <View style={s.settingIconBox}>
                  <MaterialIcons name="tune" size={20} color={colors.primary} />
                </View>
                <Text style={s.settingText}>Лимиты</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={colors.outlineVariant} />
            </TouchableOpacity>

            <TouchableOpacity style={s.settingItem}>
              <View style={s.settingLeft}>
                <View style={s.settingIconBox}>
                  <MaterialIcons name="password" size={20} color={colors.primary} />
                </View>
                <Text style={s.settingText}>Сменить ПИН-код</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={colors.outlineVariant} />
            </TouchableOpacity>

            <View style={s.settingItem}>
              <View style={s.settingLeft}>
                <View style={[s.settingIconBox, { backgroundColor: `${colors.error}18` }]}>
                  <MaterialIcons name="ac-unit" size={20} color={colors.error} />
                </View>
                <Text style={s.settingText}>Заблокировать</Text>
              </View>
              <Switch
                value={isFrozen}
                onValueChange={setIsFrozen}
                thumbColor={colors.surfaceContainerLowest}
                trackColor={{
                  false: colors.surfaceContainerHigh,
                  true: colors.error,
                }}
              />
            </View>

            <View style={s.settingItem}>
              <View style={s.settingLeft}>
                <View style={s.settingIconBox}>
                  <MaterialIcons name="sms" size={20} color={colors.primary} />
                </View>
                <Text style={s.settingText}>SMS-уведомления</Text>
              </View>
              <Switch
                value={isSmsEnabled}
                onValueChange={setIsSmsEnabled}
                thumbColor={colors.surfaceContainerLowest}
                trackColor={{
                  false: colors.surfaceContainerHigh,
                  true: colors.primary,
                }}
              />
            </View>

            <TouchableOpacity style={s.settingItem}>
              <View style={s.settingLeft}>
                <View style={s.settingIconBox}>
                  <MaterialIcons name="autorenew" size={20} color={colors.primary} />
                </View>
                <Text style={s.settingText}>Перевыпустить</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={colors.outlineVariant} />
            </TouchableOpacity>

            <View style={s.settingItem}>
              <View style={s.settingLeft}>
                <View style={s.settingIconBox}>
                  <MaterialIcons name="download" size={20} color={colors.primary} />
                </View>
                <Text style={s.settingText}>Использовать для зачислений</Text>
              </View>
              <Switch
                value={isDepositDefault}
                onValueChange={setIsDepositDefault}
                thumbColor={colors.surfaceContainerLowest}
                trackColor={{
                  false: colors.surfaceContainerHigh,
                  true: colors.primary,
                }}
              />
            </View>

            <View style={s.settingItem}>
              <View style={s.settingLeft}>
                <View style={[s.settingIconBox, { backgroundColor: 'rgba(253,207,73,0.15)' }]}>
                  <MaterialIcons name="star" size={20} color="#fdcf49" />
                </View>
                <Text style={s.settingText}>Карта по умолчанию</Text>
              </View>
              <Switch
                value={isDefaultCard}
                onValueChange={setIsDefaultCard}
                thumbColor={colors.surfaceContainerLowest}
                trackColor={{
                  false: colors.surfaceContainerHigh,
                  true: colors.primary,
                }}
              />
            </View>
          </View>
        )}

        {/* Tab: History */}
        {activeTab === 'История' && (
          <View style={s.tabContent}>
            <TouchableOpacity
              style={s.historyLink}
              onPress={() => router.push('/history')}
            >
              <MaterialIcons name="receipt-long" size={20} color={colors.primary} />
              <Text style={s.historyLinkText}>Полная история операций</Text>
              <MaterialIcons name="chevron-right" size={22} color={colors.outlineVariant} />
            </TouchableOpacity>
            <View style={s.emptyTab}>
              <MaterialIcons name="history" size={40} color={colors.outlineVariant} />
              <Text style={s.emptyTabTitle}>Скоро здесь появятся операции</Text>
              <Text style={s.emptyTabSub}>История транзакций по этой карте</Text>
            </View>
          </View>
        )}

        {/* Tab: Info */}
        {activeTab === 'Информация' && (
          <View style={s.infoList}>
            {[
              { label: 'Номер карты', value: mainCard?.maskedNumber || '•••• •••• •••• 4021' },
              { label: 'Тип карты', value: 'Mastercard Platinum' },
              { label: 'Срок действия', value: '09/27' },
              { label: 'Статус', value: isFrozen ? 'Заблокирована' : 'Активна' },
              { label: 'Валюта', value: 'BYN' },
              { label: 'Баланс', value: mainAccount ? formatMoney(mainAccount.balance) : '0.00 ₽' },
            ].map((row, i) => (
              <View key={i} style={s.infoRow}>
                <Text style={s.infoLabel}>{row.label}</Text>
                <Text style={[
                  s.infoValue,
                  row.label === 'Статус' && {
                    color: isFrozen ? colors.error : colors.primary,
                  },
                ]}>
                  {row.value}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const mk = (C: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: C.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: C.transparentBorder,
    },
    headerTitle: {
      fontSize: Fonts.sizes.lg,
      fontFamily: 'Manrope-Bold',
      color: C.onSurface,
      flex: 1,
      textAlign: 'center',
    },
    iconBtn: {
      padding: 8,
      backgroundColor: C.surfaceContainerHigh,
      borderRadius: BorderRadius.full,
    },
    bellDot: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: C.error,
    },
    scrollContent: {
      paddingBottom: Spacing['4xl'],
    },

    // Card
    cardContainer: {
      paddingHorizontal: Spacing.base,
      marginBottom: Spacing.xl,
      marginTop: Spacing.base,
    },
    glassCard: {
      width: '100%',
      aspectRatio: 1.586,
      borderRadius: BorderRadius.lg,
      padding: Spacing.xl,
      justifyContent: 'space-between',
      overflow: 'hidden',
      ...Shadows.primary,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    cardLabel: {
      fontSize: 10,
      letterSpacing: 2,
      color: 'rgba(255,255,255,0.8)',
      fontFamily: 'Manrope-SemiBold',
    },
    cardBalance: {
      fontSize: Fonts.sizes.xl,
      fontFamily: 'Manrope-ExtraBold',
      color: '#fff',
      marginTop: 4,
    },
    nfcBox: {
      width: 40,
      height: 28,
      backgroundColor: 'rgba(255,255,255,0.2)',
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardMain: {},
    cardNumber: {
      fontSize: 22,
      fontFamily: 'Manrope-Bold',
      letterSpacing: 3,
      color: '#fff',
      marginBottom: Spacing.base,
    },
    cardFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
    },
    cardInfoLabel: {
      fontSize: 10,
      color: 'rgba(255,255,255,0.6)',
      fontFamily: 'Manrope-Medium',
    },
    cardInfoValue: {
      fontSize: Fonts.sizes.sm,
      color: '#fff',
      fontFamily: 'Manrope-SemiBold',
    },
    mastercardLogo: {
      width: 40,
      height: 24,
      flexDirection: 'row',
      alignItems: 'center',
      position: 'absolute',
      right: 0,
      bottom: 0,
    },
    mcCircle1: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: '#EB001B',
      position: 'absolute',
      left: 0,
      opacity: 0.9,
    },
    mcCircle2: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: '#F79E1B',
      position: 'absolute',
      left: 14,
      opacity: 0.9,
    },

    // Actions
    actionsContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: Spacing['2xl'],
      marginBottom: Spacing.xl,
    },
    actionItem: {
      alignItems: 'center',
      gap: 8,
    },
    actionBtn: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: C.surfaceContainerHighest,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: C.transparentBorder,
    },
    actionLabel: {
      fontSize: Fonts.sizes.xs,
      fontFamily: 'Manrope-SemiBold',
      color: C.onSurfaceVariant,
      letterSpacing: 0.5,
    },

    // Design Selector
    section: {
      marginBottom: Spacing.xl,
      paddingHorizontal: Spacing.base,
    },
    sectionTitle: {
      fontSize: Fonts.sizes.sm,
      fontFamily: 'Manrope-Bold',
      color: C.onSurfaceVariant,
      marginBottom: Spacing.base,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    designScroll: {
      gap: Spacing.md,
    },
    designItem: {
      alignItems: 'center',
      gap: 6,
      opacity: 0.55,
    },
    designItemActive: {
      opacity: 1,
    },
    designPreview: {
      width: 80,
      height: 50,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: C.transparentBorder,
    },
    designName: {
      fontSize: 10,
      fontFamily: 'Manrope-SemiBold',
      color: C.onSurfaceVariant,
    },

    // Tab Switcher
    tabSwitcher: {
      flexDirection: 'row',
      backgroundColor: C.surfaceContainerLow,
      padding: 6,
      borderRadius: BorderRadius.full,
      marginHorizontal: Spacing.base,
      marginBottom: Spacing.xl,
      borderWidth: 1,
      borderColor: C.transparentBorder,
    },
    tabBtn: {
      flex: 1,
      paddingVertical: 8,
      alignItems: 'center',
      borderRadius: BorderRadius.full,
    },
    tabBtnActive: {
      backgroundColor: C.surfaceContainerLowest,
      ...Shadows.sm,
    },
    tabText: {
      fontSize: Fonts.sizes.sm,
      fontFamily: 'Manrope-Bold',
      color: C.onSurfaceVariant,
    },

    // Settings Tab
    settingsList: {
      paddingHorizontal: Spacing.md,
      gap: 4,
    },
    settingItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.sm,
      borderRadius: BorderRadius.md,
    },
    settingLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.base,
    },
    settingIconBox: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: `rgba(79,142,247,0.10)`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    settingText: {
      fontSize: Fonts.sizes.md,
      fontFamily: 'Manrope-SemiBold',
      color: C.onSurface,
    },

    // History & Info tabs
    tabContent: {
      paddingHorizontal: Spacing.base,
      gap: Spacing.sm,
    },
    historyLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      backgroundColor: C.surfaceContainerLowest,
      borderRadius: BorderRadius.lg,
      padding: Spacing.base,
      borderWidth: 1,
      borderColor: C.transparentBorder,
      ...Shadows.sm,
    },
    historyLinkText: {
      flex: 1,
      fontSize: Fonts.sizes.base,
      fontFamily: 'Manrope-Bold',
      color: C.onSurface,
    },
    emptyTab: {
      alignItems: 'center',
      paddingVertical: Spacing['3xl'],
      gap: Spacing.sm,
    },
    emptyTabTitle: {
      fontSize: Fonts.sizes.base,
      fontFamily: 'Manrope-Bold',
      color: C.onSurface,
    },
    emptyTabSub: {
      fontSize: Fonts.sizes.sm,
      fontFamily: 'Manrope-Medium',
      color: C.onSurfaceVariant,
    },
    infoList: {
      paddingHorizontal: Spacing.base,
      backgroundColor: C.surfaceContainerLowest,
      marginHorizontal: Spacing.base,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: C.transparentBorder,
      overflow: 'hidden',
      ...Shadows.sm,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: C.transparentBorder,
    },
    infoLabel: {
      fontSize: Fonts.sizes.sm,
      fontFamily: 'Manrope-Medium',
      color: C.onSurfaceVariant,
    },
    infoValue: {
      fontSize: Fonts.sizes.sm,
      fontFamily: 'Manrope-Bold',
      color: C.onSurface,
    },
  });

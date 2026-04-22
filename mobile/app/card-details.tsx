import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useStore } from '../stores/useStore';
import { Colors, Fonts, Spacing, BorderRadius, Shadows, formatMoney } from '../constants/theme';

const DESIGNS = [
  { id: 'default', name: 'Premium (Default)', colors: [Colors.primary, Colors.primaryContainer] },
  { id: 'dark', name: 'Sovereign Wealth', colors: ['#2a2a2a', '#0e0e0e'] },
  { id: 'gold', name: 'Gold Edition', colors: ['#d4af37', '#b8860b'] },
  { id: 'game_epic', name: 'Epic Gamer', colors: ['#9333ea', '#6b21a8'] },
  { id: 'game_legendary', name: 'Legendary', colors: ['#f59e0b', '#d97706'] },
];

export default function CardDetailsScreen() {
  const { user, accounts, cardDesign, setCardDesign } = useStore();
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
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={Colors.onSurfaceVariant} />
          </TouchableOpacity>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/notifications')}>
            <MaterialIcons name="notifications-none" size={24} color={Colors.onSurfaceVariant} />
            <View style={styles.bellDot} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Card Visualization */}
        <View style={styles.cardContainer}>
          <LinearGradient
            colors={currentDesign.colors as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.glassCard, isDark && { borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }]}
          >
            <View style={styles.cardGrain} />
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardLabel}>{currentDesign.name.toUpperCase()}</Text>
                <Text style={styles.cardBalance}>
                  {mainAccount ? formatMoney(mainAccount.balance) : '0.00 ₽'}
                </Text>
              </View>
              <View style={styles.nfcBox}>
                <MaterialIcons name="contactless" size={24} color={Colors.primary} />
              </View>
            </View>

            <View style={styles.cardMain}>
              <Text style={styles.cardNumber}>
                {mainCard?.maskedNumber || '•••• •••• •••• 4021'}
              </Text>
              
              <View style={styles.cardFooter}>
                <View style={styles.cardInfoCol}>
                  <Text style={styles.cardInfoLabel}>CARD HOLDER</Text>
                  <Text style={styles.cardInfoValue}>{user?.name?.toUpperCase() || 'ALEXANDER S.'}</Text>
                </View>
                <View style={[styles.cardInfoCol, { alignItems: 'flex-end', paddingRight: Spacing.xl }]}>
                  <Text style={styles.cardInfoLabel}>EXPIRES</Text>
                  <Text style={styles.cardInfoValue}>09/27</Text>
                </View>
                <View style={styles.mastercardLogo}>
                  <View style={styles.mcCircle1} />
                  <View style={styles.mcCircle2} />
                </View>
              </View>
            </View>
            {isDark && <View style={styles.cardGlow} />}
          </LinearGradient>
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.actionItem} onPress={() => router.push('/topup')}>
            <View style={styles.actionBtn}>
              <MaterialIcons name="add" size={24} color={Colors.primary} />
            </View>
            <Text style={styles.actionLabel}>Пополнить</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionItem} onPress={() => router.push('/transfer')}>
            <View style={styles.actionBtn}>
              <MaterialIcons name="send" size={24} color={Colors.primary} />
            </View>
            <Text style={styles.actionLabel}>Перевести</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionItem} onPress={() => router.push('/payment')}>
            <View style={styles.actionBtn}>
              <MaterialIcons name="receipt-long" size={24} color={Colors.primary} />
            </View>
            <Text style={styles.actionLabel}>Оплатить</Text>
          </TouchableOpacity>
        </View>

        {/* Design Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Сменить дизайн карты</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.designScroll}>
            {DESIGNS.map(d => (
              <TouchableOpacity
                key={d.id}
                style={[styles.designItem, cardDesign === d.id && styles.designItemActive]}
                onPress={() => setCardDesign(d.id)}
              >
                <LinearGradient
                  colors={d.colors as any}
                  style={styles.designPreview}
                />
                <Text style={[styles.designName, cardDesign === d.id && { color: Colors.primary }]}>
                  {d.name.split(' ')[0]}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Tab Switcher */}
        <View style={styles.tabSwitcher}>
          {['Настройки', 'История', 'Информация'].map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Settings List */}
        {activeTab === 'Настройки' && (
          <View style={styles.settingsList}>
            <TouchableOpacity style={styles.settingItem}>
              <View style={styles.settingLeft}>
                <View style={styles.settingIconBox}>
                  <MaterialIcons name="tune" size={20} color={Colors.primary} />
                </View>
                <Text style={styles.settingText}>Лимиты</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={Colors.outlineVariant} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.settingItem}>
              <View style={styles.settingLeft}>
                <View style={styles.settingIconBox}>
                  <MaterialIcons name="password" size={20} color={Colors.primary} />
                </View>
                <Text style={styles.settingText}>Сменить ПИН-код</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={Colors.outlineVariant} />
            </TouchableOpacity>

            <View style={styles.settingItem}>
              <View style={styles.settingLeft}>
                <View style={styles.settingIconBox}>
                  <MaterialIcons name="ac-unit" size={20} color={Colors.error} />
                </View>
                <Text style={styles.settingText}>Заблокировать</Text>
              </View>
              <Switch value={isFrozen} onValueChange={setIsFrozen} thumbColor={Colors.surfaceContainerLowest} trackColor={{ false: Colors.surfaceContainerHigh, true: Colors.error }} />
            </View>

            <View style={styles.settingItem}>
              <View style={styles.settingLeft}>
                <View style={styles.settingIconBox}>
                  <MaterialIcons name="sms" size={20} color={Colors.primary} />
                </View>
                <Text style={styles.settingText}>SMS-уведомления</Text>
              </View>
              <Switch value={isSmsEnabled} onValueChange={setIsSmsEnabled} thumbColor={Colors.surfaceContainerLowest} trackColor={{ false: Colors.surfaceContainerHigh, true: Colors.primary }} />
            </View>

            <TouchableOpacity style={styles.settingItem}>
              <View style={styles.settingLeft}>
                <View style={styles.settingIconBox}>
                  <MaterialIcons name="autorenew" size={20} color={Colors.primary} />
                </View>
                <Text style={styles.settingText}>Перевыпустить</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={Colors.outlineVariant} />
            </TouchableOpacity>

            <View style={styles.settingItem}>
              <View style={styles.settingLeft}>
                <View style={styles.settingIconBox}>
                  <MaterialIcons name="download" size={20} color={Colors.primary} />
                </View>
                <Text style={styles.settingText}>Использовать для зачислений</Text>
              </View>
              <Switch value={isDepositDefault} onValueChange={setIsDepositDefault} thumbColor={Colors.surfaceContainerLowest} trackColor={{ false: Colors.surfaceContainerHigh, true: Colors.primary }} />
            </View>

            <View style={styles.settingItem}>
              <View style={styles.settingLeft}>
                <View style={styles.settingIconBox}>
                  <MaterialIcons name="star" size={20} color="#FFD700" />
                </View>
                <Text style={styles.settingText}>Карта по умолчанию</Text>
              </View>
              <Switch value={isDefaultCard} onValueChange={setIsDefaultCard} thumbColor={Colors.surfaceContainerLowest} trackColor={{ false: Colors.surfaceContainerHigh, true: Colors.primary }} />
            </View>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm, zIndex: 10,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { padding: 8, backgroundColor: Colors.surfaceContainerHigh, borderRadius: BorderRadius.full },
  bellDot: {
    position: 'absolute', top: 8, right: 8, width: 8, height: 8,
    borderRadius: 4, backgroundColor: Colors.error,
  },
  scrollContent: { paddingBottom: Spacing['4xl'] },
  
  cardContainer: { paddingHorizontal: Spacing.base, marginBottom: Spacing.xl, marginTop: Spacing.sm },
  glassCard: {
    width: '100%', aspectRatio: 1.586, borderRadius: BorderRadius.lg,
    padding: Spacing.xl, justifyContent: 'space-between', overflow: 'hidden',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.3, shadowRadius: 24,
  },
  cardGrain: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.05, backgroundColor: '#fff' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 10 },
  cardLabel: { fontSize: 10, letterSpacing: 2, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  cardBalance: { fontSize: Fonts.sizes.xl, fontWeight: '800', color: '#fff', marginTop: 4 },
  nfcBox: { width: 40, height: 28, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  cardMain: { zIndex: 10 },
  cardNumber: { fontSize: 24, fontWeight: '700', letterSpacing: 3, color: '#fff', marginBottom: 16 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  cardInfoCol: { flexDirection: 'col' as any },
  cardInfoLabel: { fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },
  cardInfoValue: { fontSize: Fonts.sizes.sm, color: '#fff', fontWeight: '600' },
  mastercardLogo: {
    width: 40, height: 24, flexDirection: 'row', alignItems: 'center', position: 'absolute', right: 0, bottom: 0,
  },
  mcCircle1: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#EB001B', position: 'absolute', left: 0, opacity: 0.8 },
  mcCircle2: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#F79E1B', position: 'absolute', left: 14, opacity: 0.8 },
  cardGlow: { position: 'absolute', top: '-50%', left: '-50%', width: '100%', height: '100%', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 999 },

  actionsContainer: { flexDirection: 'row', justifyContent: 'center', gap: Spacing['2xl'], marginBottom: Spacing['xl'] },
  actionItem: { alignItems: 'center', gap: 8 },
  actionBtn: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.surfaceContainerHighest, 
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(66,71,83,0.15)',
  },
  actionLabel: { fontSize: 11, color: Colors.onSurfaceVariant, fontWeight: '600', letterSpacing: 0.5 },

  section: { marginBottom: Spacing.xl, paddingHorizontal: Spacing.base },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.onSurface, marginBottom: Spacing.base },
  designScroll: { gap: Spacing.md },
  designItem: { alignItems: 'center', gap: 6, opacity: 0.6 },
  designItemActive: { opacity: 1 },
  designPreview: { width: 80, height: 50, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
  designName: { fontSize: 10, color: Colors.onSurfaceVariant, fontWeight: '600' },

  tabSwitcher: {
    flexDirection: 'row', backgroundColor: Colors.surfaceContainerLow, padding: 6, borderRadius: BorderRadius.full,
    marginHorizontal: Spacing.base, marginBottom: Spacing.xl, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
  },
  tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: BorderRadius.full },
  tabBtnActive: { backgroundColor: Colors.surfaceContainerLowest, ...Shadows.sm },
  tabText: { fontSize: 12, color: Colors.onSurfaceVariant, fontWeight: '700' },
  tabTextActive: { color: Colors.primary },

  settingsList: { paddingHorizontal: Spacing.md, gap: 4 },
  settingItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.sm, borderRadius: BorderRadius.md,
  },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.base },
  settingIconBox: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(79,142,247,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  settingText: { fontSize: 14, color: Colors.onSurface, fontWeight: '600' },
});

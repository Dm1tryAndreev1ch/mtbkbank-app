import React, { useCallback, useState, useMemo, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, Alert, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useStore } from '../../stores/useStore';
import * as api from '../../services/api';
import { Fonts, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { useThemeColor } from '../../hooks/useThemeColor';
import DevSentryButton from '../../components/DevSentryButton';
import { ConfirmDialog } from '../../components/ConfirmDialog';

export default function AccountScreen() {
  const { user, loadUser, logout, unreadCount, theme, setTheme } = useStore();
  const [stats, setStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  // Phase-4 gap-1: logout uses ConfirmDialog instead of Alert.alert (UX-03).
  const [logoutConfirmVisible, setLogoutConfirmVisible] = useState(false);

  const colors = useThemeColor();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const scale = useSharedValue(0.9);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 600 });
    scale.value = withSpring(1, { damping: 10, stiffness: 80 });
  }, []);

  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res = await api.getMyStats();
      setStats(res.data);
    } catch {
      setStats(null);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadUser();
      fetchStats();
    }, [])
  );

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value, transform: [{ scale: scale.value }],
  }));

  const statusColors: Record<string, string> = {
    STANDARD: colors.outlineVariant,
    SILVER: '#94a3b8',
    GOLD: colors.secondaryContainer,
    PLATINUM: '#818cf8',
  };

  const statusNames: Record<string, string> = {
    STANDARD: 'Стандарт',
    SILVER: 'Серебро',
    GOLD: 'Золото',
    PLATINUM: 'Платина',
  };

  const handleLogout = () => {
    setLogoutConfirmVisible(true);
  };

  const confirmLogout = () => {
    setLogoutConfirmVisible(false);
    logout();
    router.replace('/login');
  };

  const handleThemeToggle = () => {
    Alert.alert('Выбор темы', 'Оформление приложения:', [
      { text: 'Светлая', onPress: () => setTheme('light') },
      { text: 'Тёмная', onPress: () => setTheme('dark') },
      { text: 'Системная', onPress: () => setTheme('system') },
      { text: 'Отмена', style: 'cancel' },
    ]);
  };

  const getThemeText = () => {
    if (theme === 'light') return 'Светлая';
    if (theme === 'dark') return 'Тёмная';
    return 'Системная';
  };

  const statItems = [
    {
      icon: 'style' as const,
      color: colors.primary,
      value: stats?.totalCards ?? 0,
      label: 'Карточки',
    },
    {
      icon: 'local-fire-department' as const,
      color: '#eab308',
      value: stats?.activeCashback != null ? `${stats.activeCashback}%` : '0%',
      label: 'Кэшбэк',
    },
    {
      icon: 'emoji-events' as const,
      color: '#ec4899',
      value: stats?.questsCompleted ?? 0,
      label: 'Задания',
    },
  ];

  const settingsSections = [
    {
      title: 'Безопасность',
      items: [
        { icon: 'fingerprint', label: 'Биометрия', detail: 'Face ID', action: () => {} },
        { icon: 'lock', label: 'Изменить ПИН', detail: '', action: () => {} },
      ],
    },
    {
      title: 'Внешний вид',
      items: [
        { icon: 'palette', label: 'Тема', detail: getThemeText(), action: handleThemeToggle },
        { icon: 'language', label: 'Язык', detail: 'Русский', action: () => {} },
      ],
    },
    {
      title: 'Уведомления',
      items: [
        { icon: 'notifications', label: 'Push-уведомления', detail: 'Включены', action: () => {} },
      ],
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.headerBar}>
          <Text style={styles.pageTitle}>Профиль</Text>
          <TouchableOpacity style={styles.bellBtn} onPress={() => router.push('/notifications')}>
            <MaterialIcons name="notifications-none" size={24} color={colors.onSurfaceVariant} />
            {unreadCount > 0 && <View style={styles.bellDot} />}
          </TouchableOpacity>
        </View>

        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.profileHeader}>
            <View style={styles.avatarContainer}>
              {user?.avatarUrl ? (
                <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <MaterialIcons name="person" size={40} color={colors.onSurfaceVariant} />
                </View>
              )}
              <View style={[styles.statusDot, { backgroundColor: statusColors[user?.status || 'STANDARD'] }]} />
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{user?.name || 'Пользователь'}</Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusBadge, { backgroundColor: statusColors[user?.status || 'STANDARD'] }]}>
                  <Text style={styles.statusText}>{statusNames[user?.status || 'STANDARD']}</Text>
                </View>
              </View>
            </View>
          </View>

          <Animated.View style={[styles.mbRow, animatedStyle]}>
            <View>
              <Text style={styles.mbLabel}>MB Баллы</Text>
              <Text style={styles.mbValue}>{(user?.mbPoints || 0).toLocaleString('ru-RU')}</Text>
            </View>
            <TouchableOpacity style={styles.mbButton} onPress={() => router.push('/(tabs)/cards')}>
              <Text style={styles.mbButtonText}>Колода</Text>
              <MaterialIcons name="chevron-right" size={16} color={colors.onPrimary} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* Stats */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Игровая статистика</Text>
          <View style={styles.statsRow}>
            {statItems.map((s) => (
              <View key={s.label} style={styles.statCard}>
                <MaterialIcons name={s.icon} size={24} color={s.color} />
                {loadingStats
                  ? <ActivityIndicator color={s.color} style={styles.loader} />
                  : <Text style={styles.statScore}>{s.value}</Text>
                }
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Settings */}
        {settingsSections.map((section, si) => (
          <View key={si} style={styles.settingsSection}>
            <Text style={styles.settingsSectionTitle}>{section.title}</Text>
            <View style={styles.settingsCard}>
              {section.items.map((item, ii) => (
                <TouchableOpacity
                  key={ii}
                  onPress={item.action}
                  style={[styles.settingsItem, ii < section.items.length - 1 && styles.settingsItemBorder]}
                >
                  <View style={styles.settingsLeft}>
                    <View style={styles.settingsIcon}>
                      <MaterialIcons name={item.icon as any} size={22} color={colors.primary} />
                    </View>
                    <Text style={styles.settingsLabel}>{item.label}</Text>
                  </View>
                  <View style={styles.settingsRight}>
                    {item.detail ? <Text style={styles.settingsDetail}>{item.detail}</Text> : null}
                    <MaterialIcons name="chevron-right" size={24} color={colors.outlineVariant} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <MaterialIcons name="logout" size={20} color={colors.error} />
          <Text style={styles.logoutText}>Выйти из аккаунта</Text>
        </TouchableOpacity>

        <Text style={styles.version}>MT-Банк v1.0.0 (Phase 2)</Text>

        {__DEV__ && <DevSentryButton />}
      </ScrollView>
      <ConfirmDialog
        visible={logoutConfirmVisible}
        onDismiss={() => setLogoutConfirmVisible(false)}
        title="Выйти"
        message="Вы уверены, что хотите завершить сессию?"
        confirmLabel="Выйти"
        cancelLabel="Отмена"
        confirmButton={{ onPress: confirmLogout }}
        cancelButton={{ onPress: () => setLogoutConfirmVisible(false) }}
        isDestructive
      />
    </SafeAreaView>
  );
}

const getStyles = (Colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { paddingBottom: 120 },
  headerBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingTop: Spacing.xl, paddingBottom: Spacing.sm },
  pageTitle: { fontSize: Fonts.sizes['2xl'], fontFamily: 'Manrope-ExtraBold', color: Colors.onSurface },
  bellBtn: { position: 'relative', padding: 8 },
  bellDot: { position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.error },
  profileCard: { margin: Spacing.base, backgroundColor: Colors.surfaceContainerLowest, borderRadius: BorderRadius.lg, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.transparentBorder, ...Shadows.md },
  profileHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xl, marginBottom: Spacing.xl },
  avatarContainer: { position: 'relative' },
  avatar: { width: 80, height: 80, borderRadius: 40 },
  avatarPlaceholder: { backgroundColor: Colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' },
  statusDot: { position: 'absolute', bottom: 2, right: 2, width: 20, height: 20, borderRadius: 10, borderWidth: 3, borderColor: Colors.surfaceContainerLowest },
  profileInfo: { flex: 1 },
  profileName: { fontSize: Fonts.sizes.xl, fontFamily: 'Manrope-ExtraBold', color: Colors.onSurface, letterSpacing: -0.5 },
  statusRow: { flexDirection: 'row', marginTop: Spacing.sm },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: BorderRadius.full },
  statusText: { fontSize: Fonts.sizes.xs, fontFamily: 'Manrope-ExtraBold', color: Colors.onPrimary, textTransform: 'uppercase', letterSpacing: 1 },
  mbRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.surfaceContainerLow, borderRadius: BorderRadius.base, padding: Spacing.base },
  mbLabel: { fontSize: Fonts.sizes.sm, color: Colors.onSurfaceVariant, fontFamily: 'Manrope-Medium' },
  mbValue: { fontSize: Fonts.sizes['2xl'], fontFamily: 'Manrope-ExtraBold', color: Colors.primary },
  mbButton: { backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: BorderRadius.full, flexDirection: 'row', alignItems: 'center' },
  mbButtonText: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold', color: Colors.onPrimary },
  section: { paddingHorizontal: Spacing.base, marginTop: Spacing.lg },
  sectionTitle: { fontSize: Fonts.sizes.lg, fontFamily: 'Manrope-Bold', color: Colors.onSurface, marginBottom: Spacing.md, paddingHorizontal: Spacing.sm },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm },
  statCard: { flex: 1, backgroundColor: Colors.surfaceContainerLowest, padding: Spacing.base, borderRadius: BorderRadius.base, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.transparentBorder, ...Shadows.sm },
  loader: { marginVertical: 8 },
  statScore: { fontSize: Fonts.sizes.xl, fontFamily: 'Manrope-ExtraBold', color: Colors.onSurface, marginVertical: 4 },
  statLabel: { fontSize: 10, fontFamily: 'Manrope-Bold', color: Colors.onSurfaceVariant, textTransform: 'uppercase' },
  settingsSection: { paddingHorizontal: Spacing.base, marginTop: Spacing.xl },
  settingsSectionTitle: { fontSize: Fonts.sizes.xs, fontFamily: 'Manrope-ExtraBold', color: Colors.primary, letterSpacing: 2, marginBottom: Spacing.sm, textTransform: 'uppercase' },
  settingsCard: { backgroundColor: Colors.surfaceContainerLowest, borderRadius: BorderRadius.base, borderWidth: 1, borderColor: Colors.transparentBorder, overflow: 'hidden' },
  settingsItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg },
  settingsItemBorder: { borderBottomWidth: 1, borderBottomColor: Colors.transparentBorder },
  settingsLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.base },
  settingsIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(79,142,247,0.1)', alignItems: 'center', justifyContent: 'center' },
  settingsLabel: { fontSize: Fonts.sizes.base, fontFamily: 'Manrope-Bold', color: Colors.onSurface },
  settingsRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  settingsDetail: { fontSize: Fonts.sizes.sm, color: Colors.onSurfaceVariant, fontFamily: 'Manrope-Medium' },
  logoutButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, marginHorizontal: Spacing.base, marginTop: Spacing['2xl'], padding: Spacing.base, borderRadius: BorderRadius.base, backgroundColor: 'rgba(186,26,26,0.15)', borderWidth: 1, borderColor: 'rgba(186,26,26,0.25)' },
  logoutText: { fontSize: Fonts.sizes.base, fontFamily: 'Manrope-Bold', color: Colors.error },
  version: { textAlign: 'center', marginTop: Spacing.base, marginBottom: Spacing.xl, color: Colors.outlineVariant, fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Medium' },
});

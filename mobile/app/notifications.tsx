import React, { useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, Fonts, Spacing, BorderRadius, toMaterialIconName } from '../constants/theme';
import { useStore } from '../stores/useStore';

/** Куда вести пользователя по типу уведомления (иконка/текст с бэкенда). */
function getRouteForNotification(notif: { icon?: string | null; title?: string | null; body?: string | null }) {
  const icon = String(notif.icon ?? '')
    .replace(/_/g, '-')
    .toLowerCase();
  const text = `${notif.title ?? ''} ${notif.body ?? ''}`.toLowerCase();

  if (icon.includes('swap') || text.includes('обмен')) return '/trade' as const;
  if (icon.includes('wallet') || text.includes('перевод') || text.includes('поступил')) return '/history' as const;
  if (icon.includes('heart') || icon.includes('warning') || text.includes('здоровье') || text.includes('уничтож'))
    return '/(tabs)/cards' as const;
  if (icon.includes('style') || icon.includes('gift') || text.includes('карточк')) return '/(tabs)/cards' as const;
  if (icon.includes('celebration')) return '/(tabs)/index' as const;
  return '/(tabs)/index' as const;
}

export default function NotificationsScreen() {
  const { notifications, loadNotifications, markNotificationRead } = useStore();

  useEffect(() => {
    loadNotifications();
  }, []);

  const onOpen = useCallback(
    async (notif: any) => {
      try {
        if (notif.id && !notif.read) await markNotificationRead(notif.id);
      } catch {
        /* не блокируем переход */
      }
      router.push(getRouteForNotification(notif) as any);
    },
    [markNotificationRead],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={Colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>Уведомления</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {notifications && notifications.length > 0 ? (
          notifications.map((notif: any) => (
            <TouchableOpacity
              key={notif.id || notif.createdAt}
              style={[styles.notificationCard, !notif.read && styles.unread]}
              activeOpacity={0.85}
              onPress={() => onOpen(notif)}
            >
              <View style={styles.iconContainer}>
                <MaterialIcons
                  name={toMaterialIconName(notif.icon) as any}
                  size={24}
                  color={Colors.primary}
                />
              </View>
              <View style={styles.notifBody}>
                <Text style={styles.notifTitle}>{notif.title || 'Новое уведомление'}</Text>
                <Text style={styles.notifMessage}>{notif.body ?? notif.message}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={Colors.outlineVariant} />
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyState}>
            <MaterialIcons name="notifications-off" size={64} color={Colors.outlineVariant} />
            <Text style={styles.emptyText}>Нет новых уведомлений</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  backBtn: { padding: 8 },
  title: { fontSize: Fonts.sizes.lg, fontWeight: Fonts.weights.bold, color: Colors.onSurface },
  content: { padding: Spacing.base, gap: Spacing.sm },
  notificationCard: {
    flexDirection: 'row', alignItems: 'center', padding: Spacing.base, backgroundColor: Colors.surfaceContainerLow,
    borderRadius: BorderRadius.base, gap: Spacing.sm,
  },
  unread: {
    borderLeftWidth: 4, borderLeftColor: Colors.primary,
  },
  iconContainer: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.surfaceContainerHighest,
    alignItems: 'center', justifyContent: 'center',
  },
  notifBody: { flex: 1 },
  notifTitle: { fontSize: Fonts.sizes.md, fontWeight: Fonts.weights.bold, color: Colors.onSurface, marginBottom: 2 },
  notifMessage: { fontSize: Fonts.sizes.sm, color: Colors.onSurfaceVariant },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing['3xl'], gap: Spacing.md, marginTop: 100 },
  emptyText: { fontSize: Fonts.sizes.md, color: Colors.onSurfaceVariant },
});

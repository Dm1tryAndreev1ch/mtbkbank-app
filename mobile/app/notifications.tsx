import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, Fonts, Spacing, BorderRadius } from '../constants/theme';
import { useStore } from '../stores/useStore';

export default function NotificationsScreen() {
  const { notifications, loadNotifications } = useStore();

  useEffect(() => {
    loadNotifications();
  }, []);

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
          notifications.map((notif: any, i: number) => (
            <View key={i} style={[styles.notificationCard, !notif.read && styles.unread]}>
              <View style={styles.iconContainer}>
                <MaterialIcons name="notifications" size={24} color={Colors.primary} />
              </View>
              <View style={styles.notifBody}>
                <Text style={styles.notifTitle}>{notif.title || 'Новое уведомление'}</Text>
                <Text style={styles.notifMessage}>{notif.message}</Text>
              </View>
            </View>
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
    flexDirection: 'row', padding: Spacing.base, backgroundColor: Colors.surfaceContainerLow,
    borderRadius: BorderRadius.base, gap: Spacing.base,
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

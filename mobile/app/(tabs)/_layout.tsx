import React, { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { AppState, AppStateStatus, View, StyleSheet, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Shadows } from '../../constants/theme';
import { useThemeColor } from '../../hooks/useThemeColor';
import { useStore } from '../../stores/useStore';
import { ErrorBoundary } from '../../components/ErrorBoundary';

function TabLayoutInner() {
  const colors = useThemeColor();
  const token = useStore((s) => s.token);
  const loadNotifications = useStore((s) => s.loadNotifications);
  const loadCards = useStore((s) => s.loadCards);
  const loadDecks = useStore((s) => s.loadDecks);

  useEffect(() => {
    const onState = (next: AppStateStatus) => {
      if (next !== 'active' || !token) return;
      void loadNotifications();
      void loadCards();
      void loadDecks();
    };
    const sub = AppState.addEventListener('change', onState);
    return () => sub.remove();
  }, [token, loadNotifications, loadCards, loadDecks]);

  /** Keep inventory and in-app notification badge in sync while the app is open (server ticks active-deck HP every minute). */
  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      void loadNotifications();
      void loadCards();
      void loadDecks();
    }, 60_000);
    return () => clearInterval(id);
  }, [token, loadNotifications, loadCards, loadDecks]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.onSurfaceVariant,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: colors.surfaceContainerLowest,
          borderTopWidth: 1,
          borderTopColor: colors.transparentBorder,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          height: Platform.OS === 'ios' ? 96 : 76,
          paddingTop: 8,
          paddingBottom: Platform.OS === 'ios' ? 28 : 12,
          paddingHorizontal: 4,
          ...Shadows.lg,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontFamily: 'Manrope-Bold',
          letterSpacing: 0,
          includeFontPadding: false,
        },
        tabBarItemStyle: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 0,
          overflow: 'visible',
        },
        tabBarAllowFontScaling: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Главная',
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="home" size={26} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Аналитика',
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="insights" size={26} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="payments"
        options={{
          title: '',
          tabBarIcon: ({ color, focused }) => (
            <View style={styles.fabContainer}>
              <View style={[styles.fab, focused && styles.fabActive, { backgroundColor: colors.primary }]}>
                <MaterialIcons name="arrow-upward" size={30} color={colors.onPrimary} />
              </View>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          title: 'Продукты',
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="grid-view" size={26} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Профиль',
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="person" size={26} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="cards"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

// M-M5 / D-05: per-route ErrorBoundary wraps the entire tabs subtree so a
// crash in one tab renders the fallback instead of a white screen.
export default function TabLayout() {
  return (
    <ErrorBoundary scope="route" routeName="tabs">
      <TabLayoutInner />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  fabContainer: {
    position: 'relative',
    top: -20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.primary,
  },
  fabActive: {
    transform: [{ scale: 1.05 }],
  },
});

import React, { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { AppState, AppStateStatus, View, StyleSheet, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Shadows } from '../../constants/theme';
import { useThemeColor } from '../../hooks/useThemeColor';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useStore } from '../../stores/useStore';
import { ErrorBoundary } from '../../components/ErrorBoundary';

// ANIM-09 — animates tab icon scale on focus using Reanimated spring.
// ANIM-10 — skips animation when reducedMotion is enabled.
function AnimatedTabIcon({
  focused,
  children,
}: {
  focused: boolean;
  children: React.ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) return;
    scale.value = focused
      ? withSpring(1.18, { damping: 10, stiffness: 200 })
      : withTiming(1, { duration: 150 });
  }, [focused, reducedMotion, scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return <Animated.View style={animStyle}>{children}</Animated.View>;
}

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

  /** Keep inventory and in-app notification badge in sync while the app is open. */
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
          tabBarIcon: ({ color, focused }) => (
            <AnimatedTabIcon focused={focused}>
              <MaterialIcons name="home" size={26} color={color} />
            </AnimatedTabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Аналитика',
          tabBarIcon: ({ color, focused }) => (
            <AnimatedTabIcon focused={focused}>
              <MaterialIcons name="insights" size={26} color={color} />
            </AnimatedTabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="payments"
        options={{
          title: '',
          tabBarIcon: ({ color, focused }) => (
            <View style={styles.fabContainer}>
              <View
                style={[
                  styles.fab,
                  focused && styles.fabActive,
                  { backgroundColor: colors.primary },
                ]}
              >
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
          tabBarIcon: ({ color, focused }) => (
            <AnimatedTabIcon focused={focused}>
              <MaterialIcons name="grid-view" size={26} color={color} />
            </AnimatedTabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Профиль',
          tabBarIcon: ({ color, focused }) => (
            <AnimatedTabIcon focused={focused}>
              <MaterialIcons name="person" size={26} color={color} />
            </AnimatedTabIcon>
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

// M-M5 / D-05: per-route ErrorBoundary wraps the entire tabs subtree.
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

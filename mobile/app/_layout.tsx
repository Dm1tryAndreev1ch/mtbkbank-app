// Must be first — Sentry.init runs synchronously on import; must precede React Native bridges.
// eslint-disable-next-line import/first
import '../services/sentry';
import * as Sentry from '@sentry/react-native';

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import {
  useFonts,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useStore } from '../stores/useStore';
import BiometricGuard from '../components/BiometricGuard';
import BootGate from '../components/BootGate';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { OfflineBanner } from '../components/OfflineBanner';
import { ToastHost } from '../components/Toast';
import { useCardExpiredListener } from '../hooks/useCardExpiredListener';
import { useTradeAnimationListener } from '../hooks/useTradeAnimationListener';
import { TradeFlipOverlay } from '../components/TradeFlipOverlay';

SplashScreen.preventAutoHideAsync();

// Maximum time to wait for fonts before rendering anyway (fallback to system fonts).
const FONT_TIMEOUT_MS = 5000;

function RootLayout() {
  const [fontsLoaded] = useFonts({
    Manrope: Manrope_400Regular,
    'Manrope-Medium': Manrope_500Medium,
    'Manrope-SemiBold': Manrope_600SemiBold,
    'Manrope-Bold': Manrope_700Bold,
    'Manrope-ExtraBold': Manrope_800ExtraBold,
  });

  // Fallback: if fonts haven't loaded within FONT_TIMEOUT_MS, render anyway.
  // This prevents a permanent black screen when @expo-google-fonts is slow/offline.
  const [fontTimedOut, setFontTimedOut] = useState(false);
  useEffect(() => {
    if (fontsLoaded) return;
    const t = setTimeout(() => setFontTimedOut(true), FONT_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [fontsLoaded]);

  const loaded = fontsLoaded || fontTimedOut;

  const sysTheme = useColorScheme();
  const storeTheme = useStore((state) => state.theme);
  const activeTheme = storeTheme === 'system' ? sysTheme : storeTheme;

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  useCardExpiredListener();
  useTradeAnimationListener();

  useEffect(() => {
    const sub = NetInfo.addEventListener((s) =>
      useStore.getState().network.setOnline(Boolean(s.isConnected)),
    );
    return () => sub();
  }, []);

  const tradeAnim = useStore((s) => s.tradeAnim);
  const clearTradeAnim = useStore((s) => s.clearTradeAnim);

  if (!loaded) return null;

  return (
    <ThemeProvider value={activeTheme === 'dark' ? DarkTheme : DefaultTheme}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ErrorBoundary scope="root">
          <OfflineBanner />
          <ToastHost />
          {tradeAnim ? (
            <TradeFlipOverlay payload={tradeAnim} onDone={clearTradeAnim} />
          ) : null}
          <BootGate>
            <BiometricGuard>
              <Stack
                screenOptions={{
                  headerShown: false,
                  animation:
                    Platform.OS === 'ios' ? 'default' : 'slide_from_right',
                  animationDuration: 350,
                }}
              />
            </BiometricGuard>
          </BootGate>
        </ErrorBoundary>
      </GestureHandlerRootView>
    </ThemeProvider>
  );
}

// Sentry.wrap requires Sentry.init to have been called first (done in services/sentry.ts above).
// Guard against any edge-case where wrap returns falsy by falling back to RootLayout directly.
const WrappedLayout = Sentry.wrap(RootLayout);
export default WrappedLayout ?? RootLayout;

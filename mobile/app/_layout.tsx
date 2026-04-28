// Must be first — Sentry must init before React Native bridges and Expo Router mount.
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
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useStore } from '../stores/useStore';
import BiometricGuard from '../components/BiometricGuard';
import BootGate from '../components/BootGate';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { OfflineBanner } from '../components/OfflineBanner';
import { ToastHost } from '../components/Toast';

SplashScreen.preventAutoHideAsync();

function RootLayout() {
  const [loaded] = useFonts({
    Manrope: Manrope_400Regular,
    'Manrope-Medium': Manrope_500Medium,
    'Manrope-SemiBold': Manrope_600SemiBold,
    'Manrope-Bold': Manrope_700Bold,
    'Manrope-ExtraBold': Manrope_800ExtraBold,
  });

  const sysTheme = useColorScheme();
  const storeTheme = useStore((state) => state.theme);
  const activeTheme = storeTheme === 'system' ? sysTheme : storeTheme;

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  // Plan 04-01 D-12 — wire NetInfo into useStore.network so OfflineBanner mounts
  // and ActionButton disables on connectivity loss.
  useEffect(() => {
    const sub = NetInfo.addEventListener((s) =>
      useStore.getState().network.setOnline(Boolean(s.isConnected)),
    );
    return () => sub();
  }, []);

  if (!loaded) return null;

  return (
    <ThemeProvider value={activeTheme === 'dark' ? DarkTheme : DefaultTheme}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ErrorBoundary scope="root">
          <OfflineBanner />
          <ToastHost />
          <BootGate>
            <BiometricGuard>
              <Stack screenOptions={{ headerShown: false }} />
            </BiometricGuard>
          </BootGate>
        </ErrorBoundary>
      </GestureHandlerRootView>
    </ThemeProvider>
  );
}

export default Sentry.wrap(RootLayout);

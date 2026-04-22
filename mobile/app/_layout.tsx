import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import {
  useFonts, Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { Stack, router, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { useColorScheme, Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { io } from 'socket.io-client';
import { useStore } from '../stores/useStore';
import { useThemeColor } from '../hooks/useThemeColor';
import BiometricGuard from '../components/BiometricGuard';

SplashScreen.preventAutoHideAsync();

function InitialLayout() {
  const { token, loadToken, theme, loadAccounts, loadTransactions, loadNotifications } = useStore();
  const [isReady, setIsReady] = useState(false);
  const segments = useSegments();

  useEffect(() => {
    const init = async () => {
      await loadToken();
      setIsReady(true);
    };
    init();
  }, [loadToken]);

  // WebSocket Connection
  useEffect(() => {
    if (!token) return;

    const socket = io('http://localhost:3000', {
      auth: { token },
    });

    socket.on('connect', () => {
      console.log('Mobile App connected to WebSocket');
    });

    socket.on('balance_updated', () => {
      loadAccounts();
    });

    socket.on('transaction_adjusted', () => {
      loadTransactions();
    });

    socket.on('notification_broadcast', (payload) => {
      loadNotifications();
      Alert.alert(payload.title, payload.body);
    });

    return () => {
      socket.disconnect();
    };
  }, [token]);


  useEffect(() => {
    if (!isReady) return;

    const inTabsGroup = segments[0] === '(tabs)';
    
    // Auth & Onboard Guard
    SecureStore.getItemAsync('onboarded')
      .catch(() => null)
      .then(onboarded => {
         if (!onboarded) {
            router.replace('/onboarding');
         } else if (!token && inTabsGroup) {
            router.replace('/login');
         } else if (token && !inTabsGroup) {
            router.replace('/(tabs)');
         }
      });

  }, [token, isReady, segments]);

  if (!isReady) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
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

  if (!loaded) return null;

  return (
    <ThemeProvider value={activeTheme === 'dark' ? DarkTheme : DefaultTheme}>
      <BiometricGuard>
        <InitialLayout />
      </BiometricGuard>
    </ThemeProvider>
  );
}

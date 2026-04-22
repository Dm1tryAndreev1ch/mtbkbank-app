import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import {
  useFonts,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { Stack, router, useSegments, useRootNavigationState } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { useColorScheme, Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { io } from 'socket.io-client';
import { useStore } from '../stores/useStore';
import { useThemeColor } from '../hooks/useThemeColor';
import BiometricGuard from '../components/BiometricGuard';

SplashScreen.preventAutoHideAsync();

function AuthGuard() {
  const { token, loadToken } = useStore();
  // Три состояния: null = не загружено, true/false = результат
  const [tokenReady, setTokenReady] = useState<boolean | null>(null);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const segments = useSegments();
  const navigationState = useRootNavigationState();
  const socketRef = useRef<any>(null);
  const hasRedirected = useRef(false);

  // 1. Загрузить токен и флаг onboarded параллельно
  useEffect(() => {
    Promise.all([
      loadToken(),
      SecureStore.getItemAsync('onboarded').catch(() => null),
    ]).then(([hasToken, ob]) => {
      setTokenReady(hasToken);
      setOnboarded(!!ob);
    });
  }, []);

  // 2. WebSocket после получения токена
  useEffect(() => {
    if (!token) return;
    const { loadAccounts, loadTransactions, loadNotifications } = useStore.getState();
    socketRef.current = io('http://localhost:3000', { auth: { token } });
    socketRef.current.on('balance_updated', () => loadAccounts());
    socketRef.current.on('transaction_adjusted', () => loadTransactions());
    socketRef.current.on('notification_broadcast', (p: any) => {
      loadNotifications();
      Alert.alert(p.title, p.body);
    });
    return () => socketRef.current?.disconnect();
  }, [token]);

  // 3. Редирект только когда:
  //    - навигатор готов
  //    - tokenReady и onboarded загружены
  //    - редирект ещё не был сделан
  useEffect(() => {
    if (!navigationState?.key) return;
    if (tokenReady === null || onboarded === null) return;
    if (hasRedirected.current) return;

    hasRedirected.current = true;

    if (!onboarded) {
      router.replace('/onboarding');
    } else if (!token) {
      router.replace('/login');
    } else {
      router.replace('/(tabs)');
    }
  }, [navigationState?.key, tokenReady, onboarded]);

  // Сброс редирект-гарда при логауте
  useEffect(() => {
    if (tokenReady !== null && !token && segments[0] !== '(tabs)') {
      hasRedirected.current = false;
    }
  }, [token]);

  return null;
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
        <AuthGuard />
        <Stack screenOptions={{ headerShown: false }} />
      </BiometricGuard>
    </ThemeProvider>
  );
}

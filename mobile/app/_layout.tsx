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
  const { token, loadToken, loadAccounts, loadTransactions, loadNotifications } = useStore();
  const [isReady, setIsReady] = useState(false);
  const segments = useSegments();
  // Нужно дождаться пока навигатор монтируется
  const navigationState = useRootNavigationState();
  const socketRef = useRef<any>(null);

  useEffect(() => {
    loadToken().then(() => setIsReady(true));
  }, []);

  // WebSocket
  useEffect(() => {
    if (!token) return;
    socketRef.current = io('http://localhost:3000', { auth: { token } });
    socketRef.current.on('balance_updated', () => loadAccounts());
    socketRef.current.on('transaction_adjusted', () => loadTransactions());
    socketRef.current.on('notification_broadcast', (p: any) => {
      loadNotifications();
      Alert.alert(p.title, p.body);
    });
    return () => socketRef.current?.disconnect();
  }, [token]);

  // Auth redirect - запускаем только когда навигатор готов И данные загружены
  useEffect(() => {
    if (!isReady || !navigationState?.key) return;

    const inAuthScreen = segments[0] === 'onboarding' || segments[0] === 'login';
    const inTabsGroup = segments[0] === '(tabs)';

    SecureStore.getItemAsync('onboarded')
      .catch(() => null)
      .then(onboarded => {
        if (!onboarded) {
          if (segments[0] !== 'onboarding') router.replace('/onboarding');
        } else if (!token) {
          if (!inAuthScreen) router.replace('/login');
        } else {
          // Токен есть - направляем в (tabs) только если мы на экране auth
          if (inAuthScreen) router.replace('/(tabs)');
        }
      });
  }, [isReady, navigationState?.key, token, segments[0]]);

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
        {/* Аутентификация в отдельном компоненте чтобы не блокировать рендер Stack */}
        <AuthGuard />
        {/*
          Expo Router v3: Stack без явных Stack.Screen.
          Все файлы в app/ обнаруживаются автоматически.
          Явная регистрация нужна только для кастомных опций (animation, presentation).
        */}
        <Stack screenOptions={{ headerShown: false }} />
      </BiometricGuard>
    </ThemeProvider>
  );
}

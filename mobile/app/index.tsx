import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useStore } from '../stores/useStore';
import { Colors } from '../constants/theme';

/**
 * Главная точка входа - решает куда направить пользователя:
 * 1. Не прошёл onboarding → /onboarding
 * 2. Есть токен → загрузить данные → /(tabs)
 * 3. Нет токена → /login
 */
export default function Index() {
  const { loadToken, loadAll } = useStore();

  useEffect(() => {
    async function bootstrap() {
      try {
        const onboarded = await SecureStore.getItemAsync('onboarded');
        if (!onboarded) {
          router.replace('/onboarding');
          return;
        }

        const hasToken = await loadToken();
        if (hasToken) {
          loadAll(); // фоновая загрузка
          router.replace('/(tabs)');
        } else {
          router.replace('/login');
        }
      } catch {
        router.replace('/login');
      }
    }
    bootstrap();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  );
}

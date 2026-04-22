import { useColorScheme } from 'react-native';
import { LightColors, DarkColors } from '../constants/theme';
import { useStore } from '../stores/useStore';

export function useThemeColor() {
  const theme = useStore((state) => state.theme);
  const systemColorScheme = useColorScheme();

  const colorScheme = theme === 'system' ? systemColorScheme : theme;
  
  return colorScheme === 'dark' ? DarkColors : LightColors;
}

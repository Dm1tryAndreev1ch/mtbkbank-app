export const LightColors = {
  primary: '#4F8EF7',
  primaryDark: '#1E40AF',
  primaryContainer: '#d7e2ff',
  onPrimary: '#ffffff',
  onPrimaryContainer: '#001a41',
  primaryFixed: '#d7e2ff',
  primaryFixedDim: '#acc7ff',

  secondary: '#755b00',
  secondaryContainer: '#ffe08f',
  onSecondary: '#ffffff',
  onSecondaryContainer: '#241a00',
  secondaryFixed: '#ffe08f',
  secondaryFixedDim: '#eec13c',

  tertiary: '#894e00',
  tertiaryContainer: '#ffdcbf',
  onTertiary: '#ffffff',
  tertiaryFixed: '#ffdcbf',

  error: '#ba1a1a',
  errorContainer: '#ffdad6',

  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceContainerLowest: '#FFFFFF',
  surfaceContainerLow: '#F8FAFC',
  surfaceContainer: '#F1F5F9',
  surfaceContainerHigh: '#E2E8F0',
  surfaceContainerHighest: '#CBD4E1',
  surfaceVariant: '#E2E8F0',
  surfaceDim: '#CBD4E1',

  onSurface: '#0F172A',
  onSurfaceVariant: '#475569',
  onBackground: '#0F172A',

  outline: '#94A3B8',
  outlineVariant: '#CBD4E1',
  transparentBorder: 'rgba(0,0,0,0.06)',

  inverseSurface: '#334155',
  inverseOnSurface: '#F8FAFC',
  inversePrimary: '#acc7ff',

  rarityCommon: '#9ca3af',
  rarityRare: '#4F8EF7',
  rarityEpic: '#9333EA',
  rarityLegendary: '#fdcf49',

  cardGradientStart: '#4F8EF7',
  cardGradientEnd: '#2c72d9',
};

export const DarkColors = {
  primary: '#4F8EF7',
  primaryDark: '#1E40AF',
  primaryContainer: '#2c72d9',
  onPrimary: '#ffffff',
  onPrimaryContainer: '#fefcff',
  primaryFixed: '#d7e2ff',
  primaryFixedDim: '#acc7ff',

  secondary: '#755b00',
  secondaryContainer: '#fdcf49',
  onSecondary: '#ffffff',
  onSecondaryContainer: '#715800',
  secondaryFixed: '#ffe08f',
  secondaryFixedDim: '#eec13c',

  tertiary: '#894e00',
  tertiaryContainer: '#ac6300',
  onTertiary: '#ffffff',
  tertiaryFixed: '#ffdcbf',

  error: '#ffb4ab',
  errorContainer: '#93000a',

  background: '#131313',
  surface: '#1f1f1f',
  surfaceContainerLowest: '#131313',
  surfaceContainerLow: '#1A1A1A',
  surfaceContainer: '#1f1f1f',
  surfaceContainerHigh: '#2a2a2a',
  surfaceContainerHighest: '#333333',
  surfaceVariant: '#2a2a2a',
  surfaceDim: '#1f1f1f',

  onSurface: '#ffffff',
  onSurfaceVariant: '#a3a6af',
  onBackground: '#ffffff',

  outline: '#424753',
  outlineVariant: '#cbd4e1',
  transparentBorder: 'rgba(255,255,255,0.05)',

  inverseSurface: '#e2e2e5',
  inverseOnSurface: '#2f3033',
  inversePrimary: '#0059ba',

  rarityCommon: '#9ca3af',
  rarityRare: '#4F8EF7',
  rarityEpic: '#9333EA',
  rarityLegendary: '#fdcf49',

  cardGradientStart: '#4F8EF7',
  cardGradientEnd: '#2c72d9',
};

// Fallback legacy export to prevent immediate crashes before full refactor completes
export const Colors = DarkColors;

export const Fonts = {
  family: 'Manrope',
  sizes: {
    xs: 10, sm: 12, md: 14, base: 16, lg: 18, xl: 20, '2xl': 24, '3xl': 30, '4xl': 36, display: 44,
  },
  weights: {
    regular: '400' as const, medium: '500' as const, semibold: '600' as const, bold: '700' as const, extrabold: '800' as const,
  },
};

export const Spacing = { xs: 4, sm: 8, md: 12, base: 16, lg: 20, xl: 24, '2xl': 32, '3xl': 40, '4xl': 48 };

export const BorderRadius = { sm: 8, md: 12, base: 16, lg: 24, xl: 32, full: 9999 };

export const Shadows = {
  sm: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  md: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.06, shadowRadius: 20, elevation: 4 },
  lg: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.06, shadowRadius: 40, elevation: 8 },
  xl: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 30 }, shadowOpacity: 0.10, shadowRadius: 60, elevation: 12 },
  primary: { shadowColor: '#4F8EF7', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.3, shadowRadius: 24, elevation: 8 },
};

export const getRarityColor = (rarity: string) => {
  switch (rarity) {
    case 'COMMON': return DarkColors.rarityCommon;
    case 'RARE': return DarkColors.rarityRare;
    case 'EPIC': return DarkColors.rarityEpic;
    case 'LEGENDARY': return DarkColors.rarityLegendary;
    default: return DarkColors.rarityCommon;
  }
};

export const getRarityName = (rarity: string) => {
  switch (rarity) {
    case 'COMMON': return 'Обычная';
    case 'RARE': return 'Редкая';
    case 'EPIC': return 'Эпическая';
    case 'LEGENDARY': return 'Легендарная';
    default: return rarity;
  }
};

export const formatMoney = (amount: number, currency = 'Br') => {
  return `${amount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
};

export const formatNumber = (n: number) => {
  return n.toLocaleString('ru-RU');
};

/**
 * Normalizes MaterialIcons icon names from API responses.
 * Converts snake_case (e.g. "shopping_bag") to kebab-case (e.g. "shopping-bag")
 * as required by @expo/vector-icons MaterialIcons.
 */
export const toMaterialIconName = (icon?: string): string =>
  icon?.replace(/_/g, '-') ?? 'category';

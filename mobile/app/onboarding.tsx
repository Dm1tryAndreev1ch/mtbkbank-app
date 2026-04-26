import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeColor } from '../hooks/useThemeColor';
import { Spacing, BorderRadius } from '../constants/theme';
import { setOnboarded } from '../services/secureStorageUiPrefs';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    id: '1',
    title: 'Твои Финансы — Это Игра',
    desc: 'Каждая твоя покупка в любимых категориях имеет шанс выбить коллекционную карточку бренда.',
    icon: 'sports-esports'
  },
  {
    id: '2',
    title: 'Собирай Колоды',
    desc: 'Объединяй 4 карты в боевую Составную Колоду, чтобы активировать постоянный кэшбэк на счет.',
    icon: 'style'
  },
  {
    id: '3',
    title: 'Следи за Здоровьем',
    desc: 'Карты со временем теряют здоровье. Бросай ненужные карты в жертву, чтобы спасти самые редкие.',
    icon: 'local-hospital'
  }
];

export default function OnboardingScreen() {
  const colors = useThemeColor();
  const scrollX = useRef(new Animated.Value(0)).current;
  const [currentIndex, setCurrentIndex] = useState(0);

  const handleNext = async () => {
    if (currentIndex < SLIDES.length - 1) {
      setCurrentIndex(c => c + 1);
    } else {
      await setOnboarded(true);
      router.replace('/(tabs)');
    }
  };

  const handleSkip = async () => {
    await setOnboarded(true);
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <Animated.FlatList
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false })}
        onMomentumScrollEnd={(e) => {
           setCurrentIndex(Math.round(e.nativeEvent.contentOffset.x / width));
        }}
        renderItem={({ item }) => (
          <View style={{ width, alignItems: 'center', padding: Spacing.xl, paddingTop: 100 }}>
             <View style={{ width: 160, height: 160, borderRadius: 80, backgroundColor: colors.surfaceVariant, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.xl }}>
               <MaterialIcons name={item.icon as any} size={84} color={colors.primary} />
             </View>
             <Text style={{ fontSize: 24, fontFamily: 'Manrope-ExtraBold', color: colors.onBackground, textAlign: 'center', marginBottom: Spacing.md }}>
               {item.title}
             </Text>
             <Text style={{ fontSize: 16, fontFamily: 'Manrope-Medium', color: colors.onSurfaceVariant, textAlign: 'center' }}>
               {item.desc}
             </Text>
          </View>
        )}
      />

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.xl }}>
         <TouchableOpacity onPress={handleSkip}>
            <Text style={{ color: colors.outlineVariant, fontFamily: 'Manrope-Bold' }}>ПРОПУСТИТЬ</Text>
         </TouchableOpacity>

         <View style={{ flexDirection: 'row', gap: 8 }}>
            {SLIDES.map((_, i) => (
              <View key={i} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: currentIndex === i ? colors.primary : colors.surfaceVariant }} />
            ))}
         </View>

         <TouchableOpacity onPress={handleNext} style={{ backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: BorderRadius.full }}>
            <Text style={{ color: '#fff', fontFamily: 'Manrope-Bold' }}>{currentIndex === SLIDES.length - 1 ? 'НАЧАТЬ' : 'ДАЛЕЕ'}</Text>
         </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

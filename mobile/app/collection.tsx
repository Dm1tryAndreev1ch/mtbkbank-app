import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useStore } from '../stores/useStore';
import { useThemeColor } from '../hooks/useThemeColor';
import { Fonts, Spacing, BorderRadius, Shadows, getRarityName } from '../constants/theme';
import * as api from '../services/api';

export default function CollectionScreen() {
  const { cards } = useStore();
  const colors = useThemeColor();
  const s = useMemo(() => mk(colors), [colors]);

  const [collection, setCollection] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCollection = async () => {
      try {
        const res = await api.getCollection();
        setCollection(res.data);
      } catch (e) {
      } finally {
        setLoading(false);
      }
    };
    fetchCollection();
  }, []);

  const getRarityColor = (r: string) => {
    switch (r) {
      case 'COMMON': return colors.rarityCommon;
      case 'RARE': return colors.rarityRare;
      case 'EPIC': return colors.rarityEpic;
      case 'LEGENDARY': return colors.rarityLegendary;
      default: return colors.rarityCommon;
    }
  };

  const inventoryDb = useMemo(() => {
    const set = new Set();
    cards.forEach((c: any) => set.add(c.collectionCard.id));
    return set;
  }, [cards]);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.onSurface} />
        </TouchableOpacity>
        <View style={s.headerText}>
          <Text style={s.headerTitle}>Коллекция</Text>
          <Text style={s.headerSubtitle}>
            {inventoryDb.size} / {collection.length} найдено
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={s.loader}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : collection.length === 0 ? (
        <View style={s.emptyState}>
          <MaterialIcons name="style" size={48} color={colors.outlineVariant} />
          <Text style={s.emptyTitle}>Коллекция пуста</Text>
          <Text style={s.emptySubtitle}>Здесь будут отображаться ваши карты</Text>
        </View>
      ) : (
        <FlatList
          data={collection}
          numColumns={2}
          columnWrapperStyle={s.columnWrapper}
          contentContainerStyle={s.listContent}
          keyExtractor={item => item.id}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const owned = inventoryDb.has(item.id);
            const rarityColor = getRarityColor(item.rarity);

            return (
              <View
                style={[
                  s.card,
                  owned
                    ? { backgroundColor: colors.surfaceContainerLowest }
                    : { backgroundColor: colors.surfaceVariant, opacity: 0.5, borderColor: colors.transparentBorder },
                ]}
              >
                <View
                  style={[
                    s.rarityBadge,
                    { backgroundColor: owned ? rarityColor : colors.outlineVariant },
                  ]}
                >
                  <Text style={s.rarityText}>
                    {owned ? getRarityName(item.rarity).toUpperCase() : '???'}
                  </Text>
                </View>

                <View style={s.iconWrap}>
                  <MaterialIcons
                    name={owned ? (item.brandIcon as any) : 'help-outline'}
                    size={48}
                    color={owned ? rarityColor : colors.outlineVariant}
                  />
                </View>

                <Text style={[s.cardName, { color: owned ? colors.onBackground : colors.outlineVariant }]}>
                  {owned ? item.name : 'Неизвестно'}
                </Text>

                <Text style={s.cardBrand}>
                  {owned ? item.brandName : '???'}
                </Text>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const mk = (C: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: C.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: C.transparentBorder,
    },
    backBtn: {
      padding: 8,
      marginRight: Spacing.sm,
    },
    headerText: {
      flex: 1,
    },
    headerTitle: {
      fontSize: Fonts.sizes.xl,
      fontFamily: 'Manrope-ExtraBold',
      color: C.onBackground,
    },
    headerSubtitle: {
      fontSize: Fonts.sizes.sm,
      fontFamily: 'Manrope-Medium',
      color: C.onSurfaceVariant,
      marginTop: 2,
    },
    loader: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Spacing['2xl'],
    },
    emptyTitle: {
      fontSize: Fonts.sizes.base,
      fontFamily: 'Manrope-Bold',
      color: C.onSurface,
      marginTop: Spacing.base,
    },
    emptySubtitle: {
      fontSize: Fonts.sizes.sm,
      fontFamily: 'Manrope-Medium',
      color: C.onSurfaceVariant,
      marginTop: Spacing.xs,
      textAlign: 'center',
    },
    listContent: {
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.base,
      paddingBottom: Spacing['4xl'],
    },
    columnWrapper: {
      justifyContent: 'space-between',
    },
    card: {
      width: '48%',
      aspectRatio: 0.7,
      borderRadius: BorderRadius.lg,
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.05)',
      alignItems: 'center',
      padding: Spacing.md,
      marginBottom: Spacing.md,
      ...Shadows.md,
    },
    rarityBadge: {
      position: 'absolute',
      top: 12,
      left: 12,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: BorderRadius.full,
    },
    rarityText: {
      fontSize: Fonts.sizes.xs,
      fontFamily: 'Manrope-ExtraBold',
      color: '#131313',
      letterSpacing: 1,
    },
    iconWrap: {
      marginVertical: Spacing.md,
      marginTop: Spacing['2xl'],
    },
    cardName: {
      fontSize: Fonts.sizes.md,
      fontFamily: 'Manrope-Bold',
      textAlign: 'center',
    },
    cardBrand: {
      fontSize: Fonts.sizes.xs,
      fontFamily: 'Manrope-Medium',
      color: '#9ca3af',
      marginTop: 4,
    },
  });

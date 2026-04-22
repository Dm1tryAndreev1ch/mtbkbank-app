import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useStore } from '../stores/useStore';
import { useThemeColor } from '../hooks/useThemeColor';
import { Colors, Spacing, BorderRadius, Shadows, getRarityName } from '../constants/theme';
import * as api from '../services/api';

export default function CollectionScreen() {
  const { cards } = useStore();
  const colors = useThemeColor();
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

  const getRarityCol = (r: string) => {
    switch (r) {
      case 'COMMON': return colors.rarityCommon;
      case 'RARE': return colors.rarityRare;
      case 'EPIC': return colors.rarityEpic;
      case 'LEGENDARY': return colors.rarityLegendary;
      default: return colors.rarityCommon;
    }
  };

  // Map user's collected cards to see if they own it
  const inventoryDb = useMemo(() => {
     const set = new Set();
     cards.forEach(c => set.add(c.collectionCard.id));
     return set;
  }, [cards]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: Spacing.lg, paddingTop: 60 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: Spacing.md }}>
          <MaterialIcons name="arrow-back" size={28} color={colors.onBackground} />
        </TouchableOpacity>
        <View>
           <Text style={{ fontSize: 24, fontFamily: 'Manrope-ExtraBold', color: colors.onBackground }}>Коллекция</Text>
           <Text style={{ fontSize: 12, fontFamily: 'Manrope-Medium', color: colors.onSurfaceVariant }}>{inventoryDb.size} / {collection.length} найдено</Text>
        </View>
      </View>

      {loading ? (
         <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={colors.primary} /></View>
      ) : (
         <FlatList
            data={collection}
            numColumns={2}
            columnWrapperStyle={{ paddingHorizontal: Spacing.md, justifyContent: 'space-between' }}
            keyExtractor={item => item.id}
            renderItem={({ item }) => {
               const owned = inventoryDb.has(item.id);
               const rarityColor = getRarityCol(item.rarity);

               return (
                  <View style={[
                     styles.card,
                     { backgroundColor: owned ? colors.surfaceContainerLowest : colors.surfaceVariant },
                     !owned && { opacity: 0.5, borderColor: colors.transparentBorder }
                  ]}>
                     <View style={[styles.cardHeader, { backgroundColor: owned ? rarityColor : colors.outlineVariant }]}>
                        <Text style={{ fontSize: 10, fontFamily: 'Manrope-ExtraBold', color: '#131313', letterSpacing: 1 }}>
                           {owned ? getRarityName(item.rarity) : '???'}
                        </Text>
                     </View>

                     <View style={{ marginVertical: Spacing.md }}>
                        <MaterialIcons 
                           name={owned ? (item.brandIcon as any) : 'help-outline'} 
                           size={48} 
                           color={owned ? rarityColor : colors.outlineVariant} 
                        />
                     </View>

                     <Text style={{ fontSize: 14, fontFamily: 'Manrope-Bold', color: owned ? colors.onBackground : colors.outlineVariant, textAlign: 'center' }}>
                        {owned ? item.name : 'Неизвестно'}
                     </Text>
                     
                     <Text style={{ fontSize: 10, fontFamily: 'Manrope-Medium', color: colors.onSurfaceVariant, marginTop: 4 }}>
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

const styles = StyleSheet.create({
  card: {
     width: '48%',
     aspectRatio: 0.7,
     borderRadius: BorderRadius.lg,
     borderWidth: 2,
     borderColor: 'rgba(255,255,255,0.05)',
     alignItems: 'center',
     padding: Spacing.md,
     marginBottom: Spacing.md,
     ...Shadows.md
  },
  cardHeader: {
     position: 'absolute',
     top: 12, left: 12,
     paddingHorizontal: 8, paddingVertical: 2,
     borderRadius: BorderRadius.full
  }
});

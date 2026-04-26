import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Image, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useStore } from '../stores/useStore';
import { useThemeColor } from '../hooks/useThemeColor';
import { Fonts, Spacing, BorderRadius, Shadows, formatMoney, getRarityName } from '../constants/theme';
import * as api from '../services/api';

export default function TradeScreen() {
  const { cards, loadCards } = useStore();
  const colors = useThemeColor();
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  
  const [selectedMyCard, setSelectedMyCard] = useState<any>(null);
  const [isTrading, setIsTrading] = useState(false);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  useEffect(() => {
    // SEC-09 / 03-12: backend now requires q.length >= 10 (Zod min(10)).
    if (searchQuery.length < 10) {
      setUsers([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.searchUsers(searchQuery);
        // SEC-09: response is now { items, total, page, limit }
        setUsers(Array.isArray(res.data) ? res.data : (res.data?.items ?? []));
      } catch (e) {
        setUsers([]);
      } finally {
        setSearching(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSendTrade = async () => {
    if (!selectedUser || !selectedMyCard) return;
    setIsTrading(true);
    try {
      await api.createTrade({
        toUserId: selectedUser.id,
        offeredCardId: selectedMyCard.id,
        mbPointsOffer: 0 // Optional MB Points
      });
      Alert.alert('Успех', 'Трейд успешно предложен!');
      router.back();
    } catch (e: any) {
      Alert.alert('Ошибка', e.response?.data?.error || 'Сетевая ошибка');
    } finally {
      setIsTrading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: Spacing.lg, paddingTop: 60 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: Spacing.md }}>
          <MaterialIcons name="arrow-back" size={28} color={colors.onBackground} />
        </TouchableOpacity>
        <Text style={{ fontSize: 24, fontFamily: 'Manrope-ExtraBold', color: colors.onBackground }}>Создать трейд</Text>
      </View>

      <View style={{ flex: 1, paddingHorizontal: Spacing.lg }}>
        
        {/* Step 1: User Search */}
        {!selectedUser ? (
          <View style={{ flex: 1 }}>
             <Text style={{ fontSize: 16, fontFamily: 'Manrope-Bold', color: colors.onSurface, marginBottom: 12 }}>
                1. Выберите получателя
             </Text>
             <View style={{
                flexDirection: 'row', alignItems: 'center',
                backgroundColor: colors.surfaceContainerLowest,
                borderRadius: BorderRadius.lg,
                paddingHorizontal: Spacing.md,
                height: 56,
                borderWidth: 1, borderColor: colors.transparentBorder
             }}>
                <MaterialIcons name="search" size={24} color={colors.outlineVariant} />
                <TextInput
                  placeholder="Имя получателя (минимум 10 символов)"
                  placeholderTextColor={colors.outlineVariant}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  style={{ flex: 1, color: colors.onSurface, fontFamily: 'Manrope-Medium', fontSize: 16, marginLeft: 12 }}
                />
             </View>

             <View style={{ flex: 1, marginTop: Spacing.md }}>
               {searching ? <ActivityIndicator color={colors.primary} /> : (
                 <FlatList
                   data={users}
                   keyExtractor={i => i.id}
                   renderItem={({item}) => (
                      <TouchableOpacity 
                         onPress={() => setSelectedUser(item)}
                         style={{
                           flexDirection: 'row', alignItems: 'center', padding: Spacing.md,
                           backgroundColor: colors.surfaceVariant, borderRadius: BorderRadius.md,
                           marginBottom: 8
                         }}>
                         <MaterialIcons name="person" size={24} color={colors.primary} />
                         <View style={{ marginLeft: 12 }}>
                           <Text style={{ color: colors.onSurface, fontFamily: 'Manrope-Bold' }}>{item.name}</Text>
                           {/* SEC-09 / 03-12: phone removed from /users/search response payload */}
                           {item.status ? (
                             <Text style={{ color: colors.onSurfaceVariant, fontSize: 12 }}>{item.status}</Text>
                           ) : null}
                         </View>
                      </TouchableOpacity>
                   )}
                 />
               )}
             </View>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
             <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.lg }}>
                <View>
                  <Text style={{ color: colors.outlineVariant, fontSize: 12 }}>Трейд с:</Text>
                  <Text style={{ color: colors.primary, fontFamily: 'Manrope-Bold', fontSize: 18 }}>{selectedUser.name}</Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedUser(null)}>
                   <MaterialIcons name="close" size={24} color={colors.error} />
                </TouchableOpacity>
             </View>

             <Text style={{ fontSize: 16, fontFamily: 'Manrope-Bold', color: colors.onSurface, marginBottom: 12 }}>
                2. Выберите карту
             </Text>
             
             <FlatList
               data={cards.filter(c => c.health > 0)}
               horizontal
               showsHorizontalScrollIndicator={false}
               renderItem={({item}) => (
                  <TouchableOpacity 
                     onPress={() => setSelectedMyCard(item)}
                     style={{
                       width: 140, height: 200,
                       backgroundColor: selectedMyCard?.id === item.id ? colors.primary : colors.surfaceVariant,
                       borderRadius: BorderRadius.lg, marginRight: Spacing.md,
                       padding: Spacing.md, alignItems: 'center', justifyContent: 'center',
                       borderWidth: selectedMyCard?.id === item.id ? 2 : 1,
                       borderColor: selectedMyCard?.id === item.id ? '#fff' : colors.transparentBorder
                     }}>
                     <MaterialIcons name={item.collectionCard.brandIcon as any} size={40} color={selectedMyCard?.id === item.id ? '#fff' : colors.primary} />
                     <Text style={{ color: selectedMyCard?.id === item.id ? '#fff' : colors.onSurface, textAlign: 'center', fontFamily: 'Manrope-Bold', marginTop: 8 }}>
                       {item.collectionCard.name}
                     </Text>
                  </TouchableOpacity>
               )}
             />

             <TouchableOpacity 
                disabled={!selectedMyCard || isTrading}
                onPress={handleSendTrade}
                style={{
                  height: 56, borderRadius: BorderRadius.full,
                  backgroundColor: !selectedMyCard ? colors.surfaceVariant : colors.primary,
                  alignItems: 'center', justifyContent: 'center',
                  marginTop: 'auto', marginBottom: Spacing.xl
                }}>
                {isTrading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: !selectedMyCard ? colors.outlineVariant : '#fff', fontFamily: 'Manrope-Bold', fontSize: 16 }}>Предложить трейд</Text>}
             </TouchableOpacity>

          </View>
        )}

      </View>
    </SafeAreaView>
  );
}

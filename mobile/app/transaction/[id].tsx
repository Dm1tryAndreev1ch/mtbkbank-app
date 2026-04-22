import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack, router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { useStore } from '../../stores/useStore';
import { useThemeColor } from '../../hooks/useThemeColor';
import { Colors, Spacing, BorderRadius, formatMoney } from '../../constants/theme';
import * as api from '../../services/api';

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams();
  const colors = useThemeColor();
  const [tx, setTx] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const viewShotRef = useRef<any>(null);

  useEffect(() => {
    const fetchTx = async () => {
      try {
        const res = await api.getTransactions();
        const found = res.data.transactions.find((t: any) => t.id === id);
        if (found) setTx(found);
      } catch (e) {} finally { setLoading(false); }
    };
    fetchTx();
  }, [id]);

  const handleShare = async () => {
    if (!viewShotRef.current) return;
    try {
      const uri = await viewShotRef.current.capture();
      await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', dialogTitle: 'Поделиться чеком MT-Bank' });
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) return <View style={{ flex:1, backgroundColor: colors.background, justifyContent:'center' }}><ActivityIndicator /></View>;
  if (!tx) return <View style={{ flex:1, backgroundColor: colors.background, justifyContent:'center' }}><Text style={{color:colors.error, textAlign:'center'}}>Транзакция не найдена</Text></View>;

  const isExpense = tx.type === 'PAYMENT' || tx.type === 'TRANSFER' && tx.amount < 0;
  const isDrop = tx.droppedCardId != null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent:'space-between', padding: Spacing.lg, paddingTop: 60 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <MaterialIcons name="close" size={28} color={colors.onBackground} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontFamily: 'Manrope-Bold', color: colors.onBackground }}>Чек операции</Text>
        <TouchableOpacity onPress={handleShare}>
           <MaterialIcons name="ios-share" size={28} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1, padding: Spacing.lg, alignItems: 'center' }}>
        <ViewShot ref={viewShotRef} options={{ format: 'jpg', quality: 0.9 }} style={{ width: '100%', backgroundColor: colors.background }}>
           
           <View style={[styles.receipt, { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.transparentBorder }]}>
              
              <View style={[styles.iconWrap, { backgroundColor: colors.surfaceVariant }]}>
                 <MaterialIcons name={tx.categoryIcon || 'payment'} size={32} color={colors.primary} />
              </View>

              <Text style={{ color: colors.onSurface, fontSize: 32, fontFamily: 'Manrope-ExtraBold', marginVertical: Spacing.md }}>
                 {isExpense ? '-' : '+'}{formatMoney(Math.abs(tx.amount))}
              </Text>

              <Text style={{ color: colors.onSurfaceVariant, fontSize: 16, fontFamily: 'Manrope-Medium' }}>
                 {tx.merchantName || 'Перевод'}
              </Text>

              <View style={[styles.divider, { backgroundColor: colors.transparentBorder }]} />

              <View style={styles.row}>
                 <Text style={{ color: colors.outlineVariant, fontFamily: 'Manrope-Medium' }}>Дата и время</Text>
                 <Text style={{ color: colors.onSurface, fontFamily: 'Manrope-Bold' }}>{new Date(tx.createdAt).toLocaleString('ru-RU')}</Text>
              </View>
              <View style={styles.row}>
                 <Text style={{ color: colors.outlineVariant, fontFamily: 'Manrope-Medium' }}>Статус</Text>
                 <Text style={{ color: colors.rarityCommon, fontFamily: 'Manrope-Bold' }}>Успешно</Text>
              </View>

              {isDrop && (
                 <View style={{ marginTop: Spacing.xl, padding: Spacing.md, backgroundColor: colors.surfaceVariant, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: colors.rarityEpic }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                       <MaterialIcons name="auto-awesome" size={20} color={colors.rarityEpic} />
                       <Text style={{ color: colors.rarityEpic, fontFamily: 'Manrope-Bold', marginLeft: 8 }}>Карта Выпала!</Text>
                    </View>
                    <Text style={{ color: colors.onSurfaceVariant, fontSize: 12, marginTop: 4 }}>
                       В этой транзакции вы получили коллекционную карту. Перейдите в инвентарь!
                    </Text>
                 </View>
              )}
           </View>

        </ViewShot>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  receipt: {
     width: '100%',
     borderRadius: BorderRadius.xl,
     borderWidth: 1,
     padding: Spacing.xl,
     alignItems: 'center'
  },
  iconWrap: {
     width: 64, height: 64,
     borderRadius: 32,
     alignItems: 'center', justifyContent: 'center',
     marginBottom: Spacing.sm
  },
  divider: {
     width: '100%',
     height: 1,
     borderStyle: 'dashed',
     marginVertical: Spacing.xl
  },
  row: {
     width: '100%',
     flexDirection: 'row',
     justifyContent: 'space-between',
     marginBottom: Spacing.md
  }
});

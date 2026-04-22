import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, Fonts, Spacing } from '../constants/theme';

export default function TransferScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={Colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>Перевод средств</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={styles.content}>
        <MaterialIcons name="swap-horiz" size={80} color={Colors.primary} />
        <Text style={styles.text}>Введите номер карты или телефона получателя для совершения перевода.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  backBtn: { padding: 8 },
  title: { fontSize: Fonts.sizes.lg, fontWeight: Fonts.weights.bold, color: Colors.onSurface },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.lg },
  text: { fontSize: Fonts.sizes.md, color: Colors.onSurfaceVariant, textAlign: 'center' },
});

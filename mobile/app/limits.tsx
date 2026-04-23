import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useStore } from '../stores/useStore';
import * as api from '../services/api';
import { Fonts, Spacing, BorderRadius, Shadows } from '../constants/theme';
import { useThemeColor } from '../hooks/useThemeColor';

export default function LimitsScreen() {
  const { limits, loadLimits } = useStore();
  const colors = useThemeColor();
  const s = useMemo(() => mk(colors), [colors]);

  // editingId → local string value being typed
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  useEffect(() => { loadLimits(); }, []);

  const startEdit = (limit: any) => {
    setEditing(prev => ({ ...prev, [limit.id]: String(Math.round(limit.limitAmount)) }));
  };

  const cancelEdit = (id: string) => {
    setEditing(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  const saveLimit = async (limit: any) => {
    const raw = editing[limit.id];
    const val = parseFloat(raw);
    if (!raw || isNaN(val) || val < 0) {
      Alert.alert('Ошибка', 'Введите корректную сумму лимита (0 — без ограничений)');
      return;
    }
    setSaving(prev => ({ ...prev, [limit.id]: true }));
    try {
      await api.updateLimit(limit.id, val);
      await loadLimits();
      cancelEdit(limit.id);
    } catch (err: any) {
      Alert.alert('Ошибка', err?.response?.data?.error || 'Не удалось сохранить лимит');
    } finally {
      setSaving(prev => ({ ...prev, [limit.id]: false }));
    }
  };

  const progress = (limit: any) =>
    limit.limitAmount > 0 ? Math.min(limit.spentAmount / limit.limitAmount, 1) : 0;

  const warn = (limit: any) => progress(limit) > 0.8;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={s.title}>Лимиты трат</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={s.list}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={s.hint}>
            Установите максимальную сумму расходов по каждой категории за месяц.
            Укажите 0 — лимит не применяется.
          </Text>

          {limits.length === 0 && (
            <View style={s.empty}>
              <MaterialIcons name="tune" size={48} color={colors.onSurfaceVariant} />
              <Text style={s.emptyText}>Лимиты не найдены</Text>
            </View>
          )}

          {limits.map((limit: any, i: number) => {
            const isEditing = limit.id in editing;
            const isSaving = saving[limit.id];
            const p = progress(limit);
            const w = warn(limit);
            const barColor = w ? colors.error : colors.primary;

            return (
              <Animated.View
                key={limit.id}
                entering={FadeInDown.delay(i * 60)}
                style={s.card}
              >
                {/* Top row: category + edit/save buttons */}
                <View style={s.cardTop}>
                  <Text style={s.category}>{limit.category}</Text>
                  {isEditing ? (
                    <View style={s.actions}>
                      <TouchableOpacity
                        style={s.cancelBtn}
                        onPress={() => cancelEdit(limit.id)}
                        disabled={isSaving}
                      >
                        <MaterialIcons name="close" size={20} color={colors.onSurfaceVariant} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.saveBtn, { backgroundColor: colors.primary }]}
                        onPress={() => saveLimit(limit)}
                        disabled={isSaving}
                      >
                        {isSaving
                          ? <ActivityIndicator size="small" color={colors.onPrimary} />
                          : <MaterialIcons name="check" size={18} color={colors.onPrimary} />}
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={s.editBtn}
                      onPress={() => startEdit(limit)}
                    >
                      <MaterialIcons name="edit" size={18} color={colors.primary} />
                      <Text style={[s.editLabel, { color: colors.primary }]}>Изменить</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Amounts row */}
                <View style={s.amountsRow}>
                  <Text style={[s.spent, w && { color: colors.error }]}>
                    ₽ {Math.round(limit.spentAmount).toLocaleString('ru-RU')}
                  </Text>
                  <Text style={s.sep}>/</Text>
                  {isEditing ? (
                    <TextInput
                      style={[s.input, { borderColor: colors.primary, color: colors.onSurface }]}
                      value={editing[limit.id]}
                      onChangeText={v =>
                        setEditing(prev => ({ ...prev, [limit.id]: v.replace(/[^0-9]/g, '') }))
                      }
                      keyboardType="numeric"
                      returnKeyType="done"
                      onSubmitEditing={() => saveLimit(limit)}
                      autoFocus
                      selectTextOnFocus
                      placeholder="0"
                      placeholderTextColor={colors.onSurfaceVariant}
                    />
                  ) : (
                    <Text style={s.limitAmt}>
                      {limit.limitAmount > 0
                        ? `₽ ${Math.round(limit.limitAmount).toLocaleString('ru-RU')}`
                        : 'Без лимита'}
                    </Text>
                  )}
                </View>

                {/* Progress bar */}
                {limit.limitAmount > 0 && (
                  <View style={s.barBg}>
                    <View
                      style={[
                        s.barFill,
                        { width: `${p * 100}%`, backgroundColor: barColor },
                      ]}
                    />
                  </View>
                )}

                {/* Warning label */}
                {w && (
                  <View style={s.warnRow}>
                    <MaterialIcons name="warning" size={14} color={colors.error} />
                    <Text style={[s.warnText, { color: colors.error }]}>
                      Превышено {Math.round(p * 100)}% лимита
                    </Text>
                  </View>
                )}
              </Animated.View>
            );
          })}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const mk = (C: any) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: C.background },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: C.transparentBorder,
    },
    back: { padding: 8 },
    title: {
      fontSize: Fonts.sizes.lg,
      fontFamily: 'Manrope-Bold',
      color: C.onSurface,
    },

    list: {
      padding: Spacing.base,
      paddingBottom: 80,
      gap: Spacing.sm,
    },

    hint: {
      fontSize: Fonts.sizes.sm,
      fontFamily: 'Manrope-Medium',
      color: C.onSurfaceVariant,
      marginBottom: Spacing.base,
      lineHeight: 20,
    },

    empty: {
      alignItems: 'center',
      paddingVertical: Spacing['2xl'],
      gap: Spacing.base,
    },
    emptyText: {
      fontSize: Fonts.sizes.base,
      fontFamily: 'Manrope-Medium',
      color: C.onSurfaceVariant,
    },

    card: {
      backgroundColor: C.surfaceContainerLowest,
      borderRadius: BorderRadius.lg,
      padding: Spacing.xl,
      borderWidth: 1,
      borderColor: C.transparentBorder,
      gap: Spacing.sm,
      ...Shadows.sm,
    },

    cardTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    category: {
      fontSize: Fonts.sizes.md,
      fontFamily: 'Manrope-Bold',
      color: C.onSurface,
      flex: 1,
    },

    actions: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
    cancelBtn: {
      padding: 6,
      borderRadius: BorderRadius.sm,
      backgroundColor: C.surfaceContainerHigh,
    },
    saveBtn: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: BorderRadius.sm,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      minWidth: 64,
      justifyContent: 'center',
    },
    editBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: BorderRadius.sm,
      backgroundColor: C.surfaceContainerHigh,
    },
    editLabel: {
      fontSize: Fonts.sizes.sm,
      fontFamily: 'Manrope-Bold',
    },

    amountsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    spent: {
      fontSize: Fonts.sizes.base,
      fontFamily: 'Manrope-ExtraBold',
      color: C.onSurface,
    },
    sep: {
      fontSize: Fonts.sizes.base,
      color: C.onSurfaceVariant,
      fontFamily: 'Manrope-Medium',
    },
    limitAmt: {
      fontSize: Fonts.sizes.base,
      fontFamily: 'Manrope-Medium',
      color: C.onSurfaceVariant,
    },
    input: {
      fontSize: Fonts.sizes.base,
      fontFamily: 'Manrope-Bold',
      borderBottomWidth: 2,
      paddingBottom: 2,
      minWidth: 80,
      textAlign: 'right',
    },

    barBg: {
      width: '100%',
      height: 6,
      backgroundColor: C.surfaceContainerHigh,
      borderRadius: 3,
      overflow: 'hidden',
    },
    barFill: {
      height: '100%',
      borderRadius: 3,
    },

    warnRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 2,
    },
    warnText: {
      fontSize: Fonts.sizes.xs,
      fontFamily: 'Manrope-Bold',
    },
  });

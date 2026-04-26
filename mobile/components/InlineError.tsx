// Plan 04-01 — InlineError. Reads issues[] from Phase-1/3 error contract and
// renders the first message matching `field`. Returns null when no match.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Fonts, Spacing, BorderRadius } from '../constants/theme';

export interface InlineErrorIssue {
  path: (string | number)[];
  message: string;
  code?: string;
}

export interface InlineErrorProps {
  issues?: InlineErrorIssue[];
  field: string;
}

export function InlineError({ issues, field }: InlineErrorProps) {
  if (!issues || issues.length === 0) return null;
  const match = issues.find((i) => Array.isArray(i.path) && i.path[0] === field);
  if (!match) return null;
  const message = match.message || 'Заполните поле';
  return (
    <View style={styles.row} accessibilityRole="alert">
      <MaterialIcons name="error" size={16} color="#ef4444" />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: '#ef4444',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  text: {
    fontSize: Fonts.sizes.md,
    fontFamily: 'Manrope-Medium',
    color: '#ef4444',
    flex: 1,
  },
});

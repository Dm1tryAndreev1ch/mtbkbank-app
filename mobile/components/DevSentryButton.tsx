/**
 * Phase 1 OBS-03 / D-03 verification surface.
 *
 * Renders ONLY in __DEV__ builds — production tree-shakes the import per
 * VALIDATION row 1-05-02 (manual verification: `grep -r "sentry-test-button"` in
 * the prod export must return zero).
 *
 * Tap → Sentry.captureException(new Error(...)) → event ID logged to Metro
 * console → developer opens the mtbank-mobile Sentry dashboard, confirms the event
 * appears with PII (pin / Authorization / cardNumber / etc.) redacted by piiBeforeSend.
 *
 * The button label is intentionally English: this is a developer-only surface,
 * never visible to end users (CLAUDE.md "Russian for user-facing strings" applies
 * to user-facing text; dev tools may use concise English).
 */
import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import * as Sentry from '@sentry/react-native';

export default function DevSentryButton() {
  if (!__DEV__) return null;
  return (
    <Pressable
      onPress={() => {
        const id = Sentry.captureException(new Error('Phase-1 Sentry test (mobile)'));
        // Dev-surface log — production builds tree-shake the entire component.
        // eslint-disable-next-line no-console
        console.log('[sentry-test-button] sent test event:', id);
      }}
      style={styles.button}
      accessibilityLabel="sentry-test-button"
    >
      <Text style={styles.text}>Throw test error (DEV)</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#a00',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  text: {
    color: '#a00',
    fontSize: 14,
    fontWeight: '600',
  },
});

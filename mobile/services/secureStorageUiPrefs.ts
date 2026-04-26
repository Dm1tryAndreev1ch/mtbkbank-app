// mobile/services/secureStorageUiPrefs.ts
//
// Zustand persist storage adapter for NON-SENSITIVE UI preferences ONLY (theme, cardDesign).
// Per D-09, silent catches here are acceptable — failing to persist a UI pref is harmless.
// SENSITIVE state (auth tokens) MUST go through tokenStore — this file is NOT a token store.
//
// ESLint: this is the SECOND permitted file that imports `expo-secure-store`. Whitelisted via the
// override block in mobile/eslint.config.js (extended by Plan 02-05).
import * as SecureStore from 'expo-secure-store';

export const secureStorageUiPrefs = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(name);
    } catch {
      // D-09: UI pref read failure is silent — non-sensitive prefs.
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(name, value);
    } catch {
      // D-09: UI pref write failure is silent — non-sensitive prefs.
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(name);
    } catch {
      // D-09: UI pref delete failure is silent — non-sensitive prefs.
    }
  },
};

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import * as SecureStore from 'expo-secure-store';
import * as api from '../services/api';

interface User {
  id: string;
  name: string;
  phone: string;
  avatarUrl?: string;
  mbPoints: number;
  status: string;
  isAdmin: boolean;
}

interface AppState {
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  user: User | null;
  token: string | null;
  isLoading: boolean;
  accounts: any[];
  transactions: any[];
  cards: any[];
  decks: any[];
  quests: any[];
  subscriptions: any[];
  limits: any[];
  notifications: any[];
  unreadCount: number;

  // Auth
  login: (phone: string, pin: string) => Promise<boolean>;
  logout: () => Promise<void>;
  loadToken: () => Promise<boolean>;

  // Data loading
  loadUser: () => Promise<void>;
  loadAccounts: () => Promise<void>;
  loadTransactions: (params?: any) => Promise<void>;
  loadCards: (params?: any) => Promise<void>;
  loadDecks: () => Promise<void>;
  loadQuests: () => Promise<void>;
  loadSubscriptions: () => Promise<void>;
  loadLimits: () => Promise<void>;
  loadNotifications: () => Promise<void>;
  loadAll: () => Promise<void>;

  // Settings
  cardDesign: string;
  setCardDesign: (design: string) => Promise<void>;
}

// Custom storage adapter using SecureStore
const secureStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(name);
    } catch {
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(name, value);
    } catch {}
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(name);
    } catch {}
  },
};

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),
      user: null,
      token: null,
      isLoading: false,
      accounts: [],
      transactions: [],
      cards: [],
      decks: [],
      quests: [],
      subscriptions: [],
      limits: [],
      notifications: [],
      unreadCount: 0,
      cardDesign: 'default',

      setCardDesign: async (design) => {
        try { await SecureStore.setItemAsync('cardDesign', design); } catch {}
        set({ cardDesign: design });
      },

      login: async (phone, pin) => {
        try {
          set({ isLoading: true });
          const { data } = await api.login(phone, pin);
          try { await SecureStore.setItemAsync('token', data.token); } catch {}
          set({ token: data.token, user: data.user, isLoading: false });
          return true;
        } catch (err) {
          set({ isLoading: false });
          return false;
        }
      },

      logout: async () => {
        try { await SecureStore.deleteItemAsync('token'); } catch {}
        set({
          user: null, token: null, accounts: [], transactions: [],
          cards: [], decks: [], quests: [], subscriptions: [],
          limits: [], notifications: [], unreadCount: 0,
        });
      },

      loadToken: async () => {
        let token = null;
        let design = null;
        try {
          token = await SecureStore.getItemAsync('token');
          design = await SecureStore.getItemAsync('cardDesign');
        } catch {}

        if (design) set({ cardDesign: design });
        
        if (token) {
          set({ token });
          try {
            const { data } = await api.getMe();
            set({ user: data });
            return true;
          } catch {
            try { await SecureStore.deleteItemAsync('token'); } catch {}
            set({ token: null });
            return false;
          }
        }
        return false;
      },

      loadUser: async () => {
        try {
          const { data } = await api.getMe();
          set({ user: data });
        } catch (err) {}
      },

      loadAccounts: async () => {
        try {
          const { data } = await api.getAccounts();
          set({ accounts: data });
        } catch (err) {}
      },

      loadTransactions: async (params) => {
        try {
          const { data } = await api.getTransactions(params);
          set({ transactions: data.transactions });
        } catch (err) {}
      },

      loadCards: async (params) => {
        try {
          const { data } = await api.getInventory(params);
          set({ cards: data });
        } catch (err) {}
      },

      loadDecks: async () => {
        try {
          const { data } = await api.getDecks();
          set({ decks: data });
        } catch (err) {}
      },

      loadQuests: async () => {
        try {
          const { data } = await api.getDailyQuests();
          set({ quests: data });
        } catch (err) {}
      },

      loadSubscriptions: async () => {
        try {
          const { data } = await api.getSubscriptions();
          set({ subscriptions: data });
        } catch (err) {}
      },

      loadLimits: async () => {
        try {
          const { data } = await api.getLimits();
          set({ limits: data });
        } catch (err) {}
      },

      loadNotifications: async () => {
        try {
          const { data } = await api.getNotifications();
          set({ notifications: data.notifications, unreadCount: data.unreadCount });
        } catch (err) {}
      },

      loadAll: async () => {
        const state = get();
        await Promise.all([
          state.loadUser(),
          state.loadAccounts(),
          state.loadTransactions(),
          state.loadCards(),
          state.loadDecks(),
          state.loadQuests(),
          state.loadSubscriptions(),
          state.loadLimits(),
          state.loadNotifications(),
        ]);
      },
    }),
    {
      name: 'mtbank-storage',
      // We partition storage handling gracefully natively. We do not persist the token directly into Redux persistence anymore.
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({ theme: state.theme, cardDesign: state.cardDesign }),
    }
  )
);

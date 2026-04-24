import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import * as SecureStore from 'expo-secure-store';
import axios from 'axios';
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
  register: (payload: {
    firstName: string;
    lastName: string;
    cardNumber: string;
    phone: string;
    pin: string;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
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
  markNotificationRead: (id: string) => Promise<void>;
  loadAll: () => Promise<void>;

  // Settings
  cardDesign: string;
  setCardDesign: (design: string) => Promise<void>;
}

const secureStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try { return await SecureStore.getItemAsync(name); } catch { return null; }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try { await SecureStore.setItemAsync(name, value); } catch {}
  },
  removeItem: async (name: string): Promise<void> => {
    try { await SecureStore.deleteItemAsync(name); } catch {}
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
          // api.ts сохраняет токен в SecureStore сам.
          // data.токен может быть accessToken или token в зависимости от сервера
          const token = data.accessToken || data.token;
          if (!token) {
            set({ isLoading: false });
            return false;
          }
          set({ token, user: data.user, isLoading: false });
          return true;
        } catch {
          set({ isLoading: false });
          return false;
        }
      },

      register: async (payload) => {
        try {
          set({ isLoading: true });
          const { data } = await api.register(payload);
          const token = data.accessToken || data.token;
          if (!token) {
            set({ isLoading: false });
            return { ok: false, error: 'Сервер не вернул токен' };
          }
          set({ token, user: data.user, isLoading: false });
          return { ok: true };
        } catch (e: unknown) {
          set({ isLoading: false });
          if (axios.isAxiosError(e)) {
            const data = e.response?.data;
            const serverMsg =
              typeof data === 'object' && data && 'error' in data
                ? String((data as { error: string }).error)
                : undefined;
            if (serverMsg) return { ok: false, error: serverMsg };
            if (e.code === 'ERR_NETWORK' || e.message === 'Network Error') {
              return {
                ok: false,
                error:
                  'Нет связи с сервером. Проверьте, что backend запущен (порт 3000), телефон в той же Wi‑Fi сети, либо задайте EXPO_PUBLIC_API_URL в .env в папке mobile.',
              };
            }
            if (e.response?.status) {
              return { ok: false, error: `Ошибка сервера (${e.response.status})` };
            }
            return { ok: false, error: e.message || 'Не удалось зарегистрироваться' };
          }
          return { ok: false, error: 'Не удалось зарегистрироваться' };
        }
      },

      logout: async () => {
        try { await SecureStore.deleteItemAsync('token'); } catch {}
        try { await SecureStore.deleteItemAsync('refreshToken'); } catch {}
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
        try { const { data } = await api.getMe(); set({ user: data }); } catch {}
      },

      loadAccounts: async () => {
        try { const { data } = await api.getAccounts(); set({ accounts: data }); } catch {}
      },

      loadTransactions: async (params) => {
        try { const { data } = await api.getTransactions(params); set({ transactions: data.transactions }); } catch {}
      },

      loadCards: async (params) => {
        try { const { data } = await api.getInventory(params); set({ cards: data }); } catch {}
      },

      loadDecks: async () => {
        try { const { data } = await api.getDecks(); set({ decks: data }); } catch {}
      },

      loadQuests: async () => {
        try { const { data } = await api.getDailyQuests(); set({ quests: data }); } catch {}
      },

      loadSubscriptions: async () => {
        try { const { data } = await api.getSubscriptions(); set({ subscriptions: data }); } catch {}
      },

      loadLimits: async () => {
        try { const { data } = await api.getLimits(); set({ limits: data }); } catch {}
      },

      loadNotifications: async () => {
        try {
          const { data } = await api.getNotifications();
          set({ notifications: data.notifications, unreadCount: data.unreadCount });
        } catch {}
      },

      markNotificationRead: async (id: string) => {
        try {
          await api.markNotificationRead(id);
          await get().loadNotifications();
        } catch {}
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
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({ theme: state.theme, cardDesign: state.cardDesign }),
    }
  )
);

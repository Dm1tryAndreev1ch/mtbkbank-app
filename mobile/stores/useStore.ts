import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import axios from 'axios';
import * as Sentry from '@sentry/react-native';
import * as api from '../services/api';
import * as tokenStore from '../services/tokenStore';
import { secureStorageUiPrefs } from '../services/secureStorageUiPrefs';

interface User {
  id: string;
  name: string;
  phone: string;
  avatarUrl?: string;
  mbPoints: number;
  status: string;
  isAdmin: boolean;
}

// D-06: structured error shape replacing the prior `string | null`.
export type AppError = { code: string; message: string; requestId?: string } | null;

interface AppState {
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  user: User | null;
  /**
   * Derived view of the access token. Owned by tokenStore (REL-01); kept in sync via the
   * module-level `tokenStore.subscribe` below. Existing screens (e.g. app/(tabs)/_layout.tsx)
   * read this for "is the user logged in" gating until Plan 02-09 migrates them to `isAuthed`.
   */
  token: string | null;
  isAuthed: boolean;
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
  error: AppError;
  clearError: () => void;

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
  /**
   * @deprecated since Plan 02-05. BootGate (Plan 02-09) owns hydrate via `tokenStore.hydrate()`.
   * Kept as a thin wrapper so app/index.tsx keeps booting until Plan 02-09 lands. Remove the
   * wrapper (and its AppState entry) when app/index.tsx no longer references it.
   */
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

/**
 * Build a structured AppError from any rejection. Backend Phase-1 codebook responses surface
 * `{ error, message, requestId }`; bare network errors fall back to a Russian fallback string
 * supplied by the caller.
 */
function toAppError(e: any, fallbackMessage: string, fallbackCode = 'NETWORK_ERROR'): AppError {
  const code = e?.response?.data?.error || fallbackCode;
  const message = e?.response?.data?.message || fallbackMessage;
  const requestId = e?.response?.data?.requestId;
  return { code, message, ...(requestId ? { requestId } : {}) };
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),
      user: null,
      token: tokenStore.getAccess(),
      isAuthed: tokenStore.isAuthed(),
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
      error: null,
      clearError: () => set({ error: null }),
      cardDesign: 'default',

      setCardDesign: async (design) => {
        // D-09: UI pref persist failure is non-sensitive — keep silent but breadcrumb.
        try {
          await secureStorageUiPrefs.setItem('cardDesign', design);
        } catch (e) {
          Sentry.addBreadcrumb({
            category: 'store.setCardDesign',
            level: 'info',
            message: 'cardDesign persist failed',
            data: { error: String((e as any)?.message || e).slice(0, 200) },
          });
        }
        set({ cardDesign: design });
      },

      login: async (phone, pin) => {
        set({ isLoading: true, error: null });
        try {
          const { data } = await api.login(phone, pin);
          // api.ts persists tokens via tokenStore.setTokens (REL-01); we only mirror user state.
          const token = data.accessToken || data.token;
          if (!token) {
            set({
              isLoading: false,
              error: {
                code: 'AUTH_NO_TOKEN',
                message: 'Сервер не вернул токен',
              },
            });
            return false;
          }
          set({ user: data.user, isLoading: false });
          // `token` and `isAuthed` are refreshed by the tokenStore subscription below.
          return true;
        } catch (e: any) {
          // A persist failure surfaces as a thrown Error from tokenStore.setTokens (D-09).
          // It has no `response` field (it's not an axios rejection), so we treat any rejection
          // without a server response as a probable persist failure ONLY if the api call itself
          // would have already produced a response — which it wouldn't have, since tokenStore
          // throws AFTER the HTTP success. Heuristic: `e?.response` absent + `e?.message` set.
          const isPersistFailure =
            e?.message === 'AUTH_TOKEN_PERSIST_FAILED' ||
            (!e?.response && typeof e?.message === 'string' && e.message.length > 0);
          const fallbackCode = isPersistFailure ? 'AUTH_TOKEN_PERSIST_FAILED' : 'AUTH_LOGIN_FAILED';
          const fallbackMessage = isPersistFailure
            ? 'Не удалось сохранить учётные данные'
            : 'Не удалось войти';
          set({
            isLoading: false,
            error: toAppError(e, fallbackMessage, fallbackCode),
          });
          return false;
        }
      },

      register: async (payload) => {
        try {
          set({ isLoading: true, error: null });
          const { data } = await api.register(payload);
          const token = data.accessToken || data.token;
          if (!token) {
            set({ isLoading: false });
            return { ok: false, error: 'Сервер не вернул токен' };
          }
          set({ user: data.user, isLoading: false });
          return { ok: true };
        } catch (e: unknown) {
          set({ isLoading: false });
          if (axios.isAxiosError(e)) {
            const data = e.response?.data;
            const serverMsg =
              typeof data === 'object' && data && 'message' in data
                ? String((data as { message: string }).message)
                : typeof data === 'object' && data && 'error' in data
                  ? String((data as { error: string }).error)
                  : undefined;
            if (serverMsg) {
              set({
                error: toAppError(e, serverMsg, 'AUTH_REGISTER_FAILED'),
              });
              return { ok: false, error: serverMsg };
            }
            if (e.code === 'ERR_NETWORK' || e.message === 'Network Error') {
              const msg =
                'Нет связи с сервером. Проверьте, что backend запущен (порт 3000), телефон в той же Wi‑Fi сети, либо задайте EXPO_PUBLIC_API_URL в .env в папке mobile.';
              set({ error: { code: 'NETWORK_ERROR', message: msg } });
              return { ok: false, error: msg };
            }
            if (e.response?.status === 404) {
              const msg =
                'Сервер ответил 404 (часто указан неверный адрес API). В консоли Metro должна быть строка [MTBank API] base URL: … Убедитесь, что там IP вашего ПК и порт 3000 (не 8081). При туннеле Expo создайте mobile/.env: EXPO_PUBLIC_API_URL=http://ВАШ_IP:3000 и перезапустите npx expo start -c.';
              set({ error: { code: 'AUTH_REGISTER_404', message: msg } });
              return { ok: false, error: msg };
            }
            if (e.response?.status) {
              const msg = `Ошибка сервера (${e.response.status})`;
              set({ error: { code: 'SERVER_ERROR', message: msg } });
              return { ok: false, error: msg };
            }
            const msg = e.message || 'Не удалось зарегистрироваться';
            set({ error: { code: 'AUTH_REGISTER_FAILED', message: msg } });
            return { ok: false, error: msg };
          }
          set({
            error: { code: 'AUTH_REGISTER_FAILED', message: 'Не удалось зарегистрироваться' },
          });
          return { ok: false, error: 'Не удалось зарегистрироваться' };
        }
      },

      logout: async () => {
        // api.logout() best-effort calls /auth/logout AND tokenStore.clear() internally.
        // Surface server errors via Sentry breadcrumb (NOT silent) — REL-04.
        await api.logout().catch((e: unknown) => {
          Sentry.addBreadcrumb({
            category: 'store.logout',
            level: 'info',
            message: 'logout reducer caught api.logout error',
            data: { error: String((e as any)?.message || e).slice(0, 200) },
          });
        });
        // tokenStore.clear() already ran inside api.logout(); the subscription will sync token/isAuthed.
        set({
          user: null,
          accounts: [],
          transactions: [],
          cards: [],
          decks: [],
          quests: [],
          subscriptions: [],
          limits: [],
          notifications: [],
          unreadCount: 0,
          error: null,
        });
      },

      loadToken: async () => {
        // Deprecated wrapper (see interface JSDoc). Hydrates tokenStore once and reports authed-ness.
        try {
          if (!tokenStore.isHydrated()) {
            await tokenStore.hydrate();
          }
        } catch (e) {
          Sentry.addBreadcrumb({
            category: 'store.loadToken',
            level: 'warning',
            message: 'tokenStore.hydrate failed',
            data: { error: String((e as any)?.message || e).slice(0, 200) },
          });
          return false;
        }

        if (!tokenStore.isAuthed()) return false;

        try {
          const { data } = await api.getMe();
          set({ user: data });
          return true;
        } catch (e: any) {
          // Hydrated tokens but /users/me rejected — clear and surface error so callers can route to login.
          await tokenStore.clear().catch((clearErr: unknown) => {
            Sentry.addBreadcrumb({
              category: 'store.loadToken',
              level: 'warning',
              message: 'tokenStore.clear failed after getMe rejection',
              data: { error: String((clearErr as any)?.message || clearErr).slice(0, 200) },
            });
          });
          set({
            error: toAppError(e, 'Не удалось загрузить профиль'),
          });
          return false;
        }
      },

      loadUser: async () => {
        try {
          const { data } = await api.getMe();
          set({ user: data });
        } catch (e: any) {
          set({ error: toAppError(e, 'Не удалось загрузить профиль') });
        }
      },

      loadAccounts: async () => {
        try {
          const { data } = await api.getAccounts();
          set({ accounts: data });
        } catch (e: any) {
          set({ error: toAppError(e, 'Не удалось загрузить счета') });
        }
      },

      loadTransactions: async (params) => {
        try {
          const { data } = await api.getTransactions(params);
          set({ transactions: data.transactions });
        } catch (e: any) {
          set({ error: toAppError(e, 'Не удалось загрузить транзакции') });
        }
      },

      loadCards: async (params) => {
        try {
          const { data } = await api.getInventory(params);
          set({ cards: data });
        } catch (e: any) {
          set({ error: toAppError(e, 'Не удалось загрузить карты') });
        }
      },

      loadDecks: async () => {
        try {
          const { data } = await api.getDecks();
          set({ decks: data });
        } catch (e: any) {
          set({ error: toAppError(e, 'Не удалось загрузить колоды') });
        }
      },

      loadQuests: async () => {
        try {
          const { data } = await api.getDailyQuests();
          set({ quests: data });
        } catch (e: any) {
          set({ error: toAppError(e, 'Не удалось загрузить квесты') });
        }
      },

      loadSubscriptions: async () => {
        try {
          const { data } = await api.getSubscriptions();
          set({ subscriptions: data });
        } catch (e: any) {
          set({ error: toAppError(e, 'Не удалось загрузить подписки') });
        }
      },

      loadLimits: async () => {
        try {
          const { data } = await api.getLimits();
          set({ limits: data });
        } catch (e: any) {
          set({ error: toAppError(e, 'Не удалось загрузить лимиты') });
        }
      },

      loadNotifications: async () => {
        try {
          const { data } = await api.getNotifications();
          set({ notifications: data.notifications, unreadCount: data.unreadCount });
        } catch (e: any) {
          set({ error: toAppError(e, 'Не удалось загрузить уведомления') });
        }
      },

      markNotificationRead: async (id: string) => {
        try {
          await api.markNotificationRead(id);
          await get().loadNotifications();
        } catch (e: any) {
          set({ error: toAppError(e, 'Не удалось обновить уведомление') });
        }
      },

      loadAll: async () => {
        const state = get();
        set({ error: null });
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
      // D-09: only NON-SENSITIVE UI prefs (theme, cardDesign) are persisted here. Auth tokens
      // live in tokenStore (REL-01) and never touch this storage adapter.
      storage: createJSONStorage(() => secureStorageUiPrefs),
      partialize: (state) => ({ theme: state.theme, cardDesign: state.cardDesign }),
    },
  ),
);

// REL-01: keep store.token / store.isAuthed in sync with tokenStore (the SSOT for auth tokens).
// Singleton subscription registered at module-load time; re-registers automatically on hot reload
// because the new module instance constructs a fresh listener set.
tokenStore.subscribe(() => {
  useStore.setState({
    token: tokenStore.getAccess(),
    isAuthed: tokenStore.isAuthed(),
  });
});

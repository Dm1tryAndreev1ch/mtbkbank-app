import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { isAxiosError } from 'axios';
import * as Sentry from '@sentry/react-native';
import * as api from '../services/api';
import * as tokenStore from '../services/tokenStore';
import { secureStorageUiPrefs } from '../services/secureStorageUiPrefs';
import { mergeList, mergeListWithRemovals } from './mergeByUpdatedAt';
import type { TradeAnimPayload } from '../hooks/useTradeAnimationListener';

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

// Plan 06-06 D-20 — local UserCard shape extended with the `pendingExpire` flag.
export interface LocalUserCard {
  id: string;
  updatedAt?: string;
  pendingExpire?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

// Plan 04-01 D-01/D-02 — Toast slice.
export type ToastType = 'success' | 'error' | 'warning' | 'info';
export interface ToastEntry {
  key: string;
  type: ToastType;
  message: string;
  requestId?: string;
  autoDismissMs?: number;
  createdAt: number;
}
export interface ToastSlice {
  queue: ToastEntry[];
  show: (
    message: string,
    type: ToastType,
    opts?: { key?: string; requestId?: string; autoDismissMs?: number },
  ) => void;
  hide: (key?: string) => void;
}

// Plan 04-01 D-09 — netinfo-driven slice.
export interface NetworkSlice {
  isOnline: boolean;
  setOnline: (v: boolean) => void;
}

// Plan 04-01 D-10 — rate-limit registry.
export type RateLimitMap = Record<string, { until: number; remaining?: number }>;

interface AppState {
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  user: User | null;
  token: string | null;
  isAuthed: boolean;
  onboarded: boolean;
  isLoading: boolean;
  accounts: any[];
  transactions: any[];
  cards: LocalUserCard[];
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

  // Plan 04-01 — UX primitives
  toast: ToastSlice;
  network: NetworkSlice;
  rateLimit: RateLimitMap;
  setRateLimit: (key: string, value: { until: number; remaining?: number }) => void;
  clearRateLimit: (key: string) => void;

  // Plan 06-06 D-20/D-19 — card expiry animation helpers.
  markCardPendingExpire: (userCardId: string) => void;
  removeCard: (userCardId: string) => void;

  // ANIM-08 — trade animation state.
  tradeAnim: TradeAnimPayload | null;
  showTradeAnim: (payload: TradeAnimPayload) => void;
  clearTradeAnim: () => void;
}

function toAppError(e: any, fallbackMessage: string, fallbackCode = 'NETWORK_ERROR'): AppError {
  const code = e?.response?.data?.error || fallbackCode;
  const message = e?.response?.data?.message || fallbackMessage;
  const requestId = e?.response?.data?.requestId;
  return { code, message, ...(requestId ? { requestId } : {}) };
}

/**
 * Merge a fresh transactions page into the existing local list.
 *
 * Transactions are append-only: they never mutate after creation.
 * Strategy:
 *   1. Build a Set of ids from the incoming page.
 *   2. Prepend genuinely new items (not yet in state) in server order.
 *   3. Keep all existing items that were NOT in the incoming window
 *      (they belong to earlier pages the user may have loaded).
 *
 * This guarantees:
 *   - A brand-new transaction appears immediately after loadTransactions.
 *   - Pull-to-refresh replaces the visible top-N without losing scroll history.
 *   - No stale balance / stale field issues (accounts use a separate replace path).
 */
function mergeTransactions(existing: any[], incoming: any[]): any[] {
  if (!incoming.length) return existing;
  const incomingIds = new Set(incoming.map((t: any) => t.id));
  // Items from previous pages that are not in this window — keep them.
  const tail = existing.filter((t: any) => !incomingIds.has(t.id));
  // Incoming page is already ordered desc by server; prepend to tail.
  return [...incoming, ...tail];
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),
      user: null,
      token: tokenStore.getAccess(),
      isAuthed: tokenStore.isAuthed(),
      onboarded: false,
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

      // Plan 04-01 — Toast / network / rate-limit slices (ephemeral; excluded from persist).
      toast: {
        queue: [] as ToastEntry[],
        show: (message, type, opts) => {
          set((s) => {
            const key =
              opts?.key ?? `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            const entry: ToastEntry = {
              key,
              type,
              message,
              requestId: opts?.requestId,
              autoDismissMs: opts?.autoDismissMs,
              createdAt: Date.now(),
            };
            const queue = s.toast.queue
              .filter((e) => e.key !== key)
              .concat(entry)
              .slice(-5);
            return { toast: { ...s.toast, queue } };
          });
        },
        hide: (key) =>
          set((s) => ({
            toast: {
              ...s.toast,
              queue: key ? s.toast.queue.filter((e) => e.key !== key) : [],
            },
          })),
      },
      network: {
        isOnline: true,
        setOnline: (v) =>
          set((s) => ({ network: { ...s.network, isOnline: v } })),
      },
      rateLimit: {} as RateLimitMap,
      setRateLimit: (key, value) =>
        set((s) => ({ rateLimit: { ...s.rateLimit, [key]: value } })),
      clearRateLimit: (key) =>
        set((s) => {
          const next = { ...s.rateLimit };
          delete next[key];
          return { rateLimit: next };
        }),

      // Plan 06-06 — D-20.
      markCardPendingExpire: (userCardId) =>
        set((s) => ({
          cards: (s.cards ?? []).map((c) =>
            c.id === userCardId && !c.pendingExpire ? { ...c, pendingExpire: true } : c,
          ),
        })),

      // Plan 06-06 — D-19.
      removeCard: (userCardId) =>
        set((s) => ({
          cards: (s.cards ?? []).filter((c) => c.id !== userCardId),
        })),

      // ANIM-08 — trade animation slice.
      tradeAnim: null,
      showTradeAnim: (payload) => set({ tradeAnim: payload }),
      clearTradeAnim: () => set({ tradeAnim: null }),

      setCardDesign: async (design) => {
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
          const token = data.accessToken || data.token;
          if (!token) {
            set({
              isLoading: false,
              error: { code: 'AUTH_NO_TOKEN', message: 'Сервер не вернул токен' },
            });
            return false;
          }
          set({ user: data.user, isLoading: false });
          return true;
        } catch (e: any) {
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
          if (isAxiosError(e)) {
            const data = e.response?.data;
            const serverMsg =
              typeof data === 'object' && data && 'message' in data
                ? String((data as { message: string }).message)
                : typeof data === 'object' && data && 'error' in data
                  ? String((data as { error: string }).error)
                  : undefined;
            if (serverMsg) {
              set({ error: toAppError(e, serverMsg, 'AUTH_REGISTER_FAILED') });
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
        await api.logout().catch((e: unknown) => {
          Sentry.addBreadcrumb({
            category: 'store.logout',
            level: 'info',
            message: 'logout reducer caught api.logout error',
            data: { error: String((e as any)?.message || e).slice(0, 200) },
          });
        });
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
          await tokenStore.clear().catch((clearErr: unknown) => {
            Sentry.addBreadcrumb({
              category: 'store.loadToken',
              level: 'warning',
              message: 'tokenStore.clear failed after getMe rejection',
              data: { error: String((clearErr as any)?.message || clearErr).slice(0, 200) },
            });
          });
          set({ error: toAppError(e, 'Не удалось загрузить профиль') });
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
          // Accounts mutate (balance, frozen state, etc.) — always replace
          // wholesale from the server response so stale balances never stick.
          set({ accounts: data ?? [] });
        } catch (e: any) {
          set({ error: toAppError(e, 'Не удалось загрузить счета') });
        }
      },

      loadTransactions: async (params) => {
        try {
          const { data } = await api.getTransactions(params);
          // Transactions are append-only — use prepend-merge so new items
          // surface immediately without losing previously loaded pages.
          set((s) => ({
            transactions: mergeTransactions(s.transactions ?? [], data.transactions ?? []),
          }));
        } catch (e: any) {
          set({ error: toAppError(e, 'Не удалось загрузить транзакции') });
        }
      },

      loadCards: async (params) => {
        try {
          const { data } = await api.getInventory(params);
          set((s) => ({
            cards: mergeListWithRemovals(s.cards ?? [], data ?? [], 'http', {
              skipPredicate: (existing) => existing.pendingExpire === true,
              onRemoved: (removed) => queueLocalExpire(removed),
            }),
          }));
        } catch (e: any) {
          set({ error: toAppError(e, 'Не удалось загрузить карты') });
        }
      },

      loadDecks: async () => {
        try {
          const { data } = await api.getDecks();
          set((s) => ({ decks: mergeList(s.decks ?? [], data ?? [], 'http') }));
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
          set((s) => ({
            notifications: mergeList(s.notifications ?? [], data.notifications ?? [], 'http'),
            unreadCount: data.unreadCount,
          }));
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
      storage: createJSONStorage(() => secureStorageUiPrefs),
      partialize: (state) => ({ theme: state.theme, cardDesign: state.cardDesign }),
    },
  ),
);

// Plan 06-06 D-21 — reconciliation tail.
export function queueLocalExpire(removed: LocalUserCard[]): void {
  removed.forEach((card, i) => {
    setTimeout(() => {
      useStore.getState().markCardPendingExpire(card.id);
      setTimeout(() => useStore.getState().removeCard(card.id), 800);
    }, i * 200);
  });
}

// REL-01: keep store.token / store.isAuthed in sync with tokenStore.
tokenStore.subscribe(() => {
  useStore.setState({
    token: tokenStore.getAccess(),
    isAuthed: tokenStore.isAuthed(),
  });
});

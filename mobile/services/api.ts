import axios from 'axios';
import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';
import * as Sentry from '@sentry/react-native';
import * as tokenStore from './tokenStore';

/** Только localhost / IPv4 — туннели *.exp.direct и т.п. на :3000 не подходят. */
function isUsableDevApiHost(host: string): boolean {
  if (!host) return false;
  const h = host.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1') return true;
  return /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(host);
}

/** Хост из URL бандла Metro (часто LAN-IP, даже когда hostUri — туннель). */
function hostFromBundleScript(): string | null {
  try {
    const url = NativeModules?.SourceCode?.scriptURL as string | undefined;
    if (!url) return null;
    const m = String(url).match(/^https?:\/\/([^/:[?#]+)/i);
    return m ? m[1] : null;
  } catch (e) {
    // Defensive: NativeModules may be unavailable in some test envs. Surface via breadcrumb.
    Sentry.addBreadcrumb({
      category: 'api.hostFromBundleScript',
      level: 'warning',
      message: 'failed to read scriptURL',
      data: { error: String((e as any)?.message || e).slice(0, 200) },
    });
    return null;
  }
}

/** Первый подходящий LAN-хост: manifest.debuggerHost → hostUri → scriptURL. */
function firstUsableLanHost(): string | null {
  const candidates: string[] = [];
  const manifest = Constants.manifest as { debuggerHost?: string } | undefined;
  if (manifest?.debuggerHost) {
    candidates.push(String(manifest.debuggerHost).split(':')[0]);
  }
  const uri = Constants.expoConfig?.hostUri;
  if (uri) candidates.push(String(uri).split(':')[0]);
  const fromScript = hostFromBundleScript();
  if (fromScript) candidates.push(fromScript);
  for (const h of candidates) {
    if (isUsableDevApiHost(h)) return h;
  }
  return null;
}

/** Нормализация URL из .env: порт Metro 8081 → 3000, добавление /api. */
function normalizeApiRootFromUserInput(raw: string): string {
  let u = raw.trim().replace(/\/+$/, '');
  if (/:\d+$/.test(u) && /:8081$/i.test(u)) {
    u = u.replace(/:8081$/i, ':3000');
  }
  return u.endsWith('/api') ? u : `${u}/api`;
}

function getApiBase(): string {
  const fromEnv =
    process.env.EXPO_PUBLIC_API_URL ||
    (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
  if (fromEnv && String(fromEnv).trim()) {
    return normalizeApiRootFromUserInput(String(fromEnv));
  }

  const lan = firstUsableLanHost();
  if (lan) {
    return `http://${lan}:3000/api`;
  }

  if (Platform.OS === 'android' && Constants.isDevice === false) {
    return 'http://10.0.2.2:3000/api';
  }
  if (Platform.OS === 'ios') {
    return 'http://localhost:3000/api';
  }
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3000/api';
  }
  return 'http://192.168.1.100:3000/api';
}

const API_BASE = getApiBase();

if (__DEV__) {
  // eslint-disable-next-line no-console
  console.log('[MTBank API] base URL:', API_BASE);
}

function isPublicAuthPath(url?: string): boolean {
  if (!url) return false;
  return /\/auth\/(login|register)(\?|$)/i.test(url);
}

function absoluteApiUrl(path: string): string {
  const base = String(API_BASE).replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — synchronous in-memory token read via tokenStore (REL-01).
api.interceptors.request.use((config) => {
  if (isPublicAuthPath(config.url)) return config;
  const token = tokenStore.getAccess();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor — delegates 401-refresh single-flight to tokenStore.refreshOnce (D-21).
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config;
    const status = error?.response?.status;

    if (
      status !== 401 ||
      !originalRequest ||
      originalRequest._retried ||
      isPublicAuthPath(originalRequest.url)
    ) {
      return Promise.reject(error);
    }
    originalRequest._retried = true;

    try {
      const newAccessToken = await tokenStore.refreshOnce(async (currentRefresh) => {
        // Bare axios.post (NOT the api instance) so the request interceptor doesn't
        // attach a stale Authorization header to the refresh call.
        const refreshResp = await axios.post(absoluteApiUrl('/auth/refresh'), {
          refreshToken: currentRefresh,
        });
        return {
          accessToken: refreshResp.data?.accessToken,
          refreshToken: refreshResp.data?.refreshToken,
          // userId is NOT included in /auth/refresh response — leave undefined.
        };
      });

      originalRequest.headers = originalRequest.headers || {};
      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      return api(originalRequest);
    } catch {
      // Refresh failed — wipe local token state. Phase 4 / UX-08 wires the explicit redirect.
      await tokenStore.clear();
      return Promise.reject(error);
    }
  },
);

export const login = async (phone: string, pin: string) => {
  const res = await api.post(absoluteApiUrl('/auth/login'), { phone, pin });
  const { accessToken, refreshToken, user } = res.data || {};
  if (accessToken && refreshToken) {
    // Let setTokens throw on persist failure — useStore surfaces D-09 Russian copy.
    await tokenStore.setTokens(
      accessToken,
      refreshToken,
      user?.id !== undefined ? { userId: user.id } : undefined,
    );
  }
  return res;
};

export type RegisterPayload = {
  firstName: string;
  lastName: string;
  cardNumber: string;
  phone: string;
  pin: string;
};

export const register = async (body: RegisterPayload) => {
  // Wipe any prior token state before registration (idempotent).
  await tokenStore.clear();
  const res = await api.post(absoluteApiUrl('/auth/register'), body);
  const { accessToken, refreshToken, user } = res.data || {};
  if (accessToken && refreshToken) {
    await tokenStore.setTokens(
      accessToken,
      refreshToken,
      user?.id !== undefined ? { userId: user.id } : undefined,
    );
  }
  return res;
};

export const logout = async () => {
  // Best-effort server-side revocation; surface via Sentry breadcrumb on failure (NOT silent).
  try {
    await api.post('/auth/logout');
  } catch (e) {
    Sentry.addBreadcrumb({
      category: 'auth.logout',
      level: 'warning',
      message: 'server logout failed',
      data: { error: String((e as any)?.message || e).slice(0, 200) },
    });
  }
  await tokenStore.clear();
};

// User
export const getMe = () => api.get('/users/me');
export const getMyStats = () => api.get('/users/me/stats');
export const updateMe = (data: any) => api.put('/users/me', data);
export const searchUsers = (q: string) => api.get('/users/search', { params: { q } });

// Accounts
export const getAccounts = () => api.get('/accounts');
export const topupAccount = (id: string, amount: number) =>
  api.post(`/accounts/${id}/topup`, { amount });

// Transactions
export const getTransactions = (params?: any) => api.get('/transactions', { params });
export const getAnalytics = (period?: string) =>
  api.get('/transactions/analytics', { params: { period } });

export const makeTransfer = (data: {
  fromAccountId: string;
  recipient?: string;
  toAccountId?: string;
  amount: number;
  description?: string;
}) => api.post('/transactions/transfer', data);

export const transferOwn = (data: {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  description?: string;
}) => api.post('/transactions/transfer-own', data);

export const resolveRecipient = (value: string) =>
  api.get('/transactions/resolve-recipient', { params: { value } });

// Payments
export const getPaymentCategories = () => api.get('/payments/categories');
export const makePayment = (data: any) => api.post('/payments', data);
export const getScheduledPayments = () => api.get('/payments/scheduled');

// Cards
export const getCollection = (rarity?: string) =>
  api.get('/cards/collection', { params: rarity ? { rarity } : {} });

export const getInventory = (params?: any) => api.get('/cards/inventory', { params });
export const getCard = (id: string) => api.get(`/cards/${id}`);

export const buyCard = (collectionCardId: string) =>
  api.post('/cards/buy', { collectionCardId });

export const sacrificeCard = (sacrificeId: string, targetId: string) =>
  api.post('/cards/sacrifice', { sacrificeId, targetId });
export const convertCard = (cardId: string) =>
  api.post('/cards/convert', { cardId });
export const getRarityStats = () => api.get('/cards/stats/rarities');

// Decks
export const getDecks = () => api.get('/decks');
export const createDeck = (name: string) => api.post('/decks', { name });
export const updateDeck = (id: string, data: any) => api.put(`/decks/${id}`, data);
export const activateDeck = (id: string) => api.put(`/decks/${id}/activate`);
export const getDeckCashback = (id: string) => api.get(`/decks/${id}/cashback`);
export const deleteDeck = (id: string) => api.delete(`/decks/${id}`);

// Trades
export const getTrades = (status?: string) =>
  api.get('/trades', { params: { status } });
export const createTrade = (data: any) => api.post('/trades', data);
export const acceptTrade = (id: string) => api.put(`/trades/${id}/accept`);
export const rejectTrade = (id: string) => api.put(`/trades/${id}/reject`);
export const sendCardAsGift = (cardId: string, toUserId: string) =>
  api.post('/trades/send', { cardId, toUserId });

// Quests
export const getDailyQuests = () => api.get('/quests/daily');
export const claimQuest = (id: string) => api.post(`/quests/${id}/claim`);

// Subscriptions
export const getSubscriptions = () => api.get('/subscriptions');
export const createSubscription = (data: {
  name: string;
  amount: number;
  currency?: string;
  icon?: string;
  category?: string;
  nextPayment: string;
}) => api.post('/subscriptions', data);
export const toggleSubscription = (id: string, isActive: boolean) =>
  api.put(`/subscriptions/${id}`, { isActive });
export const deleteSubscription = (id: string) =>
  api.delete(`/subscriptions/${id}`);

// Limits
export const getLimits = () => api.get('/limits');
export const updateLimit = (id: string, limitAmount: number) =>
  api.put(`/limits/${id}`, { limitAmount });

// Notifications
export const getNotifications = () => api.get('/notifications');
export const markNotificationRead = (id: string) =>
  api.put(`/notifications/${id}/read`);
export const registerPushToken = (token: string) =>
  api.post('/notifications/register-push-token', { token });

export default api;

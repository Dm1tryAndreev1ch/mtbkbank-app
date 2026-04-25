import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';
import * as Sentry from '@sentry/react-native';

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
  } catch {
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

api.interceptors.request.use(async (config) => {
  if (isPublicAuthPath(config.url)) return config;
  const token = await SecureStore.getItemAsync('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      const reqUrl = originalRequest.url || '';
      if (/\/auth\/(register|login)(\?|$)/i.test(reqUrl)) {
        return Promise.reject(error);
      }
      originalRequest._retry = true;
      try {
        const refreshToken = await SecureStore.getItemAsync('refreshToken');
        if (refreshToken) {
          const res = await axios.post(absoluteApiUrl('/auth/refresh'), { refreshToken });
          if (res.data.accessToken) {
            await SecureStore.setItemAsync('token', res.data.accessToken);
            if (res.data.refreshToken) {
              await SecureStore.setItemAsync('refreshToken', res.data.refreshToken);
            }
            originalRequest.headers.Authorization = `Bearer ${res.data.accessToken}`;
            return api(originalRequest);
          }
        }
      } catch {}
    }
    return Promise.reject(error);
  }
);

export const login = async (phone: string, pin: string) => {
  const res = await api.post(absoluteApiUrl('/auth/login'), { phone, pin });
  if (res.data.accessToken) await SecureStore.setItemAsync('token', res.data.accessToken);
  if (res.data.refreshToken) await SecureStore.setItemAsync('refreshToken', res.data.refreshToken);
  // Phase 1 OBS-03: attribute subsequent Sentry events to the authenticated user.
  // Phase 2 REL-01 will move this into tokenStore.setTokens().
  const userId = res.data?.user?.id;
  if (userId) Sentry.setUser({ id: String(userId) });
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
  try {
    await SecureStore.deleteItemAsync('token');
  } catch {}
  try {
    await SecureStore.deleteItemAsync('refreshToken');
  } catch {}
  return api.post(absoluteApiUrl('/auth/register'), body).then(async (res) => {
    try {
      if (res.data.accessToken) await SecureStore.setItemAsync('token', res.data.accessToken);
      if (res.data.refreshToken) await SecureStore.setItemAsync('refreshToken', res.data.refreshToken);
    } catch {
      /* store всё равно выставит токен в памяти */
    }
    return res;
  });
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

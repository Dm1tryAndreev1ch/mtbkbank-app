import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

let API_BASE = 'http://localhost:3000/api';
if (Constants.expoConfig?.hostUri) {
  const host = Constants.expoConfig.hostUri.split(':')[0];
  API_BASE = `http://${host}:3000/api`;
} else if (Platform.OS === 'android') {
  API_BASE = 'http://10.0.2.2:3000/api';
}

const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach token to every request
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Refresh Token Interceptor Sequence
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = await SecureStore.getItemAsync('refreshToken');
        if (refreshToken) {
          const res = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken });
          if (res.data.accessToken) {
             await SecureStore.setItemAsync('token', res.data.accessToken);
             originalRequest.headers.Authorization = `Bearer ${res.data.accessToken}`;
             return api(originalRequest);
          }
        }
      } catch (e) {
         // Refresh token failed radically
      }
    }
    return Promise.reject(error);
  }
);

// Auth
export const login = (phone: string, pin: string) =>
  api.post('/auth/login', { phone, pin }).then(async (res) => {
      // Upon explicit Login grab both keys
      if (res.data.accessToken) await SecureStore.setItemAsync('token', res.data.accessToken);
      if (res.data.refreshToken) await SecureStore.setItemAsync('refreshToken', res.data.refreshToken);
      return res;
  });

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
export const makeTransfer = (data: any) => api.post('/transactions/transfer', data);

// Payments
export const getPaymentCategories = () => api.get('/payments/categories');
export const makePayment = (data: any) => api.post('/payments', data);
export const getScheduledPayments = () => api.get('/payments/scheduled');

// Cards
export const getCollection = (rarity?: string) =>
  api.get('/cards/collection', { params: { rarity } });
export const getInventory = (params?: any) => api.get('/cards/inventory', { params });
export const getCard = (id: string) => api.get(`/cards/${id}`);
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
export const toggleSubscription = (id: string, isActive: boolean) =>
  api.put(`/subscriptions/${id}`, { isActive });

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

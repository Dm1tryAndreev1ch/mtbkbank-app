// mobile/__tests__/store-errors.test.ts
//
// REL-04 + TEST-04 — every load*() reducer in useStore.ts surfaces error.message
// (no silent catches). Mirrors the codebook-shape from Phase 1 backend (D-06):
//   { code, message, requestId }
//
// Without this pin, Plan 02-05's silent-catch removal could regress silently in a
// future refactor. Each reducer is exercised on two paths:
//   1. axios-shaped backend codebook error  → assert exact { code, message, requestId }
//   2. bare network error                    → assert NETWORK_ERROR + Russian fallback

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  wrap: (c: any) => c,
  captureException: jest.fn(),
  setUser: jest.fn(),
  addBreadcrumb: jest.fn(),
  mobileReplayIntegration: jest.fn(() => ({ name: 'MobileReplay' })),
}));

jest.mock('../services/api', () => ({
  __esModule: true,
  login: jest.fn(),
  register: jest.fn(),
  logout: jest.fn(async () => ({ data: {} })),
  getMe: jest.fn(),
  getAccounts: jest.fn(),
  getTransactions: jest.fn(),
  getInventory: jest.fn(),
  getDecks: jest.fn(),
  getDailyQuests: jest.fn(),
  getSubscriptions: jest.fn(),
  getLimits: jest.fn(),
  getNotifications: jest.fn(),
  markNotificationRead: jest.fn(),
}));

jest.mock('../services/tokenStore', () => ({
  __esModule: true,
  hydrate: jest.fn(async () => {}),
  setTokens: jest.fn(async () => {}),
  clear: jest.fn(async () => {}),
  getAccess: jest.fn(() => null),
  getRefresh: jest.fn(() => null),
  isAuthed: jest.fn(() => false),
  isHydrated: jest.fn(() => true),
  subscribe: jest.fn(() => () => {}),
  refreshOnce: jest.fn(),
  STORAGE_KEYS: { access: 'auth.access', refresh: 'auth.refresh' },
}));

jest.mock('../services/secureStorageUiPrefs', () => ({
  __esModule: true,
  secureStorageUiPrefs: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
  },
}));

import * as api from '../services/api';
import { useStore } from '../stores/useStore';

const codebookError = {
  response: {
    data: {
      error: 'BACKEND_ERR_CODE',
      message: 'Бэкенд-ошибка из кодбука',
      requestId: 'req-test-123',
    },
  },
};

const networkError = new Error('Network request failed');

// Mapping: [reducer name on store, api method to mock-reject, Russian fallback message].
// These fallback strings are sourced directly from mobile/stores/useStore.ts (Plan 02-05).
type ReducerEntry = [keyof ReturnType<typeof useStore.getState>, keyof typeof api, string];

const reducerFallbacks: ReducerEntry[] = [
  ['loadUser' as any, 'getMe' as any, 'Не удалось загрузить профиль'],
  ['loadAccounts' as any, 'getAccounts' as any, 'Не удалось загрузить счета'],
  ['loadTransactions' as any, 'getTransactions' as any, 'Не удалось загрузить транзакции'],
  ['loadCards' as any, 'getInventory' as any, 'Не удалось загрузить карты'],
  ['loadDecks' as any, 'getDecks' as any, 'Не удалось загрузить колоды'],
  ['loadQuests' as any, 'getDailyQuests' as any, 'Не удалось загрузить квесты'],
  ['loadSubscriptions' as any, 'getSubscriptions' as any, 'Не удалось загрузить подписки'],
  ['loadLimits' as any, 'getLimits' as any, 'Не удалось загрузить лимиты'],
  ['loadNotifications' as any, 'getNotifications' as any, 'Не удалось загрузить уведомления'],
];

beforeEach(() => {
  // Reset store error to null between tests.
  useStore.setState({
    error: null,
    user: null,
    accounts: [],
    transactions: [],
    cards: [],
    decks: [],
    quests: [],
    subscriptions: [],
    limits: [],
    notifications: [],
  });
  jest.clearAllMocks();
});

describe('useStore — REL-04 every load*() reducer surfaces error.message', () => {
  for (const [reducerName, apiMethodName, fallbackMsg] of reducerFallbacks) {
    test(`${String(reducerName)} surfaces codebook error shape { code, message, requestId }`, async () => {
      (api[apiMethodName] as any) = jest.fn().mockRejectedValue(codebookError);
      await (useStore.getState() as any)[reducerName]();
      const err = useStore.getState().error;
      expect(err).not.toBeNull();
      expect(err?.code).toBe('BACKEND_ERR_CODE');
      expect(err?.message).toBe('Бэкенд-ошибка из кодбука');
      expect(err?.requestId).toBe('req-test-123');
    });

    test(`${String(reducerName)} surfaces NETWORK_ERROR fallback "${fallbackMsg}"`, async () => {
      (api[apiMethodName] as any) = jest.fn().mockRejectedValue(networkError);
      await (useStore.getState() as any)[reducerName]();
      const err = useStore.getState().error;
      expect(err).not.toBeNull();
      expect(err?.code).toBe('NETWORK_ERROR');
      expect(err?.message).toBe(fallbackMsg);
      // No requestId on a bare network error.
      expect(err?.requestId).toBeUndefined();
    });
  }

  test('error.message is non-empty across every reducer (no silent return)', async () => {
    for (const [reducerName, apiMethodName, fallbackMsg] of reducerFallbacks) {
      (api[apiMethodName] as any) = jest.fn().mockRejectedValue(networkError);
      useStore.setState({ error: null });
      await (useStore.getState() as any)[reducerName]();
      const err = useStore.getState().error;
      expect(typeof err?.message).toBe('string');
      expect((err?.message ?? '').length).toBeGreaterThan(0);
      expect(err?.message).toBe(fallbackMsg);
    }
  });

  test('prior store state is NOT cleared on rejection (only error is set)', async () => {
    // Seed the store with non-empty user / accounts / cards.
    useStore.setState({
      user: { id: 'u1', name: 'Test', phone: '+7', mbPoints: 0, status: 'gold', isAdmin: false } as any,
      accounts: [{ id: 'a1' }] as any,
      cards: [{ id: 'c1' }] as any,
    });

    (api.getAccounts as any) = jest.fn().mockRejectedValue(networkError);
    await useStore.getState().loadAccounts();

    // accounts list preserved (the reducer didn't wipe it).
    expect(useStore.getState().accounts).toEqual([{ id: 'a1' }]);
    // user untouched.
    expect(useStore.getState().user?.id).toBe('u1');
    // cards untouched.
    expect(useStore.getState().cards).toEqual([{ id: 'c1' }]);
    // Only error was set.
    expect(useStore.getState().error?.code).toBe('NETWORK_ERROR');
  });
});

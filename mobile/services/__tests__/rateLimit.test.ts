// Plan 04-01 Task 3 — 429 interceptor pin.
// Verifies that any 429 response writes useStore.rateLimit[key] and queues a
// Russian warning toast.

jest.mock('@sentry/react-native', () => ({
  addBreadcrumb: jest.fn(),
  setUser: jest.fn(),
}));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
}));
jest.mock('../tokenStore', () => ({
  getAccess: () => null,
  isAuthed: () => false,
  subscribe: () => () => {},
  setTokens: jest.fn(async () => undefined),
  clear: jest.fn(async () => undefined),
  refreshOnce: jest.fn(),
}));
jest.mock('../secureStorageUiPrefs', () => ({
  secureStorageUiPrefs: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}));

import api from '../api';
import { useStore } from '../../stores/useStore';

describe('429 interceptor', () => {
  beforeEach(() => {
    useStore.setState({
      rateLimit: {},
      toast: { ...useStore.getState().toast, queue: [] },
    });
  });

  test('429 with Retry-After:120 → setRateLimit + warning toast "Попробуйте через 2 мин"', async () => {
    const adapter = jest.fn(async (config) => {
      const err: any = new Error('Too Many Requests');
      err.config = config;
      err.response = {
        status: 429,
        headers: { 'retry-after': '120' },
        data: {},
      };
      throw err;
    });
    api.defaults.adapter = adapter;
    await expect(api.post('/auth/login', { phone: 'x', pin: '1' })).rejects.toBeDefined();

    const map = useStore.getState().rateLimit;
    const entry = map['POST /auth/login'];
    expect(entry).toBeDefined();
    expect(entry.until).toBeGreaterThan(Date.now());
    expect(entry.until).toBeLessThanOrEqual(Date.now() + 121_000);

    const queue = useStore.getState().toast.queue;
    const warn = queue.find((t) => /Попробуйте через 2 мин/.test(t.message));
    expect(warn).toBeDefined();
    expect(warn!.type).toBe('warning');
  });
});

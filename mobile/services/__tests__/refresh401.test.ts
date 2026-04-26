// Plan 04-01 Task 3 — 401-on-refresh interceptor pin (UX-08, D-11).
// 401 with config._isRefresh=true must clear tokens, push session-expired toast,
// router.replace('/login'), and NOT trigger another refresh (no infinite loop).

jest.mock('@sentry/react-native', () => ({
  addBreadcrumb: jest.fn(),
  setUser: jest.fn(),
}));

jest.mock('../tokenStore', () => ({
  getAccess: () => null,
  isAuthed: () => false,
  subscribe: () => () => {},
  setTokens: jest.fn(async () => undefined),
  clear: jest.fn(async () => undefined),
  refreshOnce: jest.fn(),
}));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
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
import * as tokenStore from '../tokenStore';
import { router } from 'expo-router';

const mockClear = tokenStore.clear as jest.Mock;
const mockReplace = router.replace as unknown as jest.Mock;

describe('401-on-refresh interceptor', () => {
  beforeEach(() => {
    mockClear.mockClear();
    mockReplace.mockClear();
    useStore.setState({
      toast: { ...useStore.getState().toast, queue: [] },
    });
  });

  test('401 on _isRefresh request → clear tokens + warning toast + router.replace("/login")', async () => {
    const adapter = jest.fn(async (config) => {
      const err: any = new Error('Unauthorized');
      err.config = config;
      err.response = { status: 401, headers: {}, data: {} };
      throw err;
    });
    api.defaults.adapter = adapter;

    await expect(
      api.post('/auth/refresh', { refreshToken: 'x' }, { _isRefresh: true } as any),
    ).rejects.toBeDefined();

    expect(mockClear).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/login');

    const queue = useStore.getState().toast.queue;
    const warn = queue.find((t) => t.message === 'Сессия истекла, войдите снова');
    expect(warn).toBeDefined();
    expect(warn!.type).toBe('warning');

    // Adapter called once — no infinite refresh loop.
    expect(adapter).toHaveBeenCalledTimes(1);
  });

  test('second 401-on-refresh keeps single redirect (no loop)', async () => {
    const adapter = jest.fn(async (config) => {
      const err: any = new Error('Unauthorized');
      err.config = config;
      err.response = { status: 401, headers: {}, data: {} };
      throw err;
    });
    api.defaults.adapter = adapter;

    await expect(
      api.post('/auth/refresh', { refreshToken: 'x' }, { _isRefresh: true } as any),
    ).rejects.toBeDefined();
    await expect(
      api.post('/auth/refresh', { refreshToken: 'x' }, { _isRefresh: true } as any),
    ).rejects.toBeDefined();

    // Each call routes once. No retry happened (adapter called exactly twice — once per request).
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(mockReplace).toHaveBeenCalledTimes(2);
  });
});

// mobile/__tests__/tokenStore.test.ts
//
// REL-01 (single writer + single-flight refresh)
// REL-05 (disk-before-memory)
// D-02 / D-24 (legacy-key migration)
// D-09 (throw-on-write-failure)
// D-20 (AbortSignal mid-hydrate)
// D-21 (atomic both-tokens persist)
// TEST-04 (canonical mobile tokenStore test target)

const _store: Map<string, string> = new Map();

const mockGet = jest.fn(async (k: string) => _store.get(k) ?? null);
const mockSet = jest.fn(async (k: string, v: string) => {
  _store.set(k, v);
});
const mockDel = jest.fn(async (k: string) => {
  _store.delete(k);
});

jest.mock('expo-secure-store', () => ({
  getItemAsync: (...args: any[]) => (mockGet as any)(...args),
  setItemAsync: (...args: any[]) => (mockSet as any)(...args),
  deleteItemAsync: (...args: any[]) => (mockDel as any)(...args),
}));

const mockSentrySetUser = jest.fn();
const mockSentryBreadcrumb = jest.fn();
jest.mock('@sentry/react-native', () => ({
  setUser: (u: any) => mockSentrySetUser(u),
  addBreadcrumb: (b: any) => mockSentryBreadcrumb(b),
}));

type TokenStoreModule = typeof import('../services/tokenStore');

function loadFresh(): TokenStoreModule {
  let mod!: TokenStoreModule;
  jest.isolateModules(() => {
    mod = require('../services/tokenStore') as TokenStoreModule;
  });
  return mod;
}

beforeEach(() => {
  _store.clear();
  mockGet.mockReset();
  mockSet.mockReset();
  mockDel.mockReset();
  mockSentrySetUser.mockClear();
  mockSentryBreadcrumb.mockClear();
  // Restore default in-memory implementations after reset.
  mockGet.mockImplementation(async (k: string) => _store.get(k) ?? null);
  mockSet.mockImplementation(async (k: string, v: string) => {
    _store.set(k, v);
  });
  mockDel.mockImplementation(async (k: string) => {
    _store.delete(k);
  });
});

describe('tokenStore — REL-01 / REL-05 / D-02 / D-09 / D-20 / D-21 / D-24 / TEST-04', () => {
  test('REL-01: hydrate is a no-op when both stores are empty', async () => {
    const ts = loadFresh();
    await ts.hydrate();
    expect(ts.getAccess()).toBeNull();
    expect(ts.getRefresh()).toBeNull();
    expect(ts.isAuthed()).toBe(false);
    expect(ts.isHydrated()).toBe(true);
  });

  test('REL-01: hydrate reads new keys when only new keys are populated', async () => {
    _store.set('auth.access', 'A');
    _store.set('auth.refresh', 'R');
    const ts = loadFresh();
    await ts.hydrate();
    expect(ts.getAccess()).toBe('A');
    expect(ts.getRefresh()).toBe('R');
    expect(ts.isAuthed()).toBe(true);
  });

  test('D-24: hydrate migrates legacy token/refreshToken keys to auth.access/auth.refresh and deletes legacy keys', async () => {
    _store.set('token', 'old-A');
    _store.set('refreshToken', 'old-R');
    const ts = loadFresh();
    await ts.hydrate();
    expect(ts.getAccess()).toBe('old-A');
    expect(ts.getRefresh()).toBe('old-R');
    expect(ts.isAuthed()).toBe(true);
    expect(_store.get('auth.access')).toBe('old-A');
    expect(_store.get('auth.refresh')).toBe('old-R');
    expect(_store.has('token')).toBe(false);
    expect(_store.has('refreshToken')).toBe(false);
  });

  test('D-24: hydrate prefers new keys when both legacy and new are present, then deletes legacy', async () => {
    _store.set('token', 'old-A');
    _store.set('refreshToken', 'old-R');
    _store.set('auth.access', 'new-A');
    _store.set('auth.refresh', 'new-R');
    const ts = loadFresh();
    await ts.hydrate();
    expect(ts.getAccess()).toBe('new-A');
    expect(ts.getRefresh()).toBe('new-R');
    expect(_store.has('token')).toBe(false);
    expect(_store.has('refreshToken')).toBe(false);
  });

  test('REL-05: setTokens awaits SecureStore writes BEFORE updating in-memory mirror', async () => {
    const ts = loadFresh();
    let resolveFirstWrite!: () => void;
    let firstWriteEntered = false;
    mockSet.mockImplementationOnce(async (k: string, v: string) => {
      firstWriteEntered = true;
      await new Promise<void>((res) => {
        resolveFirstWrite = res;
      });
      _store.set(k, v);
    });

    const settling = ts.setTokens('A', 'R');
    // Allow the microtask to schedule the first setItemAsync.
    await new Promise((r) => setTimeout(r, 0));
    expect(firstWriteEntered).toBe(true);
    // Mirror has NOT been updated yet — disk write still pending.
    expect(ts.getAccess()).toBeNull();
    expect(ts.isAuthed()).toBe(false);

    resolveFirstWrite();
    await settling;
    // Mirror is updated AFTER both writes resolved.
    expect(ts.getAccess()).toBe('A');
    expect(ts.getRefresh()).toBe('R');
    expect(_store.get('auth.access')).toBe('A');
    expect(_store.get('auth.refresh')).toBe('R');
  });

  test('D-21: setTokens rejects when the second setItemAsync rejects; mirror stays at prior values (no half-state)', async () => {
    const ts = loadFresh();
    // Seed prior tokens so we can verify the mirror DOESN'T shift.
    _store.set('auth.access', 'OLD-A');
    _store.set('auth.refresh', 'OLD-R');
    await ts.hydrate();
    expect(ts.getAccess()).toBe('OLD-A');

    mockSet.mockReset();
    mockSet
      .mockImplementationOnce(async (k: string, v: string) => {
        _store.set(k, v);
      })
      .mockImplementationOnce(async () => {
        throw new Error('disk-full');
      });

    await expect(ts.setTokens('NEW-A', 'NEW-R')).rejects.toThrow('disk-full');
    expect(ts.getAccess()).toBe('OLD-A');
    expect(ts.getRefresh()).toBe('OLD-R');
  });

  test('REL-01 single-flight: 5 parallel refreshOnce calls invoke callRefreshFn exactly once', async () => {
    _store.set('auth.access', 'OLD-A');
    _store.set('auth.refresh', 'OLD-R');
    const ts = loadFresh();
    await ts.hydrate();

    const callRefreshFn = jest.fn(async () => {
      await new Promise((r) => setTimeout(r, 30));
      return { accessToken: 'NEW-A', refreshToken: 'NEW-R' };
    });

    const promises = Array.from({ length: 5 }, () => ts.refreshOnce(callRefreshFn));
    const results = await Promise.all(promises);
    expect(callRefreshFn).toHaveBeenCalledTimes(1);
    results.forEach((r) => expect(r).toBe('NEW-A'));
    expect(ts.getAccess()).toBe('NEW-A');
    expect(ts.getRefresh()).toBe('NEW-R');
  });

  test('REL-01 single-flight: rejection clears _refreshPromise; next call starts a fresh flight', async () => {
    _store.set('auth.refresh', 'R');
    const ts = loadFresh();
    await ts.hydrate();

    const callOk = jest.fn(async () => ({ accessToken: 'A2', refreshToken: 'R2' }));
    const callBad = jest.fn(async () => {
      throw new Error('refresh-network');
    });

    await expect(ts.refreshOnce(callBad)).rejects.toThrow('refresh-network');
    // Now a different (succeeding) call starts a new flight.
    const result = await ts.refreshOnce(callOk);
    expect(result).toBe('A2');
    expect(callOk).toHaveBeenCalledTimes(1);
  });

  test('REL-01: refreshOnce rejects synchronously without calling refreshFn when no refresh token is present', async () => {
    const ts = loadFresh();
    const callRefreshFn = jest.fn();
    await expect(ts.refreshOnce(callRefreshFn as any)).rejects.toThrow(/NO_REFRESH_TOKEN/);
    expect(callRefreshFn).not.toHaveBeenCalled();
  });

  test('clear() deletes both new keys and legacy keys; resets memory; calls Sentry.setUser(null)', async () => {
    _store.set('auth.access', 'A');
    _store.set('auth.refresh', 'R');
    _store.set('token', 'legacy-A');
    _store.set('refreshToken', 'legacy-R');
    const ts = loadFresh();
    await ts.hydrate();
    await ts.clear();
    expect(ts.getAccess()).toBeNull();
    expect(ts.getRefresh()).toBeNull();
    expect(ts.isAuthed()).toBe(false);
    expect(_store.has('auth.access')).toBe(false);
    expect(_store.has('auth.refresh')).toBe(false);
    expect(_store.has('token')).toBe(false);
    expect(_store.has('refreshToken')).toBe(false);
    expect(mockSentrySetUser).toHaveBeenCalledWith(null);
  });

  test('Sentry attribution: setTokens with userId calls Sentry.setUser({ id: <string> })', async () => {
    const ts = loadFresh();
    await ts.setTokens('A', 'R', { userId: 42 });
    expect(mockSentrySetUser).toHaveBeenCalledWith({ id: '42' });
  });

  test('subscribe() callback fires after setTokens and after clear; unsubscribe stops it', async () => {
    const ts = loadFresh();
    const cb = jest.fn();
    const unsub = ts.subscribe(cb);
    await ts.setTokens('A', 'R');
    expect(cb).toHaveBeenCalledTimes(1);
    await ts.clear();
    expect(cb).toHaveBeenCalledTimes(2);
    unsub();
    await ts.setTokens('A2', 'R2');
    expect(cb).toHaveBeenCalledTimes(2);
  });

  test('D-20: hydrate with already-aborted AbortSignal rejects with Aborted; mirror untouched', async () => {
    _store.set('auth.access', 'A');
    _store.set('auth.refresh', 'R');
    const ts = loadFresh();
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(ts.hydrate(ctrl.signal)).rejects.toThrow(/Aborted/);
    expect(ts.getAccess()).toBeNull(); // mirror was never updated
  });

  test('D-20: hydrate aborts mid-flight when signal fires after first read but before mirror update', async () => {
    _store.set('auth.access', 'A');
    _store.set('auth.refresh', 'R');
    const ts = loadFresh();
    const ctrl = new AbortController();
    // Make getItemAsync slow so we can abort after the parallel read kicks off.
    mockGet.mockImplementation(async (k: string) => {
      await new Promise((r) => setTimeout(r, 20));
      return _store.get(k) ?? null;
    });
    setTimeout(() => ctrl.abort(), 5);
    await expect(ts.hydrate(ctrl.signal)).rejects.toThrow(/Aborted/);
    expect(ts.getAccess()).toBeNull();
  });
});

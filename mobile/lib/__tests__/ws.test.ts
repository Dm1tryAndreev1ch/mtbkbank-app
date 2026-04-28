// Plan 06-01 Task 2 — ws singleton regression pin (ANIM-04, T-06-01-05).
// Pins: idempotent on() registration, multi-handler dispatch, token-rotation
// reconnect, no-token no-op, already-connected no-op.

jest.mock('@sentry/react-native', () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  setUser: jest.fn(),
  init: jest.fn(),
  wrap: (c: any) => c,
}));

// Module-scoped, mutable mocks. We re-import `mobile/lib/ws` after
// `jest.resetModules()` in each test so the singleton state is fresh, but
// these mock objects persist across re-requires because the jest.mock factory
// closes over them.
let mockAccess: string | null = null;
const mockSubscribers = new Set<() => void>();
function mockFireSubscribers() {
  for (const cb of mockSubscribers) cb();
}

jest.mock('../../services/tokenStore', () => ({
  getAccess: () => mockAccess,
  isAuthed: () => mockAccess !== null,
  subscribe: (cb: () => void) => {
    mockSubscribers.add(cb);
    return () => {
      mockSubscribers.delete(cb);
    };
  },
  setTokens: jest.fn(async (a: string) => {
    mockAccess = a;
    mockFireSubscribers();
  }),
  clear: jest.fn(async () => {
    mockAccess = null;
    mockFireSubscribers();
  }),
}));

// socket.io-client mock — every `io()` call returns a fresh object so we can
// observe per-instance listener registration / disconnection.
type FakeSocket = {
  on: jest.Mock;
  off: jest.Mock;
  disconnect: jest.Mock;
  connected: boolean;
  // Per-event handler registry to simulate emit() in tests.
  _listeners: Map<string, Set<(p: any) => void>>;
  emit: (event: string, payload: any) => void;
};

function makeFakeSocket(): FakeSocket {
  const listeners = new Map<string, Set<(p: any) => void>>();
  const s: FakeSocket = {
    connected: false,
    _listeners: listeners,
    on: jest.fn((event: string, h: (p: any) => void) => {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(h);
    }),
    off: jest.fn((event: string, h: (p: any) => void) => {
      const set = listeners.get(event);
      if (set) set.delete(h);
    }),
    disconnect: jest.fn(() => {
      s.connected = false;
    }),
    emit: (event: string, payload: any) => {
      const set = listeners.get(event);
      if (!set) return;
      for (const h of set) h(payload);
    },
  };
  return s;
}

const mockIo = jest.fn();
jest.mock('socket.io-client', () => ({
  io: (...args: any[]) => mockIo(...args),
}));

describe('mobile/lib/ws — Socket.IO singleton', () => {
  beforeEach(() => {
    jest.resetModules();
    mockSubscribers.clear();
    mockAccess = null;
    mockIo.mockReset();
  });

  test('on() is idempotent — same handler reference registered twice fires once per emit', () => {
    const fake = makeFakeSocket();
    mockIo.mockReturnValue(fake);
    mockAccess = 'tok-A';

    const ws = require('../ws');
    const handler = jest.fn();

    ws.on('CARD_DROP', handler);
    ws.on('CARD_DROP', handler); // dedupe — same handler reference
    ws.connect();

    fake.emit('CARD_DROP', { card: { id: 'c1' } });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ card: { id: 'c1' } });
  });

  test('multiple distinct handlers all fire on emit', () => {
    const fake = makeFakeSocket();
    mockIo.mockReturnValue(fake);
    mockAccess = 'tok-A';

    const ws = require('../ws');
    const h1 = jest.fn();
    const h2 = jest.fn();
    ws.on('CARD_DROP', h1);
    ws.on('CARD_DROP', h2);
    ws.connect();

    fake.emit('CARD_DROP', { card: { id: 'c2' } });
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  test('token rotation via setTokens triggers disconnect + reconnect; handlers re-attach to new socket', async () => {
    const sockA = makeFakeSocket();
    const sockB = makeFakeSocket();
    mockIo.mockReturnValueOnce(sockA).mockReturnValueOnce(sockB);

    mockAccess = 'tok-A';
    const ws = require('../ws');
    const tokenStore = require('../../services/tokenStore');

    const handler = jest.fn();
    ws.on('CARD_EXPIRED', handler);
    ws.connect();
    expect(mockIo).toHaveBeenCalledTimes(1);
    expect(mockIo.mock.calls[0][1]).toMatchObject({ auth: { token: 'tok-A' } });

    // Rotate token — fires the subscribe callback the singleton registered at module load.
    await tokenStore.setTokens('tok-B', 'refresh-B');

    // Old socket severed.
    expect(sockA.disconnect).toHaveBeenCalledTimes(1);
    // New socket created with the fresh token.
    expect(mockIo).toHaveBeenCalledTimes(2);
    expect(mockIo.mock.calls[1][1]).toMatchObject({ auth: { token: 'tok-B' } });

    // The previously-registered handler is re-attached on the new socket.
    sockB.emit('CARD_EXPIRED', { userCardId: 'uc1' });
    expect(handler).toHaveBeenCalledWith({ userCardId: 'uc1' });
  });

  test('connect() with no token is a silent no-op (no socket created)', () => {
    mockAccess = null;
    const ws = require('../ws');
    expect(() => ws.connect()).not.toThrow();
    expect(mockIo).not.toHaveBeenCalled();
  });

  test('connect() while a socket already exists is a no-op (no duplicate io() call)', () => {
    const fake = makeFakeSocket();
    mockIo.mockReturnValue(fake);
    mockAccess = 'tok-A';
    const ws = require('../ws');

    ws.connect();
    ws.connect();
    fake.connected = true;
    ws.connect();

    expect(mockIo).toHaveBeenCalledTimes(1);
  });
});

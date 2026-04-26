// REL-12 (Plan 04-01 Task 1) — pin the merge contract for HTTP/WS entity payloads.
// Mirrors success-criterion verbatim: stale HTTP fetch loses to fresh Socket event.

jest.mock('@sentry/react-native', () => ({
  addBreadcrumb: jest.fn(),
}));

import { mergeEntity, mergeList } from '../mergeByUpdatedAt';

describe('mergeByUpdatedAt', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    jest.clearAllMocks();
  });

  test('REL-12: stale HTTP fetch loses to fresh Socket event with newer updatedAt', () => {
    const existing = { id: 'c1', name: 'A', updatedAt: '2026-04-26T10:00:00Z' };
    const wsFresh = { id: 'c1', name: 'A-fresh', updatedAt: '2026-04-26T10:05:00Z' };
    const afterWs = mergeEntity(existing, wsFresh, 'ws');
    expect(afterWs.name).toBe('A-fresh');

    const stale = { id: 'c1', name: 'A-stale', updatedAt: '2026-04-26T10:00:00Z' };
    const afterHttp = mergeEntity(afterWs, stale, 'http');
    expect(afterHttp.name).toBe('A-fresh');
  });

  test('equal updatedAt + ws source → incoming wins', () => {
    const existing = { id: 'c1', name: 'A', updatedAt: '2026-04-26T10:00:00Z' };
    const incoming = { id: 'c1', name: 'B', updatedAt: '2026-04-26T10:00:00Z' };
    expect(mergeEntity(existing, incoming, 'ws').name).toBe('B');
  });

  test('equal updatedAt + http source → existing wins', () => {
    const existing = { id: 'c1', name: 'A', updatedAt: '2026-04-26T10:00:00Z' };
    const incoming = { id: 'c1', name: 'B', updatedAt: '2026-04-26T10:00:00Z' };
    expect(mergeEntity(existing, incoming, 'http').name).toBe('A');
  });

  test('incoming.updatedAt missing → existing wins, console.warn fires once with id', () => {
    const existing = { id: 'c1', name: 'A', updatedAt: '2026-04-26T10:00:00Z' };
    const incoming = { id: 'c1', name: 'B' } as any;
    const result = mergeEntity(existing, incoming, 'ws');
    expect(result.name).toBe('A');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('c1');
  });

  test('existing undefined → incoming wins regardless of source', () => {
    const incoming = { id: 'c1', name: 'B', updatedAt: '2026-04-26T10:00:00Z' };
    expect(mergeEntity(undefined, incoming, 'http').name).toBe('B');
    expect(mergeEntity(undefined, incoming, 'ws').name).toBe('B');
  });

  test('mergeList dedupes by id, preserves existing order, appends new ids', () => {
    const existing = [
      { id: 'a', name: 'A0', updatedAt: '2026-04-26T10:00:00Z' },
      { id: 'b', name: 'B0', updatedAt: '2026-04-26T10:00:00Z' },
    ];
    const incoming = [
      { id: 'b', name: 'B1', updatedAt: '2026-04-26T10:05:00Z' }, // newer
      { id: 'c', name: 'C0', updatedAt: '2026-04-26T10:01:00Z' }, // new id
      { id: 'a', name: 'A-stale', updatedAt: '2026-04-26T09:00:00Z' }, // stale
    ];
    const out = mergeList(existing, incoming, 'ws');
    expect(out.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(out.find((x) => x.id === 'a')!.name).toBe('A0'); // stale loses
    expect(out.find((x) => x.id === 'b')!.name).toBe('B1'); // fresh wins
    expect(out.find((x) => x.id === 'c')!.name).toBe('C0');
  });

  test('toast.show appends entry; same key replaces existing', () => {
    jest.isolateModules(() => {
      jest.doMock('../../services/api', () => ({}));
      jest.doMock('../../services/tokenStore', () => ({
        getAccess: () => null,
        isAuthed: () => false,
        subscribe: () => () => {},
      }));
      jest.doMock('../../services/secureStorageUiPrefs', () => ({
        secureStorageUiPrefs: {
          getItem: async () => null,
          setItem: async () => undefined,
          removeItem: async () => undefined,
        },
      }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { useStore } = require('../useStore');
      useStore.getState().toast.show('msg1', 'error', { key: 'k1' });
      expect(useStore.getState().toast.queue).toHaveLength(1);
      useStore.getState().toast.show('msg2', 'error', { key: 'k1' });
      expect(useStore.getState().toast.queue).toHaveLength(1);
      expect(useStore.getState().toast.queue[0].message).toBe('msg2');
    });
  });

  test('network.setOnline updates isOnline', () => {
    jest.isolateModules(() => {
      jest.doMock('../../services/api', () => ({}));
      jest.doMock('../../services/tokenStore', () => ({
        getAccess: () => null,
        isAuthed: () => false,
        subscribe: () => () => {},
      }));
      jest.doMock('../../services/secureStorageUiPrefs', () => ({
        secureStorageUiPrefs: {
          getItem: async () => null,
          setItem: async () => undefined,
          removeItem: async () => undefined,
        },
      }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { useStore } = require('../useStore');
      expect(useStore.getState().network.isOnline).toBe(true);
      useStore.getState().network.setOnline(false);
      expect(useStore.getState().network.isOnline).toBe(false);
    });
  });
});

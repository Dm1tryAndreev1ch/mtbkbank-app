/**
 * Phase-4 gap-closure pin (REL-12 wiring): asserts that store loaders run incoming
 * payloads through mergeList rather than overwriting state. The mergeByUpdatedAt
 * helper has its own unit tests; this suite is the *integration pin* — it would
 * have caught the gap-2 regression where helper existed but reducers ignored it.
 */

import { useStore } from '../useStore';

jest.mock('../../services/api', () => ({
  getInventory: jest.fn(),
  getDecks: jest.fn(),
  getTransactions: jest.fn(),
  getAccounts: jest.fn(),
  getNotifications: jest.fn(),
}));

jest.mock('../../services/tokenStore', () => ({
  getAccess: () => null,
  isAuthed: () => false,
  isHydrated: () => true,
  hydrate: jest.fn(),
  clear: jest.fn(),
  subscribe: jest.fn(),
}));

const api = require('../../services/api');

describe('store reducers wire mergeList (REL-12 pin)', () => {
  beforeEach(() => {
    useStore.setState({
      cards: [],
      decks: [],
      transactions: [],
      accounts: [],
      notifications: [],
    });
    jest.clearAllMocks();
  });

  test('loadCards: stale HTTP after fresh ws-pushed entity → ws survives', async () => {
    // Seed state as if a ws push had landed first with a fresh updatedAt.
    useStore.setState({
      cards: [{ id: 'c1', name: 'fresh-from-ws', updatedAt: '2026-04-27T10:05:00Z' }],
    });
    api.getInventory.mockResolvedValueOnce({
      data: [{ id: 'c1', name: 'stale-from-http', updatedAt: '2026-04-27T10:00:00Z' }],
    });

    await useStore.getState().loadCards();

    expect(useStore.getState().cards).toEqual([
      { id: 'c1', name: 'fresh-from-ws', updatedAt: '2026-04-27T10:05:00Z' },
    ]);
  });

  test('loadTransactions: fresh HTTP wins over older existing entity', async () => {
    useStore.setState({
      transactions: [{ id: 't1', amount: 100, updatedAt: '2026-04-27T09:00:00Z' }],
    });
    api.getTransactions.mockResolvedValueOnce({
      data: {
        transactions: [{ id: 't1', amount: 200, updatedAt: '2026-04-27T10:00:00Z' }],
      },
    });

    await useStore.getState().loadTransactions();

    expect(useStore.getState().transactions[0]).toMatchObject({ id: 't1', amount: 200 });
  });

  test('loadDecks: new ids from HTTP are appended', async () => {
    useStore.setState({
      decks: [{ id: 'd1', name: 'A', updatedAt: '2026-04-27T10:00:00Z' }],
    });
    api.getDecks.mockResolvedValueOnce({
      data: [
        { id: 'd1', name: 'A', updatedAt: '2026-04-27T10:00:00Z' },
        { id: 'd2', name: 'B', updatedAt: '2026-04-27T10:01:00Z' },
      ],
    });

    await useStore.getState().loadDecks();

    const ids = useStore.getState().decks.map((d: any) => d.id).sort();
    expect(ids).toEqual(['d1', 'd2']);
  });

  test('loadAccounts: empty existing + payload → payload wins', async () => {
    api.getAccounts.mockResolvedValueOnce({
      data: [{ id: 'a1', balance: 500, updatedAt: '2026-04-27T10:00:00Z' }],
    });

    await useStore.getState().loadAccounts();

    expect(useStore.getState().accounts).toHaveLength(1);
    expect(useStore.getState().accounts[0]).toMatchObject({ id: 'a1', balance: 500 });
  });

  test('loadNotifications: stale HTTP after fresh existing → existing survives', async () => {
    useStore.setState({
      notifications: [{ id: 'n1', read: true, updatedAt: '2026-04-27T10:05:00Z' }],
    });
    api.getNotifications.mockResolvedValueOnce({
      data: {
        notifications: [{ id: 'n1', read: false, updatedAt: '2026-04-27T10:00:00Z' }],
        unreadCount: 0,
      },
    });

    await useStore.getState().loadNotifications();

    expect(useStore.getState().notifications[0]).toMatchObject({ id: 'n1', read: true });
  });
});

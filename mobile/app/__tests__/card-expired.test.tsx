/**
 * Plan 06-06 Task 2 — useCardExpiredListener + InventoryGrid collapse pin.
 *
 * Pins ANIM-07 success criterion 4: 0-HP cards disappear via server-confirmed
 * CARD_EXPIRED only; never optimistically deleted by client.
 *
 * Six tests:
 *   1. Live event triggers collapse (pendingExpire flips, toast.show fires
 *      with locked Russian copy).
 *   2. Card removed after 800ms timeout.
 *   3. Idempotent re-receipt (toast.show called only once).
 *   4. No optimistic local-only delete: only the listener and queueLocalExpire
 *      mutate cards; no UI surface imports removeCard.
 *   5. Reconciliation diff (loadCards missing a card) drives the same path.
 *   6. Russian toast copy is LOCKED at `Карта «${name}» утратила здоровье`
 *      with guillemets «» (D-18).
 */
import React from 'react';
import { act, render } from '@testing-library/react-native';
import { execSync } from 'child_process';
import * as path from 'path';

// ---- captured ws handler so the test can dispatch CARD_EXPIRED synthetically ----
let capturedHandler: ((p: any) => void) | null = null;
const mockWsOn = jest.fn((event: string, handler: (p: any) => void) => {
  if (event === 'CARD_EXPIRED') capturedHandler = handler;
});
const mockWsOff = jest.fn(() => {
  capturedHandler = null;
});

jest.mock('../../lib/ws', () => ({
  __esModule: true,
  ws: {
    connect: jest.fn(),
    on: (...args: any[]) => (mockWsOn as any)(...args),
    off: (...args: any[]) => (mockWsOff as any)(...args),
    disconnect: jest.fn(),
  },
}));

const mockGetInventory = jest.fn();
jest.mock('../../services/api', () => ({
  getInventory: (...args: any[]) => (mockGetInventory as any).apply(null, args),
}));

jest.mock('@sentry/react-native', () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  setUser: jest.fn(),
  init: jest.fn(),
  wrap: (c: any) => c,
}));

jest.mock('../../services/tokenStore', () => ({
  getAccess: () => 'tok',
  isAuthed: () => true,
  isHydrated: () => true,
  hydrate: jest.fn(async () => {}),
  setTokens: jest.fn(),
  clear: jest.fn(),
  getRefresh: () => null,
  subscribe: () => () => {},
  refreshOnce: jest.fn(),
}));

jest.mock('../../services/secureStorageUiPrefs', () => ({
  secureStorageUiPrefs: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}));

import { useStore } from '../../stores/useStore';
import { useCardExpiredListener } from '../../hooks/useCardExpiredListener';

function TestHost() {
  useCardExpiredListener();
  return null;
}

const card = (id: string, name: string, pendingExpire = false) => ({
  id,
  updatedAt: '2026-04-28T00:00:00.000Z',
  health: 0,
  pendingExpire,
  collectionCard: { id: `cc-${id}`, name, rarity: 'COMMON', brandIcon: 'storefront' },
});

beforeEach(() => {
  capturedHandler = null;
  mockWsOn.mockClear();
  mockWsOff.mockClear();
  mockGetInventory.mockReset();
  jest.useFakeTimers();
  act(() => {
    useStore.setState({
      cards: [],
      toast: { ...useStore.getState().toast, queue: [] },
    } as any);
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useCardExpiredListener (success criterion 4)', () => {
  test('1) live CARD_EXPIRED event flips pendingExpire + fires Russian Toast', () => {
    act(() => {
      useStore.setState({ cards: [card('c1', 'TestCardName')] } as any);
    });
    render(<TestHost />);
    expect(capturedHandler).not.toBeNull();

    act(() => {
      capturedHandler!({
        userCardId: 'c1',
        collectionCard: { id: 'cc-c1', name: 'TestCardName', rarity: 'COMMON', brandIcon: 'storefront' },
      });
    });

    const after = useStore.getState();
    expect(after.cards.find((c: any) => c.id === 'c1')?.pendingExpire).toBe(true);
    const toast = after.toast.queue.find((e) => e.message.includes('TestCardName'));
    expect(toast).toBeDefined();
    expect(toast!.message).toBe('Карта «TestCardName» утратила здоровье');
    expect(toast!.type).toBe('error');
  });

  test('2) card is removed from store 800ms after CARD_EXPIRED', () => {
    act(() => {
      useStore.setState({ cards: [card('c1', 'A'), card('c2', 'B')] } as any);
    });
    render(<TestHost />);

    act(() => {
      capturedHandler!({
        userCardId: 'c1',
        collectionCard: { id: 'cc-c1', name: 'A', rarity: 'COMMON', brandIcon: 'storefront' },
      });
    });
    expect(useStore.getState().cards).toHaveLength(2); // still present, mid-collapse

    act(() => {
      jest.advanceTimersByTime(800);
    });

    const remaining = useStore.getState().cards;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('c2');
  });

  test('3) re-receipt of CARD_EXPIRED for the same card is a no-op (idempotent)', () => {
    act(() => {
      useStore.setState({ cards: [card('c1', 'A')] } as any);
    });
    render(<TestHost />);

    const payload = {
      userCardId: 'c1',
      collectionCard: { id: 'cc-c1', name: 'A', rarity: 'COMMON', brandIcon: 'storefront' },
    };
    act(() => {
      capturedHandler!(payload);
      capturedHandler!(payload);
      capturedHandler!(payload);
    });

    const toasts = useStore.getState().toast.queue.filter((e) => e.message.includes('A'));
    expect(toasts).toHaveLength(1);
  });

  test('4) no UI component imports removeCard directly (success criterion 4)', () => {
    // Static guarantee: outside of useStore.ts (declaration), useCardExpiredListener.ts
    // (live event), and __tests__ files, NO source file may reference removeCard.
    // queueLocalExpire (defined in useStore.ts) is the sole gateway for reconciliation.
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    let result = '';
    try {
      result = execSync(
        `cd ${JSON.stringify(repoRoot)} && git grep -lE 'removeCard\\b' -- 'mobile/' || true`,
        { encoding: 'utf8' },
      );
    } catch {
      // git grep with `|| true` should never throw, but guard anyway.
    }
    const offenders = result
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((p) => !p.endsWith('mobile/stores/useStore.ts'))
      .filter((p) => !p.endsWith('mobile/hooks/useCardExpiredListener.ts'))
      .filter((p) => !p.includes('__tests__'));
    expect(offenders).toEqual([]);
  });

  test('5) reconciliation diff via loadCards triggers the same collapse path', async () => {
    // Seed two cards locally; server returns only one — the missing card must
    // flow through queueLocalExpire (markCardPendingExpire, then removeCard).
    act(() => {
      useStore.setState({ cards: [card('c1', 'A'), card('c2', 'B')] } as any);
    });
    mockGetInventory.mockResolvedValueOnce({ data: [card('c1', 'A')] });

    await act(async () => {
      await useStore.getState().loadCards();
    });

    // Stagger 0 — c2 immediately gets pendingExpire flagged.
    act(() => {
      jest.advanceTimersByTime(0);
    });
    expect(useStore.getState().cards.find((c: any) => c.id === 'c2')?.pendingExpire).toBe(true);

    // 800ms later — c2 is physically removed.
    act(() => {
      jest.advanceTimersByTime(800);
    });
    expect(useStore.getState().cards.find((c: any) => c.id === 'c2')).toBeUndefined();
    expect(useStore.getState().cards).toHaveLength(1);
  });

  test('6) Russian toast copy is LOCKED with guillemets «» (D-18)', () => {
    act(() => {
      useStore.setState({ cards: [card('c1', 'TestCardName')] } as any);
    });
    render(<TestHost />);

    act(() => {
      capturedHandler!({
        userCardId: 'c1',
        collectionCard: { id: 'cc-c1', name: 'TestCardName', rarity: 'COMMON', brandIcon: 'storefront' },
      });
    });

    const toast = useStore
      .getState()
      .toast.queue.find((e) => e.message.includes('TestCardName'))!;
    // Exact string match — guillemets, not ASCII quotes.
    expect(toast.message).toBe('Карта «TestCardName» утратила здоровье');
    // Belt-and-suspenders: ASCII quotes must NOT appear.
    expect(toast.message).not.toMatch(/["']/);
    // Belt-and-suspenders: the deprecated wording «исчезла» must NOT appear.
    expect(toast.message).not.toMatch(/исчезла/);
  });
});

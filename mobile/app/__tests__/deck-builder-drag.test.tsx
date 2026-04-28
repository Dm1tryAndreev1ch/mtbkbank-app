/**
 * Plan 06-04 Task 2 — deck-builder drag + ConfirmDialog regression pins.
 *
 * Pins:
 *   1. Layout-key stability: reordering deck slots preserves stable testIDs
 *      (proxy for "no (0,0) flicker" success criterion 3 — without stable
 *      ids the Animated.View remounts and Layout transitions fire from origin).
 *   2. ConfirmDialog presence on tap-to-remove with locked Russian title
 *      'Убрать карту из активной колоды?' (D-13).
 *   3. Cancel ('Отмена') closes the dialog without mutating the deck.
 *   4. Confirm ('Убрать') invokes apiClient.updateDeck with the slot removed.
 *   5. Alert.alert is NEVER called in the deck-card removal flow.
 */
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

// ───── Mocks ─────────────────────────────────────────────────────────────────

const mockUpdateDeck = jest.fn(async () => ({ data: {} }));
const mockActivateDeck = jest.fn(async () => ({ data: {} }));
const mockGetCollection = jest.fn(async () => ({ data: [] }));

jest.mock('../../services/api', () => ({
  __esModule: true,
  updateDeck: (...args: any[]) => (mockUpdateDeck as any).apply(null, args),
  activateDeck: (...args: any[]) => (mockActivateDeck as any).apply(null, args),
  getCollection: (...args: any[]) => (mockGetCollection as any).apply(null, args),
  buyCard: jest.fn(async () => ({ data: {} })),
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

jest.mock('../../lib/ws', () => ({
  __esModule: true,
  ws: {
    connect: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    disconnect: jest.fn(),
  },
}));

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({}),
}));

jest.mock('@sentry/react-native', () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  setUser: jest.fn(),
  init: jest.fn(),
  wrap: (c: any) => c,
}));

jest.mock('@expo/vector-icons', () => ({ MaterialIcons: () => null }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: any) => children }));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  NotificationFeedbackType: { Success: 'success', Error: 'error', Warning: 'warning' },
  ImpactFeedbackStyle: { Heavy: 'heavy', Medium: 'medium', Light: 'light' },
}));

jest.mock('react-native-reanimated', () => {
  // Patch reanimated/mock with extras the deck-builder screen needs.
  let base: any;
  try {
    base = require('react-native-reanimated/mock');
  } catch {
    base = {};
  }
  return {
    __esModule: true,
    ...base,
    default: base.default ?? {
      View: ({ children }: any) => children,
      createAnimatedComponent: (c: any) => c,
    },
    FadeIn: base.FadeIn ?? { delay: () => ({}) },
    Layout: base.Layout ?? { springify: () => ({ damping: () => ({ stiffness: () => ({}) }) }) },
    useSharedValue: base.useSharedValue ?? ((v: any) => ({ value: v })),
    useAnimatedStyle: base.useAnimatedStyle ?? (() => ({})),
    useAnimatedRef: base.useAnimatedRef ?? (() => ({ current: null })),
    useReducedMotion: () => false,
    withTiming: base.withTiming ?? ((v: any) => v),
    withSpring: base.withSpring ?? ((v: any) => v),
    withSequence: base.withSequence ?? ((...args: any[]) => args[args.length - 1]),
    withRepeat: base.withRepeat ?? ((v: any) => v),
    runOnJS: base.runOnJS ?? ((fn: any) => fn),
    cancelAnimation: base.cancelAnimation ?? (() => {}),
    measure: base.measure ?? (() => null),
  };
});

jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  return {
    __esModule: true,
    Gesture: {
      LongPress: () => {
        const obj: any = {};
        obj.minDuration = () => obj;
        obj.onStart = () => obj;
        obj.simultaneousWithExternalGesture = () => obj;
        return obj;
      },
      Pan: () => {
        const obj: any = {};
        obj.onChange = () => obj;
        obj.onEnd = () => obj;
        return obj;
      },
      Simultaneous: (...gestures: any[]) => ({ gestures }),
    },
    GestureDetector: ({ children }: any) => React.createElement(React.Fragment, null, children),
    GestureHandlerRootView: ({ children }: any) => children,
  };
});

// ───── Test bootstrap ────────────────────────────────────────────────────────

import { useStore } from '../../stores/useStore';
import CardsScreen from '../(tabs)/cards';

const makeCard = (id: string, name: string, rarity = 'COMMON', health = 80) => ({
  id,
  health,
  collectionCardId: `cc-${id}`,
  collectionCard: {
    id: `cc-${id}`,
    name,
    rarity,
    cashbackPercent: 5,
    brandName: name,
    brandIcon: 'storefront',
    maxHealth: 100,
    isActive: true,
  },
});

function seedStore(deckCardIds: string[]) {
  const cards = deckCardIds.map((id) => makeCard(id, id.toUpperCase()));
  const deckCards = deckCardIds.map((id, slotIndex) => ({
    slotIndex,
    userCard: cards.find((c) => c.id === id),
  }));
  act(() => {
    useStore.setState({
      user: { id: 'u1', name: 'Test', mbPoints: 100 } as any,
      cards: cards as any,
      decks: [{ id: 'deck-1', name: 'Основная', isActive: true, deckCards }] as any,
      quests: [] as any,
      unreadCount: 0,
      loadCards: jest.fn(async () => {}) as any,
      loadDecks: jest.fn(async () => {}) as any,
      loadQuests: jest.fn(async () => {}) as any,
      loadUser: jest.fn(async () => {}) as any,
    });
  });
}

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  mockUpdateDeck.mockClear();
  mockActivateDeck.mockClear();
  mockGetCollection.mockClear();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  alertSpy.mockRestore();
});

// ───── Tests ─────────────────────────────────────────────────────────────────

describe('deck-builder drag + ConfirmDialog', () => {
  test('1. Layout-key stability: reordering preserves deck-slot testIDs', async () => {
    seedStore(['a', 'b', 'c']);
    const { queryByTestId, rerender } = render(<CardsScreen />);
    await act(async () => {});
    expect(queryByTestId('deck-slot-a')).not.toBeNull();
    expect(queryByTestId('deck-slot-b')).not.toBeNull();
    expect(queryByTestId('deck-slot-c')).not.toBeNull();

    // Reorder slots — stable id keys must keep the same testIDs reachable.
    seedStore(['c', 'a', 'b']);
    rerender(<CardsScreen />);
    await act(async () => {});
    expect(queryByTestId('deck-slot-a')).not.toBeNull();
    expect(queryByTestId('deck-slot-b')).not.toBeNull();
    expect(queryByTestId('deck-slot-c')).not.toBeNull();
  });

  test('2. Tapping a slotted card opens ConfirmDialog with locked Russian title', async () => {
    seedStore(['a', 'b', 'c']);
    const { getByTestId, getByText } = render(<CardsScreen />);
    await act(async () => {});
    fireEvent.press(getByTestId('deck-slot-a'));
    await act(async () => {});
    expect(getByText('Убрать карту из активной колоды?')).toBeTruthy();
    expect(getByText('Убрать')).toBeTruthy();
    expect(getByText('Отмена')).toBeTruthy();
  });

  test('3. Cancel closes the dialog without mutating the deck', async () => {
    seedStore(['a', 'b']);
    const { getByTestId } = render(<CardsScreen />);
    await act(async () => {});
    fireEvent.press(getByTestId('deck-slot-a'));
    await act(async () => {});
    fireEvent.press(getByTestId('confirm-dialog-cancel'));
    await act(async () => {});
    expect(mockUpdateDeck).not.toHaveBeenCalled();
  });

  test('4. Confirm invokes apiClient.updateDeck with the slot removed', async () => {
    seedStore(['a', 'b', 'c']);
    const { getByTestId } = render(<CardsScreen />);
    await act(async () => {});
    fireEvent.press(getByTestId('deck-slot-a'));
    await act(async () => {});
    fireEvent.press(getByTestId('confirm-dialog-confirm'));
    await act(async () => { await Promise.resolve(); });
    expect(mockUpdateDeck).toHaveBeenCalledTimes(1);
    const call = mockUpdateDeck.mock.calls[0] as any[];
    const payload = call[1] as { cardIds: string[] };
    expect(payload.cardIds).not.toContain('a');
    expect(payload.cardIds).toEqual(expect.arrayContaining(['b', 'c']));
  });

  test('5. Alert.alert is NEVER called in the deck-card removal flow', async () => {
    seedStore(['a', 'b']);
    const { getByTestId } = render(<CardsScreen />);
    await act(async () => {});
    fireEvent.press(getByTestId('deck-slot-a'));
    await act(async () => {});
    fireEvent.press(getByTestId('confirm-dialog-confirm'));
    await act(async () => { await Promise.resolve(); });

    // None of the Alert.alert calls (if any from unrelated code paths) should be
    // a deck-removal prompt. Belt-and-suspenders: the entire deck-removal flow
    // must not produce any Alert.alert with a Russian "Убрать"/"колод" body.
    const removalAlerts = alertSpy.mock.calls.filter(([title, msg]) => {
      const hay = `${title ?? ''} ${msg ?? ''}`;
      return /Убрать|колод/i.test(hay);
    });
    expect(removalAlerts).toHaveLength(0);
  });
});

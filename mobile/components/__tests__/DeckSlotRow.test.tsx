// Plan 06-00 Task 2 — DeckSlotRow extraction pin.
// Pins stable id keys (NEVER `key={i}`) per RESEARCH Pitfall 1 — without this,
// Layout transitions added in P03/P04 would flicker through (0,0) when slots reorder.
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('@sentry/react-native', () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  setUser: jest.fn(),
  init: jest.fn(),
  wrap: (c: any) => c,
}));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  NotificationFeedbackType: { Success: 'success', Error: 'error', Warning: 'warning' },
  ImpactFeedbackStyle: { Heavy: 'heavy', Medium: 'medium', Light: 'light' },
}));
jest.mock('../../services/api', () => ({}));
jest.mock('../../services/tokenStore', () => ({
  getAccess: () => null,
  isAuthed: () => false,
  subscribe: () => () => {},
}));

import { DeckSlotRow } from '../cards/DeckSlotRow';

const makeCard = (id: string, name: string, rarity = 'COMMON', health = 80) => ({
  id,
  health,
  collectionCard: {
    name,
    rarity,
    cashbackPercent: 5,
    brandName: name,
    brandIcon: 'storefront',
    maxHealth: 100,
  },
});

describe('DeckSlotRow', () => {
  test('renders 5 slots regardless of input length (pads with empty)', () => {
    const slots = [
      { cardId: 'a', card: makeCard('a', 'Alpha') },
      { cardId: 'b', card: makeCard('b', 'Bravo', 'RARE') },
      { cardId: 'c', card: makeCard('c', 'Charlie', 'EPIC') },
    ];
    const { getAllByTestId } = render(
      <DeckSlotRow slots={slots} onSlotTap={() => {}} />,
    );
    // 3 filled + 2 padded empties = 5 slots total.
    const allSlots = getAllByTestId(/^deck-slot-/);
    expect(allSlots).toHaveLength(5);
    expect(getAllByTestId('deck-slot-a')).toHaveLength(1);
    expect(getAllByTestId('deck-slot-empty-3')).toHaveLength(1);
    expect(getAllByTestId('deck-slot-empty-4')).toHaveLength(1);
  });

  test('reordering slots preserves stable id keys (no index-based collision)', () => {
    const initial = [
      { cardId: 'a', card: makeCard('a', 'Alpha') },
      { cardId: 'b', card: makeCard('b', 'Bravo', 'RARE') },
      { cardId: 'c', card: makeCard('c', 'Charlie', 'EPIC') },
    ];
    const { rerender, queryByTestId } = render(
      <DeckSlotRow slots={initial} onSlotTap={() => {}} />,
    );
    expect(queryByTestId('deck-slot-a')).not.toBeNull();
    expect(queryByTestId('deck-slot-b')).not.toBeNull();
    expect(queryByTestId('deck-slot-c')).not.toBeNull();

    // Reorder: c, a, b — same ids must still be findable (stable key requirement).
    const reordered = [
      { cardId: 'c', card: makeCard('c', 'Charlie', 'EPIC') },
      { cardId: 'a', card: makeCard('a', 'Alpha') },
      { cardId: 'b', card: makeCard('b', 'Bravo', 'RARE') },
    ];
    rerender(<DeckSlotRow slots={reordered} onSlotTap={() => {}} />);
    expect(queryByTestId('deck-slot-a')).not.toBeNull();
    expect(queryByTestId('deck-slot-b')).not.toBeNull();
    expect(queryByTestId('deck-slot-c')).not.toBeNull();
  });

  test('tap on filled slot fires onSlotTap with the card and index', () => {
    const onSlotTap = jest.fn();
    const slots = [
      { cardId: 'a', card: makeCard('a', 'Alpha') },
    ];
    const { getByTestId } = render(<DeckSlotRow slots={slots} onSlotTap={onSlotTap} />);
    fireEvent.press(getByTestId('deck-slot-a'));
    expect(onSlotTap).toHaveBeenCalledTimes(1);
    expect(onSlotTap.mock.calls[0][0]).toMatchObject({ id: 'a' });
    expect(onSlotTap.mock.calls[0][1]).toBe(0);
  });

  test('tap on empty slot fires onSlotTap with null and index', () => {
    const onSlotTap = jest.fn();
    const { getByTestId } = render(<DeckSlotRow slots={[]} onSlotTap={onSlotTap} />);
    fireEvent.press(getByTestId('deck-slot-empty-2'));
    expect(onSlotTap).toHaveBeenCalledWith(null, 2);
  });

  test('disabled prop blocks tap propagation', () => {
    const onSlotTap = jest.fn();
    const slots = [{ cardId: 'a', card: makeCard('a', 'Alpha') }];
    const { getByTestId } = render(
      <DeckSlotRow slots={slots} onSlotTap={onSlotTap} disabled />,
    );
    fireEvent.press(getByTestId('deck-slot-a'));
    expect(onSlotTap).not.toHaveBeenCalled();
  });
});

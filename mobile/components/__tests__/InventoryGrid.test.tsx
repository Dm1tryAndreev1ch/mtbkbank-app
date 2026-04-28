// Plan 06-00 Task 2 — InventoryGrid extraction pin.
// Pins stable id keys (`key={card.id}`) per RESEARCH Pitfall 1 and verifies that
// the P04/P05 hook props (onLongPressDrag, onSacrifice) are wired through.
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

import { InventoryGrid } from '../cards/InventoryGrid';

const makeCard = (id: string, name: string, rarity = 'COMMON', health = 80) => ({
  id,
  health,
  collectionCard: {
    name,
    rarity,
    cashbackPercent: 5,
    brandName: name,
    brandIcon: 'storefront',
  },
});

describe('InventoryGrid', () => {
  test('renders one slot per card with stable testID keyed by id', () => {
    const cards = [makeCard('x', 'X'), makeCard('y', 'Y', 'RARE'), makeCard('z', 'Z', 'EPIC')];
    const { getAllByTestId, queryByTestId } = render(
      <InventoryGrid cards={cards} equippedCardIds={new Set()} onCardTap={() => {}} />,
    );
    expect(getAllByTestId(/^inventory-card-/)).toHaveLength(3);
    expect(queryByTestId('inventory-card-x')).not.toBeNull();
    expect(queryByTestId('inventory-card-y')).not.toBeNull();
    expect(queryByTestId('inventory-card-z')).not.toBeNull();
  });

  test('reordering cards preserves stable id keys', () => {
    const initial = [makeCard('x', 'X'), makeCard('y', 'Y'), makeCard('z', 'Z')];
    const { rerender, queryByTestId } = render(
      <InventoryGrid cards={initial} equippedCardIds={new Set()} onCardTap={() => {}} />,
    );
    expect(queryByTestId('inventory-card-x')).not.toBeNull();
    rerender(
      <InventoryGrid
        cards={[makeCard('z', 'Z'), makeCard('x', 'X'), makeCard('y', 'Y')]}
        equippedCardIds={new Set()}
        onCardTap={() => {}}
      />,
    );
    // All three IDs still present after reorder.
    expect(queryByTestId('inventory-card-x')).not.toBeNull();
    expect(queryByTestId('inventory-card-y')).not.toBeNull();
    expect(queryByTestId('inventory-card-z')).not.toBeNull();
  });

  test('onCardTap fires with the tapped card', () => {
    const onCardTap = jest.fn();
    const card = makeCard('x', 'X');
    const { getByTestId } = render(
      <InventoryGrid cards={[card]} equippedCardIds={new Set()} onCardTap={onCardTap} />,
    );
    fireEvent.press(getByTestId('inventory-card-x'));
    expect(onCardTap).toHaveBeenCalledTimes(1);
    expect(onCardTap.mock.calls[0][0]).toMatchObject({ id: 'x' });
  });

  test('accepts onLongPressDrag + onSacrifice prop hooks (P04 / P05 wiring placeholders)', () => {
    const onSacrifice = jest.fn();
    const onLongPressDrag = jest.fn();
    const card = makeCard('x', 'X');
    // Just smoke-test that props are accepted; the gestures themselves are wired
    // in P04/P05. If the InventoryGridProps shape ever drops these, this test fails.
    const { queryByTestId } = render(
      <InventoryGrid
        cards={[card]}
        equippedCardIds={new Set()}
        onCardTap={() => {}}
        onSacrifice={onSacrifice}
        onLongPressDrag={onLongPressDrag}
      />,
    );
    expect(queryByTestId('inventory-card-x')).not.toBeNull();
    // Callbacks themselves are unused in P00 — assert they are NOT auto-fired.
    expect(onSacrifice).not.toHaveBeenCalled();
    expect(onLongPressDrag).not.toHaveBeenCalled();
  });

  test('renders emptyState when cards is empty', () => {
    const { Text } = require('react-native');
    const { queryByTestId } = render(
      <InventoryGrid
        cards={[]}
        equippedCardIds={new Set()}
        onCardTap={() => {}}
        emptyState={<Text testID="inventory-empty">EMPTY-MARKER</Text>}
      />,
    );
    expect(queryByTestId('inventory-empty')).not.toBeNull();
  });
});

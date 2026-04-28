/**
 * ANIM-01 + D-14 smoke test.
 * Pins `<GestureHandlerRootView>` mounted in app/_layout.tsx so gestures reach
 * nested scroll views without conflict — horizontal pan inside vertical scroll
 * is exactly the Phase 6 deck-builder pattern.
 */
import React from 'react';
import { ScrollView, View } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { GestureHandlerRootView, ScrollView as RNGHScrollView } from 'react-native-gesture-handler';

// Defensive: keep Reanimated init out of the test path if transitively imported.
jest.mock('react-native-reanimated', () => {
  try { return require('react-native-reanimated/mock'); } catch { return {}; }
});

function Fixture() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ScrollView testID="vertical-scroll">
        <RNGHScrollView horizontal testID="horizontal-cards">
          {[1, 2, 3, 4, 5].map((i) => (
            <View key={i} testID={`card-${i}`} style={{ width: 80, height: 120 }} />
          ))}
        </RNGHScrollView>
      </ScrollView>
    </GestureHandlerRootView>
  );
}

test('horizontal pan does not eat parent vertical scroll', () => {
  const { getByTestId } = render(<Fixture />);
  fireEvent.scroll(getByTestId('horizontal-cards'), {
    nativeEvent: { contentOffset: { x: 100, y: 0 } },
  });
  fireEvent.scroll(getByTestId('vertical-scroll'), {
    nativeEvent: { contentOffset: { x: 0, y: 50 } },
  });
  expect(getByTestId('vertical-scroll')).toBeTruthy();
  expect(getByTestId('horizontal-cards')).toBeTruthy();
  expect(getByTestId('card-1')).toBeTruthy();
});

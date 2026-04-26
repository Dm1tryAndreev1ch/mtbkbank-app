// Plan 04-01 Task 2 — ErrorBoundary fallback + reset pin.
import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
  addBreadcrumb: jest.fn(),
}));
jest.mock('../../services/tokenStore', () => ({
  clear: jest.fn(async () => undefined),
}));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
}));

import { ErrorBoundary } from '../ErrorBoundary';

function Boom(): React.ReactElement {
  throw new Error('boom');
}

test('renders fallback heading "Что-то пошло не так" and Sentry captures', () => {
  // Suppress React's expected error log noise
  const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  const Sentry = require('@sentry/react-native');
  const { getByText } = render(
    <ErrorBoundary scope="root" routeName="test">
      <Boom />
    </ErrorBoundary>,
  );
  expect(getByText('Что-то пошло не так')).toBeTruthy();
  expect(Sentry.captureException).toHaveBeenCalled();
  errSpy.mockRestore();
});

test('reset re-renders children when no longer throwing', () => {
  const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  let shouldThrow = true;
  function Maybe() {
    if (shouldThrow) throw new Error('boom');
    return <Text>safe</Text>;
  }
  const { getByTestId, getByText, queryByText, rerender } = render(
    <ErrorBoundary scope="root">
      <Maybe />
    </ErrorBoundary>,
  );
  expect(getByText('Что-то пошло не так')).toBeTruthy();
  shouldThrow = false;
  fireEvent.press(getByTestId('error-boundary-retry'));
  rerender(
    <ErrorBoundary scope="root">
      <Maybe />
    </ErrorBoundary>,
  );
  expect(queryByText('Что-то пошло не так')).toBeNull();
  expect(getByText('safe')).toBeTruthy();
  errSpy.mockRestore();
});

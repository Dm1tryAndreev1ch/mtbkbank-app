// Plan 04-01 Task 2 — ConfirmDialog destructive-bg + button wiring pin.
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('@sentry/react-native', () => ({ addBreadcrumb: jest.fn() }));

import { ConfirmDialog } from '../ConfirmDialog';

test('destructive primary button has #ef4444 background', () => {
  const { getByTestId } = render(
    <ConfirmDialog
      visible
      onDismiss={jest.fn()}
      title="Выйти?"
      confirmLabel="Выйти"
      isDestructive
    />,
  );
  const primary = getByTestId('confirm-dialog-confirm');
  const styleArr = Array.isArray(primary.props.style) ? primary.props.style.flat() : [primary.props.style];
  const merged = Object.assign({}, ...styleArr.filter(Boolean));
  expect(merged.backgroundColor).toBe('#ef4444');
});

test('cancel calls cancelButton.onPress AND onDismiss', () => {
  const onCancel = jest.fn();
  const onDismiss = jest.fn();
  const { getByTestId } = render(
    <ConfirmDialog
      visible
      onDismiss={onDismiss}
      title="t"
      confirmLabel="OK"
      cancelButton={{ onPress: onCancel }}
    />,
  );
  fireEvent.press(getByTestId('confirm-dialog-cancel'));
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onDismiss).toHaveBeenCalledTimes(1);
});

test('confirm calls confirmButton.onPress AND onDismiss', () => {
  const onConfirm = jest.fn();
  const onDismiss = jest.fn();
  const { getByTestId } = render(
    <ConfirmDialog
      visible
      onDismiss={onDismiss}
      title="t"
      confirmLabel="OK"
      confirmButton={{ onPress: onConfirm }}
    />,
  );
  fireEvent.press(getByTestId('confirm-dialog-confirm'));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onDismiss).toHaveBeenCalledTimes(1);
});

test('default cancelLabel is "Отмена"', () => {
  const { getByText } = render(
    <ConfirmDialog visible onDismiss={jest.fn()} title="t" confirmLabel="OK" />,
  );
  expect(getByText('Отмена')).toBeTruthy();
});

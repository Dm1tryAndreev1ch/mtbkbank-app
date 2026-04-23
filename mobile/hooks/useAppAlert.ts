import { useState, useCallback, useRef } from 'react';
import { AppAlertType, AppAlertButton } from '../components/AppAlert';

export interface AlertOptions {
  type?: AppAlertType;
  title: string;
  message?: string;
  confirmButton?: AppAlertButton;
  cancelButton?: AppAlertButton;
  onDismiss?: () => void;
  autoDismissMs?: number;
}

interface AlertState extends AlertOptions {
  visible: boolean;
}

const HIDDEN: AlertState = { visible: false, title: '' };

/**
 * useAppAlert
 *
 * Provides a queue-based alert system. If an alert is shown while another
 * is already visible, the new one is enqueued and shown after the current
 * one is dismissed.
 *
 * Usage:
 *   const alert = useAppAlert();
 *   alert.success('Успешно', 'Операция выполнена');
 *   alert.error('Ошибка', 'Что-то пошло не так');
 *   alert.confirm({ title: 'Удалить?', confirmButton: { text: 'Да', onPress: doDelete } });
 *
 *   // In JSX:
 *   <AppAlert {...alert.props} />
 */
export function useAppAlert() {
  const [state, setState] = useState<AlertState>(HIDDEN);
  const queue = useRef<AlertOptions[]>([]);

  const _show = useCallback((opts: AlertOptions) => {
    setState({ ...opts, visible: true });
  }, []);

  const dismiss = useCallback(() => {
    setState(prev => ({ ...prev, visible: false }));
    // After hide animation (~180 ms), show next queued alert
    setTimeout(() => {
      const next = queue.current.shift();
      if (next) _show(next);
    }, 220);
  }, [_show]);

  /** Generic show — enqueues if an alert is already visible */
  const show = useCallback(
    (opts: AlertOptions) => {
      setState(prev => {
        if (prev.visible) {
          queue.current.push(opts);
          return prev;
        }
        return { ...opts, visible: true };
      });
    },
    []
  );

  const success = useCallback(
    (title: string, message?: string, onDismiss?: () => void) =>
      show({ type: 'success', title, message, confirmButton: { text: 'Отлично!' }, onDismiss }),
    [show]
  );

  const error = useCallback(
    (title: string, message?: string, onDismiss?: () => void) =>
      show({ type: 'error', title, message, confirmButton: { text: 'Понятно' }, onDismiss }),
    [show]
  );

  const warning = useCallback(
    (title: string, message?: string, onDismiss?: () => void) =>
      show({ type: 'warning', title, message, confirmButton: { text: 'Хорошо' }, onDismiss }),
    [show]
  );

  const info = useCallback(
    (title: string, message?: string, onDismiss?: () => void) =>
      show({ type: 'info', title, message, confirmButton: { text: 'Ок' }, onDismiss }),
    [show]
  );

  const confirm = useCallback(
    (opts: Omit<AlertOptions, 'type'>) =>
      show({ ...opts, type: 'confirm' }),
    [show]
  );

  /** Spread into <AppAlert /> */
  const props = {
    visible: state.visible,
    type: state.type,
    title: state.title,
    message: state.message,
    confirmButton: state.confirmButton,
    cancelButton: state.cancelButton,
    autoDismissMs: state.autoDismissMs,
    onDismiss: () => {
      state.onDismiss?.();
      dismiss();
    },
  };

  return { show, dismiss, success, error, warning, info, confirm, props };
}

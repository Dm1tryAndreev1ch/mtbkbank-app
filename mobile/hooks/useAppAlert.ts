import { useState, useCallback } from 'react';
import { AppAlertType } from '../components/AppAlert';

interface AlertOptions {
  type?: AppAlertType;
  title: string;
  message?: string;
  buttonText?: string;
  cancelText?: string;
  onClose?: () => void;
  onConfirm?: () => void;
}

interface AlertState extends AlertOptions {
  visible: boolean;
}

const DEFAULT: AlertState = {
  visible: false,
  type: 'info',
  title: '',
};

export function useAppAlert() {
  const [state, setState] = useState<AlertState>(DEFAULT);

  const hide = useCallback(() => {
    setState(prev => {
      const cb = prev.onClose;
      setTimeout(() => cb?.(), 0);
      return { ...prev, visible: false, onClose: undefined };
    });
  }, []);

  const show = useCallback((opts: AlertOptions) => {
    setState({ ...opts, visible: true });
  }, []);

  const confirm = useCallback((opts: AlertOptions) => {
    setState({ ...opts, type: 'confirm', visible: true });
  }, []);

  const success = useCallback(
    (title: string, message?: string, onClose?: () => void) => {
      setState({ type: 'success', title, message, buttonText: 'Отлично!', onClose, visible: true });
    }, []
  );

  const error = useCallback(
    (title: string, message?: string) => {
      setState({ type: 'error', title, message, buttonText: 'Понятно', visible: true });
    }, []
  );

  const warning = useCallback(
    (title: string, message?: string) => {
      setState({ type: 'warning', title, message, buttonText: 'Хорошо', visible: true });
    }, []
  );

  const info = useCallback(
    (title: string, message?: string) => {
      setState({ type: 'info', title, message, buttonText: 'Ок', visible: true });
    }, []
  );

  return { state, show, hide, confirm, success, error, warning, info };
}
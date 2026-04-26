// Plan 04-01 D-05 — class-based ErrorBoundary. Catches render errors, sends
// to Sentry with route/scope/requestId tags, renders Russian fallback UI.
// Reset clears local error state; root scope offers "Выйти и войти заново".
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Sentry from '@sentry/react-native';
import { router } from 'expo-router';
import * as tokenStore from '../services/tokenStore';
import { Fonts, Spacing, BorderRadius, Shadows } from '../constants/theme';

interface Props {
  scope: 'root' | 'route';
  routeName?: string;
  children: React.ReactNode;
}
interface State {
  error: Error | null;
  requestId?: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, requestId: (error as any)?.requestId };
  }

  componentDidCatch(error: Error): void {
    try {
      Sentry.captureException(error, {
        tags: {
          scope: this.props.scope,
          route: this.props.routeName ?? 'unknown',
          requestId: this.state.requestId ?? 'none',
        },
      });
    } catch {
      // Sentry failure must not crash the boundary itself.
    }
  }

  reset = (): void => {
    this.setState({ error: null, requestId: undefined });
  };

  exitToLogin = async (): Promise<void> => {
    try {
      await tokenStore.clear();
    } catch {
      // best-effort
    }
    try {
      router.replace('/login');
    } catch {
      // best-effort
    }
    this.reset();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <View style={styles.root} testID="error-boundary-fallback">
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <MaterialIcons name="error-outline" size={56} color="#4F8EF7" />
          </View>
          <Text style={styles.title}>Что-то пошло не так</Text>
          <Text style={styles.subtitle}>
            Мы уже знаем о проблеме. Попробуйте обновить экран.
          </Text>
          {this.state.requestId ? (
            <Text style={styles.requestId}>{`Код ошибки: ${this.state.requestId}`}</Text>
          ) : null}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={this.reset}
              activeOpacity={0.8}
              accessibilityLabel="Перезагрузить"
              testID="error-boundary-retry"
            >
              <MaterialIcons name="refresh" size={20} color="#fff" />
              <Text style={styles.primaryBtnText}>Перезагрузить</Text>
            </TouchableOpacity>
          </View>
          {this.props.scope === 'root' ? (
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={this.exitToLogin}
              activeOpacity={0.8}
              accessibilityLabel="Выйти и войти заново"
              testID="error-boundary-exit"
            >
              <Text style={styles.secondaryBtnText}>Выйти и войти заново</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  }
}

export function withRouteBoundary<P extends object>(
  Component: React.ComponentType<P>,
  routeName: string,
): React.ComponentType<P> {
  return function WrappedWithBoundary(props: P) {
    return (
      <ErrorBoundary scope="route" routeName={routeName}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    maxWidth: 360,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    ...Shadows.md,
    gap: Spacing.base,
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: Fonts.sizes['2xl'],
    fontFamily: 'Manrope-ExtraBold',
    color: '#0f172a',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: Fonts.sizes.base,
    fontFamily: 'Manrope-Medium',
    color: '#475569',
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  requestId: {
    fontSize: Fonts.sizes.sm,
    fontFamily: 'Manrope-Medium',
    color: '#94a3b8',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    width: '100%',
    marginTop: Spacing.sm,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: '#4F8EF7',
    paddingVertical: Spacing.base,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.base,
    ...Shadows.primary,
  },
  primaryBtnText: {
    fontSize: Fonts.sizes.base,
    fontFamily: 'Manrope-ExtraBold',
    color: '#ffffff',
  },
  secondaryBtn: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.base,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.base,
    borderWidth: 1,
    borderColor: '#94A3B8',
    marginTop: Spacing.sm,
  },
  secondaryBtnText: {
    fontSize: Fonts.sizes.base,
    fontFamily: 'Manrope-Medium',
    color: '#0f172a',
  },
});

export default ErrorBoundary;

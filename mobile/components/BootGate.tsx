// mobile/components/BootGate.tsx
//
// REL-02 + D-01 / D-04 / D-05 / D-20 — explicit 4-state boot machine for the mobile app.
// idle -> loading -> ready (or -> error). 4-second AbortController hard timeout.
//
// Decoupled from Zustand for the BOOT path: tokenStore.hydrate() reads SecureStore directly,
// avoiding the persist-rehydrate chicken-and-egg. After state === 'ready', the routing
// useEffect SUBSCRIBES to useStore selectors (isAuthed, onboarded) so post-login state
// transitions re-fire the effect and route to /(tabs). This is the canonical login-success
// path (W4); submitLogin does NOT call router.replace.

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import * as tokenStore from '../services/tokenStore';
import { getOnboarded } from '../services/secureStorageUiPrefs';
import { useStore } from '../stores/useStore';
import { useThemeColor } from '../hooks/useThemeColor';
import BootError from './BootError';

type BootState = 'idle' | 'loading' | 'ready' | 'error';

// Reduced from 8000 — fast enough for real devices, short enough to surface errors quickly.
const HYDRATE_TIMEOUT_MS = 4000;

interface Props {
  children: React.ReactNode;
}

export default function BootGate({ children }: Props) {
  const [state, setState] = useState<BootState>('idle');
  const isAuthed = useStore((s) => s.isAuthed);
  const onboarded = useStore((s) => s.onboarded);
  const colors = useThemeColor();

  const controllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runBoot = useCallback(async () => {
    setState('loading');
    if (controllerRef.current) controllerRef.current.abort();
    if (timerRef.current) clearTimeout(timerRef.current);

    const controller = new AbortController();
    controllerRef.current = controller;

    timerRef.current = setTimeout(() => {
      controller.abort();
    }, HYDRATE_TIMEOUT_MS);

    try {
      const [, onboardedFromDisk] = await Promise.all([
        tokenStore.hydrate(controller.signal),
        getOnboarded(),
      ]);
      if (controller.signal.aborted) throw new Error('Aborted');
      useStore.setState({
        onboarded: onboardedFromDisk,
        isAuthed: tokenStore.isAuthed(),
      });
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setState('ready');
    } catch {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setState('error');
    }
  }, []);

  useEffect(() => {
    runBoot();
    return () => {
      if (controllerRef.current) controllerRef.current.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [runBoot]);

  // Delay router.replace by one tick so expo-router's navigation container
  // is fully mounted before we attempt navigation.
  useEffect(() => {
    if (state !== 'ready') return;
    const t = setTimeout(() => {
      if (!onboarded) {
        router.replace('/onboarding');
        return;
      }
      if (isAuthed) {
        router.replace('/(tabs)');
      } else {
        router.replace('/login');
      }
    }, 0);
    return () => clearTimeout(t);
  }, [state, isAuthed, onboarded]);

  const onRetry = useCallback(() => {
    runBoot();
  }, [runBoot]);

  const onExit = useCallback(async () => {
    await tokenStore.clear();
    router.replace('/login');
  }, []);

  if (state === 'error') return <BootError onRetry={onRetry} onExit={onExit} />;

  if (state !== 'ready') {
    return (
      <View style={[styles.splash, { backgroundColor: colors.background }]} testID="boot-splash">
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

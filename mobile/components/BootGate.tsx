// mobile/components/BootGate.tsx
//
// REL-02 + D-01 / D-04 / D-05 / D-20 — explicit 4-state boot machine for the mobile app.
// idle -> loading -> ready (or -> error). 8-second AbortController hard timeout.
//
// Decoupled from Zustand for the BOOT path: tokenStore.hydrate() reads SecureStore directly,
// avoiding the persist-rehydrate chicken-and-egg. After state === 'ready', the routing
// useEffect SUBSCRIBES to useStore selectors (isAuthed, onboarded) so post-login state
// transitions (Plan 02-05's tokenStore.subscribe -> useStore.setState({isAuthed: true})) re-fire
// the effect and route to /(tabs). This is the canonical login-success path (W4); Plan 02-08's
// submitLogin does NOT call router.replace.
//
// Routing is imperative via expo-router once 'ready'; mobile/app/index.tsx becomes a no-op.

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import * as tokenStore from '../services/tokenStore';
import { getOnboarded } from '../services/secureStorageUiPrefs';
import { useStore } from '../stores/useStore';
import BootError from './BootError';

type BootState = 'idle' | 'loading' | 'ready' | 'error';

const HYDRATE_TIMEOUT_MS = 8000;

interface Props {
  children: React.ReactNode;
}

export default function BootGate({ children }: Props) {
  const [state, setState] = useState<BootState>('idle');
  // Subscribe to Zustand selectors so the routing useEffect re-runs when these change post-boot.
  const isAuthed = useStore((s) => s.isAuthed);
  const onboarded = useStore((s) => s.onboarded);

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
      // Mirror onboarded into Zustand so the routing useEffect (which selects from useStore) sees it.
      // Mirror isAuthed too — tokenStore.subscribe (Plan 02-05) usually drives this, but on initial
      // hydrate we set it explicitly so the first routing pass uses correct values.
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

  // Initial mount.
  useEffect(() => {
    runBoot();
    return () => {
      if (controllerRef.current) controllerRef.current.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [runBoot]);

  // Routing once 'ready'. Re-fires on isAuthed / onboarded transitions (W4 — post-login flow).
  useEffect(() => {
    if (state !== 'ready') return;
    if (!onboarded) {
      router.replace('/onboarding');
      return;
    }
    if (isAuthed) {
      router.replace('/(tabs)');
    } else {
      router.replace('/login');
    }
  }, [state, isAuthed, onboarded]);

  const onRetry = useCallback(() => {
    runBoot();
  }, [runBoot]);

  const onExit = useCallback(async () => {
    await tokenStore.clear();
    router.replace('/login');
  }, []);

  if (state === 'error') return <BootError onRetry={onRetry} onExit={onExit} />;
  if (state !== 'ready') return <View testID="boot-splash" />;
  return <>{children}</>;
}

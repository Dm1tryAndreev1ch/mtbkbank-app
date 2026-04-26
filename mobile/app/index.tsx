// mobile/app/index.tsx
//
// D-05 — BootGate owns bootstrap routing. By the time React tries to render this screen,
// BootGate has already called `router.replace('/(tabs)' | '/login' | '/onboarding')`.
// This file is a structural placeholder; the original bootstrap logic moved into BootGate.
//
// M-M5: wrap render in withRouteBoundary so any thrown render error (e.g. expo-router
// transient issue while the boot redirect resolves) renders the fallback rather than
// a white screen.

import React from 'react';
import { Redirect } from 'expo-router';
import { withRouteBoundary } from '../components/ErrorBoundary';

function Index() {
  // Defensive fallback: BootGate's routing effect normally fires before this renders.
  // If somehow it hasn't, /login is the safest landing point.
  return <Redirect href="/login" />;
}

export default withRouteBoundary(Index, 'bootstrap');

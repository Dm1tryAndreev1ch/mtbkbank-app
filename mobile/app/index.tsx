// mobile/app/index.tsx
//
// D-05 — BootGate owns bootstrap routing. By the time React tries to render this screen,
// BootGate has already called `router.replace('/(tabs)' | '/login' | '/onboarding')`.
// This file is a structural placeholder; the original bootstrap logic moved into BootGate.

import { Redirect } from 'expo-router';

export default function Index() {
  // Defensive fallback: BootGate's routing effect normally fires before this renders.
  // If somehow it hasn't, /login is the safest landing point.
  return <Redirect href="/login" />;
}

/**
 * ANIM-02 + D-02 — re-export Reanimated's useReducedMotion.
 *
 * Reads OS prefers-reduced-motion at app start (snapshot — see Phase 5
 * RESEARCH.md Pitfall 1). We own the import path; Reanimated owns the impl.
 * Single point of swap if the PROJECT animation-stack lock changes.
 *
 * NOTE: reads at app start only. A user toggling Reduce Motion in OS
 * settings while the app is running will not see the new value until
 * relaunch. Live-listener subscription is deferred to v1.1.
 */
export { useReducedMotion } from 'react-native-reanimated';

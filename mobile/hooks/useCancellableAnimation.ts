/**
 * ANIM-02 + D-04 — leak-prevention seatbelt for worklet animations.
 *
 * Usage:
 *   const register = useCancellableAnimation();
 *   const sv = useSharedValue(0);
 *   register(sv);
 *   sv.value = withSpring(1);
 *
 * On unmount, every registered SharedValue receives cancelAnimation().
 * Misuse (registering after unmount, never registering) is silent by
 * design (D-05) — the unit test is the structural guardrail.
 */
import { useEffect, useRef } from 'react';
import { cancelAnimation, type SharedValue } from 'react-native-reanimated';

export function useCancellableAnimation() {
  // Set is idempotent — re-registering the same SV is a no-op.
  const registered = useRef<Set<SharedValue<unknown>>>(new Set());

  useEffect(() => {
    const set = registered.current;
    return () => {
      for (const sv of set) {
        cancelAnimation(sv);
      }
      set.clear();
    };
  }, []);

  // Returning the SV enables chained registration:
  //   const x = register(useSharedValue(0));
  return function register<T>(sv: SharedValue<T>): SharedValue<T> {
    registered.current.add(sv as SharedValue<unknown>);
    return sv;
  };
}

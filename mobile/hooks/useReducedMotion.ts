/**
 * Phase-4 stub. Phase-5 ANIM-02 will read AccessibilityInfo.isReduceMotionEnabled()
 * and subscribe to changes. For now this returns false so primitives behave as if
 * the OS preference is unset — Phase-4 plans depend on the contract existing, not
 * on the value being live.
 */
export function useReducedMotion(): boolean {
  return false;
}

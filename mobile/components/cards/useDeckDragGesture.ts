// Phase 6 P04 D-10/D-11 — drag-to-equip gesture composition.
//
// Lives in its own file to satisfy the Phase-5 ANIM-03 belt-and-suspenders
// regression-guard check (no worklet file references the Zustand store hook).
// cards.tsx reads from the Zustand store everywhere; this hook receives only
// SharedValues + a JS-thread `equip` callback invoked through runOnJS at
// completion. No store reads happen here.
//
// Pattern lifted verbatim from .planning/phases/06-gamified-animations-card-deck-hp/
//   06-PATTERNS.md §"Analog A — gesture composition" (LongPress + Pan,
//   simultaneousWithExternalGesture, worklet measure()).
import { useCallback } from 'react';
import {
  measure,
  runOnJS,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import {
  Gesture,
  type ComposedGesture,
  type GestureType,
} from 'react-native-gesture-handler';

import { GAMIFIED_SPRING } from './animationConstants';

export interface DeckDragGestureDeps {
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  dragScale: SharedValue<number>;
  dragOpacity: SharedValue<number>;
  draggingCardIdSV: SharedValue<string | null>;
  slotEmptySV: SharedValue<boolean[]>;
  slotRefsRef: React.MutableRefObject<Array<React.RefObject<any> | null>>;
  /** Reduced-motion gate (D-15) — when true, springs collapse to 200ms linear timings. */
  reducedMotion: boolean;
  /** JS-thread completion callback — invoked through runOnJS. */
  equip: (cardId: string, slotIndex: number) => void;
  /** JS-thread haptic helpers — invoked through runOnJS. */
  onPickup: () => void;
  onSnap: () => void;
}

export function useDeckDragGesture(deps: DeckDragGestureDeps) {
  const {
    dragX, dragY, dragScale, dragOpacity, draggingCardIdSV, slotEmptySV,
    slotRefsRef, reducedMotion, equip, onPickup, onSnap,
  } = deps;

  return useCallback(
    (cardId: string): ComposedGesture | GestureType | null => {
      const reduced = reducedMotion;
      const longPress = Gesture.LongPress()
        .minDuration(300)
        .onStart(() => {
          'worklet';
          draggingCardIdSV.value = cardId;
          dragX.value = 0;
          dragY.value = 0;
          if (reduced) {
            dragScale.value = 1;
            dragOpacity.value = 1;
          } else {
            dragScale.value = withSpring(1.08, GAMIFIED_SPRING);
            dragOpacity.value = withTiming(1, { duration: 120 });
          }
          runOnJS(onPickup)();
        });

      const panGesture = Gesture.Pan()
        .onChange((e) => {
          'worklet';
          dragX.value = e.translationX;
          dragY.value = e.translationY;
        })
        .onEnd(() => {
          'worklet';
          let nearest = -1;
          let minDist = Infinity;
          const empties = slotEmptySV.value;
          for (let i = 0; i < 5; i++) {
            const ref = slotRefsRef.current[i];
            if (!ref) continue;
            const m = measure(ref as any);
            if (!m) continue;
            if (!empties[i]) continue;
            const dx = (m.pageX + m.width / 2) - dragX.value;
            const dy = (m.pageY + m.height / 2) - dragY.value;
            const d = dx * dx + dy * dy;
            if (d < minDist) {
              minDist = d;
              nearest = i;
            }
          }
          if (nearest >= 0) {
            const m = measure(slotRefsRef.current[nearest] as any);
            if (m) {
              if (reduced) {
                dragX.value = withTiming(m.pageX, { duration: 200 });
                dragY.value = withTiming(m.pageY, { duration: 200 }, (finished) => {
                  'worklet';
                  if (finished) {
                    runOnJS(onSnap)();
                    runOnJS(equip)(cardId, nearest);
                  }
                  dragOpacity.value = 0;
                  dragScale.value = 1;
                  draggingCardIdSV.value = null;
                });
              } else {
                dragX.value = withSpring(m.pageX, GAMIFIED_SPRING);
                dragY.value = withSpring(m.pageY, GAMIFIED_SPRING, (finished) => {
                  'worklet';
                  if (finished) {
                    runOnJS(onSnap)();
                    runOnJS(equip)(cardId, nearest);
                  }
                  dragOpacity.value = withTiming(0, { duration: 150 });
                  dragScale.value = 1;
                  draggingCardIdSV.value = null;
                });
              }
              return;
            }
          }
          // No empty slot — spring back to origin.
          if (reduced) {
            dragX.value = withTiming(0, { duration: 200 });
            dragY.value = withTiming(0, { duration: 200 });
            dragOpacity.value = 0;
            dragScale.value = 1;
          } else {
            dragX.value = withSpring(0, GAMIFIED_SPRING);
            dragY.value = withSpring(0, GAMIFIED_SPRING);
            dragOpacity.value = withTiming(0, { duration: 150 });
            dragScale.value = withSpring(1, GAMIFIED_SPRING);
          }
          draggingCardIdSV.value = null;
        });

      longPress.simultaneousWithExternalGesture(panGesture);
      return Gesture.Simultaneous(longPress, panGesture);
    },
    [
      reducedMotion, equip, onPickup, onSnap,
      dragX, dragY, dragScale, dragOpacity, draggingCardIdSV, slotEmptySV, slotRefsRef,
    ],
  );
}

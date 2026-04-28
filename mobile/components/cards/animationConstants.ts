// Phase 6 P00 — shared spring + Layout transition constants for the gamified
// card / deck / HP animations. Single source of truth referenced by D-10/D-11/
// D-12/D-13/D-19. Do NOT inline these values elsewhere — keep one canonical
// definition so motion timing stays consistent across DeckSlotRow, InventoryGrid,
// the drag-snap gesture in cards.tsx, and the upcoming SacrificeOverlay.
import { Layout } from 'react-native-reanimated';

export const GAMIFIED_SPRING = { damping: 14, stiffness: 180 } as const;
export const SLOT_LAYOUT = Layout.springify().damping(14).stiffness(180);

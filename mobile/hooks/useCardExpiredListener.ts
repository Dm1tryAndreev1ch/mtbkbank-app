// Plan 06-06 D-18/D-19/D-22 — root-mounted listener for backend `CARD_EXPIRED`
// Socket.IO events. Drives the per-card collapse animation in InventoryGrid by
// flipping `pendingExpire` on the matching card, then physically removes it
// after 800ms (300ms collapse + buffer).
//
// Idempotent: a re-received CARD_EXPIRED for the same card is a no-op (D-20).
// Read-only against the store (`useStore.getState()`); no selector subscription
// — the hook itself never re-renders.
//
// PII: payload only carries the user's own card metadata (room-scoped emit on
// the backend; see threat T-06-06-01). No PII added to local store beyond the
// in-memory `pendingExpire` flag (T-06-06-04 — accept).
//
// Russian copy is LOCKED at `Карта «${name}» утратила здоровье` per D-18 +
// UI-SPEC §Copywriting Contract (guillemets, NOT ASCII quotes).
import { useEffect } from 'react';
import * as Sentry from '@sentry/react-native';

import { ws } from '../lib/ws';
import { useStore } from '../stores/useStore';

interface CardExpiredPayload {
  userCardId: string;
  collectionCard: { id: string; name: string; rarity: string; brandIcon: string };
}

function isValidPayload(p: unknown): p is CardExpiredPayload {
  if (!p || typeof p !== 'object') return false;
  const o = p as Partial<CardExpiredPayload>;
  return (
    typeof o.userCardId === 'string' &&
    o.userCardId.length > 0 &&
    !!o.collectionCard &&
    typeof o.collectionCard === 'object' &&
    typeof (o.collectionCard as { name?: unknown }).name === 'string'
  );
}

export function useCardExpiredListener(): void {
  useEffect(() => {
    const handler = (payload: unknown) => {
      if (!isValidPayload(payload)) {
        Sentry.addBreadcrumb({
          category: 'ws.cardExpired',
          level: 'warning',
          message: 'invalid CARD_EXPIRED payload',
        });
        return;
      }
      const state = useStore.getState();
      const card = (state.cards ?? []).find((c) => c.id === payload.userCardId);
      // Idempotent re-receipt — D-20.
      if (!card || card.pendingExpire === true) return;

      const name = payload.collectionCard.name;
      // D-18 LOCKED Russian copy with guillemets «».
      state.toast.show(`Карта «${name}» утратила здоровье`, 'error');
      state.markCardPendingExpire(payload.userCardId);
      // D-19 — wait 800ms (300ms collapse + buffer) then physically remove.
      setTimeout(() => {
        useStore.getState().removeCard(payload.userCardId);
      }, 800);
    };

    ws.on('CARD_EXPIRED', handler);
    return () => ws.off('CARD_EXPIRED', handler);
  }, []);
}

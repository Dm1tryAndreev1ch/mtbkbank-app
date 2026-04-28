// ANIM-08 — root-mounted listener for TRADE_COMPLETED Socket.IO events.
// Drives TradeFlipOverlay for both the SENDER (card-flip-out) and the
// RECIPIENT (card-flip-in). Both users receive the event through their
// personal broadcastToUser room (Phase 3 refactor).
//
// Synchronisation ≤200ms: the server emits TRADE_COMPLETED to both rooms
// inside a single synchronous tick, so network jitter is the only delta.
//
// Idempotent: re-mount is a no-op; ws.off cleans up on unmount.
import { useEffect } from 'react';
import * as Sentry from '@sentry/react-native';
import { ws } from '../lib/ws';
import { useStore } from '../stores/useStore';

export interface TradeAnimPayload {
  /** Whether this user sent or received the card. */
  role: 'SENDER' | 'RECIPIENT';
  /** Card leaving the SENDER's inventory (present for SENDER). */
  outgoingCard?: { id: string; name: string; rarity: string; brandIcon: string };
  /** Card arriving in the RECIPIENT's inventory (present for RECIPIENT). */
  incomingCard?: { id: string; name: string; rarity: string; brandIcon: string };
  /** Server UTC timestamp (ms) — for ≤200ms sync assertion in tests. */
  serverTs: number;
}

function isValidPayload(p: unknown): p is TradeAnimPayload {
  if (!p || typeof p !== 'object') return false;
  const o = p as Partial<TradeAnimPayload>;
  return (
    (o.role === 'SENDER' || o.role === 'RECIPIENT') &&
    typeof o.serverTs === 'number'
  );
}

export function useTradeAnimationListener(): void {
  const showTradeAnim = useStore((s) => s.showTradeAnim);

  useEffect(() => {
    const handler = (payload: unknown) => {
      if (!isValidPayload(payload)) {
        Sentry.addBreadcrumb({
          category: 'ws.tradeCompleted',
          level: 'warning',
          message: 'invalid TRADE_COMPLETED payload',
        });
        return;
      }
      showTradeAnim(payload);
    };

    ws.on('TRADE_COMPLETED', handler);
    return () => ws.off('TRADE_COMPLETED', handler);
  }, [showTradeAnim]);
}

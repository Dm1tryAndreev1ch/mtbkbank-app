// mobile/lib/ws.ts — Plan 06-01 D-17: Socket.IO client singleton.
//
// Single Socket.IO connection per app session, idempotent listener registration
// (Pitfall 9 / Fast-Refresh safety), token-rotation reconnect via tokenStore.subscribe.
//
// Leaf-level infrastructure: NO Zustand store import here (regression-guard /
// Phase-5 D-07 boundary). Store wiring lives in downstream plans P03 (CARD_DROP
// listener in payments.tsx) and P06 (CARD_EXPIRED listener). This file is the
// single, idempotent, Fast-Refresh-safe handler-registration surface those plans
// rely on.
//
// JWT is sent in `auth.token` payload at handshake time, matching backend/src/
// websocket/index.js:28-48 verification (`socket.handshake.auth.token`).

import { io, Socket } from 'socket.io-client';
import * as Sentry from '@sentry/react-native';
import * as tokenStore from '../services/tokenStore';

type Handler = (payload: any) => void;

// URL derivation: prefer EXPO_PUBLIC_API_URL (mirrors mobile/services/api.ts:64).
// Strip trailing `/api` because Socket.IO connects to the bare server origin.
function deriveWsUrl(): string {
  const raw = process.env.EXPO_PUBLIC_API_URL;
  if (!raw || !String(raw).trim()) return '';
  let u = String(raw).trim().replace(/\/+$/, '');
  if (u.endsWith('/api')) u = u.slice(0, -'/api'.length);
  return u;
}

const WS_URL = deriveWsUrl();

let socket: Socket | null = null;
const handlers: Map<string, Set<Handler>> = new Map();

function reattachAllHandlers(s: Socket): void {
  for (const [event, set] of handlers) {
    for (const h of set) {
      // Defensive dedupe: off-then-on so reconnects do not stack listeners.
      s.off(event, h);
      s.on(event, h);
    }
  }
}

/**
 * Open the singleton Socket.IO connection. No-op when:
 *   - no token is available (caller passed undefined AND tokenStore.getAccess() is null), or
 *   - a connected socket already exists (avoid duplicate `io()` calls).
 *
 * On `connect`, all previously-registered handlers from the registry are re-attached
 * to the fresh socket instance (Fast-Refresh + reconnect safety).
 */
export function connect(token?: string): void {
  const t = token ?? tokenStore.getAccess();
  if (!t) return;
  if (socket?.connected) return;
  // If a socket exists but is not yet connected, do not spawn a duplicate.
  if (socket) return;

  const next = io(WS_URL, {
    auth: { token: t },
    transports: ['websocket'],
  });

  next.on('connect', () => {
    Sentry.addBreadcrumb({
      category: 'ws',
      level: 'info',
      message: 'socket connected',
    });
    reattachAllHandlers(next);
  });

  next.on('connect_error', (err: Error) => {
    Sentry.addBreadcrumb({
      category: 'ws',
      level: 'warning',
      message: 'socket connect_error',
      data: { error: String(err?.message || err).slice(0, 200) },
    });
  });

  socket = next;
  // Eagerly attach known handlers — connect event will re-attach defensively too.
  reattachAllHandlers(next);
}

/**
 * Idempotent listener registration (Pitfall 9). Registering the same handler
 * reference twice is a no-op. If a socket exists, the handler is also attached
 * to it; an `off` precedes `on` to dedupe at the Socket.IO layer for Fast Refresh.
 */
export function on(event: string, handler: Handler): void {
  let set = handlers.get(event);
  if (!set) {
    set = new Set();
    handlers.set(event, set);
  }
  if (set.has(handler)) return;
  set.add(handler);
  if (socket) {
    socket.off(event, handler);
    socket.on(event, handler);
  }
}

/**
 * Remove a handler from the registry; also detach from the live socket if present.
 * Safe to call with a handler that was never registered.
 */
export function off(event: string, handler: Handler): void {
  const set = handlers.get(event);
  if (set) {
    set.delete(handler);
    if (set.size === 0) handlers.delete(event);
  }
  if (socket) {
    socket.off(event, handler);
  }
}

/**
 * Close the live socket and clear the singleton reference. Registered handlers
 * remain in the registry so a subsequent `connect()` will re-attach them.
 */
export function disconnect(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// Token rotation → reconnect with the fresh token (T-06-01-02 mitigation).
// Subscribed at module load; tokenStore.subscribe is a no-arg listener registry,
// so we re-read the access token inside the callback.
tokenStore.subscribe(() => {
  const t = tokenStore.getAccess();
  // Always sever the old socket so a stale-token connection cannot linger.
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  if (t) connect(t);
});

export const ws = { connect, on, off, disconnect };

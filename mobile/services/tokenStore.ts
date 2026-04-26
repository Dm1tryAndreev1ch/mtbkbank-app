// mobile/services/tokenStore.ts
//
// Sole SecureStore writer for auth tokens. All other mobile code reads/writes via this module.
// REL-01 single-source-of-truth, REL-05 disk-before-memory, D-21 atomic both-tokens persist,
// D-02/D-24 seamless legacy-key migration, D-09 throw-on-write-failure with Russian-copy surfacing
// in caller, single-flight refresh via `_refreshPromise`.
//
// ESLint: this is the ONE permitted file that imports `expo-secure-store` (whitelisted by override
// in mobile/eslint.config.js from Plan 02-01, D-25 Rule A).
import * as SecureStore from 'expo-secure-store';
import * as Sentry from '@sentry/react-native';

// New canonical key names (D-02). Legacy keys ('token' / 'refreshToken') are migrated then deleted.
export const STORAGE_KEYS = {
  access: 'auth.access',
  refresh: 'auth.refresh',
} as const;

const LEGACY_KEYS = {
  access: 'token',
  refresh: 'refreshToken',
} as const;

type Listener = () => void;

interface InternalState {
  access: string | null;
  refresh: string | null;
  hydrated: boolean;
  _refreshPromise: Promise<string | null> | null;
}

const _state: InternalState = {
  access: null,
  refresh: null,
  hydrated: false,
  _refreshPromise: null,
};

const _listeners: Set<Listener> = new Set();

function _notify(): void {
  for (const fn of _listeners) {
    try {
      fn();
    } catch (e) {
      // Listener errors must not break the store; log breadcrumb only.
      Sentry.addBreadcrumb({
        category: 'tokenStore',
        level: 'warning',
        message: 'listener threw',
        data: { error: String((e as any)?.message || e) },
      });
    }
  }
}

function _setSentryUser(userId: string | number | null): void {
  if (userId === null || userId === undefined) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({ id: String(userId) });
}

/**
 * One-shot bootstrap. Reads BOTH new keys and legacy keys; if legacy is populated and new is not,
 * migrates legacy → new then deletes legacy. Updates in-memory mirror. Notifies listeners once at end.
 *
 * Accepts an optional AbortSignal so BootGate can cancel hydrate when its 8-second timeout fires (D-20).
 * If the signal aborts before hydrate completes, the function rejects with `new Error('Aborted')` and
 * leaves the in-memory mirror in its prior state (no partial token leakage).
 */
export async function hydrate(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new Error('Aborted');

  // Read all four keys in parallel.
  const [newA, newR, oldA, oldR] = await Promise.all([
    SecureStore.getItemAsync(STORAGE_KEYS.access),
    SecureStore.getItemAsync(STORAGE_KEYS.refresh),
    SecureStore.getItemAsync(LEGACY_KEYS.access),
    SecureStore.getItemAsync(LEGACY_KEYS.refresh),
  ]);

  if (signal?.aborted) throw new Error('Aborted');

  // Resolve effective values: new keys WIN if both are populated.
  const access = newA ?? oldA ?? null;
  const refresh = newR ?? oldR ?? null;

  // Migrate: if any legacy key exists, write effective values to new keys then delete legacy.
  const needsMigration = Boolean(oldA || oldR);
  if (needsMigration) {
    const writes: Promise<unknown>[] = [];
    if (access) writes.push(SecureStore.setItemAsync(STORAGE_KEYS.access, access));
    if (refresh) writes.push(SecureStore.setItemAsync(STORAGE_KEYS.refresh, refresh));
    if (writes.length) await Promise.all(writes);
    // Delete legacy keys regardless of whether they had values (defensive cleanup).
    await Promise.all([
      SecureStore.deleteItemAsync(LEGACY_KEYS.access).catch(() => undefined),
      SecureStore.deleteItemAsync(LEGACY_KEYS.refresh).catch(() => undefined),
    ]);
  }

  if (signal?.aborted) throw new Error('Aborted');

  _state.access = access;
  _state.refresh = refresh;
  _state.hydrated = true;
  _notify();
}

/**
 * Atomic-both-tokens persist (D-21). Awaits BOTH SecureStore writes BEFORE updating the in-memory
 * mirror and BEFORE resolving (REL-05). Throws on write failure — caller is responsible for surfacing
 * a Russian "Не удалось сохранить учётные данные" via Zustand `error` field (D-09).
 *
 * The optional `opts.userId` triggers Sentry.setUser attribution (Claude's Discretion mechanical move:
 * Phase-1 placed setUser in api.ts:login; Phase 2 centralizes it here so login + register + refresh
 * attribute consistently).
 */
export async function setTokens(
  access: string,
  refresh: string,
  opts?: { userId?: string | number },
): Promise<void> {
  // Disk first (REL-05).
  await Promise.all([
    SecureStore.setItemAsync(STORAGE_KEYS.access, access),
    SecureStore.setItemAsync(STORAGE_KEYS.refresh, refresh),
  ]);
  // Memory after disk-write resolution.
  _state.access = access;
  _state.refresh = refresh;
  _state.hydrated = true;
  if (opts?.userId !== undefined) _setSentryUser(opts.userId);
  _notify();
}

/**
 * Wipe all token state. Deletes new + legacy keys; resets memory mirror; clears Sentry user; notifies.
 * Idempotent — safe to call when already cleared. Delete calls swallow errors because
 * `expo-secure-store` rejects on a missing key on Android (PITFALLS.md §1).
 */
export async function clear(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(STORAGE_KEYS.access).catch(() => undefined),
    SecureStore.deleteItemAsync(STORAGE_KEYS.refresh).catch(() => undefined),
    SecureStore.deleteItemAsync(LEGACY_KEYS.access).catch(() => undefined),
    SecureStore.deleteItemAsync(LEGACY_KEYS.refresh).catch(() => undefined),
  ]);
  _state.access = null;
  _state.refresh = null;
  _state.hydrated = true;
  _state._refreshPromise = null;
  _setSentryUser(null);
  _notify();
}

export function getAccess(): string | null {
  return _state.access;
}

export function getRefresh(): string | null {
  return _state.refresh;
}

export function isAuthed(): boolean {
  return _state.access !== null && _state.refresh !== null;
}

export function isHydrated(): boolean {
  return _state.hydrated;
}

/** Subscribe to token-state changes. Returns an unsubscribe function. */
export function subscribe(fn: Listener): () => void {
  _listeners.add(fn);
  return () => {
    _listeners.delete(fn);
  };
}

// refreshOnce is added in Task 2.

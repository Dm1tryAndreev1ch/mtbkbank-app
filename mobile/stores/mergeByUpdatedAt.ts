// REL-12 (Plan 04-01 D-12/D-13) — shared helper merging entity payloads from
// HTTP fetches and Socket.IO events. Tie-breaker: greater updatedAt wins;
// equal + ws → incoming wins (server's most recent broadcast); equal + http →
// existing wins (stable). Missing incoming.updatedAt → existing wins +
// console.warn + Sentry breadcrumb (catches backend regressions where a route
// forgot to select updatedAt).
import * as Sentry from '@sentry/react-native';

export type MergeSource = 'http' | 'ws';

export type Mergeable = { id: string; updatedAt?: string };

export function mergeEntity<T extends Mergeable>(
  existing: T | undefined,
  incoming: T,
  source: MergeSource,
): T {
  if (!incoming.updatedAt) {
    // eslint-disable-next-line no-console
    console.warn(`[mergeByUpdatedAt] missing updatedAt for ${incoming.id}`);
    Sentry.addBreadcrumb({
      category: 'merge',
      level: 'warning',
      message: 'missing updatedAt',
      data: { id: incoming.id },
    });
    return existing ?? incoming;
  }
  if (!existing) return incoming;
  if (!existing.updatedAt) return incoming;
  if (incoming.updatedAt > existing.updatedAt) return incoming;
  if (incoming.updatedAt === existing.updatedAt && source === 'ws') return incoming;
  return existing;
}

export function mergeList<T extends Mergeable>(
  existing: T[],
  incoming: T[],
  source: MergeSource,
  idKey: keyof T = 'id' as keyof T,
): T[] {
  const existingById = new Map<string, T>();
  for (const e of existing) existingById.set(String(e[idKey]), e);

  const incomingById = new Map<string, T>();
  for (const i of incoming) {
    // dedupe incoming list (last write wins among duplicates within incoming)
    incomingById.set(String(i[idKey]), i);
  }

  const result: T[] = [];
  const seen = new Set<string>();

  // Preserve existing order; merge per-id when incoming has the same id.
  for (const e of existing) {
    const id = String(e[idKey]);
    if (seen.has(id)) continue;
    const inc = incomingById.get(id);
    result.push(inc ? mergeEntity(e, inc, source) : e);
    seen.add(id);
  }

  // Append new ids (preserving incoming order).
  for (const i of incoming) {
    const id = String(i[idKey]);
    if (seen.has(id)) continue;
    if (!existingById.has(id)) {
      result.push(mergeEntity(undefined, i, source));
      seen.add(id);
    }
  }

  return result;
}

// Plan 06-06 D-20/D-21 — opt-in wrapper around mergeList that protects in-flight
// items via `skipPredicate` and reports server-confirmed removals via `onRemoved`.
//
// Behavior:
//   (a) Any existing item where opts.skipPredicate(existing) === true is preserved
//       verbatim — never replaced by an incoming entry, never reported as removed
//       (D-20 — protects cards with `pendingExpire: true` mid-collapse animation).
//   (b) Merging delegates to `mergeList(existing, incoming, source, idKey)` for all
//       non-protected items.
//   (c) Any item present in `existing` but absent from `incoming` AND not protected
//       by skipPredicate is reported via opts.onRemoved(removed[]) — the
//       reconciliation tail for dropped CARD_EXPIRED Socket.IO events (D-21).
//
// Existing callers of `mergeList` are untouched; this is a NEW export.
export interface MergeListWithRemovalsOpts<T> {
  skipPredicate?: (existing: T) => boolean;
  onRemoved?: (removedItems: T[]) => void;
  idKey?: keyof T;
}

export function mergeListWithRemovals<T extends Mergeable>(
  existing: T[],
  incoming: T[],
  source: MergeSource,
  opts?: MergeListWithRemovalsOpts<T>,
): T[] {
  const idKey = (opts?.idKey ?? ('id' as keyof T)) as keyof T;
  const skip = opts?.skipPredicate;

  // Partition existing into protected vs. mergeable. Protected items skip merging
  // entirely AND are never considered "removed" — they retain their current state.
  const protectedItems: T[] = [];
  const mergeable: T[] = [];
  for (const e of existing) {
    if (skip && skip(e)) protectedItems.push(e);
    else mergeable.push(e);
  }

  const incomingIds = new Set<string>();
  for (const i of incoming) incomingIds.add(String(i[idKey]));

  // Detect removals BEFORE merging: items in `mergeable` whose id is absent from
  // `incoming`. (Protected items are intentionally excluded — D-20.)
  const removed: T[] = [];
  for (const e of mergeable) {
    if (!incomingIds.has(String(e[idKey]))) removed.push(e);
  }

  // Plan 06-06 D-21 — DO NOT physically drop removed items here. `onRemoved`
  // hands them to `queueLocalExpire`, which (a) flips `pendingExpire: true` so
  // the InventoryGrid plays the collapse animation, then (b) calls `removeCard`
  // 800ms later. If we removed them now, the animation could not run because
  // the card would already be gone from the store. Delegate to `mergeList` over
  // the full `mergeable` list — `mergeList` preserves existing items missing
  // from `incoming` (its documented contract), which is exactly what we want
  // for the staggered-removal handoff. Existing callers that previously stripped
  // ghost items rely on the caller's `onRemoved` to drive the actual removal.
  const merged = mergeList<T>(mergeable, incoming, source, idKey);

  // Re-prepend protected items so their ordering survives. mergeList preserves
  // existing order for the items it received; protected items were filtered out
  // BEFORE that call so we restore them at the head of the list. Callers that
  // care about exact relative order can replace pendingExpire cards with a
  // post-process re-sort if needed.
  const result = protectedItems.concat(merged);

  if (removed.length > 0 && opts?.onRemoved) {
    opts.onRemoved(removed);
  }

  return result;
}

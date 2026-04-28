// REL-12 (Plan 04-01 D-12/D-13) — shared helper merging entity payloads from
// HTTP fetches and Socket.IO events. Tie-breaker: greater updatedAt wins;
// equal + ws → incoming wins (server’s most recent broadcast); equal + http →
// existing wins (stable).
//
// `updatedAt` fallback: if an entity is missing `updatedAt` we fall back to
// `createdAt`. This covers backend routes that select `createdAt` but not
// `updatedAt` (e.g. CollectionCard via GET /api/cards). If neither field is
// present we keep the existing item and emit a Sentry breadcrumb only —
// no console.warn spam in dev.
import * as Sentry from '@sentry/react-native';

export type MergeSource = 'http' | 'ws';

export type Mergeable = { id: string; updatedAt?: string; createdAt?: string };

/** Returns the best available timestamp for merge comparison. */
function getTimestamp(item: Mergeable): string | undefined {
  return item.updatedAt ?? item.createdAt;
}

export function mergeEntity<T extends Mergeable>(
  existing: T | undefined,
  incoming: T,
  source: MergeSource,
): T {
  const incomingTs = getTimestamp(incoming);
  if (!incomingTs) {
    // No timestamp at all — keep existing, log to Sentry only (no console spam).
    Sentry.addBreadcrumb({
      category: 'merge',
      level: 'warning',
      message: 'missing updatedAt and createdAt',
      data: { id: incoming.id, source },
    });
    return existing ?? incoming;
  }
  if (!existing) return incoming;
  const existingTs = getTimestamp(existing);
  if (!existingTs) return incoming;
  if (incomingTs > existingTs) return incoming;
  if (incomingTs === existingTs && source === 'ws') return incoming;
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
    incomingById.set(String(i[idKey]), i);
  }

  const result: T[] = [];
  const seen = new Set<string>();

  for (const e of existing) {
    const id = String(e[idKey]);
    if (seen.has(id)) continue;
    const inc = incomingById.get(id);
    result.push(inc ? mergeEntity(e, inc, source) : e);
    seen.add(id);
  }

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

  const protectedItems: T[] = [];
  const mergeable: T[] = [];
  for (const e of existing) {
    if (skip && skip(e)) protectedItems.push(e);
    else mergeable.push(e);
  }

  const incomingIds = new Set<string>();
  for (const i of incoming) incomingIds.add(String(i[idKey]));

  const removed: T[] = [];
  for (const e of mergeable) {
    if (!incomingIds.has(String(e[idKey]))) removed.push(e);
  }

  const merged = mergeList<T>(mergeable, incoming, source, idKey);
  const result = protectedItems.concat(merged);

  if (removed.length > 0 && opts?.onRemoved) {
    opts.onRemoved(removed);
  }

  return result;
}

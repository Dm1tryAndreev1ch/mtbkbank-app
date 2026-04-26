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

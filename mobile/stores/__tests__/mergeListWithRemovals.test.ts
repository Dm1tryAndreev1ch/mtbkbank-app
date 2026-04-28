// Plan 06-06 Task 1 — pin D-20 (skipPredicate protects in-flight items) +
// D-21 (onRemoved fires for items present in existing but absent from incoming).
import { mergeListWithRemovals } from '../mergeByUpdatedAt';

jest.mock('@sentry/react-native', () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  setUser: jest.fn(),
  init: jest.fn(),
  wrap: (c: any) => c,
}));

interface Card {
  id: string;
  updatedAt?: string;
  pendingExpire?: boolean;
  name?: string;
}

const a = (over: Partial<Card> = {}): Card => ({
  id: 'a',
  updatedAt: '2026-04-28T00:00:00.000Z',
  name: 'A',
  ...over,
});
const b = (over: Partial<Card> = {}): Card => ({
  id: 'b',
  updatedAt: '2026-04-28T00:00:00.000Z',
  name: 'B',
  ...over,
});
const c = (over: Partial<Card> = {}): Card => ({
  id: 'c',
  updatedAt: '2026-04-28T00:00:00.000Z',
  name: 'C',
  ...over,
});

describe('mergeListWithRemovals (D-20 protect + D-21 onRemoved)', () => {
  test('1) protected item is never replaced by an incoming entry', () => {
    const existing: Card[] = [a({ pendingExpire: true, name: 'A-protected' })];
    const incoming: Card[] = [a({ name: 'A-server', updatedAt: '2026-04-28T01:00:00.000Z' })];
    const onRemoved = jest.fn();

    const out = mergeListWithRemovals(existing, incoming, 'http', {
      skipPredicate: (e) => e.pendingExpire === true,
      onRemoved,
    });

    expect(out.find((x) => x.id === 'a')?.name).toBe('A-protected');
    expect(onRemoved).not.toHaveBeenCalled();
  });

  test('2) protected item missing from incoming is preserved AND NOT reported in onRemoved', () => {
    const existing: Card[] = [a({ pendingExpire: true })];
    const incoming: Card[] = []; // server says: card gone
    const onRemoved = jest.fn();

    const out = mergeListWithRemovals(existing, incoming, 'http', {
      skipPredicate: (e) => e.pendingExpire === true,
      onRemoved,
    });

    expect(out.find((x) => x.id === 'a')).toBeDefined();
    expect(onRemoved).not.toHaveBeenCalled();
  });

  test('3) unprotected item missing from incoming IS reported in onRemoved', () => {
    const existing: Card[] = [a(), b()];
    const incoming: Card[] = [a()]; // b missing
    const onRemoved = jest.fn();

    mergeListWithRemovals(existing, incoming, 'http', {
      skipPredicate: (e) => e.pendingExpire === true,
      onRemoved,
    });

    expect(onRemoved).toHaveBeenCalledTimes(1);
    const removed = onRemoved.mock.calls[0][0] as Card[];
    expect(removed.map((x) => x.id)).toEqual(['b']);
  });

  test('4) onRemoved is NOT called when there are no removals', () => {
    const existing: Card[] = [a(), b()];
    const incoming: Card[] = [a(), b(), c()];
    const onRemoved = jest.fn();

    mergeListWithRemovals(existing, incoming, 'http', { onRemoved });
    expect(onRemoved).not.toHaveBeenCalled();
  });

  test('5) skipPredicate=undefined → no protection: all unmatched items reported via onRemoved (D-21 hands removal off to queueLocalExpire so the items must remain in the result list to be animated out)', () => {
    const existing: Card[] = [a({ pendingExpire: true }), b()];
    const incoming: Card[] = []; // server says: all gone
    const onRemoved = jest.fn();

    const out = mergeListWithRemovals(existing, incoming, 'http', { onRemoved });

    // Wrapper does NOT physically drop ghost items — `queueLocalExpire`
    // (the onRemoved callback) animates them out and calls removeCard later.
    // If the wrapper removed them now, the collapse animation could not play.
    expect(out.map((x) => x.id).sort()).toEqual(['a', 'b']);
    expect(onRemoved).toHaveBeenCalledTimes(1);
    const removed = onRemoved.mock.calls[0][0] as Card[];
    expect(removed.map((x) => x.id).sort()).toEqual(['a', 'b']);
  });

  test('6) idKey override works for non-`id` keys', () => {
    interface AltCard {
      id: string;
      uuid: string;
      updatedAt?: string;
    }
    const existing: AltCard[] = [
      { id: '1', uuid: 'u1', updatedAt: '2026-04-28T00:00:00.000Z' },
      { id: '2', uuid: 'u2', updatedAt: '2026-04-28T00:00:00.000Z' },
    ];
    const incoming: AltCard[] = [
      { id: '99', uuid: 'u1', updatedAt: '2026-04-28T01:00:00.000Z' }, // same uuid as existing[0]
    ];
    const onRemoved = jest.fn();

    mergeListWithRemovals(existing, incoming, 'http', {
      idKey: 'uuid',
      onRemoved,
    });

    // u1 matched (no removal); u2 unmatched → reported.
    expect(onRemoved).toHaveBeenCalledTimes(1);
    const removed = onRemoved.mock.calls[0][0] as AltCard[];
    expect(removed.map((x) => x.uuid)).toEqual(['u2']);
  });
});

// Phase 6 / 06-02 / ANIM-07 / D-16
// Pins the CARD_EXPIRED emit-before-delete invariant in cleanupDeadCards.
//
// Contract (P02-T1, P02-T2 in 06-VALIDATION.md):
//   1. broadcastToUser('CARD_EXPIRED', { userCardId, collectionCard }) is
//      invoked once per dead card, scoped to that card's userId.
//   2. Every CARD_EXPIRED emit completes BEFORE prisma.userCard.deleteMany
//      runs — verified via Jest mock invocationCallOrder so the mobile client
//      can render its toast + 0-HP collapse animation while the card metadata
//      is still resolvable.
//   3. Payload shape matches the D-18 contract:
//      { userCardId, collectionCard: { id, name, rarity, brandIcon } }.

// Mock dependencies before importing target modules (mirror cardEngine.test.js scaffold).
jest.mock('../src/push', () => ({
  sendPushNotification: jest.fn(),
  sendCardDeathWarningPush: jest.fn(),
}));

jest.mock('../src/websocket', () => ({
  broadcastToUser: jest.fn(),
}));

const mockPrisma = {
  user: { findUnique: jest.fn() },
  userCard: { findMany: jest.fn(), deleteMany: jest.fn() },
  deckCard: { deleteMany: jest.fn() },
  notification: { create: jest.fn() },
  systemConfig: { findUnique: jest.fn().mockResolvedValue(null) },
  $executeRaw: jest.fn(),
  $transaction: jest.fn(async (fn) => fn(mockPrisma)),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

const { cleanupDeadCards } = require('../src/services/cardEngine');
const { broadcastToUser } = require('../src/websocket');

describe('cleanupDeadCards — CARD_EXPIRED emit (D-16 / ANIM-07)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.userCard.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.deckCard.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.notification.create.mockResolvedValue({});
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', expoPushToken: null });
  });

  it('Test 1: emits CARD_EXPIRED with full payload for a single dead card', async () => {
    mockPrisma.userCard.findMany.mockResolvedValue([
      {
        id: 'uc1',
        userId: 'u1',
        collectionCard: { id: 'c1', name: 'Test Card', rarity: 'EPIC', brandIcon: 'star' },
      },
    ]);
    mockPrisma.userCard.deleteMany.mockResolvedValue({ count: 1 });

    await cleanupDeadCards(mockPrisma);

    expect(broadcastToUser).toHaveBeenCalledTimes(1);
    expect(broadcastToUser).toHaveBeenCalledWith('u1', 'CARD_EXPIRED', {
      userCardId: 'uc1',
      collectionCard: { id: 'c1', name: 'Test Card', rarity: 'EPIC', brandIcon: 'star' },
    });
  });

  it('Test 2: emits one CARD_EXPIRED per dead card, scoped to each owning userId', async () => {
    mockPrisma.userCard.findMany.mockResolvedValue([
      {
        id: 'uc1',
        userId: 'u1',
        collectionCard: { id: 'c1', name: 'Card One', rarity: 'COMMON', brandIcon: 'icon1' },
      },
      {
        id: 'uc2',
        userId: 'u2',
        collectionCard: { id: 'c2', name: 'Card Two', rarity: 'RARE', brandIcon: 'icon2' },
      },
      {
        id: 'uc3',
        userId: 'u1',
        collectionCard: { id: 'c3', name: 'Card Three', rarity: 'LEGENDARY', brandIcon: 'icon3' },
      },
    ]);
    mockPrisma.userCard.deleteMany.mockResolvedValue({ count: 3 });

    await cleanupDeadCards(mockPrisma);

    expect(broadcastToUser).toHaveBeenCalledTimes(3);
    expect(broadcastToUser).toHaveBeenNthCalledWith(1, 'u1', 'CARD_EXPIRED', {
      userCardId: 'uc1',
      collectionCard: { id: 'c1', name: 'Card One', rarity: 'COMMON', brandIcon: 'icon1' },
    });
    expect(broadcastToUser).toHaveBeenNthCalledWith(2, 'u2', 'CARD_EXPIRED', {
      userCardId: 'uc2',
      collectionCard: { id: 'c2', name: 'Card Two', rarity: 'RARE', brandIcon: 'icon2' },
    });
    expect(broadcastToUser).toHaveBeenNthCalledWith(3, 'u1', 'CARD_EXPIRED', {
      userCardId: 'uc3',
      collectionCard: { id: 'c3', name: 'Card Three', rarity: 'LEGENDARY', brandIcon: 'icon3' },
    });
  });

  it('Test 3: every CARD_EXPIRED emit precedes prisma.userCard.deleteMany (invocationCallOrder)', async () => {
    mockPrisma.userCard.findMany.mockResolvedValue([
      {
        id: 'uc1',
        userId: 'u1',
        collectionCard: { id: 'c1', name: 'A', rarity: 'EPIC', brandIcon: 'a' },
      },
      {
        id: 'uc2',
        userId: 'u2',
        collectionCard: { id: 'c2', name: 'B', rarity: 'RARE', brandIcon: 'b' },
      },
    ]);
    mockPrisma.userCard.deleteMany.mockResolvedValue({ count: 2 });

    await cleanupDeadCards(mockPrisma);

    // Every broadcast must precede the delete (Jest invocationCallOrder is monotonic across mocks).
    const broadcastOrders = broadcastToUser.mock.invocationCallOrder;
    const deleteOrder = mockPrisma.userCard.deleteMany.mock.invocationCallOrder[0];

    expect(broadcastOrders.length).toBe(2);
    expect(deleteOrder).toBeDefined();
    for (const order of broadcastOrders) {
      expect(order).toBeLessThan(deleteOrder);
    }
  });

  it('Test 4: empty dead-cards list — broadcastToUser is NOT called and no error', async () => {
    mockPrisma.userCard.findMany.mockResolvedValue([]);
    mockPrisma.userCard.deleteMany.mockResolvedValue({ count: 0 });

    await expect(cleanupDeadCards(mockPrisma)).resolves.toBe(0);
    expect(broadcastToUser).not.toHaveBeenCalled();
    // deleteMany still runs (idempotent, count=0).
    expect(mockPrisma.userCard.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('Test 5: payload shape matches D-18 contract (objectContaining)', async () => {
    mockPrisma.userCard.findMany.mockResolvedValue([
      {
        id: 'uc1',
        userId: 'u1',
        collectionCard: { id: 'c1', name: 'Shape Card', rarity: 'LEGENDARY', brandIcon: 'gold' },
      },
    ]);
    mockPrisma.userCard.deleteMany.mockResolvedValue({ count: 1 });

    await cleanupDeadCards(mockPrisma);

    expect(broadcastToUser).toHaveBeenCalledWith(
      expect.any(String),
      'CARD_EXPIRED',
      expect.objectContaining({
        userCardId: expect.any(String),
        collectionCard: expect.objectContaining({
          id: expect.any(String),
          name: expect.any(String),
          rarity: expect.any(String),
          brandIcon: expect.any(String),
        }),
      })
    );
  });
});

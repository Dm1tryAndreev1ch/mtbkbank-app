// Mock dependencies before importing target modules
jest.mock('../src/push', () => ({
  sendPushNotification: jest.fn(),
  sendCardDeathWarningPush: jest.fn(),
}));

jest.mock('../src/websocket', () => ({
  broadcastToUser: jest.fn(),
}));

const mockPrisma = {
  user: { findUnique: jest.fn(), update: jest.fn() },
  userCard: { create: jest.fn(), findMany: jest.fn(), update: jest.fn(), delete: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
  collectionCard: { findMany: jest.fn() },
  notification: { create: jest.fn() },
  transaction: { update: jest.fn() },
  deckCard: { deleteMany: jest.fn() },
  systemConfig: { findUnique: jest.fn().mockResolvedValue(null) }, // returns null → use default decay rates
  $executeRaw: jest.fn(),
  $transaction: jest.fn(async (fn) => fn(mockPrisma)),
};

jest.mock('@prisma/client', () => {
  return {
    PrismaClient: jest.fn(() => mockPrisma),
  };
});

const { processCardDrop, decayAllCardHealth, sacrificeCard, rollCardDrop } = require('../src/services/cardEngine');

describe('Card Engine Mechanics', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-apply persistent defaults after clearAllMocks wipes them
    mockPrisma.systemConfig.findUnique.mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
  });

  describe('rollCardDrop', () => {
    it('returns null when random roll >= 0.30 (no drop)', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.5);
      expect(rollCardDrop()).toBeNull();
    });

    it('returns a rarity when random roll < 0.30 (drop happens)', () => {
      jest.spyOn(Math, 'random')
        .mockReturnValueOnce(0.01)  // triggers drop (< 0.30)
        .mockReturnValueOnce(0.01); // selects LEGENDARY (< 0.03)
      expect(rollCardDrop()).toBe('LEGENDARY');
    });
  });

  describe('processCardDrop', () => {
    it('returns null reliably when random roll >= 0.30 (no drop happens)', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.5);
      mockPrisma.collectionCard.findMany.mockResolvedValue([]);
      const result = await processCardDrop(mockPrisma, 'user_1', 'trans_1');
      expect(result).toBeNull();
    });

    it('processes a LEGENDARY drop if random hits an exact extreme threshold', async () => {
      jest.spyOn(Math, 'random')
          .mockReturnValueOnce(0.01) // Triggers Drop logic (< 0.30)
          .mockReturnValueOnce(0.01); // Selects Legendary rarity (< 0.03)

      mockPrisma.collectionCard.findMany.mockResolvedValue([{ id: 'c_leg', name: 'Black Card' }]);
      mockPrisma.userCard.create.mockResolvedValue({ id: 'uc_1', collectionCardId: 'c_leg', health: 100 });
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user_1', expoPushToken: 'token' });

      const result = await processCardDrop(mockPrisma, 'user_1', 'trans_1');
      expect(result).toBeDefined();
      expect(mockPrisma.userCard.create).toHaveBeenCalled();
      expect(mockPrisma.notification.create).toHaveBeenCalled();
    });
  });

  describe('decayAllCardHealth', () => {
    it('uses $executeRaw for bulk health decay and handles warning cards', async () => {
      mockPrisma.userCard.findMany.mockResolvedValue([]); // no warning-threshold cards
      mockPrisma.$executeRaw.mockResolvedValue(5); // 5 rows updated

      await decayAllCardHealth(mockPrisma);

      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
    });
  });

  describe('sacrificeCard', () => {
    it('infuses MB points cleanly calculating exact formulas', async () => {
      const sacrificeData = { id: 'sac_1', collectionCard: { rarity: 'COMMON', maxHealth: 100 } };
      const targetData = { id: 'tar_1', health: 50, collectionCard: { rarity: 'EPIC', maxHealth: 100 } };

      mockPrisma.userCard.findFirst
          .mockResolvedValueOnce(sacrificeData)
          .mockResolvedValueOnce(targetData);

      mockPrisma.userCard.delete.mockResolvedValue(true);
      mockPrisma.userCard.update.mockResolvedValue({ ...targetData, health: 100 });

      await sacrificeCard(mockPrisma, 'user_1', 'sac_1', 'tar_1');

      expect(mockPrisma.userCard.update).toHaveBeenCalledWith({
        where: { id: 'tar_1' },
        data: { health: 100 },
        include: { collectionCard: true }
      });
    });
  });
});

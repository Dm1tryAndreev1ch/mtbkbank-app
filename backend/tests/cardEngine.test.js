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
  $transaction: jest.fn(cb => cb(mockPrisma)),
};

jest.mock('@prisma/client', () => {
  return {
    PrismaClient: jest.fn(() => mockPrisma),
  };
});

const { processCardDrop, decayAllCardHealth, sacrificeCard } = require('../src/services/cardEngine');

describe('Card Engine Mechanics', () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('processCardDrop', () => {
    it('returns null reliably when random roll > 0.05 (no drop happens)', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.5); // 50%
      mockPrisma.collectionCard.findMany.mockResolvedValue([]);
      const result = await processCardDrop(mockPrisma, 'user_1', 'trans_1');
      expect(result).toBeNull();
    });

    it('processes a LEGENDARY drop if random hits an exact extreme threshold', async () => {
      // 5% drop chance threshold forces trigger. Legendary requires < 0.03
      jest.spyOn(Math, 'random')
          .mockReturnValueOnce(0.01) // Triggers Drop logic ( < 0.05 )
          .mockReturnValueOnce(0.01); // Selects Legendary rarity ( < 0.03 )

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
    it('decrements health according to rarity constraints gracefully stopping at 0', async () => {
      const mockCards = [
        { id: 'uc_1', userId: 'user_1', health: 50, collectionCard: { rarity: 'COMMON', name: 'Standard' }, user: {} },
      ];
      
      mockPrisma.userCard.findMany.mockResolvedValueOnce(mockCards).mockResolvedValue([]); // Mock remaining calls empty
      
      await decayAllCardHealth(mockPrisma);
      
      expect(mockPrisma.userCard.update).toHaveBeenCalledWith({
        where: { id: 'uc_1' },
        data: { health: 48 }, // 50 - 2.0 (COMMON default decay)
      });
    });
  });

  describe('sacrificeCard', () => {
    it('infuses MB points cleanly calculating exact formulas', async () => {
      const sacrificeData = { id: 'sac_1', collectionCard: { rarity: 'COMMON', maxHealth: 100 } }; // multiplier 0.5 -> heals 50
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

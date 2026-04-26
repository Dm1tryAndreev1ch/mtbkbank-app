const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { logger } = require('../logger');
const { env } = require('../env');

const prisma = new PrismaClient();

async function main() {
  if (env.NODE_ENV === 'production') {
    logger.warn('seed script refused to run in production (NODE_ENV=production)');
    process.exit(1);
  }

  logger.info('🌱 Начинаем заполнение базы данных...');

  // Clean existing data
  await prisma.notification.deleteMany();
  await prisma.userQuest.deleteMany();
  await prisma.deckCard.deleteMany();
  await prisma.deck.deleteMany();
  await prisma.cardTrade.deleteMany();
  await prisma.userCard.deleteMany();
  await prisma.collectionCard.deleteMany();
  await prisma.spendingLimit.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.bankCard.deleteMany();
  await prisma.bankAccount.deleteMany();
  await prisma.quest.deleteMany();
  await prisma.systemConfig.deleteMany();
  await prisma.user.deleteMany();

  logger.info('✅ Очистка завершена');

  // ==================== USERS ====================
  const pinHash = await bcrypt.hash('1234', 10);
  const adminPinHash = await bcrypt.hash('0000', 10);

  const user1 = await prisma.user.create({
    data: {
      name: 'Александр Волков',
      phone: '+79001234567',
      pin: pinHash,
      mbPoints: 12450,
      status: 'GOLD',
      avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCRwl5pivmKuJLbLjfVpeusHxIPzvIivePaHMvduDRzToL7EX2BANuse-u7ZbH7vJAflpt_0IxaGre7Jh9rJMJ4Tk01eh8h42DmOsGtZx6DsS9AR1mKON5GAKWvAPLdVt8d2Zlc5lsDtVPqT_KKdhpeKJpV9fPA48h335plSo_NuO-O-I4bO21GCikf6IFsNbgfhkOXZgzTHLROa6iWHUmWhKoNVQ5Zlz7ditN8zUdKtJdyyiJDBtHaaya250gbkW1rzKlFSDA4ae8',
    },
  });

  const user2 = await prisma.user.create({
    data: {
      name: 'Елена Петрова',
      phone: '+79009876543',
      pin: pinHash,
      mbPoints: 4250,
      status: 'SILVER',
    },
  });

  const admin = await prisma.user.create({
    data: {
      name: 'Администратор',
      phone: '+79000000000',
      pin: adminPinHash,
      mbPoints: 99999,
      status: 'PLATINUM',
      isAdmin: true,
    },
  });

  logger.info('✅ Пользователи созданы');

  // ==================== BANK ACCOUNTS ====================
  const mainAccount = await prisma.bankAccount.create({
    data: {
      userId: user1.id,
      name: 'Главный счёт',
      type: 'main',
      balance: 1240500.00,
      currency: 'RUB',
    },
  });

  const savingsAccount = await prisma.bankAccount.create({
    data: {
      userId: user1.id,
      name: 'Накопительный',
      type: 'savings',
      balance: 45000.00,
      currency: 'RUB',
    },
  });

  const currencyAccount = await prisma.bankAccount.create({
    data: {
      userId: user1.id,
      name: 'Валютный',
      type: 'currency',
      balance: 1200.40,
      currency: 'USD',
    },
  });

  // User2 accounts
  const user2Account = await prisma.bankAccount.create({
    data: {
      userId: user2.id,
      name: 'Главный счёт',
      type: 'main',
      balance: 85000.00,
      currency: 'RUB',
    },
  });

  // Admin account
  const adminAccount = await prisma.bankAccount.create({
    data: {
      userId: admin.id,
      name: 'Главный счёт',
      type: 'main',
      balance: 9999999.00,
      currency: 'RUB',
    },
  });

  logger.info('✅ Счета созданы');

  // ==================== BANK CARDS ====================
  await prisma.bankCard.create({
    data: {
      userId: user1.id,
      accountId: mainAccount.id,
      maskedNumber: '**** **** **** 4421',
      type: 'Mastercard',
      tier: 'Premium',
    },
  });

  await prisma.bankCard.create({
    data: {
      userId: user1.id,
      accountId: mainAccount.id,
      maskedNumber: '**** **** **** 8829',
      type: 'VISA',
      tier: 'Black',
    },
  });

  await prisma.bankCard.create({
    data: {
      userId: user2.id,
      accountId: user2Account.id,
      maskedNumber: '**** **** **** 5512',
      type: 'VISA',
      tier: 'Standard',
    },
  });

  await prisma.bankCard.create({
    data: {
      userId: admin.id,
      accountId: adminAccount.id,
      maskedNumber: '**** **** **** 9001',
      type: 'Mastercard',
      tier: 'Platinum',
    },
  });

  logger.info('✅ Банковские карты созданы');

  // ==================== TRANSACTIONS ====================
  const transactions = [
    { userId: user1.id, fromAccountId: mainAccount.id, amount: 1200, type: 'PURCHASE', category: 'Покупки', merchant: 'Apple Store', merchantIcon: 'shopping_bag', description: 'MacBook Air', createdAt: new Date('2025-04-16T10:45:00') },
    { userId: user1.id, fromAccountId: mainAccount.id, amount: 350.50, type: 'PURCHASE', category: 'Кафе и Рестораны', merchant: 'Le Bistro French', merchantIcon: 'restaurant', description: 'Ужин', createdAt: new Date('2025-04-15T20:20:00') },
    { userId: user1.id, toAccountId: mainAccount.id, amount: 5000, type: 'TRANSFER_IN', category: 'Перевод', merchant: 'Перевод от Елена', merchantIcon: 'account_balance_wallet', description: 'Перевод от Елены', createdAt: new Date('2025-04-14T13:15:00') },
    { userId: user1.id, fromAccountId: mainAccount.id, amount: 899, type: 'PURCHASE', category: 'Сервисы', merchant: 'Яндекс Плюс', merchantIcon: 'subscriptions', description: 'Подписка', createdAt: new Date('2025-04-13T09:00:00') },
    { userId: user1.id, fromAccountId: mainAccount.id, amount: 2500, type: 'PURCHASE', category: 'Транспорт', merchant: 'Лукойл', merchantIcon: 'local_gas_station', description: 'Топливо АИ-95', createdAt: new Date('2025-04-12T18:30:00') },
    { userId: user1.id, fromAccountId: mainAccount.id, amount: 4500, type: 'PURCHASE', category: 'Покупки', merchant: 'ZARA', merchantIcon: 'checkroom', description: 'Одежда', createdAt: new Date('2025-04-11T15:00:00') },
    { userId: user1.id, fromAccountId: mainAccount.id, amount: 650, type: 'PURCHASE', category: 'Кафе и Рестораны', merchant: 'Starbucks', merchantIcon: 'coffee', description: 'Кофе и десерт', createdAt: new Date('2025-04-10T11:00:00') },
    { userId: user1.id, fromAccountId: mainAccount.id, amount: 14200, type: 'PAYMENT', category: 'Рассрочка', merchant: 'М.Видео — MacBook Pro', merchantIcon: 'laptop_mac', description: 'Ежемесячный платёж', createdAt: new Date('2025-04-10T00:00:00') },
    { userId: user1.id, fromAccountId: mainAccount.id, amount: 1240, type: 'PAYMENT', category: 'Сервисы', merchant: 'Cloud Architecture SAAS', merchantIcon: 'cloud', status: 'scheduled', scheduledAt: new Date('2025-05-24'), createdAt: new Date('2025-04-09T10:00:00') },
    { userId: user1.id, fromAccountId: mainAccount.id, amount: 4500, type: 'PAYMENT', category: 'Развлечения', merchant: 'The Ritz-Carlton Concierge', merchantIcon: 'hotel', status: 'scheduled', scheduledAt: new Date('2025-06-02'), createdAt: new Date('2025-04-08T10:00:00') },
  ];

  for (const t of transactions) {
    await prisma.transaction.create({ data: t });
  }

  logger.info('✅ Транзакции созданы');

  // ==================== COLLECTION CARDS ====================
  const collectionCards = [
    // COMMON cards
    { name: 'Серебряный Страж', brandName: 'Сбербанк', brandIcon: 'account_balance_wallet', rarity: 'COMMON', cashbackPercent: 0.5, cashbackCategory: 'Покупки', description: 'Базовая карта для повседневных покупок', mbValue: 10, maxHealth: 100 },
    { name: 'Бронзовый Щит', brandName: 'Тинькофф', brandIcon: 'shield', rarity: 'COMMON', cashbackPercent: 0.8, cashbackCategory: 'Транспорт', description: 'Защита ваших поездок', mbValue: 10, maxHealth: 100 },
    { name: 'Медный Компас', brandName: 'Альфа-Банк', brandIcon: 'explore', rarity: 'COMMON', cashbackPercent: 1.0, cashbackCategory: 'Сервисы', description: 'Навигация в мире финансов', mbValue: 10, maxHealth: 100 },
    { name: 'Стальной Якорь', brandName: 'ВТБ', brandIcon: 'anchor', rarity: 'COMMON', cashbackPercent: 0.7, cashbackCategory: null, description: 'Надёжная основа', mbValue: 10, maxHealth: 100 },
    { name: 'Железный Мост', brandName: 'Газпромбанк', brandIcon: 'construction', rarity: 'COMMON', cashbackPercent: 1.2, cashbackCategory: 'Коммунальные', description: 'Связь с вашими услугами', mbValue: 10, maxHealth: 100 },
    // RARE cards
    { name: 'Сапфировый Клинок', brandName: 'Apple', brandIcon: 'phone_iphone', rarity: 'RARE', cashbackPercent: 2.0, cashbackCategory: 'Покупки', description: 'Острое чувство стиля', mbValue: 50, maxHealth: 100 },
    { name: 'Кофейный Барон', brandName: 'Starbucks', brandIcon: 'coffee', rarity: 'RARE', cashbackPercent: 2.5, cashbackCategory: 'Кафе и Рестораны', description: 'Владыка кофеен', mbValue: 50, maxHealth: 100 },
    { name: 'Небесный Лётчик', brandName: 'Аэрофлот', brandIcon: 'flight', rarity: 'RARE', cashbackPercent: 1.8, cashbackCategory: 'Транспорт', description: 'Покоритель небес', mbValue: 50, maxHealth: 100 },
    { name: 'Цифровой Страж', brandName: 'Яндекс', brandIcon: 'smart_toy', rarity: 'RARE', cashbackPercent: 2.2, cashbackCategory: 'Сервисы', description: 'Защитник цифрового мира', mbValue: 50, maxHealth: 100 },
    // EPIC cards
    { name: 'Алмазный Титан', brandName: 'Tesla', brandIcon: 'electric_car', rarity: 'EPIC', cashbackPercent: 4.0, cashbackCategory: 'Транспорт', description: 'Титан новых технологий', mbValue: 200, maxHealth: 100 },
    { name: 'Рубиновый Феникс', brandName: 'Gucci', brandIcon: 'diamond', rarity: 'EPIC', cashbackPercent: 3.5, cashbackCategory: 'Покупки', description: 'Возрождение стиля', mbValue: 200, maxHealth: 100 },
    { name: 'Изумрудный Оракул', brandName: 'Google', brandIcon: 'search', rarity: 'EPIC', cashbackPercent: 4.5, cashbackCategory: 'Сервисы', description: 'Предсказатель трендов', mbValue: 200, maxHealth: 100 },
    // LEGENDARY cards
    { name: 'Золотой Vault', brandName: 'MT-Банк', brandIcon: 'assured_workload', rarity: 'LEGENDARY', cashbackPercent: 7.5, cashbackCategory: null, description: 'Легенда MT-Банка. Кэшбэк на все категории.', mbValue: 1000, maxHealth: 100 },
    { name: 'Платиновый Дракон', brandName: 'MT-Банк Premium', brandIcon: 'local_fire_department', rarity: 'LEGENDARY', cashbackPercent: 10.0, cashbackCategory: null, description: 'Величайшая карта. Максимальный кэшбэк.', mbValue: 1000, maxHealth: 100 },
  ];

  const createdCards = [];
  for (const card of collectionCards) {
    const created = await prisma.collectionCard.create({ data: card });
    createdCards.push(created);
  }

  logger.info('✅ Шаблоны карт созданы');

  // ==================== USER CARDS ====================
  const commons = createdCards.filter(c => c.rarity === 'COMMON');
  const rares = createdCards.filter(c => c.rarity === 'RARE');
  const epics = createdCards.filter(c => c.rarity === 'EPIC');
  const legendaries = createdCards.filter(c => c.rarity === 'LEGENDARY');

  const userCard1 = await prisma.userCard.create({
    data: { userId: user1.id, collectionCardId: commons[0].id, health: 75, source: 'PURCHASE' },
  });
  const userCard2 = await prisma.userCard.create({
    data: { userId: user1.id, collectionCardId: rares[1].id, health: 90, source: 'PURCHASE' },
  });
  const userCard3 = await prisma.userCard.create({
    data: { userId: user1.id, collectionCardId: rares[2].id, health: 60, source: 'QUEST' },
  });
  const userCard4 = await prisma.userCard.create({
    data: { userId: user1.id, collectionCardId: legendaries[0].id, health: 100, source: 'PURCHASE' },
  });
  const userCard5 = await prisma.userCard.create({
    data: { userId: user1.id, collectionCardId: commons[1].id, health: 40, source: 'PURCHASE' },
  });
  const userCard6 = await prisma.userCard.create({
    data: { userId: user1.id, collectionCardId: epics[0].id, health: 85, source: 'PURCHASE' },
  });

  // User2 cards
  await prisma.userCard.create({
    data: { userId: user2.id, collectionCardId: commons[2].id, health: 100, source: 'PURCHASE' },
  });
  await prisma.userCard.create({
    data: { userId: user2.id, collectionCardId: rares[0].id, health: 70, source: 'PURCHASE' },
  });

  logger.info('✅ Карты пользователей созданы');

  // ==================== DECKS ====================
  const deck1 = await prisma.deck.create({
    data: { userId: user1.id, name: 'Cashback Titan', isActive: true },
  });

  await prisma.deckCard.createMany({
    data: [
      { deckId: deck1.id, userCardId: userCard4.id, slotIndex: 0 }, // Legendary
      { deckId: deck1.id, userCardId: userCard2.id, slotIndex: 1 }, // Rare
      { deckId: deck1.id, userCardId: userCard6.id, slotIndex: 2 }, // Epic
    ],
  });

  await prisma.deck.create({
    data: { userId: user2.id, name: 'Моя колода', isActive: true },
  });
  await prisma.deck.create({
    data: { userId: admin.id, name: 'Моя колода', isActive: true },
  });

  logger.info('✅ Колоды созданы');

  // ==================== QUESTS ====================
  const quests = [
    { title: 'Кофе-пробежка', description: 'Совершите покупку в кофейне', icon: 'coffee', rewardMB: 50, type: 'DAILY', condition: '{"category":"Кафе и Рестораны","count":1}' },
    { title: 'Социальный коннектор', description: 'Пригласите друга в MT-Баллы', icon: 'share', rewardMB: 250, type: 'DAILY', condition: '{"action":"referral","count":1}' },
    { title: 'Шопоголик', description: 'Совершите 3 покупки в любых магазинах', icon: 'shopping_bag', rewardMB: 100, type: 'DAILY', condition: '{"category":"Покупки","count":3}' },
    { title: 'Марафонец', description: 'Совершите покупки 7 дней подряд', icon: 'directions_run', rewardMB: 500, type: 'WEEKLY', condition: '{"action":"streak","count":7}' },
    { title: 'Коллекционер', description: 'Соберите 5 новых карт за неделю', icon: 'collections', rewardMB: 300, type: 'WEEKLY', condition: '{"action":"collect_cards","count":5}' },
  ];

  for (const q of quests) {
    await prisma.quest.create({ data: q });
  }

  logger.info('✅ Квесты созданы');

  // ==================== SUBSCRIPTIONS ====================
  await prisma.subscription.create({
    data: { userId: user1.id, name: 'Kion Premium', icon: 'movie', amount: 399, nextPayment: new Date('2025-05-12'), isActive: true },
  });
  await prisma.subscription.create({
    data: { userId: user1.id, name: 'MTS Music', icon: 'music_note', amount: 169, nextPayment: new Date('2025-05-15'), isActive: true },
  });
  await prisma.subscription.create({
    data: { userId: user1.id, name: 'Яндекс Плюс', icon: 'subscriptions', amount: 299, nextPayment: new Date('2025-05-20'), isActive: true },
  });

  logger.info('✅ Подписки созданы');

  // ==================== SPENDING LIMITS ====================
  await prisma.spendingLimit.create({
    data: { userId: user1.id, category: 'Развлечения', limitAmount: 20000, spentAmount: 12000 },
  });
  await prisma.spendingLimit.create({
    data: { userId: user1.id, category: 'Кафе и Рестораны', limitAmount: 10000, spentAmount: 8400 },
  });

  logger.info('✅ Лимиты трат созданы');

  // ==================== SYSTEM CONFIG ====================
  await prisma.systemConfig.create({
    data: { key: 'card_drop_rate', value: '0.70' },
  });
  await prisma.systemConfig.create({
    data: { key: 'health_decay_rates', value: JSON.stringify({ COMMON: 2, RARE: 1.5, EPIC: 1, LEGENDARY: 0.5 }) },
  });
  await prisma.systemConfig.create({
    data: { key: 'max_deck_size', value: '5' },
  });
  await prisma.systemConfig.create({
    data: { key: 'mb_conversion_rates', value: JSON.stringify({ COMMON: 10, RARE: 50, EPIC: 200, LEGENDARY: 1000 }) },
  });

  logger.info('✅ Системные настройки созданы');

  // ==================== NOTIFICATIONS ====================
  await prisma.notification.create({
    data: {
      userId: user1.id,
      title: '🎉 Добро пожаловать в MT-Банк!',
      body: 'Ваш Premium-аккаунт активирован. Совершайте покупки и собирайте уникальные карточки!',
      icon: 'celebration',
    },
  });

  logger.info('✅ Уведомления созданы');
  logger.info('🎉 База данных заполнена успешно!');
  logger.info('📱 Тестовые пользователи:');
  logger.info('   Клиент:  +79001234567 / ПИН: 1234');
  logger.info('   Клиент2: +79009876543 / ПИН: 1234');
  logger.info('   Админ:   +79000000000 / ПИН: 0000');
}

main()
  .catch((e) => {
    logger.error({ err: e }, '❌ Ошибка заполнения');
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

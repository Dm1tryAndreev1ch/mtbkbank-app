/**
 * Одноразово или по расписанию: у всех пользователей появляется активная колода.
 * Запуск: npm run db:ensure-decks
 */
require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { ensureAllUsersHaveActiveDeck } = require('../services/ensureUserActiveDeck');
const { logger } = require('../logger');

const prisma = new PrismaClient();

async function main() {
  const n = await ensureAllUsersHaveActiveDeck(prisma);
  logger.info(
    { updatedUsers: n },
    n > 0
      ? `Готово: обновлено пользователей — ${n}`
      : 'Все пользователи уже имеют активную колоду.'
  );
}

main()
  .catch((e) => {
    logger.error({ err: e }, 'ensure-active-decks failed');
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

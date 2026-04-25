/**
 * У каждого пользователя должна быть хотя бы одна активная колода (мобилка и кэшбэк).
 */

async function ensureActiveDeckForUser(prisma, userId) {
  const hasActive = await prisma.deck.findFirst({
    where: { userId, isActive: true },
    select: { id: true },
  });
  if (hasActive) return 'ok';

  const first = await prisma.deck.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  if (first) {
    await prisma.$transaction([
      prisma.deck.updateMany({ where: { userId }, data: { isActive: false } }),
      prisma.deck.update({ where: { id: first.id }, data: { isActive: true } }),
    ]);
    return 'activated';
  }

  await prisma.deck.create({
    data: { userId, name: 'Моя колода', isActive: true },
  });
  return 'created';
}

/** @returns {Promise<number>} число пользователей, у которых что-то изменилось */
async function ensureAllUsersHaveActiveDeck(prisma) {
  const users = await prisma.user.findMany({ select: { id: true } });
  let changed = 0;
  for (const u of users) {
    const r = await ensureActiveDeckForUser(prisma, u.id);
    if (r !== 'ok') changed += 1;
  }
  return changed;
}

module.exports = { ensureActiveDeckForUser, ensureAllUsersHaveActiveDeck };

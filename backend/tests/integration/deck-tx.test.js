/**
 * Phase 3 — Plan 03-00 Wave 0 — REL-06 scaffold.
 *
 * Deck mutation rollback: PUT /api/decks/:id wraps deleteMany+createMany in
 * a single prisma.$transaction via services/deckMutation.js.
 */

const supertest = require('supertest');
const { truncateAll, getPrisma } = require('../setup');

let app;
let prisma;

beforeAll(() => {
  jest.resetModules();
  app = require('../../src/index');
  prisma = getPrisma();
});

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
});

beforeEach(async () => {
  await truncateAll();
});

describe('deck mutation single transaction (REL-06)', () => {
  it.todo('PUT /api/decks/:id with invalid cardId rolls back; existing DeckCard rows preserved (B-H2)');
  it.todo('updateDeckCards is the single $transaction call site (services/deckMutation.js)');
  it.todo('route handler delegates to services/deckMutation.js (no inline deleteMany/createMany in routes/decks.js)');
});

void supertest;
void app;

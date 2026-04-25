# Testing Patterns

**Analysis Date:** 2026-04-25

## Overview

Testing is minimal across the codebase. Only the backend has unit tests (Jest). Mobile has a single E2E skeleton. Admin and recent_operations_view_all have no automated tests.

---

## Backend (Node.js + Express)

### Test Framework

**Runner:**
- Jest 30.3.0
- Invoked via: `npm test` (runs `jest`)
- No Jest config file detected; uses defaults

**Assertion Library:**
- Jest's built-in matchers: `.toBe()`, `.toBeNull()`, `.toHaveBeenCalled()`, `.toHaveBeenCalledWith()`

**Run Commands:**
```bash
npm test              # Run all tests
npm test -- --watch  # Watch mode (inferred)
npm test -- --coverage  # Coverage (standard Jest flag)
```

### Test File Organization

**Location:**
- Tests co-located in `tests/` directory at project root
- Pattern: `*.test.js`

**Current Test Files:**
- `tests/cardEngine.test.js` — Unit tests for card drop and health decay mechanics

**Structure:**
```
backend/
├── tests/
│   └── cardEngine.test.js
├── src/
│   ├── services/
│   │   └── cardEngine.js
│   └── ...
└── package.json
```

### Test Structure

**Example from `cardEngine.test.js`:**
```javascript
describe('Card Engine Mechanics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
```

**Patterns:**
- Nested `describe()` blocks for test organization
- `beforeEach()` resets mocks before each test
- Test names describe expected behavior: `'returns null when...'`, `'processes a LEGENDARY drop if...'`
- Arrange-Act-Assert implicit in test body

### Mocking

**Framework:** Jest's built-in mocking with `jest.mock()` and `jest.spyOn()`

**Patterns:**

1. **Module Mocking (Prisma):**
```javascript
const mockPrisma = {
  user: { findUnique: jest.fn(), update: jest.fn() },
  userCard: { create: jest.fn(), findMany: jest.fn(), update: jest.fn(), delete: jest.fn() },
  notification: { create: jest.fn() },
  $transaction: jest.fn(async (fn) => fn(mockPrisma)),
};

jest.mock('@prisma/client', () => {
  return {
    PrismaClient: jest.fn(() => mockPrisma),
  };
});
```

2. **Function Mocking (Dependencies):**
```javascript
jest.mock('../src/push', () => ({
  sendPushNotification: jest.fn(),
  sendCardDeathWarningPush: jest.fn(),
}));

jest.mock('../src/websocket', () => ({
  broadcastToUser: jest.fn(),
}));
```

3. **Math.random Spying (Deterministic Tests):**
```javascript
jest.spyOn(Math, 'random')
  .mockReturnValueOnce(0.01)  // First call
  .mockReturnValueOnce(0.01); // Second call
```

**Setup Pattern:**
- Mocks defined at module level before imports
- Reset in `beforeEach()` to ensure test isolation
- Mock implementations return resolved promises for async functions

### Fixtures and Factories

**Test Data:**
- Inline mock objects: `{ id: 'user_1', expoPushToken: 'token' }`
- No dedicated factories; data constructed directly in tests
- Example from `cardEngine.test.js`:
```javascript
mockPrisma.collectionCard.findMany.mockResolvedValue([
  { id: 'c_leg', name: 'Black Card' }
]);
mockPrisma.userCard.create.mockResolvedValue({
  id: 'uc_1', collectionCardId: 'c_leg', health: 100
});
```

**Location:**
- Fixtures embedded in test files; no separate fixtures directory
- Reuse achieved via `mockPrisma` setup and reassignment in tests

### Coverage

**Requirements:** Not enforced

**Status:** No coverage config detected; likely runs with defaults

**Likely command to view:**
```bash
npm test -- --coverage
```

### Test Types

**Unit Tests:**
- **Scope:** Individual functions in isolation
- **Approach:** Mock all external dependencies (Prisma, push notifications, websocket)
- **Focus:** Deterministic logic: card drop probability, health decay, card selection

**Integration Tests:**
- **Status:** Not present
- **Why:** Would require test database and complex fixture setup

**E2E Tests:**
- **Framework:** Not fully configured (skeleton only in mobile)
- **Status:** See Mobile section below

---

## Mobile (React Native + Expo)

### Test Framework

**Runner:**
- Detox (implied, based on E2E pattern)
- No config file found; likely would be `detox.config.js`

**Test Files:**
- `mobile/e2e/login.test.js`

**Run Commands:**
```bash
# Inferred (not yet implemented):
npm run e2e          # Build and run Detox tests
npm run e2e:ios      # iOS-specific
npm run e2e:android  # Android-specific
```

### Test File Organization

**Location:**
- E2E tests in `e2e/` directory
- Pattern: `*.test.js`

**Current Test Files:**
- `mobile/e2e/login.test.js` — Authentication flow skeleton

### Test Structure

**Example from `login.test.js`:**
```javascript
describe('Authentication Flow', () => {
  beforeAll(async () => {
    await device.launchApp({ delete: true });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('should successfully bypass biometric and login via synthetic fallback', async () => {
    await expect(element(by.id('login-phone-input'))).toBeVisible();

    await element(by.id('login-phone-input')).typeText('+375291234567\n');
    await element(by.id('login-pin-input')).typeText('0000');
    
    await element(by.id('login-submit-button')).tap();

    // Verify Tab router navigation succeeded
    await expect(element(by.id('tab-bar-cards-button'))).toBeVisible();
  });
});
```

**Patterns:**
- `beforeAll()` launches app once per suite
- `beforeEach()` reloads React Native before each test
- Tests use `element(by.id(...))` selectors (matches testID props)
- Assertions: `expect(element(...)).toBeVisible()`
- User interactions: `.typeText()`, `.tap()`

### Test Coverage Requirements

**Current Status:** Minimal
- 1 E2E test skeleton
- No unit/integration tests for React components
- No API mocking layer for E2E (real API calls expected)

---

## Admin Panel (React + Vite)

**Test Framework:** Not configured

**Status:**
- No test files found
- No Jest, Vitest, or testing library setup
- No CI test invocation

**Recommendation for Future:** Consider Vitest + React Testing Library for component tests.

---

## recent_operations_view_all

**Test Framework:** Not applicable (static artifact)

---

## CI/CD & Test Invocation

**GitHub Actions:** Likely present (`.github/workflows/` exists)
- Not explored in this analysis

**Backend Test Invocation:**
- Standard: `npm test` runs Jest
- Expected in CI pipeline

**Mobile E2E:**
- Not yet integrated into CI (skeleton test only)

**Admin:**
- No tests to run in CI

---

## Test Database

**Backend:**
- Test database: Not explicitly configured
- Tests use mocked Prisma client
- No database fixtures or seed setup for tests observed

**Recommendation:** If moving to integration tests, use Jest's `setupFilesAfterEnv` to spin up test database via `npx prisma migrate reset` with dedicated test `.env`.

---

## Common Test Patterns

### Async Testing

**Pattern in Backend:**
```javascript
it('processes a LEGENDARY drop if random hits an exact extreme threshold', async () => {
  jest.spyOn(Math, 'random')
      .mockReturnValueOnce(0.01)
      .mockReturnValueOnce(0.01);

  mockPrisma.collectionCard.findMany.mockResolvedValue([{ id: 'c_leg' }]);
  mockPrisma.userCard.create.mockResolvedValue({ id: 'uc_1' });

  const result = await processCardDrop(mockPrisma, 'user_1', 'trans_1');
  expect(result).toBeDefined();
});
```

**Pattern in Mobile E2E:**
```javascript
it('should...', async () => {
  await device.launchApp({ delete: true });
  await element(by.id('...')).typeText('...');
  await element(by.id('...')).tap();
  await expect(element(by.id('...'))).toBeVisible();
});
```

### Error Testing

**Backend:**
- Not explicitly tested in current suite
- Would need: mock prisma methods to reject promises
- Example approach:
```javascript
it('handles database errors gracefully', async () => {
  mockPrisma.user.findUnique.mockRejectedValue(new Error('DB error'));
  const result = await someFunction(mockPrisma);
  expect(result).toBeNull(); // or similar error behavior
});
```

---

## Testing Gaps & Recommendations

### Backend

**Current Coverage:**
- Card mechanics only (drop, health decay, sacrifice)

**Missing:**
- Route/endpoint tests
- Authentication flow tests
- Validation tests
- Error handling verification

**Recommendation:**
```javascript
// Example: Test route endpoint with mocked Prisma
router.get('/users', async (req, res) => {
  // Test: 200 response with users array
  // Test: 500 on database error
  // Test: Pagination with limit/offset
});
```

### Mobile

**Current Coverage:**
- Login E2E skeleton only

**Missing:**
- Component unit tests
- Store actions unit tests
- API interceptor tests
- Navigation tests

**Recommendation:**
```typescript
// Use: @react-native-testing-library/react-native
// + jest mocks for SecureStore, axios
it('should display error on login failure', () => {
  const { getByTestId } = render(<LoginScreen />);
  fireEvent.press(getByTestId('login-submit-button'));
  expect(getByTestId('error-message')).toBeVisible();
});
```

### Admin

**Current Coverage:** None

**Recommendation:**
- Use Vitest + React Testing Library
- Test critical flows: login, create/edit/delete operations
- Mock API client (fetch)

---

## Debugging Tests

### Backend

**Run Single Test:**
```bash
npm test -- cardEngine.test.js
```

**Debug with Node Inspector:**
```bash
node --inspect-brk ./node_modules/.bin/jest cardEngine.test.js
# Then open chrome://inspect in Chrome
```

### Mobile

**Debug E2E:**
- Detox provides detailed logs: `detox test e2e/login.test.js --verbose`
- Use `--record-logs all` for artifacts

---

*Testing analysis: 2026-04-25*

/**
 * Sentry mobile init / setUser wiring assertions.
 * Reference: VALIDATION row 1-05-01 + RESEARCH §5.7.
 *
 * Strategy: mock @sentry/react-native, then require ../services/sentry; inspect Sentry.init's config.
 * Variable names prefixed with `mock` so jest hoisting allows referencing them inside `jest.mock()`.
 */
const mockInitSpy = jest.fn();
const mockWrapSpy = jest.fn((c) => c);
const mockCaptureExceptionSpy = jest.fn();
const mockSetUserSpy = jest.fn();
const mockMobileReplaySpy = jest.fn((cfg) => ({ name: 'MobileReplay', __cfg: cfg }));

jest.mock('@sentry/react-native', () => ({
  init: mockInitSpy,
  wrap: mockWrapSpy,
  captureException: mockCaptureExceptionSpy,
  setUser: mockSetUserSpy,
  mobileReplayIntegration: mockMobileReplaySpy,
}));

describe('Sentry init config (with DSN)', () => {
  let initConfig: any;

  beforeAll(() => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://example@example.ingest.sentry.io/1';
    jest.isolateModules(() => {
      // Force a fresh require so init runs against the spy
      require('../services/sentry');
    });
    expect(mockInitSpy).toHaveBeenCalled();
    initConfig = mockInitSpy.mock.calls[0][0];
  });

  test('dsn passed through', () => {
    expect(initConfig.dsn).toBe('https://example@example.ingest.sentry.io/1');
  });

  test('replaysSessionSampleRate = 0 (never proactively record)', () => {
    expect(initConfig.replaysSessionSampleRate).toBe(0);
  });

  test('replaysOnErrorSampleRate present (1.0 in prod, 0 in dev)', () => {
    expect([0, 1, 1.0]).toContain(initConfig.replaysOnErrorSampleRate);
  });

  test('tracesSampleRate present', () => {
    expect(typeof initConfig.tracesSampleRate).toBe('number');
    expect(initConfig.tracesSampleRate).toBeGreaterThanOrEqual(0.1);
  });

  test('mobileReplayIntegration is configured with maskAllText/Images/Vectors true', () => {
    expect(mockMobileReplaySpy).toHaveBeenCalledWith({
      maskAllText: true,
      maskAllImages: true,
      maskAllVectors: true,
    });
  });

  test('beforeSend is wired to a function', () => {
    expect(typeof initConfig.beforeSend).toBe('function');
  });

  test('beforeBreadcrumb is wired to a function', () => {
    expect(typeof initConfig.beforeBreadcrumb).toBe('function');
  });
});

describe('Sentry init guard (no DSN)', () => {
  test('skips init when EXPO_PUBLIC_SENTRY_DSN is empty', () => {
    mockInitSpy.mockClear();
    process.env.EXPO_PUBLIC_SENTRY_DSN = '';
    jest.isolateModules(() => {
      require('../services/sentry');
    });
    expect(mockInitSpy).not.toHaveBeenCalled();
  });
});

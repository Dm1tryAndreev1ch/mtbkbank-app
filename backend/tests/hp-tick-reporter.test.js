/**
 * HP-tick error reporter tests.
 * Verifies 5/5min rate-limit, fingerprint assignment, and process-local fallback when Redis is the failing dependency.
 * Reference: RESEARCH §5.3 + VALIDATION row 1-04-03.
 */

// Mock cache + instrument BEFORE requiring the SUT
const mockRedis = { isReady: true, incr: jest.fn(), expire: jest.fn() };
jest.mock('../src/cache', () => ({ redisClient: mockRedis }));

// Names MUST start with `mock` — Jest hoists jest.mock() factories ABOVE imports,
// and the babel-jest hoist guard rejects out-of-scope refs unless they are `mock`-prefixed.
const mockCaptureExceptionSpy = jest.fn();
const mockSetFingerprintSpy = jest.fn();
const mockSetTagSpy = jest.fn();
const mockSetContextSpy = jest.fn();
jest.mock('../src/instrument', () => {
  const Sentry = {
    withScope: (cb) => cb({
      setFingerprint: mockSetFingerprintSpy,
      setTag: mockSetTagSpy,
      setContext: mockSetContextSpy,
    }),
    captureException: mockCaptureExceptionSpy,
  };
  return { Sentry, piiBeforeSend: (e) => e, scrubObject: (o) => o, scrubString: (s) => s };
});

const mockLoggerErrorSpy = jest.fn();
jest.mock('../src/logger', () => ({ logger: { error: mockLoggerErrorSpy, info: jest.fn(), warn: jest.fn() } }));

const { reportHpTickError, __resetForTests } = require('../src/services/hpTickReporter');

beforeEach(() => {
  jest.clearAllMocks();
  mockRedis.isReady = true;
  mockRedis.incr.mockReset();
  mockRedis.expire.mockReset();
  __resetForTests();
});

describe('reportHpTickError — Redis-backed rate-limit', () => {
  test('first call captures and sets fingerprint + tag + context', async () => {
    mockRedis.incr.mockResolvedValueOnce(1);
    await reportHpTickError(new Error('boom'), { tickIntervalMs: 60000 });
    expect(mockCaptureExceptionSpy).toHaveBeenCalledTimes(1);
    expect(mockSetFingerprintSpy).toHaveBeenCalledWith(['hp-tick-error']);
    expect(mockSetTagSpy).toHaveBeenCalledWith('component', 'cron-hp-tick');
    expect(mockSetContextSpy).toHaveBeenCalledWith('hp_tick', { tickIntervalMs: 60000 });
    expect(mockRedis.expire).toHaveBeenCalledWith('sentry:hp-tick-rate', 300);
  });

  test('events 2-5 capture (under window cap)', async () => {
    mockRedis.incr
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(5);
    await reportHpTickError(new Error('e2'), {});
    await reportHpTickError(new Error('e3'), {});
    await reportHpTickError(new Error('e4'), {});
    await reportHpTickError(new Error('e5'), {});
    expect(mockCaptureExceptionSpy).toHaveBeenCalledTimes(4);
  });

  test('event 6 within window is suppressed', async () => {
    mockRedis.incr.mockResolvedValueOnce(6);
    await reportHpTickError(new Error('e6'), {});
    expect(mockCaptureExceptionSpy).not.toHaveBeenCalled();
  });

  test('every call logs to pino regardless of capture decision', async () => {
    mockRedis.incr.mockResolvedValueOnce(99);
    await reportHpTickError(new Error('over-cap'), { ctx: 1 });
    expect(mockLoggerErrorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), ctx: 1 }),
      'hp_tick_error'
    );
    expect(mockCaptureExceptionSpy).not.toHaveBeenCalled();
  });
});

describe('reportHpTickError — Redis unavailable fallback', () => {
  test('first error with Redis down → captures + sets process fallback timestamp', async () => {
    mockRedis.isReady = false;
    await reportHpTickError(new Error('redis-down-1'), {});
    expect(mockCaptureExceptionSpy).toHaveBeenCalledTimes(1);
  });

  test('second error within 5min with Redis still down → suppressed', async () => {
    mockRedis.isReady = false;
    await reportHpTickError(new Error('redis-down-1'), {});
    await reportHpTickError(new Error('redis-down-2'), {});
    expect(mockCaptureExceptionSpy).toHaveBeenCalledTimes(1);
  });

  test('after 5min reset, next error captures again', async () => {
    mockRedis.isReady = false;
    await reportHpTickError(new Error('first'), {});
    __resetForTests();
    await reportHpTickError(new Error('after-window'), {});
    expect(mockCaptureExceptionSpy).toHaveBeenCalledTimes(2);
  });

  test('Redis incr throws → falls back to process-local guard', async () => {
    mockRedis.incr.mockRejectedValueOnce(new Error('connection refused'));
    await reportHpTickError(new Error('redis-throw'), {});
    expect(mockCaptureExceptionSpy).toHaveBeenCalledTimes(1);
  });
});

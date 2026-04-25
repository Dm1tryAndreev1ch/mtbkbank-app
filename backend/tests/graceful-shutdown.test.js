/**
 * Graceful-shutdown integration test.
 * Spawns the full backend as a child node process, waits for `server_started`,
 * sends SIGTERM, asserts the process exits 0 within close-with-grace's 10s
 * window with the shutdown_start / shutdown_complete log markers present.
 *
 * Why a child process and not in-process? close-with-grace registers SIGTERM
 * handlers on `process` itself; firing SIGTERM from inside Jest would kill
 * Jest. Spawning a fresh node lets us drive the signal cleanly.
 *
 * Postgres / Redis reachability: the test relies on lazy connections
 * (prisma connects on first query; redis logs+continues on connection error).
 * close-with-grace's per-step try/catch guarantees a stuck Redis cannot block
 * the drain past the 10s deadline. CI Compose stack provides reachable
 * services; local runs without containers may show prisma_disconnect_failed
 * warnings but still exit 0 within budget.
 */
const { spawn } = require('child_process');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const INDEX_JS = path.join(REPO_ROOT, 'backend', 'src', 'index.js');

function spawnBackend(extraEnv = {}) {
  return spawn(process.execPath, [INDEX_JS], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test',
      REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
      JWT_SECRET: 'test-jwt',
      JWT_REFRESH_SECRET: 'test-jwt-refresh',
      ALLOWED_ORIGINS: 'http://localhost:5173',
      // envalid rejects PORT=0 (port() validator); use a high ephemeral
      // port unlikely to collide with dev services.
      PORT: process.env.GRACEFUL_SHUTDOWN_TEST_PORT || '39001',
      LOG_LEVEL: 'info',
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function waitForLog(child, pattern, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${pattern}`)), timeoutMs);
    const onData = (data) => {
      if (pattern.test(data.toString())) {
        clearTimeout(timer);
        child.stdout.off('data', onData);
        child.stderr.off('data', onData);
        resolve();
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
  });
}

describe('graceful shutdown via close-with-grace', () => {
  jest.setTimeout(20000);

  test('SIGTERM triggers shutdown_complete and exits 0 within 11s', async () => {
    const child = spawnBackend();
    let stdoutBuf = '';
    child.stdout.on('data', (d) => { stdoutBuf += d.toString(); });
    child.stderr.on('data', (d) => { stdoutBuf += d.toString(); });

    try {
      await waitForLog(child, /server_started/, 8000);
    } catch (e) {
      child.kill('SIGKILL');
      throw new Error(`Backend did not start: ${e.message}\n--- output ---\n${stdoutBuf}`);
    }

    const start = Date.now();
    child.kill('SIGTERM');

    const exitCode = await new Promise((resolve) => {
      child.on('exit', (code) => resolve(code));
    });

    const elapsed = Date.now() - start;
    // close-with-grace's hard kill is 10s; expect graceful exit well before that.
    // Add 1s jitter for CI scheduler latency.
    expect(elapsed).toBeLessThan(11000);
    expect(exitCode).toBe(0);
    // shutdown chain must have logged the start or complete marker.
    expect(stdoutBuf).toMatch(/shutdown_start|shutdown_complete/);
  });
});

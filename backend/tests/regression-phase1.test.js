/**
 * Phase-1 regression guard (Jest).
 * Pins the four already-fixed Phase-1 anti-patterns AND staging-pins the
 * Phase-2 fixes that are still in the codebase today (intentionally RED via
 * `test.failing` — they flip GREEN automatically when Phase 2 lands without any
 * test edit).
 *
 * Companion to scripts/regression-guard.sh (eight bash git-grep checks).
 *
 * NOTE on `git grep` flags: We use `git grep -P` (PCRE) so `\s` and `\b` work
 * portably on macOS git (POSIX ERE in macOS git grep does not support these
 * escapes). The companion script `scripts/regression-guard.sh` does the same.
 *
 * NOTE on Phase-1 RED/GREEN status (verified at write time, 2026-04-25):
 *   - admin/src/App.jsx already has NO `let TOKEN` → assertion is a regular
 *     already-fixed pin (will RED if regressed).
 *   - mobile/services/api.ts has NO `.catch(() => {})` (already removed) but
 *     DOES have `catch {}` blocks → we pin both, the latter is `.failing`.
 *   - mobile/stores/useStore.ts has multiple `catch {}` blocks → `.failing`.
 *   - backend/src has `console.*` calls → `.failing` until plan 01-01 lands.
 *   - JWT fallback_secret literal: not present today → already-fixed pin.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..', '..');

function readRepoFile(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

describe('Phase-1 regression guard — static pins (already fixed)', () => {
  test('no JWT fallback_secret literal anywhere in backend/src/', () => {
    const out = execSync(
      'git grep -lP "fallback_secret" -- backend/src/ || true',
      { cwd: REPO_ROOT, encoding: 'utf8' }
    ).trim();
    expect(out).toBe('');
  });

  test('no `JWT_SECRET || ...` fallback expression in backend/src/', () => {
    const out = execSync(
      'git grep -lP "JWT_SECRET\\s*\\|\\|\\s*[\\"\\\']" -- backend/src/ || true',
      { cwd: REPO_ROOT, encoding: 'utf8' }
    ).trim();
    expect(out).toBe('');
  });

  test('admin/src/App.jsx has no module-scope `let TOKEN` (Phase-1 SEC-06 already fixed)', () => {
    const file = readRepoFile('admin/src/App.jsx');
    expect(file).not.toMatch(/^let\s+TOKEN\b/m);
  });

  test('mobile/services/api.ts has no empty `.catch(() => {})` (Phase-1 already fixed)', () => {
    const file = readRepoFile('mobile/services/api.ts');
    expect(file).not.toMatch(/\.catch\s*\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/);
  });

  test('regression-guard.sh exists and is executable', () => {
    const stat = fs.statSync(path.join(REPO_ROOT, 'scripts/regression-guard.sh'));
    // Owner-execute bit must be set
    expect(stat.mode & 0o100).toBeTruthy();
  });

  test('regression-guard.sh contains all six guard categories', () => {
    const sh = readRepoFile('scripts/regression-guard.sh');
    expect(sh).toMatch(/CORS origin: true/);
    expect(sh).toMatch(/CORS wildcard origin/);
    expect(sh).toMatch(/JWT fallback_secret literal/);
    expect(sh).toMatch(/Admin module-scope let TOKEN/);
    expect(sh).toMatch(/Empty \.catch/);
    expect(sh).toMatch(/console\.\* in backend\/src/);
  });
});

describe('Phase-1 regression guard — staging pins (RED today, GREEN after Phase 2)', () => {
  // .failing => Jest expects this assertion to FAIL today; when Phase-2 REL-04 removes
  // the empty `catch {}` blocks, these tests start passing, which Jest then reports as
  // FAILING because .failing inverted the expectation. Flip .failing → standard `test(...)`
  // in Phase 2 (REL-04) to keep them green.

  test.failing('mobile/services/api.ts has no empty `catch {}` (Phase-2 REL-04 fixes this)', () => {
    const file = readRepoFile('mobile/services/api.ts');
    expect(file).not.toMatch(/catch\s*(\([^)]*\))?\s*\{\s*\}/);
  });

  test.failing('mobile/stores/useStore.ts has no empty `catch {}` (Phase-2 REL-04 fixes this)', () => {
    const file = readRepoFile('mobile/stores/useStore.ts');
    expect(file).not.toMatch(/catch\s*(\([^)]*\))?\s*\{\s*\}/);
  });
});

describe('Phase-1 regression guard — console.log migration (plan 01-01 complete)', () => {
  test('no console.log/error/warn/info in backend/src/ (plan 01-01 migrated them)', () => {
    const out = execSync(
      'git grep -lP "\\bconsole\\.(log|error|warn|info)\\b" -- backend/src/ || true',
      { cwd: REPO_ROOT, encoding: 'utf8' }
    ).trim();
    expect(out).toBe('');
  });
});

describe('Phase-1 regression guard — dynamic CORS / boot / middleware (filled by plan 01-99)', () => {
  // Plan 01-99 fills these bodies once plans 01-01..01-08 have landed.
  test.todo('CORS rejects Origin: * (boot app, hit /healthz with bad Origin, no ACAO header)');
  test.todo('CORS accepts allow-listed origin (boot app, hit /healthz, ACAO matches)');
  test.todo('Backend boot fails non-zero when JWT_SECRET is missing in NODE_ENV=production (spawnSync)');
  test.todo('X-Request-Id echoed on every response and present in pino log line');
  test.todo('404 returns {error: NOT_FOUND, message: Russian, requestId} JSON');
  test.todo('AppError thrown from /__test__/sentry-error returns {error, message, requestId} JSON');
});

// Phase 4.5 / 04.5-01 / Task 4 — exercises the no-restricted-syntax selectors
// added to backend/eslint.config.js.
//
// Implementation note (mirrored from mobile/eslint-rules/__tests__/
// no-raw-mutation-button.test.js): the ESLint Node API loads flat-config via
// dynamic `import()`, which jest's CJS VM cannot evaluate without
// `--experimental-vm-modules`. Shelling out to the local `eslint` CLI is
// simpler and faster: write a fixture, run `eslint --format json`, parse.
//
// Belt-and-suspenders: scripts/regression-guard.sh greps for the rule's
// presence so disabling the lint rule alone does not pass CI.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BACKEND_ROOT = path.join(__dirname, '..', '..');

function lintSource(relPath, source) {
  const fixturePath = path.join(BACKEND_ROOT, relPath);
  fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
  fs.writeFileSync(fixturePath, source, 'utf8');
  try {
    const res = spawnSync(
      'npx',
      ['--no-install', 'eslint', '--no-ignore', '--format', 'json', fixturePath],
      { cwd: BACKEND_ROOT, encoding: 'utf8' }
    );
    const stdout = res.stdout || '';
    if (!stdout.trim()) {
      throw new Error(`eslint returned no JSON. stderr=${(res.stderr || '').slice(0, 500)}`);
    }
    const parsed = JSON.parse(stdout);
    const file = parsed.find((r) => r.filePath === fixturePath) || parsed[0];
    return file && file.messages ? file.messages : [];
  } finally {
    try { fs.unlinkSync(fixturePath); } catch (_) { /* ignore */ }
  }
}

describe('Phase-4.5 D-02 — no destructive prisma calls outside admin', () => {
  jest.setTimeout(60_000);

  test('flags prisma.user.delete OUTSIDE backend/src/routes/admin/**', () => {
    const msgs = lintSource(
      'src/__phase45_fixture_outside_admin.js',
      "module.exports = (req) => req.prisma.user.delete({ where: { id: '1' } });\n"
    );
    expect(msgs.some((m) => /prisma\.user\.delete is restricted/.test(m.message))).toBe(true);
  });

  test('allows prisma.user.delete INSIDE backend/src/routes/admin/**', () => {
    const msgs = lintSource(
      'src/routes/admin/__phase45_fixture_inside_admin.js',
      "module.exports = (req) => req.prisma.user.delete({ where: { id: '1' } });\n"
    );
    expect(msgs.some((m) => /prisma\.user\.delete is restricted/.test(m.message))).toBe(false);
  });

  test('allows prisma.userCard.delete inside services/cardEngine.js (allowlist)', () => {
    // Use the dedicated fixture path explicitly listed in the allowlist
    // alongside services/cardEngine.js — keeps the real cardEngine.js
    // source untouched during the test run.
    const msgs = lintSource(
      'src/services/__phase45_fixture_engine.js',
      "module.exports = (prisma) => prisma.userCard.delete({ where: { id: '1' } });\n"
    );
    expect(msgs.some((m) => /prisma\.userCard\.delete is restricted/.test(m.message))).toBe(false);
  });

  test('allows prisma.user.delete inside src/seed/** (allowlist)', () => {
    const msgs = lintSource(
      'src/seed/__phase45_fixture_seed.js',
      "module.exports = (prisma) => prisma.user.delete({ where: { id: '1' } });\n"
    );
    expect(msgs.some((m) => /prisma\.user\.delete is restricted/.test(m.message))).toBe(false);
  });
});

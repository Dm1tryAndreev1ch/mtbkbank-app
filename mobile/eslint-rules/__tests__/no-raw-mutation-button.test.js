// Phase-4 D-08 — exercises the three no-restricted-syntax selectors added to
// mobile/eslint.config.js (block A: empty onPress; block B: onPress={() => undefined};
// block C: raw async onPress on non-ActionButton elements).
//
// Implementation note: the ESLint Node API loads flat-config files via
// dynamic `import()`, which jest-expo's CJS VM does not support without
// `--experimental-vm-modules`. To keep the test config-free we shell out to
// the local `eslint` CLI (which runs in a normal Node process and resolves
// flat config natively). We assert on JSON-formatted lint output.
//
// Belt-and-suspenders: scripts/regression-guard.sh greps for the same patterns
// so disabling the lint rule alone does not pass CI.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const MOBILE_ROOT = path.join(__dirname, '..', '..');

function lintSource(source) {
  // Write to mobile/app/__phase4_eslint_fixture__.tsx so flat-config `files: ['app/**/*.tsx']`
  // matches; clean up afterward.
  const fixturePath = path.join(MOBILE_ROOT, 'app', '__phase4_eslint_fixture__.tsx');
  fs.writeFileSync(fixturePath, source, 'utf8');
  try {
    const res = spawnSync(
      'npx',
      ['--no-install', 'eslint', '--format', 'json', fixturePath],
      {
        cwd: MOBILE_ROOT,
        encoding: 'utf8',
      }
    );
    const stdout = res.stdout || '';
    if (!stdout.trim()) {
      throw new Error(
        `eslint returned no JSON. stderr=${(res.stderr || '').slice(0, 500)}`
      );
    }
    const parsed = JSON.parse(stdout);
    const file = parsed.find((r) => r.filePath === fixturePath) || parsed[0];
    return file.messages || [];
  } finally {
    try {
      fs.unlinkSync(fixturePath);
    } catch (_) {
      /* ignore */
    }
  }
}

describe('Phase-4 D-08 — no-restricted-syntax (mockup-button + raw async onPress)', () => {
  jest.setTimeout(60_000);

  test('flags empty onPress block on TouchableOpacity inside mobile/app', () => {
    const msgs = lintSource(
      "import {TouchableOpacity} from 'react-native';\n" +
        "export default function F() { return <TouchableOpacity onPress={() => {}} />; }\n"
    );
    expect(msgs.some((m) => /Empty onPress/.test(m.message))).toBe(true);
  });

  test('flags onPress={() => undefined} on TouchableOpacity inside mobile/app', () => {
    const msgs = lintSource(
      "import {TouchableOpacity} from 'react-native';\n" +
        "export default function F() { return <TouchableOpacity onPress={() => undefined} />; }\n"
    );
    expect(msgs.some((m) => /\(\) => undefined/.test(m.message))).toBe(true);
  });

  test('flags raw async onPress on TouchableOpacity', () => {
    const msgs = lintSource(
      "import {TouchableOpacity} from 'react-native';\n" +
        "export default function F() {\n" +
        "  return <TouchableOpacity onPress={async () => { await fetch('/x'); }} />;\n" +
        '}\n'
    );
    expect(msgs.some((m) => /Raw async onPress/.test(m.message))).toBe(true);
  });

  test('allows async onPress on ActionButton (single-flight wrapper)', () => {
    const msgs = lintSource(
      "import {ActionButton} from '../components/ActionButton';\n" +
        "export default function F() {\n" +
        "  return <ActionButton label='X' onPress={async () => { await fetch('/x'); }} />;\n" +
        '}\n'
    );
    expect(msgs.some((m) => /Raw async onPress/.test(m.message))).toBe(false);
  });
});

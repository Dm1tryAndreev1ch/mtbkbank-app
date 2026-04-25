/**
 * Asserts `require('./instrument')` is the first non-comment, non-blank `require(...)`
 * call in backend/src/index.js. Mitigates Risk 8.3 (instrument.js not actually first).
 * Reference: RESEARCH §5.6 step 01, RESEARCH §8.3 + VALIDATION row 1-04-02.
 */
const fs = require('fs');
const path = require('path');

const INDEX_JS = path.join(__dirname, '..', 'src', 'index.js');

describe('Risk 8.3 — instrument.js placement', () => {
  test('require(\'./instrument\') is the first require() in backend/src/index.js', () => {
    const src = fs.readFileSync(INDEX_JS, 'utf8');
    const lines = src.split('\n');
    // Find the first line that calls require(...) and is NOT inside a /* */ block
    // (we keep it simple: skip blank lines and lines starting with // or /*)
    let firstRequire = null;
    for (const raw of lines) {
      const line = raw.trim();
      if (line === '' || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) continue;
      if (/\brequire\s*\(/.test(line)) {
        firstRequire = line;
        break;
      }
    }
    expect(firstRequire).not.toBeNull();
    expect(firstRequire).toMatch(/require\(['"]\.\/instrument['"]\)/);
  });

  test('Sentry.setupExpressErrorHandler is wired (placeholder removed)', () => {
    const src = fs.readFileSync(INDEX_JS, 'utf8');
    // The PLAN 04 placeholder comment must be GONE; live call must be present
    expect(src).toMatch(/Sentry\.setupExpressErrorHandler\(app\)/);
    expect(src).not.toMatch(/\/\/\s*PLAN\s*04:\s*Sentry\.setupExpressErrorHandler/);
  });

  test('per-request requestId scope tag is wired', () => {
    const src = fs.readFileSync(INDEX_JS, 'utf8');
    expect(src).toMatch(/Sentry\.getCurrentScope\(\)\.setTag\(['"]requestId['"]/);
  });

  test('cron .catch routes through hpTickReporter (no bare logger.error placeholder)', () => {
    const src = fs.readFileSync(INDEX_JS, 'utf8');
    expect(src).toMatch(/reportHpTickError\(err/);
    expect(src).not.toMatch(/logger\.error\(\{\s*err,\s*event:\s*['"]hp-tick-error['"]/);
  });
});

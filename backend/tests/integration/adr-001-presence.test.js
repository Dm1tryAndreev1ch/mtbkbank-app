/**
 * Phase 3 — Plan 03-14 — SEC-13 live presence test.
 *
 * ADR-001 file-existence + section-headings pin. No Express boot needed.
 * Wave-0 todos (from 03-00) flipped live by 03-14.
 */

const fs = require('node:fs');
const path = require('node:path');

const ADR_PATH = path.resolve(
  __dirname,
  '../../../docs/adr/ADR-001-no-csrf-middleware.md'
);

describe('ADR-001 presence (SEC-13)', () => {
  let content;

  beforeAll(() => {
    content = fs.readFileSync(ADR_PATH, 'utf8');
  });

  it('docs/adr/ADR-001-no-csrf-middleware.md exists', () => {
    expect(fs.existsSync(ADR_PATH)).toBe(true);
  });

  it('file contains heading ## Context', () => {
    expect(content).toMatch(/^## Context\s*$/m);
  });

  it('file contains heading ## Decision', () => {
    expect(content).toMatch(/^## Decision\s*$/m);
  });

  it('file contains heading ## Consequences', () => {
    expect(content).toMatch(/^## Consequences\s*$/m);
  });

  it('file mentions bearer + localStorage rationale', () => {
    expect(content).toMatch(/bearer/i);
    expect(content).toMatch(/localStorage/);
    expect(content).toMatch(/Origin/);
  });
});

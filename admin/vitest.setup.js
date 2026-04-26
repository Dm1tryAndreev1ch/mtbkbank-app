/**
 * Phase 3 — Plan 03-15.
 *
 * Node 25 ships experimental built-in `localStorage` (gated by
 * `--experimental-webstorage` / `--localstorage-file=...`). When vitest
 * boots with `environment: 'jsdom'`, that Node global shadows jsdom's
 * `window.localStorage` Storage implementation, leaving us with a plain
 * object that has no `setItem` / `getItem` methods. Tests that touch
 * localStorage (TokenContext SEC-06, error-rendering SEC-07) then fail with
 * `localStorage.setItem is not a function`.
 *
 * Fix: re-install jsdom's Storage on globalThis before any test runs.
 * Rule-3 deviation: SEC-06 plan needs working localStorage; without this
 * setup the new live tests cannot pass on Node 25.
 */
// Build a fresh Storage-shaped object — jsdom 25 + Node 25's experimental
// `localStorage` global collide and the real Storage prototype never makes
// it onto window/globalThis. Tests just need a working get/set/remove.
function makeStorage() {
  const store = new Map();
  return {
    get length() { return store.size; },
    key(n) { return Array.from(store.keys())[n] ?? null; },
    getItem(k) { return store.has(String(k)) ? store.get(String(k)) : null; },
    setItem(k, v) { store.set(String(k), String(v)); },
    removeItem(k) { store.delete(String(k)); },
    clear() { store.clear(); },
  };
}

const localStorageShim = makeStorage();
const sessionStorageShim = makeStorage();

for (const target of [globalThis, typeof window !== 'undefined' ? window : null].filter(Boolean)) {
  Object.defineProperty(target, 'localStorage', {
    configurable: true,
    writable: true,
    value: localStorageShim,
  });
  Object.defineProperty(target, 'sessionStorage', {
    configurable: true,
    writable: true,
    value: sessionStorageShim,
  });
}

// backend/src/schemas/_helpers/luhn.js
// Single source of truth for Luhn check (D-11). ESM so Vite can bundle it
// into the admin SPA without injecting a bare require() call.
// Node loads this transparently from CJS packages via static import interop.

/** Алгоритм Луна для банковского номера карты. */
export function luhnCheck(pan) {
  if (!pan || pan.length < 13 || pan.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = pan.length - 1; i >= 0; i -= 1) {
    let n = parseInt(pan[i], 10);
    if (Number.isNaN(n)) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

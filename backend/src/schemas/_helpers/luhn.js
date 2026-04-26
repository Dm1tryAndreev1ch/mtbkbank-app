// backend/src/schemas/_helpers/luhn.js
// Single source of truth for Luhn check (D-11). Extracted from backend/src/routes/auth.js
// (Phase 1/2 register handler) to be reused by Zod schemas in Phase 3 AND the existing
// register handler. Keep verbatim — Phase-1/2 register-Luhn behaviour must be preserved.

/** Алгоритм Луна для банковского номера карты. */
function luhnCheck(pan) {
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

module.exports = { luhnCheck };

/**
 * Single error class for the entire backend.
 * Per D-08: NO subclasses (no AuthError / ValidationError / etc.).
 * Per D-09: status code is decided at the throw site, not in the codebook.
 *
 * Usage:
 *   throw new AppError('AUTH_INVALID_PIN', 401);              // resolves Russian message from messages.js
 *   throw new AppError('CUSTOM_CODE', 422, 'Точное сообщение'); // override resolved message
 */
class AppError extends Error {
  constructor(code, status, messageOverride) {
    super(messageOverride || code);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    if (messageOverride) this.message = messageOverride;
    this.isAppError = true;
    // Distinguish "operator-supplied override" from "constructor default-to-code".
    // errorNormalizer uses this to prefer the Russian codebook entry over the bare code
    // when no override was provided at the throw site (per plan must_haves: "When
    // messageOverride is omitted, messages[code] resolves the Russian string").
    this.hasMessageOverride = Boolean(messageOverride);
  }
}

module.exports = { AppError };

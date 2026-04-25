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
  }
}

module.exports = { AppError };

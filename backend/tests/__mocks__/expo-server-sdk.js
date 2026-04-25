/**
 * Jest mock for expo-server-sdk.
 *
 * The real `expo-server-sdk` ships as ESM only and Jest's CJS-by-default loader
 * cannot transform it without extra config. Tests that require the real Express
 * app (supertest, integration tests) only care that push notifications can be
 * imported and called as a no-op — the wire-level Expo behaviour is out of
 * scope for those tests.
 *
 * Wired via jest.config.js `moduleNameMapper`: '^expo-server-sdk$' -> this file.
 */
class Expo {
  constructor() {}
  static isExpoPushToken(_token) { return true; }
  chunkPushNotifications(messages) { return [messages]; }
  async sendPushNotificationsAsync(_chunk) { return []; }
  chunkPushNotificationReceiptIds(ids) { return [ids]; }
  async getPushNotificationReceiptsAsync(_chunk) { return {}; }
}

module.exports = { Expo };

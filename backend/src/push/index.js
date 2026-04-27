const { Expo } = require('expo-server-sdk');
const { logger } = require('../logger');

// Create a new Expo SDK client
// optionally providing an access token if you have enabled push security
const expo = new Expo();

async function sendPushNotification(expoPushToken, title, body, data = {}) {
  // Check that all your push tokens appear to be valid Expo push tokens
  if (!Expo.isExpoPushToken(expoPushToken)) {
    logger.error(
      { expoPushToken },
      'Push token is not a valid Expo push token'
    );
    return;
  }

  const messages = [{
    to: expoPushToken,
    sound: 'default',
    title: title,
    body: body,
    data: data,
  }];

  try {
    const chunks = expo.chunkPushNotifications(messages);
    for (let chunk of chunks) {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      logger.info({ ticketChunk }, 'Push ticket received');
    }
  } catch (error) {
    logger.error({ err: error }, 'Error sending push notification');
  }
}

async function sendCardDeathWarningPush(user, cardName, currentHealth) {
  if (user.expoPushToken) {
    await sendPushNotification(
      user.expoPushToken,
      '⚠️ Карта теряет здоровье!',
      `Ваша карта "${cardName}" близка к уничтожению (Осталось ${currentHealth} HP). Восстановите её здоровье!`,
      { type: 'CARD_WARNING', cardName }
    );
  }
}

// ---------------------------------------------------------------------------
// Phase 4.5 / 04.5-04 / ADMIN-10 — broadcast helper for admin notification fan-out.
//
// Chunks an array of recipients via expo.chunkPushNotifications and aggregates
// per-ticket ok/error counts. Per-chunk send failures (Expo upstream errors,
// network exceptions) are caught so a single bad chunk does not abort the
// fan-out. Recipients without an expoPushToken are silently skipped — admin
// has no actionable signal for them.
//
// Returns: { ok: number, error: number }
//   ok    = count of tickets with status='ok' across every chunk
//   error = count of tickets with status='error' + chunk send failures
// ---------------------------------------------------------------------------
async function sendBroadcast(recipients, { title, body, data }) {
  const messages = (recipients || [])
    .filter((r) => r && r.expoPushToken && Expo.isExpoPushToken(r.expoPushToken))
    .map((r) => ({
      to: r.expoPushToken,
      sound: 'default',
      title,
      body,
      data: data || {},
    }));
  if (messages.length === 0) return { ok: 0, error: 0 };

  const chunks = expo.chunkPushNotifications(messages);
  let ok = 0;
  let error = 0;
  for (const chunk of chunks) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      for (const t of tickets) {
        if (t && t.status === 'ok') ok += 1;
        else error += 1;
      }
    } catch (e) {
      logger.error({ err: e }, 'Push broadcast chunk send failed');
      error += chunk.length;
    }
  }
  return { ok, error };
}

module.exports = {
  sendPushNotification,
  sendCardDeathWarningPush,
  sendBroadcast,
};

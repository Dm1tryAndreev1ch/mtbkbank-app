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

module.exports = {
  sendPushNotification,
  sendCardDeathWarningPush
};

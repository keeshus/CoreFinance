import webpush from 'web-push';
import { getWebPushSubscriptions } from './db.js';

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(
    'mailto:support@corefinance.local',
    vapidPublicKey,
    vapidPrivateKey
  );
}

export const sendPushNotification = async (title, body, url = '/') => {
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.error('Push notification failed: VAPID keys are not configured in environment variables.');
    return;
  }
  try {
    const subscriptions = await getWebPushSubscriptions();
    if (subscriptions.length === 0) {
      console.log('No push subscriptions found, skipping notification.');
      return;
    }

    const payload = JSON.stringify({
      title,
      body,
      url,
    });

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          payload
        );
      } catch (err) {
        console.error('Error sending push notification to a subscriber:', err);
        // Optionally handle removing expired subscriptions (err.statusCode === 410)
      }
    }
  } catch (err) {
    console.error('Failed to send push notifications:', err);
  }
};

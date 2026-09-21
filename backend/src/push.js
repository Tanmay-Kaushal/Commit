const webpush = require('web-push');
const db = require('./db');

function pushConfigured() {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

if (pushConfigured()) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// Sends a push to every subscribed device. sw.js decides whether to
// actually show it (stays silent if a tab is already visible).
async function sendPushToUser(userId, payload) {
  if (!pushConfigured()) return;

  const subscriptions = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId);
  if (subscriptions.length === 0) return;

  const body = JSON.stringify(payload);
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body
        );
      } catch (err) {
        // 404/410 = subscription gone for good; stop sending to it.
        if (err.statusCode === 404 || err.statusCode === 410) {
          db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
        } else {
          console.error(`[push] send failed for subscription ${sub.id}:`, err.message);
        }
      }
    })
  );
}

// Fires the socket event (in-page popup) and a push (background) together.
function notifyUser(io, userId, socketEvent, socketPayload, pushPayload) {
  if (io) io.to(`user:${userId}`).emit(socketEvent, socketPayload);
  sendPushToUser(userId, pushPayload).catch((err) => console.error('[push] notifyUser failed:', err.message));
}

module.exports = { pushConfigured, sendPushToUser, notifyUser };

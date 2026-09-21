const webpush = require('web-push');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { persistentDir } = require('./persistentDir');

// Uses VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY if set; otherwise generates a
// pair and persists it to the volume (if attached) so push subscriptions
// survive restarts. No volume and no env vars = push just stays disabled
// (unlike DB_PATH/JWT_SECRET, this isn't fatal — push is optional).
function resolveVapidKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }

  const keyPath = path.join(persistentDir(), '.vapid-keys.json');
  if (fs.existsSync(keyPath)) return JSON.parse(fs.readFileSync(keyPath, 'utf8'));

  if (!process.env.RAILWAY_VOLUME_MOUNT_PATH && process.env.NODE_ENV === 'production') return null;

  const keys = webpush.generateVAPIDKeys();
  fs.writeFileSync(keyPath, JSON.stringify(keys), { mode: 0o600 });
  console.log('[push] generated and persisted new VAPID keys');
  return keys;
}

const vapidKeys = resolveVapidKeys();

function pushConfigured() {
  return !!vapidKeys;
}

if (vapidKeys) {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', vapidKeys.publicKey, vapidKeys.privateKey);
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

module.exports = { pushConfigured, sendPushToUser, notifyUser, vapidPublicKey: () => vapidKeys?.publicKey || null };

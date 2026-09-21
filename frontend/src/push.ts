import client from './api/client';

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

export function registerServiceWorker() {
  if (!isPushSupported()) return;
  navigator.serviceWorker.register('/sw.js').catch((err) => console.error('[push] service worker registration failed:', err));
}

function urlBase64ToUint8Array(base64url: string) {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function getExistingSubscription() {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function enableNotifications() {
  if (!isPushSupported()) throw new Error('Push notifications are not supported in this browser');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted');

  const { data } = await client.get('/push/vapid-public-key');
  if (!data.key) throw new Error('Push notifications are not configured on this server');

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(data.key),
  });

  await client.post('/push/subscribe', subscription.toJSON());
  return subscription;
}

export async function disableNotifications() {
  const subscription = await getExistingSubscription();
  if (!subscription) return;
  await client.post('/push/unsubscribe', { endpoint: subscription.endpoint }).catch(() => {});
  await subscription.unsubscribe();
}

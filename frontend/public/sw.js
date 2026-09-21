// Shows a push notification only when no tab is currently visible.

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const anyVisible = clientsList.some((client) => client.visibilityState === 'visible');
      if (anyVisible) return; // the in-page popup already has this covered

      await self.registration.showNotification(payload.title || 'Commit', {
        body: payload.body || '',
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        data: { url: payload.url || '/dashboard' },
      });
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = clientsList.find((c) => 'focus' in c);
      if (existing) {
        existing.navigate(url);
        return existing.focus();
      }
      return self.clients.openWindow(url);
    })()
  );
});

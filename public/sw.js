self.addEventListener('push', (event) => {
  let payload = {
    title: 'KheloFit',
    body: 'You have a new update',
    url: '/app',
    tag: 'khelofit-update',
    data: {}
  };

  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch (_) {}

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: payload.tag,
      data: { url: payload.url || '/app', ...(payload.data || {}) }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/app';

  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const sameApp = allClients.find((client) => client.url.includes('/app'));

    if (sameApp) {
      await sameApp.focus();
      sameApp.postMessage({ type: 'PUSH_CLICK', url: targetUrl });
      return;
    }

    await clients.openWindow(targetUrl);
  })());
});

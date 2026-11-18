// Service Worker STEELEX Cantieri — gestisce push notifications

self.addEventListener('push', function(event) {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch(e) {
    data = { title: 'STEELEX Cantieri', body: event.data.text() };
  }

  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' },
    vibrate: [200, 100, 200],
    requireInteraction: false,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'STEELEX Cantieri', options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Il browser ha rinnovato/invalidato la subscription: ne crea una nuova con la stessa
// chiave; il backend la riceve alla prossima apertura dell'app (risincronizzaPush).
self.addEventListener('pushsubscriptionchange', function(event) {
  const opzioni = event.oldSubscription && event.oldSubscription.options;
  if (!opzioni || !opzioni.applicationServerKey) return;
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: opzioni.applicationServerKey,
    }).catch(function() {})
  );
});

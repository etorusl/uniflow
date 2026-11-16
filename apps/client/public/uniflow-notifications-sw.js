const personalPath = /^\/tasks\?taskId=[a-f0-9-]{36}$/i;
const groupPath = /^\/groups\?groupId=[a-f0-9-]{36}&taskId=[a-f0-9-]{36}$/i;

function validPath(path) {
  return typeof path === 'string' && (personalPath.test(path) || groupPath.test(path));
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data;
  try {
    data = event.data?.json();
  } catch {
    return;
  }
  if (!validPath(data?.path)) return;
  event.waitUntil(
    self.registration.showNotification('Дедлайн · UniFlow', {
      body: 'Скоро дедлайн. Откройте UniFlow, чтобы посмотреть задание.',
      tag: typeof data.tag === 'string' ? data.tag : 'uniflow-deadline',
      data: { path: data.path },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = event.notification.data?.path;
  if (!validPath(path)) return;
  event.waitUntil(
    (async () => {
      const url = new URL(path, self.location.origin);
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const opened = clients.find((client) => client.url === url.href);
      if (opened) await opened.focus();
      else await self.clients.openWindow(url.href);
    })(),
  );
});

// Service Worker for OpenMD push notifications
// Place this file at /public/sw.js — Next.js serves it from the root.

self.addEventListener('push', (event) => {
  if (!event.data) return

  let data
  try {
    data = event.data.json()
  } catch {
    data = { title: 'OpenMD', body: event.data.text(), url: '/notifications', icon: '/icon-192.png' }
  }

  const options = {
    body: data.body ?? '',
    icon: data.icon ?? '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url ?? '/notifications' },
    requireInteraction: false,
  }

  event.waitUntil(self.registration.showNotification(data.title ?? 'OpenMD', options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/notifications'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url)
      }
    })
  )
})

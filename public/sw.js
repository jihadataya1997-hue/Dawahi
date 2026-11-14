// Service Worker لضواحي: يفتح التطبيق بدون نت + يستقبل التنبيهات والتطبيق مسكّر
const CACHE = 'zapp-v5'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/index.html', '/manifest.webmanifest', '/icon-192.png'])))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))))
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  // طلبات السيرفر ما تنخزّن أبداً
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/')) return
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {})
        return res
      })
      .catch(() =>
        caches.match(e.request).then(
          (r) => r || caches.match(url.pathname.startsWith('/driver') ? '/driver.html' : url.pathname.startsWith('/admin') ? '/admin.html' : '/index.html')
        )
      )
  )
})

// ───── التنبيهات ─────
self.addEventListener('push', (e) => {
  let data = {}
  try {
    data = e.data ? e.data.json() : {}
  } catch {
    data = { title: 'ZAPP', body: e.data ? e.data.text() : '' }
  }
  const url = data.url || '/'
  const isDriver = url.startsWith('/driver')
  e.waitUntil(
    self.registration.showNotification(data.title || 'ZAPP', {
      body: data.body || '',
      icon: isDriver ? '/driver-192.png' : '/icon-192.png',
      badge: '/badge-96.png',
      tag: data.tag || undefined,
      renotify: true,
      requireInteraction: isDriver || url.startsWith('/admin'), // يبقى ظاهر لحتى ينضغط
      vibrate: [300, 100, 300, 100, 300],
      dir: 'rtl',
      lang: 'ar',
      data: { url },
    })
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = e.notification.data?.url || '/'
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const same = list.find((c) => new URL(c.url).pathname.startsWith(url === '/' ? '/' : url) && 'focus' in c)
      if (same) {
        same.postMessage({ type: 'refresh' })
        return same.focus()
      }
      return self.clients.openWindow(url)
    })
  )
})

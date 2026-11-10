// Service worker: ทำให้แอปเปิดได้แม้ออฟไลน์ และรองรับการกดแจ้งเตือน
const CACHE_NAME = 'my-cards-v30';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // ไม่ยุ่งกับ Apps Script / Google Fonts
  // network-first: ได้เวอร์ชันล่าสุดเมื่อออนไลน์ ใช้ cache เมื่อออฟไลน์
  // cache: 'no-cache' = ถามเซิร์ฟเวอร์ทุกครั้ง (ไม่ใช้ HTTP cache ของเบราว์เซอร์ที่ค้างได้ ~10 นาที)
  e.respondWith(
    fetch(new Request(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }))
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus();
      if (clients.openWindow) return clients.openWindow('./index.html');
    })
  );
});

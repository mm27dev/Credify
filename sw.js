// Credify service worker — no-op placeholder so the registration call in
// app.js (navigator.serviceWorker.register('./sw.js')) resolves instead of
// 404ing. Add offline caching here later if you want PWA install support.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

// ==========================================
// Service Worker - PWA 離線支援
// ==========================================

const CACHE_NAME = 'ptat-inventory-v3';
const BASE_PATH = '/ptatinventory';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/config.js',
  '/camera.js',
  '/signature.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
].map(path => `${BASE_PATH}${path}`);

// 安裝 Service Worker
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('快取已開啟');
        return cache.addAll(urlsToCache);
      })
  );
});

// 快取策略：網路優先，失敗則使用快取
self.addEventListener('fetch', function(event) {
  event.respondWith(
    fetch(event.request)
      .then(function(response) {
        // 如果請求成功，複製回應並存入快取
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then(function(cache) {
              cache.put(event.request, responseToCache);
            });
        }
        return response;
      })
      .catch(function() {
        // 網路請求失敗，嘗試從快取取得
        return caches.match(event.request);
      })
  );
});

// 更新 Service Worker
self.addEventListener('activate', function(event) {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

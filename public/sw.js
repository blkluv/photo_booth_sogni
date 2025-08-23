// Service Worker for Sogni AI Photobooth PWA
const CACHE_VERSION = '1.0.16';
const CACHE_NAME = `sogni-photobooth-v${CACHE_VERSION}`;
const STATIC_CACHE_NAME = `sogni-photobooth-static-v${CACHE_VERSION}`;

// Assets to cache for offline functionality
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/icons/icon-72x72.png',
  '/icons/icon-96x96.png',
  '/icons/icon-128x128.png',
  '/icons/icon-144x144.png',
  '/icons/icon-152x152.png',
  '/icons/icon-192x192.png',
  '/icons/icon-384x384.png',
  '/icons/icon-512x512.png',
  '/polaroid-camera.png',
  '/slothicorn-camera.png'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      console.log('Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  // Don't immediately take control to prevent reload loops
  // Let the page decide when to activate the new service worker
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== STATIC_CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache when possible
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip API requests - let them go to network
  if (event.request.url.includes('/api/') || 
      event.request.url.includes('/sogni/') || 
      event.request.url.includes('/health')) {
    return;
  }

  // NEVER cache JavaScript files to prevent update issues
  if (event.request.url.includes('.js') || event.request.url.includes('assets/index-')) {
    console.log('Bypassing cache for JS file:', event.request.url);
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      // If not in cache, fetch from network
      return fetch(event.request).then((response) => {
        // Don't cache non-successful responses
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // Cache the response for future use
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return response;
      }).catch(() => {
        // If both cache and network fail, return offline page for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

// Handle background sync for photo uploads when back online
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    console.log('Background sync triggered');
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  // This could be used for queuing photo uploads when offline
  console.log('Performing background sync...');
}

// Handle push notifications (for future use)
self.addEventListener('push', (event) => {
  console.log('Push notification received');
  // Handle push notifications here if needed in the future
});

console.log('Sogni Photobooth Service Worker loaded');

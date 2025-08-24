// Service Worker for Sogni AI Photobooth PWA - NO CACHING VERSION
const CACHE_VERSION = '1.0.18';

// Install event - immediately activate without caching
self.addEventListener('install', (event) => {
  console.log('Service Worker installing (NO CACHE MODE)...');
  // Skip waiting and activate immediately
  self.skipWaiting();
});

// Activate event - clear ALL existing caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating (CLEARING ALL CACHES)...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      console.log('Deleting ALL caches:', cacheNames);
      return Promise.all(
        cacheNames.map((cacheName) => {
          console.log('Deleting cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    })
  );
  
  // Take control immediately
  self.clients.claim();
});

// Fetch event - NEVER cache, always fetch fresh from network
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip API requests - let them go to network normally
  if (event.request.url.includes('/api/') || 
      event.request.url.includes('/sogni/') || 
      event.request.url.includes('/health')) {
    return;
  }

  // ALWAYS fetch fresh from network with cache-busting headers
  event.respondWith(
    fetch(event.request, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    }).catch(() => {
      // If network fails for navigation requests, return a simple offline message
      if (event.request.mode === 'navigate') {
        return new Response('Offline - Please check your internet connection', {
          status: 503,
          statusText: 'Service Unavailable'
        });
      }
      // For other requests, let them fail naturally
      throw new Error('Network unavailable');
    })
  );
});

// Handle background sync for photo uploads when back online
self.addEventListener('sync', (event) => {
  console.log('Background sync event:', event.tag);
  // Background sync functionality can be added here if needed
});
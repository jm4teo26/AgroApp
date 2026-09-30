/* ========================================
   AgroApp — Service Worker
   Permite funcionar sin internet (offline)
   ======================================== */

const CACHE_NAME = 'agroapp-v1';
const ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/css/variables.css',
    '/css/base.css',
    '/css/components.css',
    '/css/layout.css',
    '/css/dashboard.css',
    '/css/parcelas.css',
    '/css/clima.css',
    '/css/calendario.css',
    '/css/bitacora.css',
    '/css/sugerencias.css',
    '/css/modals.css',
    '/js/data.js',
    '/js/utils.js',
    '/js/weather.js',
    '/js/suggestions.js',
    '/js/maps.js',
    '/js/parcelas.js',
    '/js/calendario.js',
    '/js/bitacora.js',
    '/js/dashboard.js',
    '/js/app.js',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

// Instalar: cachear todos los archivos
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Activar: limpiar caches viejos
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

// Fetch: servir desde cache primero, luego red
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Para la API de clima y mapas: network first (si hay internet usa datos frescos)
    if (url.hostname === 'api.open-meteo.com' ||
        url.hostname.includes('basemaps.cartocdn.com') ||
        url.hostname === 'unpkg.com' ||
        url.hostname === 'fonts.googleapis.com' ||
        url.hostname === 'fonts.gstatic.com') {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // Para archivos locales: cache first
    event.respondWith(
        caches.match(event.request)
            .then(cached => cached || fetch(event.request))
    );
});

/* ========================================
   AgroApp — Service Worker
   Permite funcionar sin internet (offline)
   Compatible con GitHub Pages (subdirectorio)
   ======================================== */

const CACHE_NAME = 'agroapp-v7-weather';

// Detectar la base path automáticamente
const BASE_PATH = self.registration.scope;

// Instalar: cachear página principal
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                return cache.addAll([
                    BASE_PATH,
                    BASE_PATH + 'index.html'
                ]);
            })
            .then(() => self.skipWaiting())
    );
});

// Activar: limpiar absolutamente todos los caches anteriores
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

// Fetch: network first para todo, con fallback a cache
self.addEventListener('fetch', (event) => {
    const url = event.request.url;

    // Descartar peticiones obsoletas de Carto
    if (url.includes('cartocdn.com') || url.includes('carto.com')) {
        event.respondWith(new Response('', { status: 404 }));
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Guardar copia en cache sólo para archivos locales (no para tiles externos)
                if (response.ok && !url.includes('google.com/vt') && !url.includes('arcgisonline.com')) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, clone);
                    });
                }
                return response;
            })
            .catch(() => {
                // Sin internet: servir desde cache
                return caches.match(event.request).then(cached => {
                    if (cached) return cached;
                    if (event.request.mode === 'navigate') {
                        return caches.match(BASE_PATH + 'index.html');
                    }
                    return new Response('Offline', { status: 503 });
                });
            })
    );
});

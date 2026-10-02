/* ========================================
   AgroApp — Service Worker
   Permite funcionar sin internet (offline)
   Compatible con GitHub Pages (subdirectorio)
   ======================================== */

const CACHE_NAME = 'agroapp-v4';

// Detectar la base path automáticamente
const BASE_PATH = self.registration.scope;

// Instalar: cachear página principal
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                // Cachear la página principal usando ruta relativa
                return cache.addAll([
                    BASE_PATH,
                    BASE_PATH + 'index.html'
                ]);
            })
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

// Fetch: network first para todo, con fallback a cache
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Guardar copia en cache
                if (response.ok) {
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
                    // Si es una navegación, devolver la página principal
                    if (event.request.mode === 'navigate') {
                        return caches.match(BASE_PATH + 'index.html');
                    }
                    return new Response('Offline', { status: 503 });
                });
            })
    );
});

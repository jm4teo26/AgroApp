/* ========================================
   AgroApp — Service Worker
   Permite funcionar sin internet (offline)
   Compatible con GitHub Pages (subdirectorio)
   ======================================== */

const CACHE_NAME = 'agroapp-v12-sat';

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

// Fetch: solo interceptar recursos locales de la app
self.addEventListener('fetch', (event) => {
    const url = event.request.url;

    // Descartar peticiones obsoletas de Carto
    if (url.includes('cartocdn.com') || url.includes('carto.com')) {
        event.respondWith(new Response('', { status: 404 }));
        return;
    }

    // NUNCA interceptar APIs externas ni mapas (Open-Meteo, Google Tiles, Esri)
    // El navegador se conecta de forma directa y nativa vía Wi-Fi o datos móviles
    if (!url.startsWith(self.location.origin)) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then(response => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, clone);
                    });
                }
                return response;
            })
            .catch(() => {
                // Sin internet: servir recursos locales desde cache
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

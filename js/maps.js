/* ========================================
   AgroApp — Servicio de mapas (Leaflet)
   ======================================== */

const MapService = {
    maps: {},
    markers: {},

    TILE_URL: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    TILE_ATTR: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',

    CORN_ICON: null,

    init() {
        this.CORN_ICON = L.divIcon({
            html: '<div style="font-size:1.5rem;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5))">🌽</div>',
            className: 'corn-marker',
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32]
        });
    },

    createMap(containerId, options = {}) {
        const defaults = {
            center: [23.6345, -102.5528], // Centro de México
            zoom: 5,
            zoomControl: true,
            attributionControl: false
        };

        const config = { ...defaults, ...options };
        const map = L.map(containerId, config);

        L.tileLayer(this.TILE_URL, {
            attribution: this.TILE_ATTR,
            maxZoom: 18
        }).addTo(map);

        this.maps[containerId] = map;
        this.markers[containerId] = [];

        return map;
    },

    updateMarkers(containerId) {
        const map = this.maps[containerId];
        if (!map) return;

        // Limpiar markers existentes
        if (this.markers[containerId]) {
            this.markers[containerId].forEach(m => map.removeLayer(m));
        }
        this.markers[containerId] = [];

        const parcelas = DB.getParcelas();
        if (parcelas.length === 0) return;

        const bounds = [];

        parcelas.forEach(p => {
            const marker = L.marker([p.lat, p.lng], { icon: this.CORN_ICON })
                .addTo(map)
                .bindPopup(`
                    <div style="font-family:Inter,sans-serif;min-width:150px">
                        <strong style="font-size:14px">${p.nombre}</strong><br>
                        <span style="color:#86efac;font-size:12px">${Utils.cultivoName(p.cultivo)}</span><br>
                        <span style="font-size:11px;opacity:0.7">${p.superficie ? p.superficie + ' ha' : ''} ${p.suelo ? '• ' + Utils.sueloName(p.suelo) : ''}</span>
                    </div>
                `);

            this.markers[containerId].push(marker);
            bounds.push([p.lat, p.lng]);
        });

        if (bounds.length > 0) {
            if (bounds.length === 1) {
                map.setView(bounds[0], 13);
            } else {
                map.fitBounds(bounds, { padding: [30, 30] });
            }
        }
    },

    invalidateSize(containerId) {
        const map = this.maps[containerId];
        if (map) {
            setTimeout(() => map.invalidateSize(), 100);
        }
    },

    destroyMap(containerId) {
        const map = this.maps[containerId];
        if (map) {
            map.remove();
            delete this.maps[containerId];
            delete this.markers[containerId];
        }
    }
};

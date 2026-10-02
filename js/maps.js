/* ========================================
   AgroApp — Servicio de mapas (Leaflet)
   Soporte para marcadores, polígonos y capas
   ======================================== */

const MapService = {
    maps: {},
    markers: {},

    // Tile sin API key - CartoDB Dark Matter
    TILE_URL: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    TILE_ATTR: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',

    // Capa satélite sin API key (Esri World Imagery)
    SAT_URL: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    SAT_ATTR: '&copy; Esri &mdash; Maxar, Earthstar Geographics',

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

        const darkLayer = L.tileLayer(this.TILE_URL, {
            attribution: this.TILE_ATTR,
            maxZoom: 19
        }).addTo(map);

        // Capa satelital opcional con control de capas
        const satLayer = L.tileLayer(this.SAT_URL, {
            attribution: this.SAT_ATTR,
            maxZoom: 19
        });

        L.control.layers(
            { '🌙 Oscuro': darkLayer, '🛰️ Satélite': satLayer },
            null,
            { position: 'topright' }
        ).addTo(map);

        this.maps[containerId] = map;
        this.markers[containerId] = [];

        return map;
    },

    updateMarkers(containerId) {
        const map = this.maps[containerId];
        if (!map) return;

        // Limpiar capas existentes
        if (this.markers[containerId]) {
            this.markers[containerId].forEach(m => map.removeLayer(m));
        }
        this.markers[containerId] = [];

        const parcelas = DB.getParcelas();
        if (parcelas.length === 0) return;

        const bounds = [];

        parcelas.forEach(p => {
            const hasPolygon = p.polygon && p.polygon.length >= 3;
            const popupContent = `
                <div style="font-family:Inter,sans-serif;min-width:160px;padding:2px">
                    <strong style="font-size:14px;color:#f8fafc">${p.nombre}</strong><br>
                    <span style="color:#86efac;font-size:12px;font-weight:600">🌽 ${Utils.cultivoName(p.cultivo)}</span><br>
                    <span style="font-size:11px;color:#94a3b8">
                        ${p.superficie ? p.superficie + ' ha' : ''} ${p.suelo ? '• ' + Utils.sueloName(p.suelo) : ''}
                    </span>
                    ${hasPolygon ? `
                        <div style="margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.1)">
                            <button onclick="ExportService.downloadCroquis(DB.getParcelaById('${p.id}'))" 
                                style="background:#22c55e;color:#052e16;border:none;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;width:100%">
                                📄 Descargar Croquis
                            </button>
                        </div>
                    ` : ''}
                </div>
            `;

            // Si tiene polígono, dibujarlo
            if (hasPolygon) {
                const latlngs = p.polygon.map(pt => [pt.lat, pt.lng]);
                const polyLayer = L.polygon(latlngs, {
                    color: '#22c55e',
                    fillColor: '#22c55e',
                    fillOpacity: 0.25,
                    weight: 2
                }).addTo(map).bindPopup(popupContent);

                this.markers[containerId].push(polyLayer);
                p.polygon.forEach(pt => bounds.push([pt.lat, pt.lng]));
            }

            // Marcador con ícono en el centro/posición
            if (!isNaN(p.lat) && !isNaN(p.lng)) {
                const marker = L.marker([p.lat, p.lng], { icon: this.CORN_ICON })
                    .addTo(map)
                    .bindPopup(popupContent);

                this.markers[containerId].push(marker);
                bounds.push([p.lat, p.lng]);
            }
        });

        if (bounds.length > 0) {
            if (bounds.length === 1) {
                map.setView(bounds[0], 14);
            } else {
                map.fitBounds(bounds, { padding: [40, 40] });
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

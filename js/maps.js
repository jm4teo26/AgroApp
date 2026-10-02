/* ========================================
   AgroApp — Servicio de mapas (Leaflet)
   Capa Satelital Exclusiva de Alta Definición
   ======================================== */

const MapService = {
    maps: {},
    markers: {},

    // Capa satélite sin API key (Esri World Imagery) - Cobertura global de alta definición
    SAT_URL: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    SAT_ATTR: '&copy; Esri, Maxar, Earthstar Geographics',

    // Capa de carreteras, nombres y límites superpuesta al satélite
    LABELS_URL: 'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',

    CORN_ICON: null,

    init() {
        this.CORN_ICON = L.divIcon({
            html: '<div style="font-size:1.6rem;filter:drop-shadow(0 2px 5px rgba(0,0,0,0.7))">🌽</div>',
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

        // 1. Capa Satélite directa (base exclusiva)
        L.tileLayer(this.SAT_URL, {
            attribution: this.SAT_ATTR,
            maxZoom: 19
        }).addTo(map);

        // 2. Capa de linderos, carreteras y poblados superpuesta
        L.tileLayer(this.LABELS_URL, {
            maxZoom: 19,
            opacity: 0.85
        }).addTo(map);

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
                <div style="font-family:Inter,sans-serif;min-width:160px;padding:4px">
                    <strong style="font-size:14px;color:#0f172a">${p.nombre}</strong><br>
                    <span style="color:#16a34a;font-size:12px;font-weight:700">🌽 ${Utils.cultivoName(p.cultivo)}</span><br>
                    <span style="font-size:11px;color:#475569">
                        ${p.superficie ? p.superficie + ' ha' : ''} ${p.suelo ? '• ' + Utils.sueloName(p.suelo) : ''}
                    </span>
                    ${hasPolygon ? `
                        <div style="margin-top:8px;padding-top:6px;border-top:1px solid rgba(0,0,0,0.1)">
                            <button onclick="ExportService.downloadCroquis(DB.getParcelaById('${p.id}'))" 
                                style="background:#16a34a;color:#ffffff;border:none;border-radius:6px;padding:5px 8px;font-size:11px;font-weight:700;cursor:pointer;width:100%;box-shadow:0 1px 3px rgba(0,0,0,0.2)">
                                📄 Descargar Croquis
                            </button>
                        </div>
                    ` : ''}
                </div>
            `;

            // Si tiene polígono, dibujarlo en el mapa satelital
            if (hasPolygon) {
                const latlngs = p.polygon.map(pt => [pt.lat, pt.lng]);
                const polyLayer = L.polygon(latlngs, {
                    color: '#22c55e',
                    fillColor: '#22c55e',
                    fillOpacity: 0.35,
                    weight: 3
                }).addTo(map).bindPopup(popupContent);

                this.markers[containerId].push(polyLayer);
                p.polygon.forEach(pt => bounds.push([pt.lat, pt.lng]));
            }

            // Marcador con ícono de maíz en el centro/posición
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
                map.setView(bounds[0], 15);
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

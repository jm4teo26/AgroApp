/* ========================================
   AgroApp — Servicio de mapas (Leaflet)
   Capa Satelital Exclusiva de Alta Definición Ultra-Rápida
   ======================================== */

var MapService = window.MapService = {
    maps: {},
    markers: {},

    // Google Satélite Limpio (Satélite natural de alta definición, sin nombres de calles ni carreteras)
    SAT_GOOGLE: 'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',

    CORN_ICON: null,

    init() {
        this.CORN_ICON = L.divIcon({
            html: '<div style="font-size:1.6rem;filter:drop-shadow(0 2px 5px rgba(0,0,0,0.8))">🌽</div>',
            className: 'corn-marker',
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32]
        });
    },

    createMap(containerId, options = {}) {
        const container = document.getElementById(containerId);
        if (!container) return null;

        if (this.maps[containerId]) {
            try { this.maps[containerId].remove(); } catch (e) {}
            delete this.maps[containerId];
        }
        if (container._leaflet_id) {
            container._leaflet_id = null;
        }

        // Calcular centro óptimo según parcelas existentes para evitar saltos y recargas de zoom
        const parcelas = DB.getParcelas();
        let center = [23.6345, -102.5528];
        let zoom = 5;

        if (parcelas.length > 0) {
            for (const p of parcelas) {
                if (!isNaN(p.lat) && !isNaN(p.lng) && p.lat !== 0 && p.lng !== 0) {
                    center = [parseFloat(p.lat), parseFloat(p.lng)];
                    zoom = 15;
                    break;
                }
                if (p.polygon && p.polygon.length >= 3 && typeof ExportService !== 'undefined') {
                    const c = ExportService.centroid(p.polygon);
                    if (c && !isNaN(c.lat) && !isNaN(c.lng)) {
                        center = [c.lat, c.lng];
                        zoom = 15;
                        break;
                    }
                }
            }
        }

        const defaults = {
            center: center,
            zoom: zoom,
            zoomControl: true,
            attributionControl: false,
            preferCanvas: true // Renderizado por GPU ultra veloz
        };

        const config = { ...defaults, ...options };
        const map = L.map(containerId, config);

        // Capa satélite Google Limpia (sin nombres de calles ni carreteras, pura imagen satelital)
        L.tileLayer(this.SAT_GOOGLE, {
            subdomains: ['0', '1', '2', '3'],
            maxZoom: 20,
            maxNativeZoom: 19,
            keepBuffer: 6,
            updateWhenIdle: false,
            updateWhenZooming: true,
            attribution: '&copy; Google Maps'
        }).addTo(map);

        this.maps[containerId] = map;
        this.markers[containerId] = [];

        // Forzar calibración de tamaño inmediata
        requestAnimationFrame(() => map.invalidateSize(true));
        setTimeout(() => map.invalidateSize(true), 200);

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
                <div style="font-family:Inter,sans-serif;min-width:170px;padding:4px">
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
            if (!isNaN(p.lat) && !isNaN(p.lng) && p.lat !== 0 && p.lng !== 0) {
                const marker = L.marker([p.lat, p.lng], { icon: this.CORN_ICON })
                    .addTo(map)
                    .bindPopup(popupContent);

                this.markers[containerId].push(marker);
                bounds.push([p.lat, p.lng]);
            }
        });

        if (bounds.length > 0) {
            if (bounds.length === 1) {
                map.setView(bounds[0], 15, { animate: false });
            } else {
                map.fitBounds(bounds, { padding: [40, 40], animate: false });
            }
        }

        requestAnimationFrame(() => map.invalidateSize(true));
    },

    invalidateSize(containerId) {
        const map = this.maps[containerId];
        if (map) {
            requestAnimationFrame(() => map.invalidateSize(true));
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

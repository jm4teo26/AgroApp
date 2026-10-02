/* ========================================
   AgroApp — Módulo de Parcelas
   Con soporte para polígono y exportación
   ======================================== */

const ParcelasModule = {
    // Estado del polígono en edición
    _pendingPolygon: null,
    _formState: null,
    _polyMap: null,
    _polyPoints: [],
    _polyMarkers: [],
    _polyLine: null,
    _polyFill: null,

    init() {
        // Botones de agregar parcela
        document.getElementById('btnAddParcela').addEventListener('click', () => this.openForm());
        document.getElementById('btnAddParcelaEmpty').addEventListener('click', () => this.openForm());

        // GPS
        document.getElementById('btnGetLocation').addEventListener('click', () => this.getGPS());

        // Form submit
        document.getElementById('formParcela').addEventListener('submit', (e) => this.handleSubmit(e));

        // Dibujo de polígono
        document.getElementById('btnDrawPolygon').addEventListener('click', () => this.openPolygonDrawer());
        document.getElementById('btnPolyUndo').addEventListener('click', () => this._removeLastPolyPoint());
        document.getElementById('btnPolyClear').addEventListener('click', () => this._clearPolyPoints());
        document.getElementById('btnPolySave').addEventListener('click', () => this._savePolygon());
        document.getElementById('btnPolygonClose').addEventListener('click', () => this._closePolygonModal(true));

        // Cerrar modal polígono al tocar fuera
        const polyOverlay = document.getElementById('modalPolygon');
        polyOverlay.addEventListener('click', (e) => {
            if (e.target === polyOverlay) {
                this._closePolygonModal(true);
            }
        });

        this.render();
    },

    // === FORMULARIO DE PARCELA ===

    openForm(parcelaId = null) {
        const form = document.getElementById('formParcela');
        form.reset();
        document.getElementById('parcelaId').value = '';
        this._pendingPolygon = null;

        if (parcelaId) {
            const p = DB.getParcelaById(parcelaId);
            if (p) {
                document.getElementById('modalParcelaTitle').textContent = 'Editar Parcela';
                document.getElementById('parcelaId').value = p.id;
                document.getElementById('parcelaNombre').value = p.nombre || '';
                document.getElementById('parcelaLat').value = p.lat || '';
                document.getElementById('parcelaLng').value = p.lng || '';
                document.getElementById('parcelaSuperficie').value = p.superficie || '';
                document.getElementById('parcelaSuelo').value = p.suelo || '';
                document.getElementById('parcelaCultivo').value = p.cultivo || '';
                document.getElementById('parcelaRiego').value = p.riego || '';
                document.getElementById('parcelaNotas').value = p.notas || '';

                // Cargar polígono existente
                if (p.polygon && p.polygon.length >= 3) {
                    this._pendingPolygon = p.polygon.map(c => ({ ...c }));
                }
            }
        } else {
            document.getElementById('modalParcelaTitle').textContent = 'Nueva Parcela';
        }

        this._updatePolygonStatus();
        Utils.openModal('modalParcela');
    },

    getGPS() {
        if (!navigator.geolocation) {
            Utils.showToast('Tu dispositivo no soporta geolocalización', 'error');
            return;
        }

        Utils.showToast('Obteniendo ubicación...', 'info');

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                document.getElementById('parcelaLat').value = pos.coords.latitude.toFixed(6);
                document.getElementById('parcelaLng').value = pos.coords.longitude.toFixed(6);
                Utils.showToast('Ubicación obtenida correctamente', 'success');
            },
            (err) => {
                Utils.showToast('No se pudo obtener la ubicación: ' + err.message, 'error');
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    },

    handleSubmit(e) {
        e.preventDefault();

        const parcela = {
            nombre: document.getElementById('parcelaNombre').value.trim(),
            lat: parseFloat(document.getElementById('parcelaLat').value),
            lng: parseFloat(document.getElementById('parcelaLng').value),
            superficie: parseFloat(document.getElementById('parcelaSuperficie').value) || null,
            suelo: document.getElementById('parcelaSuelo').value,
            cultivo: document.getElementById('parcelaCultivo').value,
            riego: document.getElementById('parcelaRiego').value,
            notas: document.getElementById('parcelaNotas').value.trim()
        };

        // Si hay polígono, calcular centro y área automáticamente
        if (this._pendingPolygon && this._pendingPolygon.length >= 3) {
            parcela.polygon = this._pendingPolygon;
            const center = ExportService.centroid(parcela.polygon);
            parcela.lat = center.lat;
            parcela.lng = center.lng;
            parcela.superficie = parseFloat((ExportService.polygonAreaM2(parcela.polygon) / 10000).toFixed(4));
        }

        const existingId = document.getElementById('parcelaId').value;
        if (existingId) {
            parcela.id = existingId;
            // Conservar polígono existente si no se redibujó
            if (!parcela.polygon) {
                const existing = DB.getParcelaById(existingId);
                if (existing && existing.polygon) {
                    parcela.polygon = existing.polygon;
                }
            }
        }

        // Validación
        if (!parcela.nombre) {
            Utils.showToast('Ingresa el nombre de la parcela', 'error');
            return;
        }

        if (!parcela.polygon && (isNaN(parcela.lat) || isNaN(parcela.lng))) {
            Utils.showToast('Ingresa coordenadas o dibuja el perímetro', 'error');
            return;
        }

        DB.saveParcela(parcela);
        Utils.closeModal('modalParcela');
        Utils.showToast(existingId ? 'Parcela actualizada' : 'Parcela guardada', 'success');

        this._pendingPolygon = null;
        this.render();
        Utils.updateParcelaSelects();
        MapService.updateMarkers('parcelasMap');
        MapService.updateMarkers('dashboardMap');
        DashboardModule.refresh();
    },

    deleteParcela(id) {
        const parcela = DB.getParcelaById(id);
        document.getElementById('confirmMsg').textContent = '¿Eliminar la parcela "' + (parcela ? parcela.nombre : '') + '"? Se borrarán también sus actividades y notas.';
        Utils.openModal('modalConfirm');

        document.getElementById('btnConfirmOk').onclick = () => {
            DB.deleteParcela(id);
            Utils.closeModal('modalConfirm');
            Utils.showToast('Parcela eliminada', 'success');
            this.render();
            Utils.updateParcelaSelects();
            MapService.updateMarkers('parcelasMap');
            MapService.updateMarkers('dashboardMap');
            DashboardModule.refresh();
        };
    },

    render() {
        const parcelas = DB.getParcelas();
        const list = document.getElementById('parcelasList');
        const empty = document.getElementById('emptyParcelas');

        if (parcelas.length === 0) {
            list.innerHTML = '';
            empty.style.display = '';
            return;
        }

        empty.style.display = 'none';
        list.innerHTML = parcelas.map((p, i) => {
            const hasPolygon = p.polygon && p.polygon.length >= 3;
            const polygonInfo = hasPolygon
                ? '<div class="parcela-polygon-info">\uD83D\uDCD0 ' + p.polygon.length + ' vértices \u2022 Perímetro trazado</div>'
                : '';
            const exportBtn = hasPolygon
                ? '<button class="parcela-action-btn export" onclick="ExportService.downloadCroquis(DB.getParcelaById(\'' + p.id + '\'))" aria-label="Croquis" title="Descargar croquis">\uD83D\uDCC4</button>'
                : '';

            return '<div class="parcela-card" style="animation-delay:' + (i * 0.05) + 's">' +
                '<div class="parcela-card-header">' +
                    '<div>' +
                        '<div class="parcela-card-name">' + p.nombre + '</div>' +
                        '<div class="parcela-card-cultivo">\uD83C\uDF3D ' + Utils.cultivoName(p.cultivo) + '</div>' +
                    '</div>' +
                    '<div class="parcela-card-actions">' +
                        exportBtn +
                        '<button class="parcela-action-btn" onclick="ParcelasModule.openForm(\'' + p.id + '\')" aria-label="Editar">' +
                            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>' +
                        '</button>' +
                        '<button class="parcela-action-btn delete" onclick="ParcelasModule.deleteParcela(\'' + p.id + '\')" aria-label="Eliminar">' +
                            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>' +
                        '</button>' +
                    '</div>' +
                '</div>' +
                '<div class="parcela-card-details">' +
                    '<div class="parcela-detail">' +
                        '<span class="parcela-detail-icon">\uD83D\uDCCD</span>' +
                        '<span class="parcela-detail-text"><strong>' + p.lat.toFixed(4) + ', ' + p.lng.toFixed(4) + '</strong></span>' +
                    '</div>' +
                    '<div class="parcela-detail">' +
                        '<span class="parcela-detail-icon">\uD83D\uDCD0</span>' +
                        '<span class="parcela-detail-text"><strong>' + (p.superficie ? p.superficie + ' ha' : '\u2014') + '</strong></span>' +
                    '</div>' +
                    '<div class="parcela-detail">' +
                        '<span class="parcela-detail-icon">\uD83C\uDF0D</span>' +
                        '<span class="parcela-detail-text"><strong>' + Utils.sueloName(p.suelo) + '</strong></span>' +
                    '</div>' +
                    '<div class="parcela-detail">' +
                        '<span class="parcela-detail-icon">\uD83D\uDCA7</span>' +
                        '<span class="parcela-detail-text"><strong>' + Utils.riegoName(p.riego) + '</strong></span>' +
                    '</div>' +
                '</div>' +
                polygonInfo +
            '</div>';
        }).join('');
    },

    // === DIBUJO DE POLÍGONO ===

    openPolygonDrawer() {
        this._saveFormState();
        Utils.closeModal('modalParcela');
        Utils.openModal('modalPolygon');

        setTimeout(() => this._initPolyMap(), 300);
    },

    _saveFormState() {
        this._formState = {
            id: document.getElementById('parcelaId').value,
            nombre: document.getElementById('parcelaNombre').value,
            lat: document.getElementById('parcelaLat').value,
            lng: document.getElementById('parcelaLng').value,
            superficie: document.getElementById('parcelaSuperficie').value,
            suelo: document.getElementById('parcelaSuelo').value,
            cultivo: document.getElementById('parcelaCultivo').value,
            riego: document.getElementById('parcelaRiego').value,
            notas: document.getElementById('parcelaNotas').value
        };
    },

    _restoreFormState() {
        if (!this._formState) return;
        const s = this._formState;
        document.getElementById('parcelaId').value = s.id;
        document.getElementById('parcelaNombre').value = s.nombre;
        document.getElementById('parcelaLat').value = s.lat;
        document.getElementById('parcelaLng').value = s.lng;
        document.getElementById('parcelaSuperficie').value = s.superficie;
        document.getElementById('parcelaSuelo').value = s.suelo;
        document.getElementById('parcelaCultivo').value = s.cultivo;
        document.getElementById('parcelaRiego').value = s.riego;
        document.getElementById('parcelaNotas').value = s.notas;
        if (s.id) {
            document.getElementById('modalParcelaTitle').textContent = 'Editar Parcela';
        }
    },

    _initPolyMap() {
        if (this._polyMap) {
            this._polyMap.remove();
            this._polyMap = null;
        }

        // Centro del mapa
        let center = [23.6345, -102.5528];
        let zoom = 5;
        const lat = parseFloat(this._formState ? this._formState.lat : '');
        const lng = parseFloat(this._formState ? this._formState.lng : '');
        if (!isNaN(lat) && !isNaN(lng) && (lat !== 0 || lng !== 0)) {
            center = [lat, lng];
            zoom = 17;
        }

        this._polyMap = L.map('polygonDrawMap', { center: center, zoom: zoom, zoomControl: true });

        // Capas: Satélite + Mapa
        const osmLayer = L.tileLayer(MapService.TILE_URL, {
            maxZoom: 20, attribution: '\u00A9 OSM'
        });
        const satLayer = L.tileLayer(
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            { maxZoom: 19, attribution: '\u00A9 Esri' }
        );
        satLayer.addTo(this._polyMap);
        L.control.layers({ '\uD83D\uDDFA\uFE0F Mapa': osmLayer, '\uD83D\uDEF0\uFE0F Satélite': satLayer }).addTo(this._polyMap);

        // Botón GPS en el mapa
        const self = this;
        const GpsControl = L.Control.extend({
            onAdd: function() {
                const btn = L.DomUtil.create('div', 'leaflet-bar');
                btn.innerHTML = '<a href="#" title="Mi ubicación" style="font-size:18px;line-height:30px;text-align:center;display:block;width:30px;height:30px">\uD83D\uDCCD</a>';
                L.DomEvent.on(btn, 'click', function(e) {
                    L.DomEvent.preventDefault(e);
                    L.DomEvent.stopPropagation(e);
                    if (navigator.geolocation) {
                        navigator.geolocation.getCurrentPosition(
                            function(pos) { self._polyMap.setView([pos.coords.latitude, pos.coords.longitude], 17); },
                            function() { Utils.showToast('No se pudo obtener ubicación', 'error'); },
                            { enableHighAccuracy: true }
                        );
                    }
                });
                return btn;
            }
        });
        new GpsControl({ position: 'topleft' }).addTo(this._polyMap);

        // Reset estado
        this._polyPoints = [];
        this._polyMarkers = [];
        this._polyLine = null;
        this._polyFill = null;

        // Cargar polígono existente
        if (this._pendingPolygon && this._pendingPolygon.length > 0) {
            this._pendingPolygon.forEach(function(p) {
                self._addPolyPoint(L.latLng(p.lat, p.lng));
            });
            if (this._pendingPolygon.length > 1) {
                this._polyMap.fitBounds(
                    this._pendingPolygon.map(function(p) { return [p.lat, p.lng]; }),
                    { padding: [60, 60] }
                );
            }
        }

        // Click para agregar punto
        this._polyMap.on('click', function(e) { self._addPolyPoint(e.latlng); });

        this._updatePolyInfo();
        this._updatePolyButtons();
    },

    _addPolyPoint(latlng) {
        const idx = this._polyPoints.length;
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const letter = letters[idx] || '' + (idx + 1);
        const self = this;

        this._polyPoints.push(latlng);

        const marker = L.marker(latlng, {
            icon: L.divIcon({
                html: '<div class="poly-corner-marker">' + letter + '</div>',
                className: 'poly-corner-icon',
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            }),
            draggable: true
        }).addTo(this._polyMap);

        marker.on('drag', function() {
            self._polyPoints[idx] = marker.getLatLng();
            self._updatePolyDisplay();
            self._updatePolyInfo();
        });

        this._polyMarkers.push(marker);
        this._updatePolyDisplay();
        this._updatePolyInfo();
        this._updatePolyButtons();
    },

    _removeLastPolyPoint() {
        if (this._polyPoints.length === 0) return;
        this._polyPoints.pop();
        const marker = this._polyMarkers.pop();
        if (marker) this._polyMap.removeLayer(marker);
        this._updatePolyDisplay();
        this._updatePolyInfo();
        this._updatePolyButtons();
    },

    _clearPolyPoints() {
        var self = this;
        this._polyPoints = [];
        this._polyMarkers.forEach(function(m) { self._polyMap.removeLayer(m); });
        this._polyMarkers = [];
        this._updatePolyDisplay();
        this._updatePolyInfo();
        this._updatePolyButtons();
    },

    _updatePolyDisplay() {
        if (this._polyLine) { this._polyMap.removeLayer(this._polyLine); this._polyLine = null; }
        if (this._polyFill) { this._polyMap.removeLayer(this._polyFill); this._polyFill = null; }

        if (this._polyPoints.length < 2) return;

        var latlngs = this._polyPoints.map(function(p) { return [p.lat, p.lng]; });

        if (this._polyPoints.length >= 3) {
            this._polyFill = L.polygon(latlngs, {
                color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.2, weight: 2
            }).addTo(this._polyMap);
        } else {
            this._polyLine = L.polyline(latlngs, {
                color: '#22c55e', weight: 2, dashArray: '6, 6'
            }).addTo(this._polyMap);
        }
    },

    _updatePolyInfo() {
        var n = this._polyPoints.length;
        document.getElementById('polyPointCount').textContent = n;

        if (n >= 3) {
            var coords = this._polyPoints.map(function(p) { return { lat: p.lat, lng: p.lng }; });
            var area = ExportService.polygonAreaM2(coords) / 10000;
            var perim = ExportService.polygonPerimeter(coords);
            document.getElementById('polyArea').textContent = area.toFixed(4) + ' ha';
            document.getElementById('polyPerimeter').textContent = ExportService.formatDist(perim);
        } else {
            document.getElementById('polyArea').textContent = '\u2014';
            document.getElementById('polyPerimeter').textContent = '\u2014';
        }
    },

    _updatePolyButtons() {
        var n = this._polyPoints.length;
        document.getElementById('btnPolyUndo').disabled = n === 0;
        document.getElementById('btnPolyClear').disabled = n === 0;
        document.getElementById('btnPolySave').disabled = n < 3;
    },

    _savePolygon() {
        if (this._polyPoints.length < 3) return;

        this._pendingPolygon = this._polyPoints.map(function(p) { return { lat: p.lat, lng: p.lng }; });

        // Auto-rellenar centro y área
        var center = ExportService.centroid(this._pendingPolygon);
        var areaHa = ExportService.polygonAreaM2(this._pendingPolygon) / 10000;

        if (this._formState) {
            this._formState.lat = center.lat.toFixed(6);
            this._formState.lng = center.lng.toFixed(6);
            this._formState.superficie = areaHa.toFixed(4);
        }

        this._closePolygonModal(true);
        Utils.showToast('Perímetro guardado (' + this._polyPoints.length + ' puntos, ' + areaHa.toFixed(4) + ' ha)', 'success');
    },

    _closePolygonModal(reopenForm) {
        Utils.closeModal('modalPolygon');

        if (this._polyMap) {
            this._polyMap.remove();
            this._polyMap = null;
        }
        this._polyPoints = [];
        this._polyMarkers = [];
        this._polyLine = null;
        this._polyFill = null;

        if (reopenForm) {
            Utils.openModal('modalParcela');
            this._restoreFormState();
            this._updatePolygonStatus();
        }
    },

    _updatePolygonStatus() {
        var el = document.getElementById('polygonStatus');
        if (!el) return;

        if (this._pendingPolygon && this._pendingPolygon.length >= 3) {
            var area = ExportService.polygonAreaM2(this._pendingPolygon) / 10000;
            el.className = 'polygon-status defined';
            el.innerHTML = '\u2705 Perímetro definido \u2014 ' + this._pendingPolygon.length + ' puntos \u2022 ' + area.toFixed(4) + ' ha';
        } else {
            el.className = 'polygon-status undefined';
            el.innerHTML = '\uD83D\uDCD0 Sin perímetro \u2014 toca el botón para dibujar';
        }
    }
};

/* ========================================
   AgroApp — Servicio de Certificados Parcelarios (RAN / PROCEDE)
   Especializado para Sinaloa y México (UTM Zonas 12N y 13N, WGS84 y NAD27)
   ======================================== */

var CertificadoService = window.CertificadoService = {
    _previewMap: null,
    _previewLayer: null,
    _currentPoints: [],

    // Municipios de Sinaloa y su zona UTM correspondiente
    // Zona 12N: Oeste de -108° (Norte y Costa Norte)
    // Zona 13N: Este de -108° (Centro y Sur)
    MUNICIPIOS_SINALOA: [
        { nombre: 'Culiacán', zona: 13 },
        { nombre: 'Navolato', zona: 13 },
        { nombre: 'Ahome (Los Mochis)', zona: 12 },
        { nombre: 'Guasave', zona: 12 },
        { nombre: 'Mazatlán', zona: 13 },
        { nombre: 'El Fuerte', zona: 12 },
        { nombre: 'Angostura', zona: 12 },
        { nombre: 'Salvador Alvarado (Guamúchil)', zona: 12 },
        { nombre: 'Mocorito', zona: 12 },
        { nombre: 'Sinaloa de Leyva', zona: 12 },
        { nombre: 'Choix', zona: 12 },
        { nombre: 'Badiraguato', zona: 13 },
        { nombre: 'Cosalá', zona: 13 },
        { nombre: 'Elota (La Cruz)', zona: 13 },
        { nombre: 'San Ignacio', zona: 13 },
        { nombre: 'Concordia', zona: 13 },
        { nombre: 'Rosario', zona: 13 },
        { nombre: 'Escuinapa', zona: 13 },
        { nombre: 'Eldorado', zona: 13 },
        { nombre: 'Juan José Ríos', zona: 12 },
        { nombre: 'Otro (Fuera de Sinaloa)', zona: 12 }
    ],

    // === Conversor Geodésico UTM a Lat/Lng (WGS84 y NAD27) ===

    utmToLatLon(x, y, zone = 12, datum = 'WGS84') {
        const isNAD27 = datum === 'NAD27';
        // Parámetros del elipsoide
        // Clarke 1866 para NAD27, GRS80/WGS84 para WGS84
        const a = isNAD27 ? 6378206.4 : 6378137.0;
        const f = isNAD27 ? (1 / 294.9786982) : (1 / 298.257223563);
        const k0 = 0.9996;
        const e2 = 2 * f - f * f;
        const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

        const x0 = x - 500000.0;
        const y0 = y;

        const m = y0 / k0;
        const mu = m / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256));

        const phi1Rad = mu + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu)
                           + (21 * Math.pow(e1, 2) / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu)
                           + (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu);

        const n1 = a / Math.sqrt(1 - e2 * Math.sin(phi1Rad) * Math.sin(phi1Rad));
        const t1 = Math.tan(phi1Rad) * Math.tan(phi1Rad);
        const c1 = (e2 / (1 - e2)) * Math.cos(phi1Rad) * Math.cos(phi1Rad);
        const r1 = a * (1 - e2) / Math.pow(1 - e2 * Math.sin(phi1Rad) * Math.sin(phi1Rad), 1.5);
        const d = x0 / (n1 * k0);

        let latRad = phi1Rad - (n1 * Math.tan(phi1Rad) / r1) * (
            d * d / 2 -
            (5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * (e2 / (1 - e2))) * Math.pow(d, 4) / 24 +
            (61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * (e2 / (1 - e2)) - 3 * c1 * c1) * Math.pow(d, 6) / 720
        );

        let lonRad = ((zone * 6 - 183) * Math.PI / 180) + (
            d -
            (1 + 2 * t1 + c1) * Math.pow(d, 3) / 6 +
            (5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * (e2 / (1 - e2)) + 24 * t1 * t1) * Math.pow(d, 5) / 120
        ) / Math.cos(phi1Rad);

        let finalLat = latRad * 180 / Math.PI;
        let finalLng = lonRad * 180 / Math.PI;

        // Si el certificado era NAD27, aplicar la transformación Molodensky oficial de México a WGS84
        if (isNAD27) {
            const shift = this._molodenskyNAD27toWGS84(finalLat, finalLng);
            finalLat = shift.lat;
            finalLng = shift.lng;
        }

        return { lat: finalLat, lng: finalLng };
    },

    _molodenskyNAD27toWGS84(lat, lon) {
        // Parámetros oficiales INEGI / DMA para México (NAD27 -> WGS84)
        const a = 6378206.4;
        const f = 1 / 294.9786982;
        const da = 6378137.0 - a;
        const df = (1 / 298.257223563) - f;
        const dx = -12.0;
        const dy = 130.0;
        const dz = 190.0;

        const phi = lat * Math.PI / 180;
        const lam = lon * Math.PI / 180;

        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);
        const sinLam = Math.sin(lam);
        const cosLam = Math.cos(lam);

        const e2 = 2 * f - f * f;
        const rn = a / Math.sqrt(1 - e2 * sinPhi * sinPhi);
        const rm = a * (1 - e2) / Math.pow(1 - e2 * sinPhi * sinPhi, 1.5);

        const dPhi = (-dx * sinPhi * cosLam - dy * sinPhi * sinLam + dz * cosPhi +
                      (a * df + f * da) * Math.sin(2 * phi)) / rm;
        const dLam = (-dx * sinLam + dy * cosLam) / (rn * cosPhi);

        return {
            lat: lat + (dPhi * 180 / Math.PI),
            lng: lon + (dLam * 180 / Math.PI)
        };
    },

    // Conversión de Has - Áreas - Centiáreas a Hectáreas decimales
    hasAreasToHa(has, areas, centiareas) {
        const h = parseFloat(has) || 0;
        const a = parseFloat(areas) || 0;
        const c = parseFloat(centiareas) || 0;
        return h + (a / 100) + (c / 10000);
    },

    // Parser inteligente de texto: soporta copiar y pegar del PDF/foto del certificado
    parseVerticesText(text, zone = 12, datum = 'WGS84') {
        if (!text || !text.trim()) return [];

        const lines = text.trim().split(/\r?\n/);
        const points = [];
        let autoIndex = 1;

        for (let line of lines) {
            line = line.trim();
            if (!line || line.startsWith('#') || line.toLowerCase().includes('cuadro') || line.toLowerCase().includes('vértice') || line.toLowerCase().includes('rumbo')) {
                continue;
            }

            // Normalizar separadores y quitar comas de miles (ej: 2,745,612.30 -> 2745612.30)
            const cleanLine = line.replace(/(\d),(\d{3})/g, '$1$2').replace(/,/g, ' ');
            // Extraer números (incluyendo decimales)
            const matches = cleanLine.match(/[-+]?\d*\.?\d+/g);
            if (!matches || matches.length < 2) continue;

            const numbers = matches.map(Number).filter(n => !isNaN(n));
            if (numbers.length < 2) continue;

            let x = null;
            let y = null;
            let label = null;

            // Detectar automáticamente X e Y por su magnitud en México:
            // Y (Norte): Entre 1,500,000 y 3,600,000
            // X (Este): Entre 150,000 y 850,000
            const n1 = numbers[0];
            const n2 = numbers[1];
            const n3 = numbers.length >= 3 ? numbers[2] : null;

            if (n3 !== null) {
                // Caso común: Col 0 es Número de Vértice (1, 2, 3), Col 1 y 2 son X e Y
                if (n1 < 1000 && ((n2 > 100000 && n3 > 100000) || (n2 < 90 && n3 < 0))) {
                    label = String(Math.round(n1));
                    if (this._isY(n2) && this._isX(n3)) { y = n2; x = n3; }
                    else if (this._isX(n2) && this._isY(n3)) { x = n2; y = n3; }
                    else { x = n2; y = n3; }
                } else {
                    // Buscar entre todos los números encontrados
                    for (let n of numbers) {
                        if (this._isY(n) && y === null) y = n;
                        else if (this._isX(n) && x === null) x = n;
                    }
                }
            } else {
                // Solo 2 números: uno es X y otro es Y
                if (this._isY(n1) && this._isX(n2)) { y = n1; x = n2; }
                else if (this._isX(n1) && this._isY(n2)) { x = n1; y = n2; }
                else if (n1 > n2) { y = n1; x = n2; }
                else { x = n1; y = n2; }
            }

            if (x !== null && y !== null) {
                const geo = this.utmToLatLon(x, y, zone, datum);
                points.push({
                    x: x,
                    y: y,
                    lat: geo.lat,
                    lng: geo.lng,
                    label: label || String(autoIndex++)
                });
            }
        }

        return points;
    },

    _isY(num) {
        return num >= 1500000 && num <= 3600000;
    },

    _isX(num) {
        return num >= 150000 && num <= 880000;
    },

    // === Inicialización y Manejo del Modal ===

    init() {
        this._setupMunicipioSelect();
        this._bindEvents();
    },

    _setupMunicipioSelect() {
        const select = document.getElementById('certMunicipio');
        if (!select) return;

        select.innerHTML = '<option value="">Seleccionar Municipio de Sinaloa...</option>' +
            this.MUNICIPIOS_SINALOA.map(m => `<option value="${m.nombre}" data-zona="${m.zona}">${m.nombre} (Zona ${m.zona}N)</option>`).join('');

        // Al cambiar municipio, preseleccionar la Zona UTM correspondiente
        select.addEventListener('change', (e) => {
            const opt = select.selectedOptions[0];
            if (opt && opt.dataset.zona) {
                const zonaRadio = document.querySelector(`input[name="certUtmZone"][value="${opt.dataset.zona}"]`);
                if (zonaRadio) zonaRadio.checked = true;
                this.updatePreview();
            }
        });
    },

    _bindEvents() {
        // Abrir modal de certificado
        const btnOpen = document.getElementById('btnOpenCertificado');
        if (btnOpen) {
            btnOpen.addEventListener('click', () => this.openModal());
        }

        const btnOpen2 = document.getElementById('btnOpenCertificadoFromParcela');
        if (btnOpen2) {
            btnOpen2.addEventListener('click', () => {
                Utils.closeModal('modalParcela');
                this.openModal();
            });
        }

        // Pestañas de entrada (Texto Pegado vs Fila por Fila)
        document.querySelectorAll('.cert-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.cert-tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.cert-tab-pane').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                const targetPane = document.getElementById(btn.dataset.pane);
                if (targetPane) targetPane.classList.add('active');
            });
        });

        // Eventos de cálculo en Has - Áreas - Centiáreas
        ['certHas', 'certAreas', 'certCentiareas'].forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('input', () => this._updateDeclaredHa());
            }
        });

        // Eventos de cambio de Datum o Zona UTM
        document.querySelectorAll('input[name="certDatum"], input[name="certUtmZone"]').forEach(radio => {
            radio.addEventListener('change', () => this.updatePreview());
        });

        // Botón parsear texto pegado
        const btnParse = document.getElementById('btnCertParseText');
        if (btnParse) {
            btnParse.addEventListener('click', () => this.parseFromTextarea());
        }

        // Botón agregar fila en tabla manual
        const btnAddRow = document.getElementById('btnCertAddRow');
        if (btnAddRow) {
            btnAddRow.addEventListener('click', () => this.addRowToTable());
        }

        // Botón guardar parcela
        const btnSave = document.getElementById('btnCertSave');
        if (btnSave) {
            btnSave.addEventListener('click', () => this.saveParcelaFromCertificado());
        }
    },

    openModal() {
        Utils.openModal('modalCertificado');
        this._currentPoints = [];
        this._updateDeclaredHa();

        // Inicializar o recalibrar mapa de previsualización
        requestAnimationFrame(() => {
            if (!this._previewMap) {
                this._initPreviewMap();
            } else {
                this._previewMap.invalidateSize(true);
            }
        });
    },

    _initPreviewMap() {
        const container = document.getElementById('certPreviewMap');
        if (!container) return;

        this._previewMap = L.map('certPreviewMap', {
            center: [24.808, -107.394], // Centro de Culiacán / Sinaloa
            zoom: 10,
            zoomControl: true,
            attributionControl: false,
            preferCanvas: true
        });

        // Satélite Google Limpio
        L.tileLayer(MapService.SAT_GOOGLE, {
            subdomains: ['0', '1', '2', '3'],
            maxZoom: 20,
            maxNativeZoom: 19,
            keepBuffer: 6,
            attribution: '&copy; Google'
        }).addTo(this._previewMap);

        this._previewLayer = L.featureGroup().addTo(this._previewMap);
    },

    _updateDeclaredHa() {
        const has = document.getElementById('certHas') ? document.getElementById('certHas').value : '';
        const areas = document.getElementById('certAreas') ? document.getElementById('certAreas').value : '';
        const ca = document.getElementById('certCentiareas') ? document.getElementById('certCentiareas').value : '';

        const totalHa = this.hasAreasToHa(has, areas, ca);
        const display = document.getElementById('certDeclaredHaDisplay');
        if (display) {
            if (totalHa > 0) {
                const totalM2 = (totalHa * 10000).toLocaleString('es-MX', { maximumFractionDigits: 2 });
                display.textContent = `= ${totalHa.toFixed(4)} ha (${totalM2} m²)`;
                display.style.color = '#4ade80';
            } else {
                display.textContent = '— ha';
                display.style.color = 'var(--text-muted)';
            }
        }
        this._compareSurfaces(totalHa);
    },

    parseFromTextarea() {
        const text = document.getElementById('certPasteInput').value;
        if (!text || !text.trim()) {
            Utils.showToast('Pega las coordenadas del certificado primero', 'info');
            return;
        }

        const zone = parseInt(document.querySelector('input[name="certUtmZone"]:checked')?.value || '12');
        const datum = document.querySelector('input[name="certDatum"]:checked')?.value || 'WGS84';

        const points = this.parseVerticesText(text, zone, datum);
        if (points.length < 3) {
            Utils.showToast('Se requieren al menos 3 vértices para formar el polígono', 'warning');
            return;
        }

        this._currentPoints = points;
        this._syncPointsToManualTable(points);
        this.updatePreview();
        Utils.showToast(`✅ Se cargaron ${points.length} vértices correctamente`, 'success');
    },

    _syncPointsToManualTable(points) {
        const tbody = document.getElementById('certTableBody');
        if (!tbody) return;

        tbody.innerHTML = '';
        points.forEach((p, idx) => {
            this.addRowToTable(p.label || String(idx + 1), p.x, p.y);
        });
    },

    addRowToTable(label = '', x = '', y = '') {
        const tbody = document.getElementById('certTableBody');
        if (!tbody) return;

        const rowCount = tbody.children.length;
        const currentLabel = label || String(rowCount + 1);

        const tr = document.createElement('tr');
        tr.className = 'cert-coord-row';
        tr.innerHTML = `
            <td><input type="text" class="cert-input-sm cert-row-label" value="${currentLabel}" style="width:45px;text-align:center"></td>
            <td><input type="number" step="any" class="cert-input-sm cert-row-x" value="${x || ''}" placeholder="Ej: 245180.45"></td>
            <td><input type="number" step="any" class="cert-input-sm cert-row-y" value="${y || ''}" placeholder="Ej: 2745612.30"></td>
            <td style="text-align:center">
                <button type="button" class="btn-cert-del-row" title="Eliminar vértice" style="background:transparent;border:none;color:#ef4444;cursor:pointer;font-size:16px">✕</button>
            </td>
        `;

        tr.querySelector('.btn-cert-del-row').addEventListener('click', () => {
            tr.remove();
            this._readPointsFromManualTable();
        });

        tr.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', () => this._readPointsFromManualTable());
        });

        tbody.appendChild(tr);
    },

    _readPointsFromManualTable() {
        const tbody = document.getElementById('certTableBody');
        if (!tbody) return;

        const rows = tbody.querySelectorAll('.cert-coord-row');
        const zone = parseInt(document.querySelector('input[name="certUtmZone"]:checked')?.value || '12');
        const datum = document.querySelector('input[name="certDatum"]:checked')?.value || 'WGS84';

        const points = [];
        rows.forEach((r, idx) => {
            const label = r.querySelector('.cert-row-label').value || String(idx + 1);
            const x = parseFloat(r.querySelector('.cert-row-x').value);
            const y = parseFloat(r.querySelector('.cert-row-y').value);

            if (!isNaN(x) && !isNaN(y) && x > 0 && y > 0) {
                const geo = this.utmToLatLon(x, y, zone, datum);
                points.push({
                    label: label,
                    x: x,
                    y: y,
                    lat: geo.lat,
                    lng: geo.lng
                });
            }
        });

        this._currentPoints = points;
        this.updatePreview();
    },

    updatePreview() {
        if (!this._previewMap || !this._previewLayer) return;

        this._previewLayer.clearLayers();

        // Si tenemos puntos, recalcular sus coordenadas según el Datum y Zona seleccionados actualmente
        const zone = parseInt(document.querySelector('input[name="certUtmZone"]:checked')?.value || '12');
        const datum = document.querySelector('input[name="certDatum"]:checked')?.value || 'WGS84';

        this._currentPoints.forEach(p => {
            const geo = this.utmToLatLon(p.x, p.y, zone, datum);
            p.lat = geo.lat;
            p.lng = geo.lng;
        });

        const points = this._currentPoints;
        const countDisplay = document.getElementById('certPointCountDisplay');
        const areaDisplay = document.getElementById('certAreaDisplay');

        if (countDisplay) countDisplay.textContent = points.length;

        if (points.length < 3) {
            if (areaDisplay) areaDisplay.textContent = '— ha';
            return;
        }

        // Trazar polígono
        const latlngs = points.map(p => [p.lat, p.lng]);
        const polygon = L.polygon(latlngs, {
            color: '#22c55e',
            fillColor: '#22c55e',
            fillOpacity: 0.35,
            weight: 3
        }).addTo(this._previewLayer);

        // Marcadores numerados en cada vértice
        points.forEach(p => {
            const icon = L.divIcon({
                html: `<div style="background:#16a34a;color:#ffffff;border:2px solid #ffffff;border-radius:50%;width:24px;height:24px;line-height:20px;text-align:center;font-size:11px;font-weight:700;box-shadow:0 2px 4px rgba(0,0,0,0.5)">${p.label}</div>`,
                className: 'cert-vertex-marker',
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });
            L.marker([p.lat, p.lng], { icon: icon })
                .bindTooltip(`Vértice ${p.label}<br>X: ${p.x.toFixed(2)}<br>Y: ${p.y.toFixed(2)}`)
                .addTo(this._previewLayer);
        });

        // Ajustar vista del satélite al terreno
        this._previewMap.fitBounds(polygon.getBounds(), { padding: [30, 30], animate: false });
        this._previewMap.invalidateSize(true);

        // Calcular superficie por polígono
        const areaM2 = ExportService.polygonAreaM2(points);
        const areaHa = areaM2 / 10000;
        if (areaDisplay) {
            areaDisplay.textContent = `${areaHa.toFixed(4)} ha`;
        }

        this._compareSurfaces(areaHa);
    },

    _compareSurfaces(calculatedHa) {
        const has = document.getElementById('certHas') ? document.getElementById('certHas').value : '';
        const areas = document.getElementById('certAreas') ? document.getElementById('certAreas').value : '';
        const ca = document.getElementById('certCentiareas') ? document.getElementById('certCentiareas').value : '';
        const declaredHa = this.hasAreasToHa(has, areas, ca);

        const compareEl = document.getElementById('certComparisonBadge');
        if (!compareEl) return;

        if (declaredHa > 0 && calculatedHa > 0) {
            const diffHa = Math.abs(calculatedHa - declaredHa);
            const diffPercent = (diffHa / declaredHa) * 100;

            if (diffPercent < 1.0) {
                compareEl.className = 'cert-badge cert-badge-match';
                compareEl.innerHTML = `✅ Cuadre de precisión: <strong>${(100 - diffPercent).toFixed(2)}%</strong> (Diferencia de apenas ${(diffHa * 10000).toFixed(1)} m²)`;
            } else if (diffPercent < 5.0) {
                compareEl.className = 'cert-badge cert-badge-warn';
                compareEl.innerHTML = `⚠️ Cuadre aproximado (${(100 - diffPercent).toFixed(1)}%). Revisa si falta algún vértice intermedio.`;
            } else {
                compareEl.className = 'cert-badge cert-badge-diff';
                compareEl.innerHTML = `ℹ️ El polígono arroja ${calculatedHa.toFixed(3)} ha vs ${declaredHa.toFixed(3)} ha en certificado.`;
            }
            compareEl.style.display = 'block';
        } else {
            compareEl.style.display = 'none';
        }
    },

    saveParcelaFromCertificado() {
        const ejido = document.getElementById('certEjido')?.value.trim();
        const numParcela = document.getElementById('certNumParcela')?.value.trim();
        const municipio = document.getElementById('certMunicipio')?.value || '';
        const folioRAN = document.getElementById('certFolio')?.value.trim() || '';
        const cultivo = document.getElementById('certCultivo')?.value || 'maiz';
        const suelo = document.getElementById('certSuelo')?.value || 'arcilloso';
        const riego = document.getElementById('certRiego')?.value || 'surcos';

        if (!ejido) {
            Utils.showToast('Ingresa el nombre del Ejido o Parcela', 'error');
            return;
        }

        if (this._currentPoints.length < 3) {
            Utils.showToast('El certificado debe tener al menos 3 vértices cargados', 'error');
            return;
        }

        const has = document.getElementById('certHas')?.value || '';
        const areas = document.getElementById('certAreas')?.value || '';
        const ca = document.getElementById('certCentiareas')?.value || '';
        const declaredHa = this.hasAreasToHa(has, areas, ca);

        // Si se declaró en has/áreas/ca usamos ese número, si no el calculado por coordenadas
        const areaM2 = ExportService.polygonAreaM2(this._currentPoints);
        const calcHa = areaM2 / 10000;
        const finalSuperficie = declaredHa > 0 ? declaredHa : parseFloat(calcHa.toFixed(2));

        // Centro geodésico
        const centroid = ExportService.centroid(this._currentPoints);
        const zone = parseInt(document.querySelector('input[name="certUtmZone"]:checked')?.value || '12');
        const datum = document.querySelector('input[name="certDatum"]:checked')?.value || 'WGS84';

        const nombreFinal = numParcela ? `Parcela ${numParcela} — ${ejido}` : ejido;

        const parcelaData = {
            nombre: nombreFinal,
            ejido: ejido,
            numParcela: numParcela,
            municipio: municipio,
            folioRAN: folioRAN,
            datum: datum,
            utmZone: zone,
            hasAreasFormat: (has || areas || ca) ? `${has || 0}-${areas || 0}-${ca || 0}` : null,
            superficie: parseFloat(finalSuperficie.toFixed(2)),
            cultivo: cultivo,
            suelo: suelo,
            riego: riego,
            lat: centroid.lat,
            lng: centroid.lng,
            polygon: this._currentPoints.map(p => ({
                lat: p.lat,
                lng: p.lng,
                x: p.x,
                y: p.y,
                label: p.label
            })),
            notas: `Certificado Parcelario: ${folioRAN ? 'Folio ' + folioRAN : ''} • Ejido: ${ejido} • Municipio: ${municipio || 'Sinaloa'} • Datum: ${datum} (Zona ${zone}N)`
        };

        DB.saveParcela(parcelaData);
        Utils.closeModal('modalCertificado');
        Utils.showToast(`🎉 Parcela "${nombreFinal}" guardada y delimitada con éxito`, 'success');

        // Actualizar vistas y mapas
        ParcelasModule.render();
        Utils.updateParcelaSelects();
        MapService.updateMarkers('parcelasMap');
        MapService.invalidateSize('parcelasMap');

        if (MapService.maps['dashboardMap']) {
            MapService.updateMarkers('dashboardMap');
            MapService.invalidateSize('dashboardMap');
        }
    }
};

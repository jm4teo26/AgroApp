/* ========================================
   AgroApp — Servicio de exportación (Croquis)
   Genera documentos PNG con esquema de parcela,
   medidas de orillas, coordenadas y hectáreas
   ======================================== */

const ExportService = {
    EARTH_RADIUS: 6371000, // metros

    // === Cálculos geodésicos ===

    haversineDistance(lat1, lng1, lat2, lng2) {
        const toRad = d => d * Math.PI / 180;
        const dLat = toRad(lat2 - lat1);
        const dLng = toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
                  Math.sin(dLng / 2) ** 2;
        return this.EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    },

    polygonAreaM2(coords) {
        if (!coords || coords.length < 3) return 0;
        const toRad = d => d * Math.PI / 180;
        let area = 0;
        for (let i = 0; i < coords.length; i++) {
            const j = (i + 1) % coords.length;
            area += toRad(coords[j].lng - coords[i].lng) *
                    (2 + Math.sin(toRad(coords[i].lat)) + Math.sin(toRad(coords[j].lat)));
        }
        return Math.abs(area * this.EARTH_RADIUS ** 2 / 2);
    },

    polygonPerimeter(coords) {
        if (!coords || coords.length < 2) return 0;
        let p = 0;
        for (let i = 0; i < coords.length; i++) {
            const j = (i + 1) % coords.length;
            p += this.haversineDistance(coords[i].lat, coords[i].lng, coords[j].lat, coords[j].lng);
        }
        return p;
    },

    edgeDistances(coords) {
        const d = [];
        for (let i = 0; i < coords.length; i++) {
            const j = (i + 1) % coords.length;
            d.push(this.haversineDistance(coords[i].lat, coords[i].lng, coords[j].lat, coords[j].lng));
        }
        return d;
    },

    centroid(coords) {
        const n = coords.length;
        return {
            lat: coords.reduce((s, c) => s + c.lat, 0) / n,
            lng: coords.reduce((s, c) => s + c.lng, 0) / n
        };
    },

    formatDist(meters) {
        return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${meters.toFixed(1)} m`;
    },

    // === Helpers de dibujo ===

    _roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    },

    // === Generación del Croquis ===

    generateCroquis(parcela) {
        const polygon = parcela.polygon;
        if (!polygon || polygon.length < 3) return null;

        const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const W = 1200;
        const headerH = 140;
        const mapAreaH = 650;
        const edges = this.edgeDistances(polygon);
        const areaM2 = this.polygonAreaM2(polygon);
        const areaHa = areaM2 / 10000;
        const perimeter = this.polygonPerimeter(polygon);

        // Altura dinámica según número de vértices
        const H = Math.max(1500,
            headerH + 30 + mapAreaH + 60 +
            50 + 5 * 36 + 40 +
            50 + 40 + polygon.length * 32 + 100
        );

        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');

        // === FONDO ===
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, H);

        // === HEADER ===
        const grd = ctx.createLinearGradient(0, 0, W, 0);
        grd.addColorStop(0, '#1a3a14');
        grd.addColorStop(1, '#2e5f24');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, W, headerH);

        ctx.fillStyle = '#4ade80';
        ctx.fillRect(0, headerH - 3, W, 3);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 32px Inter, Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('AGROAPP — CROQUIS DE PARCELA', 50, 52);

        ctx.font = '600 22px Inter, Arial, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillText('Parcela: "' + parcela.nombre + '"', 50, 88);

        const dateStr = new Date().toLocaleDateString('es-MX', {
            day: 'numeric', month: 'long', year: 'numeric'
        });
        ctx.font = '18px Inter, Arial, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.fillText('Generado: ' + dateStr, 50, 118);

        // === ÁREA DE DIBUJO DEL POLÍGONO ===
        const mapTop = headerH + 30;
        const mapLeft = 50;
        const mapW = W - 100;

        // Marco
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.strokeRect(mapLeft, mapTop, mapW, mapAreaH);

        // Grid de fondo
        ctx.strokeStyle = '#f3f3f3';
        ctx.lineWidth = 0.5;
        for (let x = mapLeft + 40; x < mapLeft + mapW; x += 40) {
            ctx.beginPath(); ctx.moveTo(x, mapTop); ctx.lineTo(x, mapTop + mapAreaH); ctx.stroke();
        }
        for (let y = mapTop + 40; y < mapTop + mapAreaH; y += 40) {
            ctx.beginPath(); ctx.moveTo(mapLeft, y); ctx.lineTo(mapLeft + mapW, y); ctx.stroke();
        }

        // Bounding box y escala con corrección de coseno
        let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
        polygon.forEach(c => {
            minLat = Math.min(minLat, c.lat); maxLat = Math.max(maxLat, c.lat);
            minLng = Math.min(minLng, c.lng); maxLng = Math.max(maxLng, c.lng);
        });

        const pad = 100;
        const drawW = mapW - pad * 2;
        const drawH = mapAreaH - pad * 2;
        const latRange = maxLat - minLat || 0.0001;
        const lngRange = maxLng - minLng || 0.0001;
        const avgLat = (minLat + maxLat) / 2;
        const cosLat = Math.cos(avgLat * Math.PI / 180);
        const corrLngRange = lngRange * cosLat;

        const scale = Math.min(drawW / corrLngRange, drawH / latRange);
        const polyW = corrLngRange * scale;
        const polyH = latRange * scale;
        const offX = mapLeft + pad + (drawW - polyW) / 2;
        const offY = mapTop + pad + (drawH - polyH) / 2;

        const toCanvas = c => ({
            x: offX + (c.lng - minLng) * cosLat * scale,
            y: offY + (maxLat - c.lat) * scale
        });

        const pts = polygon.map(toCanvas);

        // Dibujar polígono relleno
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.fillStyle = 'rgba(34, 197, 94, 0.1)';
        ctx.fill();
        ctx.strokeStyle = '#2e7d32';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([]);
        ctx.stroke();

        // Líneas diagonales internas decorativas
        ctx.strokeStyle = 'rgba(34, 197, 94, 0.04)';
        ctx.lineWidth = 1;
        for (let i = 0; i < pts.length; i++) {
            for (let j = i + 2; j < pts.length; j++) {
                if (i === 0 && j === pts.length - 1) continue;
                ctx.beginPath();
                ctx.setLineDash([4, 8]);
                ctx.moveTo(pts[i].x, pts[i].y);
                ctx.lineTo(pts[j].x, pts[j].y);
                ctx.stroke();
            }
        }
        ctx.setLineDash([]);

        // Etiquetas de distancia en cada orilla
        ctx.textBaseline = 'middle';
        for (let i = 0; i < pts.length; i++) {
            const j = (i + 1) % pts.length;
            const p1 = pts[i], p2 = pts[j];
            const mx = (p1.x + p2.x) / 2;
            const my = (p1.y + p2.y) / 2;
            const dx = p2.x - p1.x, dy = p2.y - p1.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len < 35) continue;

            const nx = -dy / len * 22;
            const ny = dx / len * 22;
            const lx = mx + nx, ly = my + ny;

            const label = this.formatDist(edges[i]);
            ctx.font = 'bold 14px Inter, Arial, sans-serif';
            const tw = ctx.measureText(label).width + 14;

            // Fondo pill
            ctx.fillStyle = 'rgba(255,255,255,0.92)';
            ctx.fillRect(lx - tw / 2, ly - 11, tw, 22);
            ctx.strokeStyle = '#bbb';
            ctx.lineWidth = 0.8;
            ctx.strokeRect(lx - tw / 2, ly - 11, tw, 22);

            ctx.fillStyle = '#444';
            ctx.textAlign = 'center';
            ctx.fillText(label, lx, ly);
        }

        // Marcadores de esquinas
        ctx.textBaseline = 'alphabetic';
        for (let i = 0; i < pts.length; i++) {
            const p = pts[i];
            const letter = LETTERS[i] || '' + (i + 1);

            // Círculo azul
            ctx.beginPath();
            ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
            ctx.fillStyle = '#1565c0';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
            ctx.stroke();

            // Letra dentro del círculo
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 13px Inter, Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(letter, p.x, p.y + 4.5);

            // Letra arriba como etiqueta
            ctx.fillStyle = '#1565c0';
            ctx.font = 'bold 16px Inter, Arial, sans-serif';
            ctx.fillText(letter, p.x, p.y - 22);
        }

        // === BRÚJULA ===
        const cx = mapLeft + mapW - 55;
        const cy = mapTop + 55;
        const cr = 22;

        ctx.beginPath();
        ctx.arc(cx, cy, cr + 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fill();
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Flecha norte
        ctx.beginPath();
        ctx.moveTo(cx, cy - cr);
        ctx.lineTo(cx - 6, cy - 2);
        ctx.lineTo(cx + 6, cy - 2);
        ctx.closePath();
        ctx.fillStyle = '#d32f2f';
        ctx.fill();

        // Flecha sur
        ctx.beginPath();
        ctx.moveTo(cx, cy + cr);
        ctx.lineTo(cx - 6, cy + 2);
        ctx.lineTo(cx + 6, cy + 2);
        ctx.closePath();
        ctx.fillStyle = '#ccc';
        ctx.fill();

        ctx.font = 'bold 14px Inter, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#d32f2f';
        ctx.fillText('N', cx, cy - cr - 10);

        // === INFORMACIÓN DE LA PARCELA ===
        let y = mapTop + mapAreaH + 50;

        ctx.fillStyle = '#1a3a14';
        ctx.font = 'bold 22px Inter, Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('INFORMACION DE LA PARCELA', 60, y);
        y += 10;
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(60, y, 310, 2);
        y += 30;

        const info = [
            ['Area', areaHa.toFixed(4) + ' ha  (' + areaM2.toLocaleString('es-MX', { maximumFractionDigits: 0 }) + ' m\u00B2)'],
            ['Perimetro', this.formatDist(perimeter)],
            ['Cultivo', Utils.cultivoName(parcela.cultivo)],
            ['Suelo', Utils.sueloName(parcela.suelo)],
            ['Riego', Utils.riegoName(parcela.riego)]
        ];

        info.forEach(([label, value]) => {
            ctx.font = '600 18px Inter, Arial, sans-serif';
            ctx.fillStyle = '#888';
            ctx.fillText(label + ':', 80, y);
            ctx.font = '18px Inter, Arial, sans-serif';
            ctx.fillStyle = '#222';
            ctx.fillText(value, 260, y);
            y += 36;
        });

        // === TABLA DE VÉRTICES Y COORDENADAS ===
        y += 25;
        ctx.fillStyle = '#1a3a14';
        ctx.font = 'bold 22px Inter, Arial, sans-serif';
        ctx.fillText('VERTICES Y COORDENADAS', 60, y);
        y += 10;
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(60, y, 290, 2);
        y += 28;

        // Encabezados de tabla
        ctx.font = 'bold 15px Inter, Arial, sans-serif';
        ctx.fillStyle = '#888';
        ctx.fillText('Punto', 85, y);
        ctx.fillText('Latitud', 180, y);
        ctx.fillText('Longitud', 390, y);
        ctx.fillText('Lado', 610, y);
        ctx.fillText('Distancia', 740, y);
        y += 8;
        ctx.fillStyle = '#e0e0e0';
        ctx.fillRect(60, y, W - 120, 1);
        y += 22;

        // Filas de la tabla
        polygon.forEach((coord, i) => {
            const letter = LETTERS[i] || '' + (i + 1);
            const nextLetter = LETTERS[(i + 1) % polygon.length] || '' + ((i + 1) % polygon.length + 1);
            const dist = edges[i];
            const latDir = coord.lat >= 0 ? 'N' : 'S';
            const lngDir = coord.lng >= 0 ? 'E' : 'O';

            // Fondo alterno
            if (i % 2 === 0) {
                ctx.fillStyle = '#f8f9fa';
                ctx.fillRect(60, y - 17, W - 120, 30);
            }

            ctx.font = 'bold 16px Inter, Arial, sans-serif';
            ctx.fillStyle = '#1565c0';
            ctx.fillText(letter, 100, y);

            ctx.font = '15px Inter, Arial, sans-serif';
            ctx.fillStyle = '#333';
            ctx.fillText(Math.abs(coord.lat).toFixed(6) + '\u00B0 ' + latDir, 180, y);
            ctx.fillText(Math.abs(coord.lng).toFixed(6) + '\u00B0 ' + lngDir, 390, y);
            ctx.fillText(letter + ' \u2192 ' + nextLetter, 610, y);
            ctx.fillText(this.formatDist(dist), 740, y);

            y += 32;
        });

        // Línea de cierre
        ctx.fillStyle = '#e0e0e0';
        ctx.fillRect(60, y, W - 120, 1);

        // === PIE DE PÁGINA ===
        const footerY = H - 35;
        ctx.fillStyle = '#e0e0e0';
        ctx.fillRect(60, footerY - 20, W - 120, 1);
        ctx.font = '14px Inter, Arial, sans-serif';
        ctx.fillStyle = '#aaa';
        ctx.textAlign = 'center';
        ctx.fillText('Documento generado por AgroApp \u2014 ' + dateStr, W / 2, footerY);

        return canvas;
    },

    // === Descarga / Compartir ===

    downloadCroquis(parcela) {
        if (!parcela) {
            Utils.showToast('Parcela no encontrada', 'error');
            return;
        }

        if (!parcela.polygon || parcela.polygon.length < 3) {
            Utils.showToast('Define el perimetro de la parcela primero', 'error');
            return;
        }

        Utils.showToast('Generando croquis...', 'info', 1500);

        setTimeout(() => {
            const canvas = this.generateCroquis(parcela);
            if (!canvas) {
                Utils.showToast('Error generando croquis', 'error');
                return;
            }

            canvas.toBlob(blob => {
                const fileName = 'Croquis_' + parcela.nombre.replace(/[^a-zA-Z0-9\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1 ]/g, '').replace(/\s+/g, '_') + '.png';

                // Web Share API (ideal para iOS/móvil)
                if (navigator.share && navigator.canShare) {
                    const file = new File([blob], fileName, { type: 'image/png' });
                    if (navigator.canShare({ files: [file] })) {
                        navigator.share({
                            title: 'Croquis - ' + parcela.nombre,
                            files: [file]
                        }).then(() => {
                            Utils.showToast('Croquis compartido', 'success');
                        }).catch(() => {
                            this._downloadBlob(blob, fileName);
                        });
                        return;
                    }
                }

                // Fallback: descarga directa
                this._downloadBlob(blob, fileName);
            }, 'image/png');
        }, 200);
    },

    _downloadBlob(blob, fileName) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        Utils.showToast('Croquis descargado', 'success');
    }
};

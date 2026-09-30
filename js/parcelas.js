/* ========================================
   AgroApp — Módulo de Parcelas
   ======================================== */

const ParcelasModule = {
    init() {
        // Botones de agregar
        document.getElementById('btnAddParcela').addEventListener('click', () => this.openForm());
        document.getElementById('btnAddParcelaEmpty').addEventListener('click', () => this.openForm());

        // GPS
        document.getElementById('btnGetLocation').addEventListener('click', () => this.getGPS());

        // Form submit
        document.getElementById('formParcela').addEventListener('submit', (e) => this.handleSubmit(e));

        this.render();
    },

    openForm(parcelaId = null) {
        const form = document.getElementById('formParcela');
        form.reset();
        document.getElementById('parcelaId').value = '';

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
            }
        } else {
            document.getElementById('modalParcelaTitle').textContent = 'Nueva Parcela';
        }

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

        const existingId = document.getElementById('parcelaId').value;
        if (existingId) parcela.id = existingId;

        if (!parcela.nombre || isNaN(parcela.lat) || isNaN(parcela.lng)) {
            Utils.showToast('Completa nombre, latitud y longitud', 'error');
            return;
        }

        DB.saveParcela(parcela);
        Utils.closeModal('modalParcela');
        Utils.showToast(existingId ? 'Parcela actualizada' : 'Parcela guardada', 'success');

        this.render();
        Utils.updateParcelaSelects();
        MapService.updateMarkers('parcelasMap');
        MapService.updateMarkers('dashboardMap');
        DashboardModule.refresh();
    },

    deleteParcela(id) {
        const parcela = DB.getParcelaById(id);
        document.getElementById('confirmMsg').textContent = `¿Eliminar la parcela "${parcela?.nombre}"? Se borrarán también sus actividades y notas.`;
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
        list.innerHTML = parcelas.map((p, i) => `
            <div class="parcela-card" style="animation-delay:${i * 0.05}s">
                <div class="parcela-card-header">
                    <div>
                        <div class="parcela-card-name">${p.nombre}</div>
                        <div class="parcela-card-cultivo">🌽 ${Utils.cultivoName(p.cultivo)}</div>
                    </div>
                    <div class="parcela-card-actions">
                        <button class="parcela-action-btn" onclick="ParcelasModule.openForm('${p.id}')" aria-label="Editar">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                        </button>
                        <button class="parcela-action-btn delete" onclick="ParcelasModule.deleteParcela('${p.id}')" aria-label="Eliminar">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </button>
                    </div>
                </div>
                <div class="parcela-card-details">
                    <div class="parcela-detail">
                        <span class="parcela-detail-icon">📍</span>
                        <span class="parcela-detail-text"><strong>${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}</strong></span>
                    </div>
                    <div class="parcela-detail">
                        <span class="parcela-detail-icon">📐</span>
                        <span class="parcela-detail-text"><strong>${p.superficie ? p.superficie + ' ha' : '—'}</strong></span>
                    </div>
                    <div class="parcela-detail">
                        <span class="parcela-detail-icon">🌍</span>
                        <span class="parcela-detail-text"><strong>${Utils.sueloName(p.suelo)}</strong></span>
                    </div>
                    <div class="parcela-detail">
                        <span class="parcela-detail-icon">💧</span>
                        <span class="parcela-detail-text"><strong>${Utils.riegoName(p.riego)}</strong></span>
                    </div>
                </div>
            </div>
        `).join('');
    }
};

/* ========================================
   AgroApp — Módulo de Bitácora
   ======================================== */

const BitacoraModule = {
    currentTab: 'notas',

    init() {
        document.getElementById('btnAddNote').addEventListener('click', () => this.openForm());

        // Tabs
        document.querySelectorAll('#bitacoraTabs .tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('#bitacoraTabs .tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.currentTab = tab.dataset.tab;
                this.render();
            });
        });

        // Filtro parcela
        document.getElementById('bitacoraParcelaFilter').addEventListener('change', () => this.render());

        // Form submit
        document.getElementById('formNote').addEventListener('submit', (e) => this.handleSubmit(e));

        // Campos condicionales
        document.getElementById('noteTipo').addEventListener('change', (e) => {
            this.toggleConditionalFields(e.target.value);
        });

        // Default date
        document.getElementById('noteFecha').value = new Date().toISOString().split('T')[0];

        this.render();
    },

    openForm(noteId = null) {
        const form = document.getElementById('formNote');
        form.reset();
        document.getElementById('noteId').value = '';
        document.getElementById('noteFecha').value = new Date().toISOString().split('T')[0];
        this.toggleConditionalFields('nota');

        Utils.updateParcelaSelects();

        if (noteId) {
            const notes = DB.getNotes();
            const n = notes.find(note => note.id === noteId);
            if (n) {
                document.getElementById('modalNoteTitle').textContent = 'Editar Entrada';
                document.getElementById('noteId').value = n.id;
                document.getElementById('noteParcela').value = n.parcelaId;
                document.getElementById('noteTipo').value = n.tipo;
                document.getElementById('noteFecha').value = n.fecha;
                document.getElementById('noteTitulo').value = n.titulo || '';
                document.getElementById('noteDesc').value = n.descripcion || '';

                this.toggleConditionalFields(n.tipo);

                if (n.tipo === 'insumo') {
                    document.getElementById('insumoNombre').value = n.insumoNombre || '';
                    document.getElementById('insumoCantidad').value = n.insumoCantidad || '';
                    document.getElementById('insumoCosto').value = n.insumoCosto || '';
                } else if (n.tipo === 'plaga') {
                    document.getElementById('plagaNombre').value = n.plagaNombre || '';
                    document.getElementById('plagaSeveridad').value = n.plagaSeveridad || 'baja';
                } else if (n.tipo === 'produccion') {
                    document.getElementById('produccionCantidad').value = n.produccionCantidad || '';
                    document.getElementById('produccionCalidad').value = n.produccionCalidad || 'buena';
                }
            }
        } else {
            document.getElementById('modalNoteTitle').textContent = 'Nueva Entrada';
        }

        Utils.openModal('modalNote');
    },

    toggleConditionalFields(tipo) {
        document.getElementById('insumoFields').style.display = tipo === 'insumo' ? '' : 'none';
        document.getElementById('plagaFields').style.display = tipo === 'plaga' ? '' : 'none';
        document.getElementById('produccionFields').style.display = tipo === 'produccion' ? '' : 'none';
    },

    handleSubmit(e) {
        e.preventDefault();

        const parcelaId = document.getElementById('noteParcela').value;
        if (!parcelaId) {
            Utils.showToast('Selecciona una parcela', 'error');
            return;
        }

        const note = {
            parcelaId,
            tipo: document.getElementById('noteTipo').value,
            fecha: document.getElementById('noteFecha').value,
            titulo: document.getElementById('noteTitulo').value.trim(),
            descripcion: document.getElementById('noteDesc').value.trim()
        };

        // Campos condicionales
        if (note.tipo === 'insumo') {
            note.insumoNombre = document.getElementById('insumoNombre').value.trim();
            note.insumoCantidad = document.getElementById('insumoCantidad').value.trim();
            note.insumoCosto = parseFloat(document.getElementById('insumoCosto').value) || 0;
        } else if (note.tipo === 'plaga') {
            note.plagaNombre = document.getElementById('plagaNombre').value.trim();
            note.plagaSeveridad = document.getElementById('plagaSeveridad').value;
        } else if (note.tipo === 'produccion') {
            note.produccionCantidad = parseFloat(document.getElementById('produccionCantidad').value) || 0;
            note.produccionCalidad = document.getElementById('produccionCalidad').value;
        }

        const existingId = document.getElementById('noteId').value;
        if (existingId) note.id = existingId;

        DB.saveNote(note);
        Utils.closeModal('modalNote');
        Utils.showToast(existingId ? 'Entrada actualizada' : 'Entrada guardada', 'success');
        this.render();
    },

    deleteNote(id) {
        document.getElementById('confirmMsg').textContent = '¿Eliminar esta entrada de la bitácora?';
        Utils.openModal('modalConfirm');
        document.getElementById('btnConfirmOk').onclick = () => {
            DB.deleteNote(id);
            Utils.closeModal('modalConfirm');
            Utils.showToast('Entrada eliminada', 'success');
            this.render();
        };
    },

    render() {
        const container = document.getElementById('bitacoraContent');
        const filterParcela = document.getElementById('bitacoraParcelaFilter').value;

        // Map tab to tipo
        const tipoMap = {
            'notas': 'nota',
            'insumos': 'insumo',
            'plagas': 'plaga',
            'produccion': 'produccion'
        };

        let notes = DB.getNotes().filter(n => n.tipo === tipoMap[this.currentTab]);

        if (filterParcela !== 'all') {
            notes = notes.filter(n => n.parcelaId === filterParcela);
        }

        // Ordenar por fecha desc
        notes.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        if (notes.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">${Utils.noteTypeIcon(tipoMap[this.currentTab])}</div>
                    <h3>Sin registros</h3>
                    <p>Agrega una entrada de tipo "${this.currentTab}"</p>
                </div>
            `;
            return;
        }

        // Costo total para insumos
        let costHtml = '';
        if (this.currentTab === 'insumos') {
            const totalCost = notes.reduce((sum, n) => sum + (n.insumoCosto || 0), 0);
            costHtml = `
                <div class="cost-summary">
                    <span class="cost-summary-label">💰 Costo total</span>
                    <span class="cost-summary-value">$${totalCost.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                </div>
            `;
        }

        container.innerHTML = costHtml + notes.map(n => {
            const parcela = DB.getParcelaById(n.parcelaId);
            let metaHtml = '';

            if (n.tipo === 'insumo') {
                metaHtml = `
                    ${n.insumoNombre ? `<span class="entry-meta-item">📦 ${n.insumoNombre}</span>` : ''}
                    ${n.insumoCantidad ? `<span class="entry-meta-item">📏 ${n.insumoCantidad}</span>` : ''}
                    ${n.insumoCosto ? `<span class="entry-meta-item">💰 $${n.insumoCosto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>` : ''}
                `;
            } else if (n.tipo === 'plaga') {
                const sevBadge = { baja: 'badge-green', media: 'badge-amber', alta: 'badge-red' };
                metaHtml = `
                    ${n.plagaNombre ? `<span class="entry-meta-item">🐛 ${n.plagaNombre}</span>` : ''}
                    <span class="badge ${sevBadge[n.plagaSeveridad] || 'badge-green'}">${n.plagaSeveridad || 'baja'}</span>
                `;
            } else if (n.tipo === 'produccion') {
                metaHtml = `
                    ${n.produccionCantidad ? `<span class="entry-meta-item">📊 ${n.produccionCantidad} ton/ha</span>` : ''}
                    ${n.produccionCalidad ? `<span class="entry-meta-item">⭐ ${n.produccionCalidad}</span>` : ''}
                `;
            }

            return `
                <div class="entry-card">
                    <div class="entry-card-header">
                        <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
                            <span class="entry-card-type">${Utils.noteTypeIcon(n.tipo)}</span>
                            <div style="min-width:0">
                                <div class="entry-card-title">${n.titulo}</div>
                                <div class="entry-card-date">${parcela ? parcela.nombre + ' • ' : ''}${Utils.formatDate(n.fecha)}</div>
                            </div>
                        </div>
                        <div class="entry-card-actions">
                            <button class="entry-action-btn" onclick="BitacoraModule.openForm('${n.id}')" title="Editar">✏️</button>
                            <button class="entry-action-btn" onclick="BitacoraModule.deleteNote('${n.id}')" title="Eliminar">🗑️</button>
                        </div>
                    </div>
                    ${n.descripcion ? `<div class="entry-card-body">${n.descripcion}</div>` : ''}
                    <div class="entry-card-meta">${metaHtml}</div>
                </div>
            `;
        }).join('');
    }
};

/* ========================================
   AgroApp — Módulo de Calendario
   ======================================== */

const CalendarioModule = {
    currentDate: new Date(),

    init() {
        document.getElementById('btnAddActivity').addEventListener('click', () => this.openForm());
        document.getElementById('calPrev').addEventListener('click', () => this.changeMonth(-1));
        document.getElementById('calNext').addEventListener('click', () => this.changeMonth(1));
        document.getElementById('calParcelaFilter').addEventListener('change', () => this.render());
        document.getElementById('formActivity').addEventListener('submit', (e) => this.handleSubmit(e));

        // Toggle recurrencia
        document.getElementById('activityRecurrente').addEventListener('change', (e) => {
            document.getElementById('recurrenciaGroup').classList.toggle('hidden', !e.target.checked);
        });

        // Default date
        document.getElementById('activityFecha').value = new Date().toISOString().split('T')[0];

        this.render();
    },

    openForm(activityId = null) {
        const form = document.getElementById('formActivity');
        form.reset();
        document.getElementById('activityId').value = '';
        document.getElementById('recurrenciaGroup').classList.add('hidden');
        document.getElementById('activityFecha').value = new Date().toISOString().split('T')[0];

        // Llenar select de parcelas
        Utils.updateParcelaSelects();

        if (activityId) {
            const activities = DB.getActivities();
            const a = activities.find(act => act.id === activityId);
            if (a) {
                document.getElementById('modalActivityTitle').textContent = 'Editar Actividad';
                document.getElementById('activityId').value = a.id;
                document.getElementById('activityParcela').value = a.parcelaId;
                document.getElementById('activityTipo').value = a.tipo;
                document.getElementById('activityFecha').value = a.fecha;
                document.getElementById('activityHora').value = a.hora || '';
                document.getElementById('activityDesc').value = a.descripcion || '';
            }
        } else {
            document.getElementById('modalActivityTitle').textContent = 'Nueva Actividad';
        }

        Utils.openModal('modalActivity');
    },

    handleSubmit(e) {
        e.preventDefault();

        const parcelaId = document.getElementById('activityParcela').value;
        if (!parcelaId) {
            Utils.showToast('Selecciona una parcela', 'error');
            return;
        }

        const activity = {
            parcelaId,
            tipo: document.getElementById('activityTipo').value,
            fecha: document.getElementById('activityFecha').value,
            hora: document.getElementById('activityHora').value,
            descripcion: document.getElementById('activityDesc').value.trim()
        };

        const existingId = document.getElementById('activityId').value;
        if (existingId) activity.id = existingId;

        DB.saveActivity(activity);

        // Si es recurrente, crear copias futuras
        if (document.getElementById('activityRecurrente').checked && !existingId) {
            const dias = parseInt(document.getElementById('recurrenciaDias').value) || 7;
            const unidad = document.getElementById('recurrenciaUnidad').value;
            let multiplier = 1;
            if (unidad === 'semanas') multiplier = 7;
            if (unidad === 'meses') multiplier = 30;

            for (let i = 1; i <= 8; i++) { // 8 repeticiones máximo
                const nextDate = new Date(activity.fecha);
                nextDate.setDate(nextDate.getDate() + (dias * multiplier * i));
                DB.saveActivity({
                    ...activity,
                    id: undefined,
                    fecha: nextDate.toISOString().split('T')[0]
                });
            }
        }

        Utils.closeModal('modalActivity');
        Utils.showToast(existingId ? 'Actividad actualizada' : 'Actividad creada', 'success');
        this.render();
        DashboardModule.refresh();
    },

    changeMonth(delta) {
        this.currentDate.setMonth(this.currentDate.getMonth() + delta);
        this.render();
    },

    render() {
        this.renderCalendar();
        this.renderUpcoming();
    },

    renderCalendar() {
        const grid = document.getElementById('calGrid');
        const monthYear = document.getElementById('calMonthYear');
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();

        monthYear.textContent = new Date(year, month).toLocaleDateString('es-MX', {
            month: 'long', year: 'numeric'
        });

        const filterParcela = document.getElementById('calParcelaFilter').value;
        let activities = DB.getActivities();
        if (filterParcela !== 'all') {
            activities = activities.filter(a => a.parcelaId === filterParcela);
        }

        // Días
        const firstDay = new Date(year, month, 1).getDay(); // 0=dom
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const daysInPrev = new Date(year, month, 0).getDate();
        const today = new Date();

        let html = '';
        // Headers
        const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        dayNames.forEach(d => {
            html += `<div class="cal-header-cell">${d}</div>`;
        });

        // Días del mes anterior
        for (let i = firstDay - 1; i >= 0; i--) {
            html += `<div class="cal-cell other-month">${daysInPrev - i}</div>`;
        }

        // Días del mes actual
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dayActivities = activities.filter(a => a.fecha === dateStr);
            const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;

            let classes = 'cal-cell';
            if (isToday) classes += ' today';
            if (dayActivities.length > 0) classes += ' has-events';
            if (dayActivities.length > 1) classes += ' multi';

            html += `<div class="${classes}" data-date="${dateStr}" onclick="CalendarioModule.onDayClick('${dateStr}')">${d}</div>`;
        }

        // Días del siguiente mes
        const totalCells = firstDay + daysInMonth;
        const remaining = (7 - (totalCells % 7)) % 7;
        for (let d = 1; d <= remaining; d++) {
            html += `<div class="cal-cell other-month">${d}</div>`;
        }

        grid.innerHTML = html;
    },

    onDayClick(dateStr) {
        document.getElementById('activityFecha').value = dateStr;
        this.openForm();
    },

    renderUpcoming() {
        const list = document.getElementById('upcomingList');
        const upcoming = DB.getUpcomingActivities(30);

        if (upcoming.length === 0) {
            list.innerHTML = '<div class="empty-mini">Sin actividades próximas</div>';
            return;
        }

        list.innerHTML = upcoming.slice(0, 10).map(a => {
            const parcela = DB.getParcelaById(a.parcelaId);
            return `
                <div class="activity-entry ${a.completed ? 'completed' : ''}" data-type="${a.tipo}">
                    <div class="activity-entry-icon">${Utils.activityIcon(a.tipo)}</div>
                    <div class="activity-entry-content">
                        <div class="activity-entry-title">${Utils.activityName(a.tipo)}${a.descripcion ? ' — ' + a.descripcion : ''}</div>
                        <div class="activity-entry-meta">${parcela ? parcela.nombre : '—'} • ${Utils.relativeDate(a.fecha)}${a.hora ? ' • ' + Utils.formatTime(a.hora) : ''}</div>
                    </div>
                    <div class="activity-entry-actions">
                        <button class="activity-complete-btn" onclick="CalendarioModule.toggleComplete('${a.id}')" title="${a.completed ? 'Desmarcar' : 'Completar'}">
                            ${a.completed ? '↩️' : '✅'}
                        </button>
                        <button class="activity-delete-btn" onclick="CalendarioModule.deleteActivity('${a.id}')" title="Eliminar">
                            🗑️
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    },

    toggleComplete(id) {
        DB.toggleActivityComplete(id);
        this.render();
        DashboardModule.refresh();
        Utils.showToast('Actividad actualizada', 'success');
    },

    deleteActivity(id) {
        DB.deleteActivity(id);
        this.render();
        DashboardModule.refresh();
        Utils.showToast('Actividad eliminada', 'success');
    }
};

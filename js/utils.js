/* ========================================
   AgroApp — Utilidades generales
   ======================================== */

const Utils = {
    // Formato de fecha
    formatDate(dateStr) {
        const d = new Date(dateStr);
        return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
    },

    formatDateShort(dateStr) {
        const d = new Date(dateStr);
        return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
    },

    formatTime(timeStr) {
        if (!timeStr) return '';
        const [h, m] = timeStr.split(':');
        const hour = parseInt(h);
        return `${hour > 12 ? hour - 12 : hour}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
    },

    isToday(dateStr) {
        const d = new Date(dateStr);
        const today = new Date();
        return d.toDateString() === today.toDateString();
    },

    daysFromNow(dateStr) {
        const d = new Date(dateStr);
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        d.setHours(0, 0, 0, 0);
        return Math.ceil((d - now) / (1000 * 60 * 60 * 24));
    },

    relativeDate(dateStr) {
        const days = this.daysFromNow(dateStr);
        if (days === 0) return 'Hoy';
        if (days === 1) return 'Mañana';
        if (days === -1) return 'Ayer';
        if (days > 0 && days <= 7) return `En ${days} días`;
        if (days < 0 && days >= -7) return `Hace ${Math.abs(days)} días`;
        return this.formatDateShort(dateStr);
    },

    // Nombres de cultivo legibles
    cultivoName(value) {
        const names = {
            'maiz-blanco': 'Maíz Blanco',
            'maiz-amarillo': 'Maíz Amarillo',
            'maiz-azul': 'Maíz Azul',
            'maiz-morado': 'Maíz Morado',
            'maiz-palomero': 'Maíz Palomero',
            'maiz-dulce': 'Maíz Dulce',
            'maiz-forrajero': 'Maíz Forrajero'
        };
        return names[value] || value || 'Sin cultivo';
    },

    sueloName(value) {
        const names = {
            'arcilloso': 'Arcilloso',
            'arenoso': 'Arenoso',
            'franco': 'Franco',
            'franco-arcilloso': 'Franco-arcilloso',
            'franco-arenoso': 'Franco-arenoso',
            'limoso': 'Limoso',
            'humifero': 'Humífero'
        };
        return names[value] || value || 'No especificado';
    },

    riegoName(value) {
        const names = {
            'temporal': 'Temporal',
            'goteo': 'Goteo',
            'aspersion': 'Aspersión',
            'surcos': 'Surcos',
            'pivote': 'Pivote'
        };
        return names[value] || value || 'No especificado';
    },

    activityIcon(tipo) {
        const icons = {
            'siembra': '🌱',
            'riego': '💧',
            'fertilizacion': '🧪',
            'fumigacion': '🔬',
            'deshierbe': '🌿',
            'cosecha': '🌽',
            'preparacion': '🚜',
            'otro': '📋'
        };
        return icons[tipo] || '📋';
    },

    activityName(tipo) {
        const names = {
            'siembra': 'Siembra',
            'riego': 'Riego',
            'fertilizacion': 'Fertilización',
            'fumigacion': 'Fumigación',
            'deshierbe': 'Deshierbe',
            'cosecha': 'Cosecha',
            'preparacion': 'Preparación',
            'otro': 'Otro'
        };
        return names[tipo] || tipo;
    },

    noteTypeIcon(tipo) {
        const icons = {
            'nota': '📝',
            'insumo': '📦',
            'plaga': '🐛',
            'produccion': '📊'
        };
        return icons[tipo] || '📝';
    },

    // Toast notifications
    showToast(message, type = 'info', duration = 3000) {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('toast-out');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },

    // Modal helpers
    openModal(id) {
        const modal = document.getElementById(id);
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    },

    closeModal(id) {
        const modal = document.getElementById(id);
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    },

    // Populate parcela selects
    updateParcelaSelects() {
        const parcelas = DB.getParcelas();
        const selects = [
            'climaParcelaSelect',
            'activityParcela',
            'noteParcela',
            'calParcelaFilter',
            'bitacoraParcelaFilter'
        ];

        selects.forEach(selectId => {
            const el = document.getElementById(selectId);
            if (!el) return;

            const currentVal = el.value;
            const isFilter = selectId.includes('Filter') || selectId === 'climaParcelaSelect';

            // Mantener solo la primera opción
            while (el.options.length > 1) el.remove(1);

            parcelas.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.nombre;
                el.appendChild(opt);
            });

            // Restaurar valor
            if (currentVal) el.value = currentVal;
        });
    },

    // Weather emoji
    weatherIcon(code) {
        if (code === 0) return '☀️';
        if (code <= 3) return '⛅';
        if (code <= 48) return '🌫️';
        if (code <= 55) return '🌦️';
        if (code <= 65) return '🌧️';
        if (code <= 67) return '🌨️';
        if (code <= 75) return '❄️';
        if (code <= 77) return '🌨️';
        if (code <= 82) return '🌧️';
        if (code <= 86) return '❄️';
        if (code <= 99) return '⛈️';
        return '🌤️';
    },

    weatherDesc(code) {
        if (code === 0) return 'Despejado';
        if (code <= 3) return 'Parcialmente nublado';
        if (code <= 48) return 'Niebla';
        if (code <= 55) return 'Llovizna';
        if (code <= 65) return 'Lluvia';
        if (code <= 67) return 'Lluvia helada';
        if (code <= 75) return 'Nieve';
        if (code <= 77) return 'Granizo';
        if (code <= 82) return 'Aguacero';
        if (code <= 86) return 'Nevada';
        if (code <= 99) return 'Tormenta eléctrica';
        return 'Variable';
    },

    dayNameShort(date) {
        return date.toLocaleDateString('es-MX', { weekday: 'short' }).toUpperCase();
    }
};

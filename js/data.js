/* ========================================
   AgroApp — Capa de datos (localStorage)
   ======================================== */

const DB = {
    KEYS: {
        PARCELAS: 'agroapp_parcelas',
        ACTIVITIES: 'agroapp_activities',
        NOTES: 'agroapp_notes',
        SETTINGS: 'agroapp_settings',
        WEATHER_CACHE: 'agroapp_weather_cache'
    },

    // --- Genéricos ---
    _get(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : [];
        } catch {
            return [];
        }
    },

    _set(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
    },

    _generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    },

    // --- Parcelas ---
    getParcelas() {
        return this._get(this.KEYS.PARCELAS);
    },

    saveParcela(parcela) {
        const parcelas = this.getParcelas();
        if (parcela.id) {
            const idx = parcelas.findIndex(p => p.id === parcela.id);
            if (idx !== -1) parcelas[idx] = { ...parcelas[idx], ...parcela, updatedAt: new Date().toISOString() };
        } else {
            parcela.id = this._generateId();
            parcela.createdAt = new Date().toISOString();
            parcela.updatedAt = new Date().toISOString();
            parcelas.push(parcela);
        }
        this._set(this.KEYS.PARCELAS, parcelas);
        return parcela;
    },

    deleteParcela(id) {
        const parcelas = this.getParcelas().filter(p => p.id !== id);
        this._set(this.KEYS.PARCELAS, parcelas);
        // También eliminar actividades y notas asociadas
        const activities = this.getActivities().filter(a => a.parcelaId !== id);
        this._set(this.KEYS.ACTIVITIES, activities);
        const notes = this.getNotes().filter(n => n.parcelaId !== id);
        this._set(this.KEYS.NOTES, notes);
    },

    getParcelaById(id) {
        return this.getParcelas().find(p => p.id === id);
    },

    // --- Actividades ---
    getActivities() {
        return this._get(this.KEYS.ACTIVITIES);
    },

    saveActivity(activity) {
        const activities = this.getActivities();
        if (activity.id) {
            const idx = activities.findIndex(a => a.id === activity.id);
            if (idx !== -1) activities[idx] = { ...activities[idx], ...activity };
        } else {
            activity.id = this._generateId();
            activity.completed = false;
            activity.createdAt = new Date().toISOString();
            activities.push(activity);
        }
        this._set(this.KEYS.ACTIVITIES, activities);
        return activity;
    },

    toggleActivityComplete(id) {
        const activities = this.getActivities();
        const idx = activities.findIndex(a => a.id === id);
        if (idx !== -1) {
            activities[idx].completed = !activities[idx].completed;
            this._set(this.KEYS.ACTIVITIES, activities);
        }
    },

    deleteActivity(id) {
        const activities = this.getActivities().filter(a => a.id !== id);
        this._set(this.KEYS.ACTIVITIES, activities);
    },

    getUpcomingActivities(days = 14) {
        const now = new Date();
        const limit = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        return this.getActivities()
            .filter(a => {
                const d = new Date(a.fecha);
                return d >= now && d <= limit && !a.completed;
            })
            .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    },

    // --- Notas / Bitácora ---
    getNotes() {
        return this._get(this.KEYS.NOTES);
    },

    saveNote(note) {
        const notes = this.getNotes();
        if (note.id) {
            const idx = notes.findIndex(n => n.id === note.id);
            if (idx !== -1) notes[idx] = { ...notes[idx], ...note };
        } else {
            note.id = this._generateId();
            note.createdAt = new Date().toISOString();
            notes.push(note);
        }
        this._set(this.KEYS.NOTES, notes);
        return note;
    },

    deleteNote(id) {
        const notes = this.getNotes().filter(n => n.id !== id);
        this._set(this.KEYS.NOTES, notes);
    },

    getNotesByType(tipo) {
        return this.getNotes().filter(n => n.tipo === tipo);
    },

    // --- Weather Cache ---
    getCachedWeather(lat, lng) {
        try {
            const cache = JSON.parse(localStorage.getItem(this.KEYS.WEATHER_CACHE) || '{}');
            const key = `${lat.toFixed(2)}_${lng.toFixed(2)}`;
            const entry = cache[key];
            if (entry && Date.now() - entry.timestamp < 30 * 60 * 1000) { // 30 min cache
                return entry.data;
            }
            return null;
        } catch {
            return null;
        }
    },

    setCachedWeather(lat, lng, data) {
        try {
            const cache = JSON.parse(localStorage.getItem(this.KEYS.WEATHER_CACHE) || '{}');
            const key = `${lat.toFixed(2)}_${lng.toFixed(2)}`;
            cache[key] = { data, timestamp: Date.now() };
            localStorage.setItem(this.KEYS.WEATHER_CACHE, JSON.stringify(cache));
        } catch { /* silent */ }
    },

    // --- Settings ---
    getSettings() {
        const defaults = { temperatureUnit: 'celsius', language: 'es' };
        try {
            const saved = JSON.parse(localStorage.getItem(this.KEYS.SETTINGS) || '{}');
            return { ...defaults, ...saved };
        } catch {
            return defaults;
        }
    },

    saveSettings(settings) {
        this._set(this.KEYS.SETTINGS, settings);
    }
};

/* ========================================
   AgroApp — Capa local y sincronización Supabase
   ======================================== */

const DB = {
    COLLECTIONS: ['parcelas', 'activities', 'notes', 'settings'],
    userId: null,
    supabase: null,
    syncPromise: null,
    onlineSyncListener: null,

    KEYS: {
        PARCELAS: 'agroapp_parcelas',
        ACTIVITIES: 'agroapp_activities',
        NOTES: 'agroapp_notes',
        SETTINGS: 'agroapp_settings',
        WEATHER_CACHE: 'agroapp_weather_cache'
    },

    initializeSupabase() {
        const config = window.SUPABASE_CONFIG || {};
        const url = (config.url || '').trim();
        const anonKey = (config.anonKey || '').trim();

        if (!url && !anonKey) return false;
        if (!url || !anonKey) {
            throw new Error('Configura la URL y la clave pública de Supabase en js/supabase-config.js.');
        }
        if (!window.supabase || typeof window.supabase.createClient !== 'function') {
            throw new Error('No se pudo cargar el cliente de Supabase. Revisa tu conexión a internet.');
        }

        this.supabase = window.supabase.createClient(url, anonKey);
        return true;
    },

    async restoreSession() {
        const { data, error } = await this.supabase.auth.getSession();
        if (error) throw error;
        if (!data.session) return false;
        await this.initializeUserData(data.session.user.id);
        return true;
    },

    async signIn(email, password) {
        const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await this.initializeUserData(data.user.id);
    },

    async signUp(email, password) {
        const { data, error } = await this.supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session) await this.initializeUserData(data.user.id);
        return Boolean(data.session);
    },

    async signOut() {
        await this._flushSyncQueue();
        const { error } = await this.supabase.auth.signOut();
        if (error) throw error;
        this.userId = null;
    },

    async initializeUserData(userId) {
        this.userId = userId;
        const { data, error } = await this.supabase
            .from('app_records')
            .select('collection, record_id, data')
            .eq('user_id', userId);
        if (error) throw error;

        let records = data || [];
        const migrationKey = `agroapp_migrated_${userId}`;
        if (records.length === 0 && localStorage.getItem(migrationKey) !== 'true') {
            if (localStorage.getItem('agroapp_legacy_migrated') !== 'true') {
                const legacyRecords = this._getLegacyRecords();
                if (legacyRecords.length > 0) {
                    const { error: migrationError } = await this.supabase
                        .from('app_records')
                        .upsert(legacyRecords.map(record => ({ ...record, user_id: userId })));
                    if (migrationError) {
                        this.userId = null;
                        throw migrationError;
                    }
                    records = legacyRecords;
                }
                localStorage.setItem('agroapp_legacy_migrated', 'true');
            }
            localStorage.setItem(migrationKey, 'true');
        } else if (records.length > 0) {
            localStorage.setItem('agroapp_legacy_migrated', 'true');
        }

        const pending = this._readStored(this._queueKey(), []);
        for (const collection of this.COLLECTIONS) {
            const collectionRecords = records.filter(record => record.collection === collection);
            for (const operation of pending.filter(item => item.collection === collection)) {
                const index = collectionRecords.findIndex(record => record.record_id === operation.record_id);
                if (operation.data === null) {
                    if (index !== -1) collectionRecords.splice(index, 1);
                } else if (index === -1) {
                    collectionRecords.push(operation);
                } else {
                    collectionRecords[index] = operation;
                }
            }
            if (collection === 'settings') {
                const setting = collectionRecords.find(record => record.record_id === 'app_settings');
                this._set(this.KEYS.SETTINGS, setting ? setting.data : {});
            } else {
                this._set(this.KEYS[this._keyName(collection)], collectionRecords.map(record => record.data));
            }
        }

        if (!this.onlineSyncListener) {
            this.onlineSyncListener = () => this._flushSyncQueue();
            window.addEventListener('online', this.onlineSyncListener);
        }
        await this._flushSyncQueue();
    },

    _keyName(collection) {
        return { parcelas: 'PARCELAS', activities: 'ACTIVITIES', notes: 'NOTES' }[collection];
    },

    _keyForUser(key) {
        return this.userId ? `${key}_${this.userId}` : key;
    },

    _getLegacyRecords() {
        const records = [];
        for (const collection of this.COLLECTIONS) {
            const values = collection === 'settings'
                ? this._readStored(this.KEYS.SETTINGS, {})
                : this._readStored(this.KEYS[this._keyName(collection)], []);
            if (collection === 'settings') {
                if (Object.keys(values).length > 0) {
                    records.push({ collection, record_id: 'app_settings', data: values });
                }
            } else {
                for (const value of values) {
                    if (value && value.id) {
                        records.push({ collection, record_id: String(value.id), data: value });
                    }
                }
            }
        }
        return records;
    },

    _readStored(key, fallback) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : fallback;
        } catch {
            return fallback;
        }
    },

    _syncRecord(collection, recordId, value) {
        if (!this.supabase || !this.userId) return;
        const queue = this._readStored(this._queueKey(), []);
        queue.push({
            id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
            collection,
            record_id: String(recordId),
            data: value
        });
        localStorage.setItem(this._queueKey(), JSON.stringify(queue));
        this._flushSyncQueue();
    },

    _queueKey() {
        return `agroapp_sync_queue_${this.userId}`;
    },

    _flushSyncQueue() {
        if (!this.supabase || !this.userId) return Promise.resolve();
        if (this.syncPromise) return this.syncPromise;

        this.syncPromise = (async () => {
            const queueKey = this._queueKey();
            while (true) {
                const queue = this._readStored(queueKey, []);
                if (queue.length === 0) return;
                const operation = queue[0];
                const request = operation.data === null
                    ? this.supabase.from('app_records').delete()
                        .eq('user_id', this.userId).eq('collection', operation.collection)
                        .eq('record_id', operation.record_id)
                    : this.supabase.from('app_records').upsert({
                        user_id: this.userId,
                        collection: operation.collection,
                        record_id: operation.record_id,
                        data: operation.data
                    }, { onConflict: 'user_id,collection,record_id' });

                try {
                    const { error } = await request;
                    if (error) {
                        this._reportSyncError(error);
                        return;
                    }
                    const remaining = this._readStored(queueKey, []).filter(item => item.id !== operation.id);
                    localStorage.setItem(queueKey, JSON.stringify(remaining));
                } catch (error) {
                    this._reportSyncError(error);
                    return;
                }
            }
        })().finally(() => {
            this.syncPromise = null;
        });
        return this.syncPromise;
    },

    _reportSyncError(error) {
        console.error('Error al sincronizar con Supabase:', error);
        if (typeof Utils !== 'undefined' && Utils.showToast) {
            Utils.showToast('No se pudieron sincronizar los datos. Se conservaron en este dispositivo.', 'error');
        }
    },

    // --- Genéricos ---
    _get(key) {
        try {
            const data = localStorage.getItem(this._keyForUser(key));
            return data ? JSON.parse(data) : [];
        } catch {
            return [];
        }
    },

    _set(key, data) {
        localStorage.setItem(this._keyForUser(key), JSON.stringify(data));
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
        this._syncRecord('parcelas', parcela.id, parcela);
        return parcela;
    },

    deleteParcela(id) {
        const parcelas = this.getParcelas().filter(p => p.id !== id);
        this._set(this.KEYS.PARCELAS, parcelas);
        this._syncRecord('parcelas', id, null);
        // También eliminar actividades y notas asociadas
        this.getActivities().filter(a => a.parcelaId === id).forEach(activity => this.deleteActivity(activity.id));
        this.getNotes().filter(n => n.parcelaId === id).forEach(note => this.deleteNote(note.id));
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
        this._syncRecord('activities', activity.id, activity);
        return activity;
    },

    toggleActivityComplete(id) {
        const activities = this.getActivities();
        const idx = activities.findIndex(a => a.id === id);
        if (idx !== -1) {
            activities[idx].completed = !activities[idx].completed;
            this._set(this.KEYS.ACTIVITIES, activities);
            this._syncRecord('activities', id, activities[idx]);
        }
    },

    deleteActivity(id) {
        const activities = this.getActivities().filter(a => a.id !== id);
        this._set(this.KEYS.ACTIVITIES, activities);
        this._syncRecord('activities', id, null);
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
        this._syncRecord('notes', note.id, note);
        return note;
    },

    deleteNote(id) {
        const notes = this.getNotes().filter(n => n.id !== id);
        this._set(this.KEYS.NOTES, notes);
        this._syncRecord('notes', id, null);
    },

    getNotesByType(tipo) {
        return this.getNotes().filter(n => n.tipo === tipo);
    },

    // --- Weather Cache ---
    getCachedWeather(lat, lng, allowStale = false) {
        try {
            const numLat = parseFloat(lat);
            const numLng = parseFloat(lng);
            if (isNaN(numLat) || isNaN(numLng)) return null;

            const cache = JSON.parse(localStorage.getItem(this.KEYS.WEATHER_CACHE) || '{}');
            const key = `${numLat.toFixed(2)}_${numLng.toFixed(2)}`;
            const entry = cache[key];
            if (!entry) return null;

            const maxAge = allowStale ? 48 * 60 * 60 * 1000 : 60 * 60 * 1000;
            if (Date.now() - entry.timestamp < maxAge) {
                return entry.data;
            }
            return null;
        } catch {
            return null;
        }
    },

    setCachedWeather(lat, lng, data) {
        try {
            const numLat = parseFloat(lat);
            const numLng = parseFloat(lng);
            if (isNaN(numLat) || isNaN(numLng)) return;

            const cache = JSON.parse(localStorage.getItem(this.KEYS.WEATHER_CACHE) || '{}');
            const key = `${numLat.toFixed(2)}_${numLng.toFixed(2)}`;
            cache[key] = { data, timestamp: Date.now() };
            localStorage.setItem(this.KEYS.WEATHER_CACHE, JSON.stringify(cache));
        } catch { /* silent */ }
    },

    // --- Settings ---
    getSettings() {
        const defaults = { temperatureUnit: 'celsius', language: 'es' };
        try {
            const saved = JSON.parse(localStorage.getItem(this._keyForUser(this.KEYS.SETTINGS)) || '{}');
            return { ...defaults, ...saved };
        } catch {
            return defaults;
        }
    },

    saveSettings(settings) {
        this._set(this.KEYS.SETTINGS, settings);
        this._syncRecord('settings', 'app_settings', settings);
    }
};

/* ========================================
   AgroApp — Módulo de Dashboard
   ======================================== */

const DashboardModule = {
    init() {
        this.refresh();
    },

    async refresh() {
        this.renderStats();
        this.renderActivities();
        await this.renderWeather();
        await this.renderAlerts();
    },

    renderStats() {
        const parcelas = DB.getParcelas();
        const activities = DB.getActivities();
        const upcoming = DB.getUpcomingActivities(7);
        const notes = DB.getNotes();

        const totalHa = parcelas.reduce((sum, p) => sum + (p.superficie || 0), 0);

        document.getElementById('statsRow').innerHTML = `
            <div class="stat-card">
                <div class="stat-icon">🌽</div>
                <div class="stat-value">${parcelas.length}</div>
                <div class="stat-label">Parcelas</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">📐</div>
                <div class="stat-value">${totalHa.toFixed(1)}</div>
                <div class="stat-label">Hectáreas</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">📅</div>
                <div class="stat-value">${upcoming.length}</div>
                <div class="stat-label">Pendientes</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">📓</div>
                <div class="stat-value">${notes.length}</div>
                <div class="stat-label">Registros</div>
            </div>
        `;
    },

    async renderWeather() {
        const container = document.getElementById('dashWeatherContent');
        const parcelas = DB.getParcelas();

        if (parcelas.length === 0) {
            container.innerHTML = '<div class="weather-placeholder"><p>Agrega una parcela para ver el clima</p></div>';
            return;
        }

        container.innerHTML = '<div class="weather-placeholder"><p>Cargando clima...</p></div>';

        try {
            const p = parcelas[0];
            const weather = await WeatherService.fetchWeather(p.lat, p.lng);
            if (!weather || !weather.current) {
                container.innerHTML = '<div class="weather-placeholder"><p>No se pudo obtener el clima</p></div>';
                return;
            }

            const current = weather.current;
            const icon = Utils.weatherIcon(current.weather_code);
            const desc = Utils.weatherDesc(current.weather_code);

            container.innerHTML = `
                <div class="weather-main">
                    <div>
                        <div class="weather-temp">${Math.round(current.temperature_2m)}°C</div>
                        <div class="weather-desc">${desc} • ${p.nombre}</div>
                    </div>
                    <div class="weather-icon-big">${icon}</div>
                </div>
                <div class="weather-details">
                    <div class="weather-detail">
                        <div class="weather-detail-value">${current.relative_humidity_2m}%</div>
                        <div class="weather-detail-label">Humedad</div>
                    </div>
                    <div class="weather-detail">
                        <div class="weather-detail-value">${current.wind_speed_10m} km/h</div>
                        <div class="weather-detail-label">Viento</div>
                    </div>
                    <div class="weather-detail">
                        <div class="weather-detail-value">${current.precipitation} mm</div>
                        <div class="weather-detail-label">Lluvia</div>
                    </div>
                </div>
            `;
        } catch (err) {
            container.innerHTML = '<div class="weather-placeholder"><p>Error al obtener clima</p></div>';
        }
    },

    renderActivities() {
        const container = document.getElementById('dashActivities');
        const upcoming = DB.getUpcomingActivities(14);

        if (upcoming.length === 0) {
            container.innerHTML = '<div class="empty-mini">Sin actividades próximas</div>';
            return;
        }

        container.innerHTML = upcoming.slice(0, 4).map(a => {
            const parcela = DB.getParcelaById(a.parcelaId);
            return `
                <div class="activity-item">
                    <div class="activity-item-icon">${Utils.activityIcon(a.tipo)}</div>
                    <div class="activity-item-content">
                        <div class="activity-item-title">${Utils.activityName(a.tipo)}</div>
                        <div class="activity-item-meta">${parcela ? parcela.nombre : ''}</div>
                    </div>
                    <div class="activity-item-date">${Utils.relativeDate(a.fecha)}</div>
                </div>
            `;
        }).join('');
    },

    async renderAlerts() {
        const container = document.getElementById('dashAlerts');
        const parcelas = DB.getParcelas();

        if (parcelas.length === 0) {
            container.innerHTML = '<div class="empty-mini">Sin alertas activas</div>';
            return;
        }

        const allAlerts = [];
        for (const p of parcelas) {
            try {
                const weather = await WeatherService.fetchWeather(p.lat, p.lng);
                if (weather) {
                    const alerts = WeatherService.generateAlerts(weather, p);
                    allAlerts.push(...alerts);
                }
            } catch { /* silent */ }
        }

        if (allAlerts.length === 0) {
            container.innerHTML = `
                <div class="alert-item alert-success">
                    <span class="alert-item-icon">✅</span>
                    <div class="alert-item-text">
                        <strong>Todo en orden</strong>
                        Sin alertas climáticas en los próximos días
                    </div>
                </div>
            `;
            return;
        }

        // Actualizar badge
        const badge = document.getElementById('notifBadge');
        badge.textContent = allAlerts.length;
        badge.classList.remove('hidden');

        const alertClass = {
            frost: 'alert-info',
            heat: 'alert-warning',
            rain: 'alert-info',
            storm: 'alert-danger',
            drought: 'alert-warning'
        };

        container.innerHTML = allAlerts.slice(0, 4).map(a => `
            <div class="alert-item ${alertClass[a.type] || 'alert-warning'}">
                <span class="alert-item-icon">${a.icon}</span>
                <div class="alert-item-text">
                    <strong>${a.parcela}</strong>
                    ${a.message.substring(2)}
                </div>
            </div>
        `).join('');
    }
};

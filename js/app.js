/* ========================================
   AgroApp — Controlador principal
   ======================================== */

const App = {
    currentPage: 'dashboard',

    init() {
        // Inicializar servicios
        if (typeof MapService !== 'undefined' && MapService.init) {
            MapService.init();
        }

        // Navegación inferior
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.navigate(tab.dataset.page);
            });
        });

        // Modal close buttons
        document.querySelectorAll('[data-close]').forEach(btn => {
            btn.addEventListener('click', () => {
                Utils.closeModal(btn.dataset.close);
            });
        });

        // Click fuera del modal para cerrar
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.classList.remove('active');
                    document.body.style.overflow = '';
                }
            });
        });

        // Clima: select parcela
        document.getElementById('climaParcelaSelect').addEventListener('change', (e) => {
            if (e.target.value) this.loadClima(e.target.value);
        });

        // Sugerencias: refresh
        document.getElementById('btnRefreshSugg').addEventListener('click', () => {
            this.loadSugerencias();
        });

        // Poblar selects
        Utils.updateParcelaSelects();

        // Inicializar módulos
        ParcelasModule.init();
        CalendarioModule.init();
        BitacoraModule.init();
        DashboardModule.init();

        // Inicializar mapas después de un frame
        requestAnimationFrame(() => {
            if (typeof MapService !== 'undefined') {
                MapService.createMap('dashboardMap', { zoomControl: false });
                MapService.updateMarkers('dashboardMap');

                // Pre-calentar mapa de parcelas en segundo plano para carga inmediata
                setTimeout(() => {
                    if (!MapService.maps['parcelasMap']) {
                        MapService.createMap('parcelasMap');
                        MapService.updateMarkers('parcelasMap');
                    }
                }, 300);
            }
        });

        // Ocultar splash
        setTimeout(() => {
            document.getElementById('splashScreen').classList.add('hidden');
        }, 1200);
    },

    navigate(page) {
        if (page === this.currentPage) return;
        this.currentPage = page;

        // Actualizar tabs
        document.querySelectorAll('.nav-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.page === page);
        });

        // Mostrar página
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const pageEl = document.getElementById(`page-${page}`);
        if (pageEl) pageEl.classList.add('active');

        // Scroll al top
        document.getElementById('appScroll').scrollTop = 0;

        // Actualizar header
        const titles = {
            dashboard: ['Dashboard', 'Resumen general'],
            parcelas: ['Mis Parcelas', 'Gestión de parcelas'],
            clima: ['Clima', 'Condiciones climáticas'],
            calendario: ['Agenda', 'Calendario de actividades'],
            bitacora: ['Bitácora', 'Registro de campo'],
            sugerencias: ['Sugerencias IA', 'Recomendaciones inteligentes']
        };

        const [title, subtitle] = titles[page] || ['AgroApp', ''];
        document.getElementById('headerTitle').textContent = title;
        document.getElementById('headerSubtitle').textContent = subtitle;

        // Acciones específicas por página
        if (page === 'parcelas') {
            requestAnimationFrame(() => {
                if (typeof MapService !== 'undefined') {
                    if (!MapService.maps['parcelasMap']) {
                        MapService.createMap('parcelasMap');
                    }
                    MapService.updateMarkers('parcelasMap');
                    MapService.invalidateSize('parcelasMap');
                }
            });
        }

        if (page === 'calendario') {
            Utils.updateParcelaSelects();
            CalendarioModule.render();
        }

        if (page === 'bitacora') {
            Utils.updateParcelaSelects();
            BitacoraModule.render();
        }

        if (page === 'sugerencias') {
            this.loadSugerencias();
        }

        if (page === 'clima') {
            Utils.updateParcelaSelects();
            const select = document.getElementById('climaParcelaSelect');
            if (select) {
                if (!select.value && select.options.length > 1) {
                    select.selectedIndex = 1;
                }
                if (select.value) {
                    this.loadClima(select.value);
                }
            }
        }

        if (page === 'dashboard') {
            if (typeof MapService !== 'undefined') {
                MapService.invalidateSize('dashboardMap');
                MapService.updateMarkers('dashboardMap');
            }
            DashboardModule.refresh();
        }
    },

    async loadClima(parcelaId) {
        const container = document.getElementById('climaContent');
        const parcela = DB.getParcelaById(parcelaId);
        if (!parcela) return;

        container.innerHTML = `
            <div class="ai-thinking">
                <div class="ai-dots"><span></span><span></span><span></span></div>
                <span>Cargando pronóstico para "${parcela.nombre}"...</span>
            </div>
        `;

        try {
            const coords = WeatherService.getParcelaCoords(parcela) || { lat: 20.6597, lng: -103.3496 };
            let weather = await WeatherService.fetchWeather(coords.lat, coords.lng);

            if (!weather || !weather.current) {
                weather = WeatherService.getSimulatedFallback(coords.lat, coords.lng);
            }

            const current = weather.current;
            const daily = weather.daily || {};
            const isFallback = !!weather.isFallback;

            let html = '<div class="clima-grid">';

            // Clima actual
            html += `
                <div class="clima-current">
                    <div class="clima-current-icon">${Utils.weatherIcon(current.weather_code)}</div>
                    <div class="clima-current-temp">${Math.round(current.temperature_2m)}°C</div>
                    <div class="clima-current-desc">${Utils.weatherDesc(current.weather_code)} • ${parcela.nombre}</div>
                    <div class="clima-current-details">
                        <div class="clima-detail-card">
                            <div class="clima-detail-card-icon">🌡️</div>
                            <div class="clima-detail-card-value">${Math.round(current.apparent_temperature || current.temperature_2m)}°C</div>
                            <div class="clima-detail-card-label">Sensación</div>
                        </div>
                        <div class="clima-detail-card">
                            <div class="clima-detail-card-icon">💧</div>
                            <div class="clima-detail-card-value">${current.relative_humidity_2m}%</div>
                            <div class="clima-detail-card-label">Humedad</div>
                        </div>
                        <div class="clima-detail-card">
                            <div class="clima-detail-card-icon">💨</div>
                            <div class="clima-detail-card-value">${Math.round(current.wind_speed_10m)} km/h</div>
                            <div class="clima-detail-card-label">Viento</div>
                        </div>
                        <div class="clima-detail-card">
                            <div class="clima-detail-card-icon">🌧️</div>
                            <div class="clima-detail-card-value">${current.precipitation || 0} mm</div>
                            <div class="clima-detail-card-label">Precipitación</div>
                        </div>
                    </div>
                </div>
            `;

            // Pronóstico 14 días
            if (daily && daily.time && daily.time.length > 0) {
                html += `
                    <div class="forecast-section">
                        <div class="forecast-title">Pronóstico 14 días</div>
                        <div class="forecast-scroll">
                            <div class="forecast-row">
                `;

                for (let i = 0; i < daily.time.length; i++) {
                    const date = new Date(daily.time[i] + 'T12:00:00');
                    const isToday = i === 0;
                    const maxT = daily.temperature_2m_max ? Math.round(daily.temperature_2m_max[i]) : '--';
                    const minT = daily.temperature_2m_min ? Math.round(daily.temperature_2m_min[i]) : '--';
                    const rain = daily.precipitation_sum ? daily.precipitation_sum[i] : 0;
                    const code = daily.weather_code ? daily.weather_code[i] : 1;

                    html += `
                        <div class="forecast-day ${isToday ? 'today' : ''}">
                            <div class="forecast-day-name">${isToday ? 'Hoy' : Utils.dayNameShort(date)}</div>
                            <div class="forecast-day-icon">${Utils.weatherIcon(code)}</div>
                            <div class="forecast-day-temp">${maxT}°</div>
                            <div class="forecast-day-temp-min">${minT}°</div>
                            ${rain > 0 ? `<div class="forecast-day-rain">💧${rain.toFixed(0)}mm</div>` : ''}
                        </div>
                    `;
                }

                html += `
                            </div>
                        </div>
                    </div>
                `;
            }

            // Alertas
            const alerts = WeatherService.generateAlerts(weather, parcela);
            if (alerts.length > 0) {
                html += `
                    <div class="forecast-section">
                        <div class="forecast-title">⚠️ Alertas Climáticas</div>
                        <div class="clima-alerts">
                `;

                const alertClassMap = {
                    frost: 'clima-alert-frost',
                    heat: 'clima-alert-heat',
                    rain: 'clima-alert-rain',
                    storm: 'clima-alert-rain',
                    drought: 'clima-alert-drought'
                };

                alerts.forEach(a => {
                    html += `
                        <div class="clima-alert ${alertClassMap[a.type] || ''}">
                            <span>${a.icon}</span>
                            <span>${a.message.substring(2)}</span>
                        </div>
                    `;
                });

                html += '</div></div>';
            }

            html += '</div>';
            container.innerHTML = html;

        } catch (err) {
            console.error('Error cargando clima:', err);
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🌤️</div>
                    <h3>Clima temporalmente no disponible</h3>
                    <p>Revisa tu conexión a internet</p>
                    <button class="btn btn-secondary btn-sm" onclick="App.loadClima('${parcelaId}')" style="margin-top:12px">
                        🔄 Reintentar
                    </button>
                </div>
            `;
        }
    },

    async loadSugerencias() {
        const container = document.getElementById('sugerenciasContent');
        const parcelas = DB.getParcelas();

        if (parcelas.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🤖</div>
                    <h3>Agrega parcelas primero</h3>
                    <p>Las sugerencias se generan según tus parcelas y clima</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="ai-thinking">
                <div class="ai-dots"><span></span><span></span><span></span></div>
                <span>Analizando tus parcelas...</span>
            </div>
        `;

        try {
            const suggestions = await SuggestionsEngine.generateSuggestions();

            if (suggestions.length === 0) {
                container.innerHTML = '<div class="empty-state"><div class="empty-icon">🤔</div><h3>Sin sugerencias</h3><p>Completa la información de tus parcelas</p></div>';
                return;
            }

            const typeClass = {
                siembra: 'sug-siembra',
                riego: 'sug-riego',
                plaga: 'sug-plaga',
                rotacion: 'sug-rotacion',
                general: 'sug-general'
            };

            const typeIcons = {
                siembra: '🌱',
                riego: '💧',
                plaga: '🐛',
                rotacion: '🔄',
                general: '🌍'
            };

            container.innerHTML = `
                <div class="suggestions-grid">
                    ${suggestions.map((s, i) => {
                        const confClass = s.confidence >= 75 ? 'high' : s.confidence >= 50 ? 'medium' : 'low';
                        return `
                            <div class="suggestion-card ${typeClass[s.type] || 'sug-general'}" style="animation-delay:${i * 0.08}s">
                                <div class="suggestion-header">
                                    <div class="suggestion-icon">${typeIcons[s.type] || '💡'}</div>
                                    <div>
                                        <div class="suggestion-title">${s.title}</div>
                                        <div class="suggestion-parcela">${s.parcela}</div>
                                    </div>
                                </div>
                                <div class="suggestion-body">${s.message.replace(/\n/g, '<br>')}</div>
                                <div class="suggestion-tags">
                                    ${s.tags.map(t => `<span class="suggestion-tag">${t}</span>`).join('')}
                                </div>
                                <div class="suggestion-confidence">
                                    <div class="confidence-bar">
                                        <div class="confidence-fill ${confClass}" style="width:${s.confidence}%"></div>
                                    </div>
                                    <span class="confidence-label">${s.confidence}% confianza</span>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        } catch (err) {
            console.error(err);
            container.innerHTML = '<div class="empty-state"><div class="empty-icon">❌</div><h3>Error</h3><p>No se pudieron generar sugerencias</p></div>';
        }
    }
};

// === INICIAR APP ===
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

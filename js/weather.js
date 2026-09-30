/* ========================================
   AgroApp — Servicio de clima (Open-Meteo API)
   API gratuita sin API key
   ======================================== */

const WeatherService = {
    BASE_URL: 'https://api.open-meteo.com/v1/forecast',

    async fetchWeather(lat, lng) {
        // Verificar caché
        const cached = DB.getCachedWeather(lat, lng);
        if (cached) return cached;

        try {
            const params = new URLSearchParams({
                latitude: lat,
                longitude: lng,
                current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure',
                daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset',
                hourly: 'temperature_2m,precipitation_probability,weather_code',
                timezone: 'auto',
                forecast_days: 14
            });

            const response = await fetch(`${this.BASE_URL}?${params}`);
            if (!response.ok) throw new Error('Error en la API de clima');

            const data = await response.json();
            DB.setCachedWeather(lat, lng, data);
            return data;
        } catch (error) {
            console.error('Error obteniendo clima:', error);
            return null;
        }
    },

    // Obtener clima actual de la primera parcela (para dashboard)
    async fetchFirstParcelaWeather() {
        const parcelas = DB.getParcelas();
        if (parcelas.length === 0) return null;
        const p = parcelas[0];
        return this.fetchWeather(p.lat, p.lng);
    },

    // Generar alertas climáticas basadas en el pronóstico
    generateAlerts(weatherData, parcela) {
        if (!weatherData || !weatherData.daily) return [];
        const alerts = [];
        const daily = weatherData.daily;

        for (let i = 0; i < Math.min(7, daily.time.length); i++) {
            const date = daily.time[i];
            const tempMin = daily.temperature_2m_min[i];
            const tempMax = daily.temperature_2m_max[i];
            const precip = daily.precipitation_sum[i];
            const precipProb = daily.precipitation_probability_max[i];
            const weatherCode = daily.weather_code[i];

            // Alerta de helada
            if (tempMin <= 2) {
                alerts.push({
                    type: 'frost',
                    severity: tempMin <= 0 ? 'alta' : 'media',
                    date,
                    message: `⚠️ Riesgo de helada el ${Utils.formatDateShort(date)}. Temperatura mínima: ${tempMin}°C`,
                    icon: '🥶',
                    parcela: parcela.nombre
                });
            }

            // Alerta de calor extremo
            if (tempMax >= 38) {
                alerts.push({
                    type: 'heat',
                    severity: tempMax >= 42 ? 'alta' : 'media',
                    date,
                    message: `🌡️ Calor extremo el ${Utils.formatDateShort(date)}. Máxima: ${tempMax}°C. Considere riego adicional.`,
                    icon: '🔥',
                    parcela: parcela.nombre
                });
            }

            // Alerta de lluvia fuerte
            if (precip >= 20) {
                alerts.push({
                    type: 'rain',
                    severity: precip >= 40 ? 'alta' : 'media',
                    date,
                    message: `🌧️ Lluvia fuerte esperada el ${Utils.formatDateShort(date)}: ${precip}mm. ${precip >= 40 ? 'Riesgo de inundación.' : 'Ajuste su plan de riego.'}`,
                    icon: '🌧️',
                    parcela: parcela.nombre
                });
            }

            // Alerta de tormenta
            if (weatherCode >= 95) {
                alerts.push({
                    type: 'storm',
                    severity: 'alta',
                    date,
                    message: `⛈️ Tormenta eléctrica pronosticada para ${Utils.formatDateShort(date)}. Evite actividades de campo.`,
                    icon: '⛈️',
                    parcela: parcela.nombre
                });
            }
        }

        // Verificar sequía (sin lluvia por +5 días)
        let dryDays = 0;
        for (let i = 0; i < Math.min(7, daily.time.length); i++) {
            if (daily.precipitation_sum[i] < 1) dryDays++;
        }
        if (dryDays >= 5) {
            alerts.push({
                type: 'drought',
                severity: dryDays >= 7 ? 'alta' : 'media',
                date: daily.time[0],
                message: `🏜️ ${dryDays} días sin lluvia significativa pronosticados. Aumente la frecuencia de riego.`,
                icon: '☀️',
                parcela: parcela.nombre
            });
        }

        return alerts;
    }
};

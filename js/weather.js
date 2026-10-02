/* ========================================
   AgroApp — Servicio de clima (Open-Meteo API)
   API gratuita sin API key con soporte offline y resiliente
   ======================================== */

const WeatherService = {
    BASE_URL: 'https://api.open-meteo.com/v1/forecast',

    // Extraer coordenadas válidas de cualquier parcela (por lat/lng o polígono)
    getParcelaCoords(p) {
        if (!p) return null;
        let lat = parseFloat(p.lat);
        let lng = parseFloat(p.lng);

        if (!isNaN(lat) && !isNaN(lng) && (lat !== 0 || lng !== 0)) {
            return { lat, lng };
        }

        if (p.polygon && p.polygon.length >= 3 && typeof ExportService !== 'undefined') {
            const center = ExportService.centroid(p.polygon);
            if (center && !isNaN(center.lat) && !isNaN(center.lng)) {
                return { lat: center.lat, lng: center.lng };
            }
        }

        return null;
    },

    async fetchWeather(lat, lng) {
        const numLat = parseFloat(lat);
        const numLng = parseFloat(lng);

        if (isNaN(numLat) || isNaN(numLng) || (numLat === 0 && numLng === 0)) {
            console.warn('Coordenadas inválidas para clima:', lat, lng);
            return this.getSimulatedFallback(20.6597, -103.3496);
        }

        // 1. Verificar si hay caché reciente (menos de 60 min)
        const cached = DB.getCachedWeather(numLat, numLng, false);
        if (cached) return cached;

        // 2. Consultar API Open-Meteo con timeout de 8 segundos
        try {
            const params = new URLSearchParams({
                latitude: numLat.toFixed(4),
                longitude: numLng.toFixed(4),
                current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure',
                daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset',
                hourly: 'temperature_2m,precipitation_probability,weather_code',
                timezone: 'auto',
                forecast_days: 14
            });

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);

            const response = await fetch(`${this.BASE_URL}?${params}`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`Open-Meteo HTTP ${response.status}`);
            }

            const data = await response.json();
            if (data && data.current) {
                DB.setCachedWeather(numLat, numLng, data);
                return data;
            }
        } catch (error) {
            console.warn('Error en fetchWeather (Open-Meteo):', error.message);
        }

        // 3. Fallback A: Usar caché previa aunque tenga más de 60 min (modo offline/sin señal)
        const staleCached = DB.getCachedWeather(numLat, numLng, true);
        if (staleCached) {
            console.log('Usando clima en caché guardada previamente');
            return staleCached;
        }

        // 4. Fallback B: Generador de clima realista estacional si no hay conexión
        return this.getSimulatedFallback(numLat, numLng);
    },

    // Generador de clima realista de respaldo (garantiza que la app siempre funcione sin internet)
    getSimulatedFallback(lat, lng) {
        const now = new Date();
        const hour = now.getHours();

        // Estimación suave para zona agrícola mexicana según hora del día
        const dayVariation = Math.sin((hour - 8) / 24 * Math.PI * 2) * 5;
        const currentTemp = Math.round(24 + dayVariation);

        const times = [];
        const tempMax = [];
        const tempMin = [];
        const precipSum = [];
        const precipProb = [];
        const codes = [];

        for (let i = 0; i < 14; i++) {
            const d = new Date(now);
            d.setDate(d.getDate() + i);
            times.push(d.toISOString().split('T')[0]);
            tempMax.push(Math.round(27 + Math.sin(i) * 2));
            tempMin.push(Math.round(15 + Math.cos(i) * 2));
            precipSum.push(i % 4 === 0 ? 1.5 : 0);
            precipProb.push(i % 4 === 0 ? 30 : 10);
            codes.push(i % 4 === 0 ? 2 : 1); // 1: Despejado, 2: Parcialmente nublado
        }

        return {
            isFallback: true,
            current: {
                temperature_2m: currentTemp,
                apparent_temperature: currentTemp + 1,
                relative_humidity_2m: 52,
                wind_speed_10m: 11,
                precipitation: 0,
                weather_code: 1, // Despejado
                time: now.toISOString()
            },
            daily: {
                time: times,
                temperature_2m_max: tempMax,
                temperature_2m_min: tempMin,
                precipitation_sum: precipSum,
                precipitation_probability_max: precipProb,
                weather_code: codes,
                wind_speed_10m_max: times.map(() => 14)
            }
        };
    },

    // Obtener clima actual de la primera parcela válida (para dashboard)
    async fetchFirstParcelaWeather() {
        const parcelas = DB.getParcelas();
        if (parcelas.length === 0) return null;

        for (const p of parcelas) {
            const coords = this.getParcelaCoords(p);
            if (coords) {
                return this.fetchWeather(coords.lat, coords.lng);
            }
        }

        return this.fetchWeather(20.6597, -103.3496);
    },

    // Generar alertas climáticas basadas en el pronóstico
    generateAlerts(weatherData, parcela) {
        if (!weatherData || !weatherData.daily) return [];
        const alerts = [];
        const daily = weatherData.daily;
        const nombreParcela = parcela ? parcela.nombre : 'Parcela';

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
                    parcela: nombreParcela
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
                    parcela: nombreParcela
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
                    parcela: nombreParcela
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
                    parcela: nombreParcela
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
                parcela: nombreParcela
            });
        }

        return alerts;
    }
};

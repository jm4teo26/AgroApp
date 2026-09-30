/* ========================================
   AgroApp — Motor de sugerencias inteligentes
   Basado en clima, suelo, cultivo y calendario
   ======================================== */

const SuggestionsEngine = {

    // Datos de referencia para maíz
    CORN_DATA: {
        tempOptMin: 18,
        tempOptMax: 32,
        tempAbsMin: 10,
        tempAbsMax: 40,
        germinationTemp: 12,
        waterNeedDaily: 5, // mm/día promedio
        growingDays: { min: 90, max: 150 },
        stages: {
            germinacion: { days: [0, 10], waterFactor: 0.6 },
            vegetativo: { days: [10, 40], waterFactor: 0.8 },
            floracion: { days: [40, 70], waterFactor: 1.2 },
            llenado: { days: [70, 110], waterFactor: 1.0 },
            maduracion: { days: [110, 140], waterFactor: 0.5 }
        },
        // Plagas comunes por condición
        pests: {
            hot_humid: ['Gusano cogollero', 'Roya del maíz', 'Tizón foliar'],
            hot_dry: ['Araña roja', 'Trips', 'Gusano elotero'],
            cool_humid: ['Fusarium', 'Carbón del maíz', 'Mancha de asfalto'],
            cool_dry: ['Pulgón del maíz']
        },
        // Rotación recomendada
        rotation: ['frijol', 'calabaza', 'avena', 'sorgo', 'girasol', 'soya']
    },

    // Factores de suelo para riego
    SOIL_WATER: {
        'arcilloso': { retention: 'alta', drainage: 'baja', irrigationFactor: 0.7, desc: 'Retiene mucha agua pero drena lento. Riesgo de encharcamiento.' },
        'arenoso': { retention: 'baja', drainage: 'alta', irrigationFactor: 1.4, desc: 'Drena rápido, necesita riego más frecuente pero en menor cantidad.' },
        'franco': { retention: 'media', drainage: 'media', irrigationFactor: 1.0, desc: 'Ideal para maíz. Balance perfecto de retención y drenaje.' },
        'franco-arcilloso': { retention: 'alta', drainage: 'media', irrigationFactor: 0.85, desc: 'Buena retención con drenaje aceptable.' },
        'franco-arenoso': { retention: 'media', drainage: 'alta', irrigationFactor: 1.2, desc: 'Buen drenaje pero necesita riego más frecuente.' },
        'limoso': { retention: 'alta', drainage: 'baja', irrigationFactor: 0.8, desc: 'Fértil pero puede compactarse. Evite el exceso de agua.' },
        'humifero': { retention: 'alta', drainage: 'media', irrigationFactor: 0.9, desc: 'Muy fértil con excelente estructura. Ideal.' }
    },

    async generateSuggestions() {
        const parcelas = DB.getParcelas();
        if (parcelas.length === 0) return [];

        const suggestions = [];
        const today = new Date();
        const month = today.getMonth(); // 0-11

        for (const parcela of parcelas) {
            // Obtener clima
            let weather = null;
            try {
                weather = await WeatherService.fetchWeather(parcela.lat, parcela.lng);
            } catch { /* sin clima */ }

            const suelo = this.SOIL_WATER[parcela.suelo] || this.SOIL_WATER['franco'];
            const currentTemp = weather?.current?.temperature_2m || 25;
            const currentHumidity = weather?.current?.relative_humidity_2m || 50;

            // 1. Sugerencia de SIEMBRA
            suggestions.push(this._getSiembraSuggestion(parcela, weather, month, currentTemp));

            // 2. Sugerencia de RIEGO
            suggestions.push(this._getRiegoSuggestion(parcela, weather, suelo, currentTemp));

            // 3. Sugerencia de PLAGAS
            suggestions.push(this._getPlagaSuggestion(parcela, weather, currentTemp, currentHumidity));

            // 4. Sugerencia de ROTACIÓN
            if (parcela.cultivo) {
                suggestions.push(this._getRotacionSuggestion(parcela));
            }

            // 5. Sugerencia GENERAL según suelo
            suggestions.push(this._getSueloSuggestion(parcela, suelo));
        }

        return suggestions.filter(s => s !== null);
    },

    _getSiembraSuggestion(parcela, weather, month, temp) {
        const corn = this.CORN_DATA;
        let confidence, message, tags = [];

        // Meses ideales para siembra de maíz en México: marzo-junio (primavera-verano)
        const idealMonths = [2, 3, 4, 5]; // mar-jun
        const secondaryMonths = [6, 7]; // jul-ago
        const isIdealMonth = idealMonths.includes(month);
        const isSecondaryMonth = secondaryMonths.includes(month);

        if (isIdealMonth && temp >= corn.germinationTemp && temp <= corn.tempOptMax) {
            confidence = 90;
            message = `🟢 EXCELENTE momento para sembrar maíz en "${parcela.nombre}". `;
            message += `La temperatura actual (${temp}°C) está dentro del rango óptimo (${corn.tempOptMin}-${corn.tempOptMax}°C). `;

            if (weather?.daily) {
                const next3DaysRain = weather.daily.precipitation_sum.slice(0, 3).reduce((a, b) => a + b, 0);
                if (next3DaysRain > 5) {
                    message += `Se esperan lluvias los próximos días (${next3DaysRain.toFixed(0)}mm), lo cual favorece la germinación.`;
                    confidence = 95;
                } else {
                    message += `Asegure riego después de la siembra ya que no se esperan lluvias significativas.`;
                }
            }
            tags = ['Siembra óptima', 'Temporada ideal', `${temp}°C`];
        } else if (isSecondaryMonth && temp >= corn.germinationTemp) {
            confidence = 65;
            message = `🟡 Aún viable para siembra en "${parcela.nombre}". `;
            message += `Estamos en temporada secundaria. El maíz necesita al menos ${corn.growingDays.min} días antes de las heladas.`;
            tags = ['Siembra tardía', 'Viable con riesgo'];
        } else if (temp < corn.germinationTemp) {
            confidence = 20;
            message = `🔴 NO recomendable sembrar ahora en "${parcela.nombre}". `;
            message += `La temperatura (${temp}°C) está por debajo del mínimo de germinación (${corn.germinationTemp}°C). `;
            message += `Espere a que la temperatura suba consistentemente por encima de ${corn.tempOptMin}°C.`;
            tags = ['No sembrar', 'Temperatura baja'];
        } else {
            confidence = 40;
            message = `🟡 Fuera de temporada ideal para siembra en "${parcela.nombre}". `;
            message += `La mejor época es de marzo a junio. Temperatura actual: ${temp}°C.`;
            tags = ['Fuera de temporada'];
        }

        return {
            type: 'siembra',
            parcela: parcela.nombre,
            parcelaId: parcela.id,
            title: 'Recomendación de Siembra',
            message,
            confidence,
            tags
        };
    },

    _getRiegoSuggestion(parcela, weather, suelo, temp) {
        const corn = this.CORN_DATA;
        let waterNeed = corn.waterNeedDaily * suelo.irrigationFactor;
        let confidence = 75;
        let message = '';
        let tags = [];

        // Ajustar por temperatura
        if (temp > 35) waterNeed *= 1.3;
        else if (temp > 30) waterNeed *= 1.15;
        else if (temp < 15) waterNeed *= 0.6;

        let rainfallExpected = 0;
        if (weather?.daily) {
            rainfallExpected = weather.daily.precipitation_sum.slice(0, 3).reduce((a, b) => a + b, 0);
        }

        const dailyNeed = waterNeed.toFixed(1);
        const weeklyNeed = (waterNeed * 7).toFixed(0);

        if (rainfallExpected >= waterNeed * 3) {
            confidence = 85;
            message = `💧 Se esperan ${rainfallExpected.toFixed(0)}mm de lluvia en los próximos 3 días para "${parcela.nombre}". `;
            message += `NO es necesario regar. El cultivo necesita aprox. ${dailyNeed}mm/día (${weeklyNeed}mm/semana). `;
            if (suelo.drainage === 'baja') {
                message += `⚠️ Con suelo ${parcela.suelo}, vigile encharcamientos.`;
            }
            tags = ['Sin riego necesario', 'Lluvia esperada', `${rainfallExpected.toFixed(0)}mm`];
        } else if (rainfallExpected > 0) {
            confidence = 70;
            message = `💧 Riego complementario recomendado para "${parcela.nombre}". `;
            message += `Se esperan ${rainfallExpected.toFixed(0)}mm pero se necesitan aprox. ${(waterNeed * 3).toFixed(0)}mm en 3 días. `;
            message += `Aplique ${(waterNeed * 3 - rainfallExpected).toFixed(0)}mm adicionales. `;
            message += suelo.desc;
            tags = ['Riego parcial', `${dailyNeed}mm/día`, suelo.retention + ' retención'];
        } else {
            confidence = 90;
            message = `💧 RIEGO NECESARIO para "${parcela.nombre}". `;
            message += `No se espera lluvia y el cultivo necesita ${dailyNeed}mm/día. `;
            if (parcela.riego === 'temporal') {
                message += `⚠️ Su parcela depende de temporal. Considere riego de emergencia. `;
            }
            message += `Tipo de suelo ${parcela.suelo}: ${suelo.desc}`;
            tags = ['Riego urgente', `${dailyNeed}mm/día`, 'Sin lluvia'];
        }

        // Hora de riego recomendada
        message += ` 🕐 Mejor hora de riego: temprano (6-8 AM) o al atardecer (5-7 PM) para minimizar evaporación.`;

        return {
            type: 'riego',
            parcela: parcela.nombre,
            parcelaId: parcela.id,
            title: 'Plan de Riego',
            message,
            confidence,
            tags
        };
    },

    _getPlagaSuggestion(parcela, weather, temp, humidity) {
        const corn = this.CORN_DATA;
        let condition;
        let confidence = 60;
        let message = '';
        let tags = [];

        if (temp > 28 && humidity > 70) {
            condition = 'hot_humid';
            confidence = 80;
        } else if (temp > 28 && humidity <= 70) {
            condition = 'hot_dry';
            confidence = 65;
        } else if (temp <= 28 && humidity > 70) {
            condition = 'cool_humid';
            confidence = 70;
        } else {
            condition = 'cool_dry';
            confidence = 50;
        }

        const pests = corn.pests[condition];
        message = `🐛 Alerta de plagas para "${parcela.nombre}". `;
        message += `Con ${temp}°C y ${humidity}% de humedad, las plagas más probables son:\n\n`;
        pests.forEach((pest, i) => {
            message += `• ${pest}\n`;
        });
        message += `\nRevise su cultivo frecuentemente y actúe al primer signo de infestación.`;

        if (condition === 'hot_humid') {
            message += ` Las condiciones cálidas y húmedas son las más favorables para plagas.`;
            tags = ['Riesgo alto', 'Calor + humedad', ...pests];
        } else if (condition === 'hot_dry') {
            message += ` El calor seco favorece ácaros y trips. Mantenga la humedad del follaje.`;
            tags = ['Riesgo medio', 'Calor seco', ...pests];
        } else {
            tags = ['Monitorear', `${temp}°C / ${humidity}%`, ...pests];
        }

        return {
            type: 'plaga',
            parcela: parcela.nombre,
            parcelaId: parcela.id,
            title: 'Alerta de Plagas',
            message,
            confidence,
            tags
        };
    },

    _getRotacionSuggestion(parcela) {
        const corn = this.CORN_DATA;
        const rotOptions = corn.rotation;
        const message = `🔄 Para "${parcela.nombre}" con ${Utils.cultivoName(parcela.cultivo)}, se recomienda rotar con:\n\n` +
            rotOptions.map((c, i) => `${i + 1}. ${c.charAt(0).toUpperCase() + c.slice(1)}`).join('\n') +
            `\n\nLa rotación mejora la fertilidad del suelo, rompe ciclos de plagas y reduce la necesidad de fertilizantes. ` +
            `Ideal: no repetir maíz en la misma parcela por más de 2 temporadas seguidas.`;

        return {
            type: 'rotacion',
            parcela: parcela.nombre,
            parcelaId: parcela.id,
            title: 'Rotación de Cultivos',
            message,
            confidence: 85,
            tags: ['Siguiente ciclo', ...rotOptions.slice(0, 3)]
        };
    },

    _getSueloSuggestion(parcela, suelo) {
        if (!parcela.suelo) return null;

        const recommendations = {
            'arcilloso': 'Mejore el drenaje con materia orgánica. Evite trabajar el suelo cuando está muy húmedo. Acolchado (mulch) ayuda a prevenir costras.',
            'arenoso': 'Aplique materia orgánica abundante para mejorar retención de agua y nutrientes. Riego frecuente en pequeñas dosis. Fertilice con mayor frecuencia.',
            'franco': 'Suelo ideal para maíz. Mantenga niveles de materia orgánica con abono verde. Rotación de cultivos para mantener la fertilidad.',
            'franco-arcilloso': 'Buen suelo con tendencia a compactarse. Evite tráfico pesado y mantenga cobertura vegetal entre ciclos.',
            'franco-arenoso': 'Buena estructura pero pierde nutrientes. Aplique fertilizante fraccionado (en varias dosis) en lugar de una sola aplicación.',
            'limoso': 'Muy fértil pero erosionable. Use cobertura vegetal y evite dejarlo descubierto. Riesgo de compactación.',
            'humifero': 'Excelente fertilidad natural. Minimice fertilizantes químicos. Ideal para producción orgánica.'
        };

        return {
            type: 'general',
            parcela: parcela.nombre,
            parcelaId: parcela.id,
            title: `Manejo de Suelo ${Utils.sueloName(parcela.suelo)}`,
            message: `🌱 Recomendaciones para suelo ${parcela.suelo} en "${parcela.nombre}":\n\n${recommendations[parcela.suelo] || 'Realice un análisis de suelo para obtener recomendaciones específicas.'}`,
            confidence: 80,
            tags: [parcela.suelo, suelo.retention + ' retención', suelo.drainage + ' drenaje']
        };
    }
};

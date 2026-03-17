const config = require('./config');

const knownEntities = new Set();

async function haFetch(url, options = {}) {
    if (!config.ha.token) {
        console.error('[HA] Token non configure');
        return null;
    }
    const resp = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${config.ha.token}`,
            'Content-Type': 'application/json',
            ...options.headers
        }
    });
    if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    }
    return resp.json();
}

async function updateEntity(entityId, state, attributes = {}) {
    try {
        const data = await haFetch(`${config.ha.host}/api/states/${entityId}`, {
            method: 'POST',
            body: JSON.stringify({ state: String(state), attributes })
        });
        console.log(`[HA] ${entityId} = ${state}`);
        return data;
    } catch (err) {
        console.error(`[HA] Erreur update ${entityId}:`, err.message);
    }
}

function detectSensorType(sensorId) {
    if (sensorId.includes('temp')) return { deviceClass: 'temperature', unit: '\u00b0C' };
    if (sensorId.includes('humid')) return { deviceClass: 'humidity', unit: '%' };
    if (sensorId.includes('light')) return { deviceClass: 'illuminance', unit: 'lx' };
    if (sensorId.includes('pressure')) return { deviceClass: 'pressure', unit: 'hPa' };
    if (sensorId.includes('batt')) return { deviceClass: 'battery', unit: '%' };
    return { deviceClass: null, unit: '' };
}

async function ensureEntity(sensorId, friendlyName, deviceClass, unit) {
    const entityId = `sensor.${sensorId}`;
    if (knownEntities.has(entityId)) return;

    try {
        const resp = await fetch(`${config.ha.host}/api/states/${entityId}`, {
            headers: { 'Authorization': `Bearer ${config.ha.token}` }
        });
        if (resp.status === 404) {
            console.log(`[HA] Creation entite ${entityId}`);
            const attrs = { friendly_name: friendlyName, state_class: 'measurement' };
            if (deviceClass) attrs.device_class = deviceClass;
            if (unit) attrs.unit_of_measurement = unit;
            await updateEntity(entityId, 'unknown', attrs);
        }
        knownEntities.add(entityId);
    } catch (err) {
        console.error(`[HA] Erreur creation ${entityId}:`, err.message);
    }
}

async function processSensorData(data, state) {
    const { deviceClass, unit } = detectSensorType(data.sensor_id);
    await ensureEntity(
        data.sensor_id,
        data.friendly_name || `Capteur ${data.sensor_id}`,
        deviceClass,
        data.unit || unit
    );
    await updateEntity(`sensor.${data.sensor_id}`, data.value, {
        last_update: new Date().toISOString(),
        raw_value: data.value
    });
    if (state) {
        state.updateSensor(data.sensor_id, data.value, { deviceClass, unit: data.unit || unit });
    }
}

async function processBinarySensorData(data, state) {
    const entityId = `binary_sensor.${data.sensor_id}`;
    if (!knownEntities.has(entityId)) {
        await ensureEntity(data.sensor_id, data.friendly_name || `Capteur ${data.sensor_id}`, data.device_class || null, '');
        knownEntities.add(entityId);
    }
    const stateValue = data.state ? 'on' : 'off';
    await updateEntity(entityId, stateValue, { last_update: new Date().toISOString() });
    if (state) {
        state.updateSensor(data.sensor_id, stateValue, { type: 'binary' });
    }
}

module.exports = { updateEntity, ensureEntity, processSensorData, processBinarySensorData, detectSensorType };

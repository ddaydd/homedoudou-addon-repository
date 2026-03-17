const EventEmitter = require('events');

class StateManager extends EventEmitter {
    constructor() {
        super();
        this.devices = new Map();       // deviceId -> WebSocket
        this.sensors = new Map();       // sensorId -> { value, attributes, updatedAt }
        this.ddpStatus = 'disconnected'; // disconnected | connecting | connected
        this.oledStatus = 'disabled';    // disabled | running | error
        this.startedAt = Date.now();
    }

    // --- Devices Arduino ---
    addDevice(deviceId, ws) {
        this.devices.set(deviceId, ws);
        this.emit('change', { type: 'device_add', deviceId });
    }

    removeDevice(deviceId) {
        this.devices.delete(deviceId);
        this.emit('change', { type: 'device_remove', deviceId });
    }

    getDeviceIds() {
        return Array.from(this.devices.keys());
    }

    getDeviceWs(deviceId) {
        return this.devices.get(deviceId);
    }

    // --- Capteurs ---
    updateSensor(sensorId, value, attributes = {}) {
        this.sensors.set(sensorId, {
            value,
            attributes,
            updatedAt: new Date().toISOString()
        });
        this.emit('change', { type: 'sensor_update', sensorId, value });
    }

    getSensors() {
        const result = {};
        for (const [id, data] of this.sensors) {
            result[id] = data;
        }
        return result;
    }

    // --- Status global ---
    setDdpStatus(status) {
        this.ddpStatus = status;
        this.emit('change', { type: 'ddp_status', status });
    }

    setOledStatus(status) {
        this.oledStatus = status;
        this.emit('change', { type: 'oled_status', status });
    }

    getStatus() {
        return {
            uptime: Math.floor((Date.now() - this.startedAt) / 1000),
            devices: this.getDeviceIds(),
            deviceCount: this.devices.size,
            sensorCount: this.sensors.size,
            sensors: this.getSensors(),
            ddp: this.ddpStatus,
            oled: this.oledStatus
        };
    }
}

module.exports = StateManager;

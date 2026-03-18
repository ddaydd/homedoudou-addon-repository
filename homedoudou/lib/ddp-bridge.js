const WebSocket = require('ws');

class DDPBridge {
    constructor(config, state, haApi) {
        this.config = config;
        this.state = state;
        this.haApi = haApi;
        this.client = null;
        this.connected = false;
        this.methodId = 1;
        this.aliveCounter = 0;
        this.reconnectDelay = 5000;
        this.maxReconnectDelay = 60000;
        this.reconnectTimer = null;
    }

    connect() {
        if (!this.config.ddp.enabled || !this.config.ddp.hardId) {
            console.log('[DDP] Desactive ou hardId manquant');
            return;
        }

        this.state.setDdpStatus('connecting');
        console.log(`[DDP] Connexion a ${this.config.ddp.endpoint}...`);

        try {
            this.client = new WebSocket(this.config.ddp.endpoint);
        } catch (err) {
            console.error('[DDP] Erreur creation WebSocket:', err.message);
            this.scheduleReconnect();
            return;
        }

        this.client.on('open', () => {
            console.log('[DDP] Connecte');
            this.reconnectDelay = 5000;
            this.send({
                msg: 'connect',
                version: '1',
                support: ['1', 'pre2', 'pre1']
            });
        });

        this.client.on('message', (raw) => {
            try {
                const data = JSON.parse(raw);
                this.handleMessage(data);
            } catch (err) {
                console.error('[DDP] Erreur parse:', err.message);
            }
        });

        this.client.on('close', () => {
            console.log('[DDP] Deconnecte');
            this.connected = false;
            this.state.setDdpStatus('disconnected');
            this.scheduleReconnect();
        });

        this.client.on('error', (err) => {
            console.error('[DDP] Erreur:', err.message);
        });
    }

    handleMessage(data) {
        switch (data.msg) {
            case 'connected':
                this.connected = true;
                this.state.setDdpStatus('connected');
                console.log(`[DDP] Session ${data.session}`);
                // Identification aupres de HomeDoudou
                this.sendToHMD('connexion', 'hard_id', this.config.ddp.hardId);
                this.sendToHMD('boot', 'version', '2.0.0');
                // Souscrire aux keys du hardware apres identification
                this.subscribe('hardwareKeys');
                break;

            case 'ping':
                this.send({ msg: 'pong', id: data.id });
                this.aliveCounter++;
                // Heartbeat toutes les 10 pings (~5 min)
                if (this.aliveCounter % 10 === 0) {
                    this.sendToHMD('archive', 'vivant', '1');
                }
                break;

            case 'changed':
                // Reception d'un changement de donnee depuis Meteor
                this.handleChanged(data);
                break;

            case 'result':
                // Resultat d'un appel de methode
                if (data.error) {
                    console.error('[DDP] Erreur methode:', data.error);
                }
                break;

            case 'added':
                // Document ajoute via subscription
                this.handleAdded(data);
                break;
        }
    }

    // Normalise un ID pour HA : minuscules, sans accents, espaces/special -> underscore
    sanitizeId(str) {
        return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    }

    handleChanged(data) {
        // Quand une Key change dans Meteor, on peut mettre a jour HA
        if (data.collection === 'configCle' && data.fields) {
            const fields = data.fields;
            if (fields.lastData && fields.lastData.value !== undefined) {
                const rawId = fields.alias || data.id;
                const sensorId = this.sanitizeId(rawId);
                console.log(`[DDP] Key change: ${rawId} = ${fields.lastData.value}`);
                this.haApi.updateEntity(`sensor.hmd_${sensorId}`, fields.lastData.value, {
                    friendly_name: `HMD ${fields.nom || rawId}`,
                    last_update: new Date().toISOString(),
                    source: 'homedoudou'
                });
                this.state.updateSensor(`hmd_${sensorId}`, fields.lastData.value, { source: 'ddp' });
            }
        }
    }

    handleAdded(data) {
        // Document initial d'une subscription
        if (data.collection === 'configCle' && data.fields) {
            const fields = data.fields;
            const keyName = fields.name || data.id;
            const rawId = fields.alias || keyName;
            const sensorId = this.sanitizeId(rawId);
            const value = fields.lastData?.value;
            console.log(`[DDP] Key initiale: ${rawId} (${keyName}) = ${value}`);
            this.state.updateSensor(`hmd_${sensorId}`, value !== undefined ? value : 'unknown', {
                source: 'ddp',
                keyName,
                keyId: data.id,
                nom: fields.nom || keyName,
                show: fields.show,
                public: fields.public
            });
            if (value !== undefined) {
                this.haApi.updateEntity(`sensor.hmd_${sensorId}`, value, {
                    friendly_name: `HMD ${fields.nom || rawId}`,
                    last_update: fields.lastData?.date || new Date().toISOString(),
                    source: 'homedoudou',
                    key_name: keyName
                });
            }
        }
    }

    send(json) {
        if (this.client && this.client.readyState === WebSocket.OPEN) {
            this.client.send(JSON.stringify(json));
        }
    }

    sendToHMD(mode, key, value) {
        this.send({
            msg: 'method',
            id: String(this.methodId++),
            method: 'ddpToHmd',
            params: [{ m: mode, k: key, v: value }]
        });
    }

    subscribe(name, params = []) {
        this.send({
            msg: 'sub',
            id: String(this.methodId++),
            name,
            params
        });
    }

    scheduleReconnect() {
        if (this.reconnectTimer) return;
        console.log(`[DDP] Reconnexion dans ${this.reconnectDelay / 1000}s...`);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
    }

    close() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.client) {
            this.client.close();
            this.client = null;
        }
        this.connected = false;
    }
}

module.exports = DDPBridge;

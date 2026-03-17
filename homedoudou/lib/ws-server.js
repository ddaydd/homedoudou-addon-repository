const WebSocket = require('ws');
const haApi = require('./ha-api');

function createWsServer(port, state, ddpBridge) {
    const wss = new WebSocket.Server({ port });
    console.log(`[WS] Serveur Arduino demarre sur le port ${port}`);

    wss.on('connection', (ws) => {
        console.log('[WS] Nouvelle connexion');
        let deviceId = null;

        ws.on('message', async (message) => {
            try {
                const data = JSON.parse(message);

                // Identification de l'appareil
                if (data.type === 'hello' && data.device) {
                    deviceId = data.device;
                    state.addDevice(deviceId, ws);
                    console.log(`[WS] Appareil enregistre: ${deviceId}`);
                }

                // Traitement des capteurs
                if (data.type === 'sensor' && data.sensor_id && data.value !== undefined) {
                    await haApi.processSensorData(data, state);
                    // Synchro DDP
                    if (ddpBridge && ddpBridge.connected) {
                        ddpBridge.sendToHMD('archive', data.sensor_id, data.value);
                    }
                } else if (data.type === 'binary_sensor' && data.sensor_id && data.state !== undefined) {
                    await haApi.processBinarySensorData(data, state);
                }

                ws.send(JSON.stringify({ status: 'ok', message: 'Donnees recues' }));
            } catch (err) {
                console.error('[WS] Erreur traitement:', err.message);
                ws.send(JSON.stringify({ status: 'error', message: 'Format invalide' }));
            }
        });

        ws.on('close', () => {
            if (deviceId) {
                state.removeDevice(deviceId);
                console.log(`[WS] Appareil deconnecte: ${deviceId}`);
            }
        });

        ws.on('error', (err) => console.error('[WS] Erreur:', err.message));
    });

    return wss;
}

function sendCommand(state, deviceId, command) {
    const ws = state.getDeviceWs(deviceId);
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify({ type: 'command', ...command }));
    return true;
}

module.exports = { createWsServer, sendCommand };

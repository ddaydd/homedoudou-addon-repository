const express = require('express');
const { sendCommand } = require('../lib/ws-server');

function createApiRouter(state, ddpBridge) {
    const router = express.Router();

    router.get('/status', (req, res) => {
        res.json(state.getStatus());
    });

    router.get('/devices', (req, res) => {
        res.json({ devices: state.getDeviceIds() });
    });

    router.get('/sensors', (req, res) => {
        res.json(state.getSensors());
    });

    router.post('/send-command', (req, res) => {
        const { device_id, command, parameters } = req.body;
        if (!device_id || !command) {
            return res.status(400).json({ error: 'device_id et command sont requis' });
        }
        const cmdObj = { command, ...parameters };
        if (sendCommand(state, device_id, cmdObj)) {
            res.json({ status: 'success', message: 'Commande envoyee' });
        } else {
            res.status(404).json({ error: 'Appareil non connecte' });
        }
    });

    router.post('/ddp/send', (req, res) => {
        if (!ddpBridge || !ddpBridge.connected) {
            return res.status(503).json({ error: 'DDP non connecte' });
        }
        const { mode, key, value } = req.body;
        if (!mode || !key) {
            return res.status(400).json({ error: 'mode et key sont requis' });
        }
        ddpBridge.sendToHMD(mode, key, value || '');
        res.json({ status: 'success' });
    });

    return router;
}

module.exports = createApiRouter;

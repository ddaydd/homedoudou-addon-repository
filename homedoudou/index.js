const path = require('path');
const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const config = require('./lib/config');
const StateManager = require('./lib/state');
const haApi = require('./lib/ha-api');
const { createWsServer } = require('./lib/ws-server');
const DDPBridge = require('./lib/ddp-bridge');
const OLEDBridge = require('./lib/oled-bridge');
const createApiRouter = require('./routes/api');
const createWebRouter = require('./routes/web');

// --- State ---
const state = new StateManager();

// --- DDP Bridge ---
let ddpBridge = null;
if (config.ddp.enabled) {
    ddpBridge = new DDPBridge(config, state, haApi);
    ddpBridge.connect();
}

// --- OLED Bridge ---
let oledBridge = null;
if (config.oled.enabled) {
    oledBridge = new OLEDBridge(state);
    oledBridge.start();
}

// --- WebSocket Arduino ---
const wss = createWsServer(config.websocket_port, state, ddpBridge);

// --- Express HTTP ---
const app = express();
app.use(express.json());
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'] }));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));
app.use('/public', express.static(path.join(__dirname, 'public')));

app.use('/api', createApiRouter(state, ddpBridge));
app.use('/', createWebRouter(state));

const server = app.listen(config.http_port, () => {
    console.log(`[HTTP] Serveur demarre sur le port ${config.http_port}`);
});

// --- WebSocket Browser (meme port HTTP, path /ws) ---
const wssBrowser = new WebSocket.Server({ noServer: true });

server.on('upgrade', (request, socket, head) => {
    if (request.url === '/ws') {
        wssBrowser.handleUpgrade(request, socket, head, (ws) => {
            wssBrowser.emit('connection', ws, request);
        });
    } else {
        socket.destroy();
    }
});

// Broadcast les changements d'etat aux browsers
state.on('change', (event) => {
    const msg = JSON.stringify(event);
    wssBrowser.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
});

// Envoyer le status complet a la connexion
wssBrowser.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'init', ...state.getStatus() }));
});

// --- Logs ---
console.log(`[Config] Mode: ${config.isAddon ? 'Add-on HA' : 'Standalone'}`);
console.log(`[Config] HA: ${config.ha.host} token=${config.ha.token ? 'OK' : 'MANQUANT'}`);
console.log(`[Config] DDP: ${config.ddp.enabled ? config.ddp.endpoint : 'desactive'}`);
console.log(`[Config] OLED: ${config.oled.enabled ? 'active' : 'desactive'}`);
console.log('[HomeDoudou] Addon v2.0.0 demarre');

// --- Arret propre ---
process.on('SIGTERM', () => {
    console.log('[HomeDoudou] Arret...');
    if (ddpBridge) ddpBridge.close();
    if (oledBridge) oledBridge.stop();
    wss.close();
    server.close();
    process.exit(0);
});

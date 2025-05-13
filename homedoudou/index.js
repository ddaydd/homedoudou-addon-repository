const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const hbs = require('hbs');
const express = require('express');
const cors = require('cors'); // Pour gérer le CORS
const app = express();

app.use(express.json());
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// Log immédiat pour vérifier SUPERVISOR_TOKEN
console.log('SUPERVISOR_TOKEN au démarrage :', process.env.SUPERVISOR_TOKEN ? '[PRÉSENT]' : '[ABSENT]');

// Chargement de la configuration
let options = {
    websocket_port: process.env.WS_PORT || 8080,
    http_port: process.env.HTTP_PORT || 3000,
    ha_host: process.env.HA_HOST || 'http://homeassistant:8123',
    ha_token: process.env.HA_TOKEN || ''
};

// Détection du mode add-on
const isAddon = !!process.env.SUPERVISOR_TOKEN;

// Charger la configuration depuis options.json si disponible
try {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir);
    }

    const configPath = path.join(dataDir, 'options.json');
    if (fs.existsSync(configPath)) {
        const fileOptions = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        options = { ...options, ...fileOptions };
        console.log('Configuration chargée depuis options.json');
    } else {
        fs.writeFileSync(configPath, JSON.stringify(options, null, 4));
        console.log('Fichier options.json créé avec les valeurs par défaut');
    }
} catch (err) {
    console.error('Erreur lors du chargement de la configuration:', err);
}

const HA_CONFIG = {
    // En mode add-on, utilisez l'API supervisor, sinon utilisez l'hôte configuré
    host: isAddon ? 'http://supervisor/core' : options.ha_host,
    // Priorité au token supervisor s'il existe
    token: process.env.SUPERVISOR_TOKEN || options.ha_token
};

// Log de la configuration (sans afficher le token pour des raisons de sécurité)
console.log(`Configuration Home Assistant: host=${HA_CONFIG.host}, token=${HA_CONFIG.token ? '[PRÉSENT]' : '[MANQUANT]'}`);
console.log(`Mode d'exécution: ${isAddon ? 'Add-on Home Assistant' : 'Standalone'}`);

// Création du serveur WebSocket
const wss = new WebSocket.Server({ port: options.websocket_port });

console.log(`Serveur WebSocket démarré sur le port ${options.websocket_port}`);

// Gestion des connexions WebSocket
wss.on('connection', (ws) => {
    console.log('Nouvelle connexion établie');

    // Gestion des messages reçus
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Message reçu:', data);

            // Traitement des données reçues de l'Arduino
            processArduinoData(data);

            // Confirmation de réception
            ws.send(JSON.stringify({ status: 'ok', message: 'Données reçues' }));
        } catch (err) {
            console.error('Erreur lors du traitement du message:', err);
            ws.send(JSON.stringify({ status: 'error', message: 'Format de message invalide' }));
        }
    });

    // Gestion de la fermeture de la connexion
    ws.on('close', () => {
        console.log('Connexion fermée');
    });

    // Gestion des erreurs
    ws.on('error', (error) => {
        console.error('Erreur WebSocket:', error);
    });
});

// Fonction pour mettre à jour une entité dans Home Assistant
async function updateHomeAssistantEntity(entityId, state, attributes = {}) {
    if (!HA_CONFIG.token) {
        console.error('Token Home Assistant non configuré');
        return;
    }

    try {
        const url = `${HA_CONFIG.host}/api/states/${entityId}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${HA_CONFIG.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                state: state,
                attributes: attributes
            })
        });

        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }

        const data = await response.json();
        console.log(`Entité ${entityId} mise à jour avec succès`);
        return data;
    } catch (err) {
        console.error(`Erreur lors de la mise à jour de l'entité ${entityId}:`, err);
    }
}

// Gestion de l'arrêt propre
process.on('SIGTERM', () => {
    console.log('Arrêt du serveur WebSocket...');
    wss.close(() => {
        console.log('Serveur WebSocket arrêté');
        process.exit(0);
    });
});

// Extension du fichier index.js pour ajouter l'intégration avec l'API Home Assistant
// Ce code peut être ajouté à la fin du fichier index.js précédent

// Modules supplémentaires pour l'API Home Assistant
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

// Configuration pour l'API Home Assistant
const HA_HOST = process.env.SUPERVISOR_TOKEN ? 'http://supervisor/core' : options.ha_host;
let HA_TOKEN = process.env.SUPERVISOR_TOKEN || options.ha_token;

// Fonction pour mettre à jour une entité dans Home Assistant
async function updateHomeAssistantEntity(entityId, state, attributes = {}) {
    if (!HA_TOKEN) {
        console.error('Token Home Assistant non configuré');
        return;
    }

    try {
        const url = `${HA_HOST}/api/states/${entityId}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${HA_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                state: state,
                attributes: attributes
            })
        });

        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }

        const data = await response.json();
        console.log(`Entité ${entityId} mise à jour avec succès:`, data);
        return data;
    } catch (err) {
        console.error(`Erreur lors de la mise à jour de l'entité ${entityId}:`, err);
    }
}

// Fonction pour créer automatiquement des entités pour les capteurs Arduino
async function createSensorEntity(sensorId, friendlyName, deviceClass, unitOfMeasurement) {
    if (!HA_CONFIG.token) {
        console.error('Token Home Assistant non configuré');
        return;
    }

    // Vérifier si l'entité existe déjà
    try {
        console.log(`Vérification de l'entité sensor.${sensorId} sur ${HA_CONFIG.host}`);

        const url = `${HA_CONFIG.host}/api/states/sensor.${sensorId}`;
        console.log(`URL de vérification: ${url}`);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${HA_CONFIG.token}`,
                'Content-Type': 'application/json',
            }
        });

        // Si la réponse est 404, l'entité n'existe pas encore
        if (response.status === 404) {
            console.log(`Création d'une nouvelle entité pour le capteur ${sensorId}`);

            // Créer l'entité avec un état initial
            await updateHomeAssistantEntity(`sensor.${sensorId}`, 'unknown', {
                friendly_name: friendlyName,
                device_class: deviceClass,
                unit_of_measurement: unitOfMeasurement,
                state_class: 'measurement'
            });
        } else {
            console.log(`L'entité sensor.${sensorId} existe déjà`);
        }
    } catch (err) {
        console.error(`Erreur lors de la vérification/création de l'entité ${sensorId}:`, err);
        // Afficher plus de détails sur l'erreur
        if (err.code === 'ECONNREFUSED') {
            console.error(`Connexion refusée à ${HA_CONFIG.host}. Vérifiez que Home Assistant est accessible.`);
            console.error(`Si vous êtes en mode add-on, vérifiez que l'add-on a accès à l'API Home Assistant.`);
        }
    }
}

// Fonction améliorée pour traiter les données reçues de l'Arduino
async function processArduinoData(data) {
    // Traiter différents types de données
    if (data.type === 'sensor' && data.sensor_id && data.value !== undefined) {
        console.log(`Valeur du capteur reçue: ${data.sensor_id} = ${data.value}`);

        // Déterminer le type de capteur (exemple)
        let deviceClass = 'sensor';
        let unitOfMeasurement = '';

        // Vous pouvez définir des règles basées sur l'ID du capteur
        if (data.sensor_id.includes('temp')) {
            deviceClass = 'temperature';
            unitOfMeasurement = '°C';
        } else if (data.sensor_id.includes('humid')) {
            deviceClass = 'humidity';
            unitOfMeasurement = '%';
        } else if (data.sensor_id.includes('light')) {
            deviceClass = 'illuminance';
            unitOfMeasurement = 'lx';
        }

        // Créer l'entité si elle n'existe pas encore
        await createSensorEntity(
            data.sensor_id,
            data.friendly_name || `Capteur ${data.sensor_id}`,
            deviceClass,
            data.unit || unitOfMeasurement
        );

        // Mettre à jour l'état du capteur
        await updateHomeAssistantEntity(`sensor.${data.sensor_id}`, data.value.toString(), {
            last_update: new Date().toISOString(),
            raw_value: data.value
        });
    } else if (data.type === 'binary_sensor' && data.sensor_id && data.state !== undefined) {
        console.log(`État du capteur binaire reçu: ${data.sensor_id} = ${data.state}`);

        // Créer l'entité si nécessaire
        await createSensorEntity(
            data.sensor_id,
            data.friendly_name || `Capteur ${data.sensor_id}`,
            data.device_class || 'binary_sensor',
            ''
        );

        // Mettre à jour l'état
        await updateHomeAssistantEntity(`binary_sensor.${data.sensor_id}`,
            data.state ? 'on' : 'off',
            {
                last_update: new Date().toISOString()
            }
        );
    } else if (data.type === 'hello') {
        console.log(`Appareil connecté: ${data.device}`);
        // Vous pouvez enregistrer les appareils connectés ou effectuer d'autres actions
    }
}

// Fonction pour envoyer des commandes à l'Arduino
function sendCommandToArduino(ws, command) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(command));
        console.log('Commande envoyée à Arduino:', command);
        return true;
    } else {
        console.error('WebSocket non connecté, impossible d\'envoyer la commande');
        return false;
    }
}

// Enregistrer les services personnalisés dans Home Assistant
async function registerHomeAssistantServices() {
    const url = `${HA_CONFIG.host}/api/services/homedoudou/register`;
    const data = {
        service: 'my_service',
        domain: 'homedoudou',
        description: 'My custom service'
    };
    console.log('Enregistrement service :', { url, data });
    try {
        const response = await axios.post(url, data, {
            headers: {
                'Authorization': `Bearer ${HA_CONFIG.token}`,
                'Content-Type': 'application/json'
            }
        });
        console.log('Service enregistré :', response.data);
    } catch (error) {
        console.error('Erreur enregistrement service :', error.response ? error.response.data : error.message);
        throw error;
    }
}

// Stocker les connexions WebSocket actives par identifiant d'appareil
const activeConnections = new Map();

// Modification de la gestion des connexions pour stocker l'appareil
wss.on('connection', (ws) => {
    console.log('Nouvelle connexion établie');
    let deviceId = null;

    // Gestion des messages reçus
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Message reçu:', data);

            // Si c'est un message d'identification, enregistrer l'appareil
            if (data.type === 'hello' && data.device) {
                deviceId = data.device;
                activeConnections.set(deviceId, ws);
                console.log(`Appareil enregistré: ${deviceId}`);
            }

            // Traiter les données reçues
            processArduinoData(data);

            // Confirmation de réception
            ws.send(JSON.stringify({ status: 'ok', message: 'Données reçues' }));
        } catch (err) {
            console.error('Erreur lors du traitement du message:', err);
            ws.send(JSON.stringify({ status: 'error', message: 'Format de message invalide' }));
        }
    });

    // Gestion de la fermeture de la connexion
    ws.on('close', () => {
        console.log('Connexion fermée');
        if (deviceId) {
            activeConnections.delete(deviceId);
            console.log(`Appareil déconnecté: ${deviceId}`);
        }
    });

    // Gestion des erreurs
    ws.on('error', (error) => {
        console.error('Erreur WebSocket:', error);
    });
});



// Route pour la page d'accueil avec Handlebars
app.get('/', (req, res) => {
    const devices = Array.from(activeConnections.keys());
    res.render('index', {
        title: 'HomeDoudou',
        message: 'Bienvenue !',
        devices: devices,
    });
});

// Migration des endpoints de l'ancien code

// Endpoint pour envoyer une commande à un appareil
app.post('/api/send-command', (req, res) => {
    const { device_id, command, parameters } = req.body;

    if (!device_id || !command) {
        return res.status(400).json({ error: 'device_id et command sont requis' });
    }

    const ws = activeConnections.get(device_id);
    if (!ws) {
        return res.status(404).json({ error: 'Appareil non connecté' });
    }

    const commandObj = {
        type: 'command',
        command: command,
        ...parameters,
    };

    if (sendCommandToArduino(ws, commandObj)) {
        res.status(200).json({ status: 'success', message: 'Commande envoyée' });
    } else {
        res.status(500).json({ error: 'Erreur lors de l\'envoi de la commande' });
    }
});

// Endpoint pour lister les appareils connectés
app.get('/api/devices', (req, res) => {
    const devices = Array.from(activeConnections.keys());
    res.status(200).json({ devices });
});

// Endpoint pour créer une entité
app.post('/api/create-entity', (req, res) => {
    createSensorEntity('temperature_test', 'Temperature', 'temperature', '°C');
    res.status(200).json({ message: 'Entité créée' });
});

// Endpoint pour le statut de l'add-on
app.get('/api/status', (req, res) => {
    res.status(200).json({
        status: 'running',
        websocket_port: options.websocket_port,
        connected_devices: activeConnections.size,
        uptime: process.uptime(),
    });
});

// Endpoint home (ancien endpoint JSON déplacé)
app.get('/api/home', (req, res) => {
    res.status(200).json({ message: 'HomeDoudou Addon démarré' });
});

// Gestion des routes non trouvées
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint non trouvé' });
});

// Démarrer le serveur
app.listen(options.http_port, () => {
    console.log(`Serveur démarré sur le port ${options.http_port}`);
});

// Démarrer l'addon
console.log('HomeDoudou Addon démarré');
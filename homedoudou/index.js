const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// Chargement de la configuration
let options = {};
try {
    const configPath = path.join('/data', 'options.json');
    if (fs.existsSync(configPath)) {
        options = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
} catch (err) {
    console.error('Erreur lors du chargement de la configuration:', err);
}

// Port pour le serveur WebSocket
const PORT = options.websocket_port || 8080;

// Création du serveur WebSocket
const wss = new WebSocket.Server({ port: PORT });

console.log(`Serveur WebSocket démarré sur le port ${PORT}`);

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

// Fonction pour traiter les données reçues de l'Arduino
function processArduinoData(data) {
    // Ici, vous pouvez implémenter la logique pour traiter les données
    // et les envoyer à Home Assistant via l'API REST ou WebSocket

    // Exemple: si l'Arduino envoie des données de capteur
    if (data.type === 'sensor' && data.value !== undefined) {
        console.log(`Valeur du capteur reçue: ${data.sensor_id} = ${data.value}`);

        // TODO: Envoyer les données à Home Assistant
        // Exemple: updateHomeAssistantEntity(data.sensor_id, data.value);
    }
}

// Fonction pour mettre à jour une entité dans Home Assistant
function updateHomeAssistantEntity(entityId, state) {
    // Cette fonction sera implémentée pour communiquer avec l'API Home Assistant
    console.log(`Mise à jour de l'entité ${entityId} avec l'état ${state}`);

    // TODO: Implémenter la communication avec l'API Home Assistant
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
const HA_HOST = process.env.SUPERVISOR_TOKEN ? 'http://supervisor/core' : 'http://localhost:8123';
let HA_TOKEN = '';

// Si l'addon s'exécute dans l'environnement Home Assistant, utiliser le token du superviseur
if (process.env.SUPERVISOR_TOKEN) {
    HA_TOKEN = process.env.SUPERVISOR_TOKEN;
} else {
    // Sinon, essayer de charger un token depuis la configuration
    try {
        const tokenPath = path.join('/data', 'token.txt');
        if (fs.existsSync(tokenPath)) {
            HA_TOKEN = fs.readFileSync(tokenPath, 'utf8').trim();
        }
    } catch (err) {
        console.error('Erreur lors du chargement du token Home Assistant:', err);
    }
}

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
    // Vérifier si l'entité existe déjà
    try {
        const response = await fetch(`${HA_HOST}/api/states/sensor.${sensorId}`, {
            headers: {
                'Authorization': `Bearer ${HA_TOKEN}`,
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
        }
    } catch (err) {
        console.error(`Erreur lors de la vérification/création de l'entité ${sensorId}:`, err);
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
    if (!HA_TOKEN) {
        console.error('Token Home Assistant non configuré, impossible d\'enregistrer les services');
        return;
    }

    try {
        // Enregistrer un service pour envoyer des commandes à l'Arduino
        const serviceData = {
            domain: 'homedoudou',
            service: 'send_command',
            fields: {
                device_id: {
                    required: true,
                    example: 'arduino_1',
                    selector: {
                        text: {}
                    }
                },
                command: {
                    required: true,
                    example: 'toggle_led',
                    selector: {
                        text: {}
                    }
                },
                parameters: {
                    required: false,
                    example: '{"pin": 13, "state": true}',
                    selector: {
                        object: {}
                    }
                }
            }
        };

        const url = `${HA_HOST}/api/services/homedoudou/send_command`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${HA_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(serviceData)
        });

        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }

        console.log('Service enregistré avec succès dans Home Assistant');
    } catch (err) {
        console.error('Erreur lors de l\'enregistrement du service: ', err);
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

// Créer un serveur HTTP simple pour exposer une API REST
const http = require('http');
const server = http.createServer((req, res) => {
    // Autoriser les requêtes CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Gérer les requêtes OPTIONS pour le CORS
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Endpoint pour envoyer une commande à un appareil
    if (req.method === 'POST' && req.url === '/api/send-command') {
        let body = '';

        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const { device_id, command, parameters } = data;

                if (!device_id || !command) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'device_id et command sont requis' }));
                    return;
                }

                const ws = activeConnections.get(device_id);
                if (!ws) {
                    res.writeHead(404);
                    res.end(JSON.stringify({ error: 'Appareil non connecté' }));
                    return;
                }

                // Envoyer la commande
                const commandObj = {
                    type: 'command',
                    command: command,
                    ...parameters
                };

                if (sendCommandToArduino(ws, commandObj)) {
                    res.writeHead(200);
                    res.end(JSON.stringify({ status: 'success', message: 'Commande envoyée' }));
                } else {
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: 'Erreur lors de l\'envoi de la commande' }));
                }
            } catch (err) {
                console.error('Erreur:', err);
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Requête invalide' }));
            }
        });
    }
    // Endpoint pour lister les appareils connectés
    else if (req.method === 'GET' && req.url === '/api/devices') {
        const devices = Array.from(activeConnections.keys());
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ devices }));
    }
    // Endpoint pour le statut de l'addon
    else if (req.method === 'GET' && req.url === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'running',
            websocket_port: PORT,
            connected_devices: activeConnections.size,
            uptime: process.uptime()
        }));
    }
    else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Endpoint non trouvé' }));
    }
});

// Démarrer le serveur HTTP sur un port différent
const HTTP_PORT = options.http_port || 3000;
server.listen(HTTP_PORT, () => {
    console.log(`Serveur HTTP démarré sur le port ${HTTP_PORT}`);
});

// Démarrer l'addon
console.log('HomeDoudou Addon démarré');

// Enregistrer les services Home Assistant
registerHomeAssistantServices()
    .then(() => console.log('Initialisation des services Home Assistant terminée'))
    .catch(err => console.error('Erreur lors de l\'initialisation des services:', err));
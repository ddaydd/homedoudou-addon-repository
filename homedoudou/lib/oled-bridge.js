const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');

class OLEDBridge {
    constructor(state) {
        this.state = state;
        this.process = null;
        this.dataFile = '/tmp/oled_data.json';
        this.refreshInterval = null;
    }

    start() {
        const script = path.join(__dirname, '..', 'oled_display.py');

        if (!fs.existsSync('/dev/spidev0.0')) {
            console.error('[OLED] /dev/spidev0.0 non disponible');
            this.state.setOledStatus('error');
            return;
        }

        console.log('[OLED] Demarrage du process Python...');
        this.process = spawn('python3', [script], {
            stdio: ['pipe', 'inherit', 'inherit']
        });

        this.process.on('exit', (code) => {
            console.log(`[OLED] Process Python arrete (code ${code})`);
            this.state.setOledStatus('error');
        });

        this.state.setOledStatus('running');

        // Ecrire les donnees toutes les 3 secondes
        this.refreshInterval = setInterval(() => this.writeData(), 3000);
        this.writeData();
    }

    writeData() {
        const status = this.state.getStatus();
        const lines = [
            { text: 'HomeDoudou v2.0', invert: true },
            { text: `HA: ok  DDP: ${status.ddp}` },
            { text: `Devices: ${status.deviceCount}  Sensors: ${status.sensorCount}` },
        ];

        // Ajouter les 2 derniers capteurs mis a jour
        const sensors = Object.entries(status.sensors)
            .sort((a, b) => (b[1].updatedAt || '').localeCompare(a[1].updatedAt || ''))
            .slice(0, 2);

        for (const [id, data] of sensors) {
            const name = id.length > 10 ? id.substring(0, 10) : id;
            lines.push({ text: `${name}: ${data.value}` });
        }

        // Completer a 5 lignes
        while (lines.length < 5) {
            lines.push({ text: '' });
        }

        try {
            fs.writeFileSync(this.dataFile, JSON.stringify({ lines, updated_at: new Date().toISOString() }));
        } catch (err) {
            // Silencieux
        }
    }

    stop() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        if (this.process) {
            this.process.kill('SIGTERM');
        }
    }
}

module.exports = OLEDBridge;

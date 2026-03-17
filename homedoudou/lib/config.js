const isAddon = !!process.env.SUPERVISOR_TOKEN;

module.exports = {
    websocket_port: parseInt(process.env.WS_PORT) || 8080,
    http_port: parseInt(process.env.HTTP_PORT) || 3000,
    isAddon,
    ha: {
        host: isAddon ? 'http://supervisor/core' : (process.env.HA_HOST || 'http://homeassistant:8123'),
        token: process.env.SUPERVISOR_TOKEN || process.env.HA_TOKEN || ''
    },
    ddp: {
        enabled: process.env.DDP_ENABLED === 'true',
        endpoint: process.env.DDP_ENDPOINT || 'wss://hard.homedoudou.fr/websocket',
        hardId: process.env.DDP_HARD_ID || ''
    },
    oled: {
        enabled: process.env.OLED_ENABLED === 'true'
    }
};

#!/usr/bin/with-contenv bashio

bashio::log.info "Demarrage HomeDoudou addon v2.0.0..."

# Lecture des options depuis config.yaml via bashio
export WS_PORT=$(bashio::config 'websocket_port')
export HTTP_PORT=$(bashio::config 'http_port')
export DDP_ENABLED=$(bashio::config 'ddp_enabled')
export DDP_ENDPOINT=$(bashio::config 'ddp_endpoint')
export DDP_HARD_ID=$(bashio::config 'ddp_hard_id')
export OLED_ENABLED=$(bashio::config 'oled_enabled')

exec node /app/index.js

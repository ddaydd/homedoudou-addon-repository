ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:latest
FROM ${BUILD_FROM}

# Installation de Node.js
RUN apk add --no-cache nodejs npm

# Copie des fichiers
WORKDIR /app
COPY package.json .
COPY index.js .

# Installation des dépendances
RUN npm install

# Configuration pour l'exécution
CMD [ "node", "index.js" ]
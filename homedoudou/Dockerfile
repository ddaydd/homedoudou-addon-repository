ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:latest
FROM ${BUILD_FROM}

# Installation de Node.js et dépendances
RUN apk add --no-cache nodejs npm

# Copie des fichiers de l'application
WORKDIR /app
COPY package.json .
COPY index.js .
RUN npm install

# Copie de la configuration s6-overlay
COPY rootfs /

# S'assurer que /init est exécutable
RUN chmod +x /init

# Utiliser s6-overlay
CMD ["/init"]
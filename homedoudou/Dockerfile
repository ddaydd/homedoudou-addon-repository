ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:latest
FROM ${BUILD_FROM}

# Installation de Node.js et dépendances
RUN apk add --no-cache nodejs npm

# Copie des fichiers de l'application
WORKDIR /app
COPY package.json .
COPY index.js .
RUN npm install

# Copy data for add-on
COPY run.sh /
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
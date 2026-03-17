ARG BUILD_FROM=ghcr.io/home-assistant/aarch64-base:latest
FROM ${BUILD_FROM}

# Node.js + Python pour OLED
RUN apk add --no-cache nodejs npm python3 py3-pip py3-pillow \
    && pip3 install --break-system-packages spidev gpiod

# Application Node.js
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --production 2>/dev/null || npm install --production
COPY . .

# Entrypoint
COPY run.sh /
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]

FROM node:24.19.0-bookworm-slim
ENV npm_config_cache=/tmp/npm-cache NODE_ENV=production CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium CHROMIUM_NO_SANDBOX=true
RUN apt-get update && apt-get install -y --no-install-recommends chromium ca-certificates fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
# Optional trusted corporate/platform CA is mounted only during installation.
# Never disable TLS verification or copy the CA/credentials into the image.
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
    npm ci --omit=dev && rm -rf /tmp/npm-cache
COPY --chown=node:node . .
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["npm", "start"]

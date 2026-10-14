FROM node:24.19.0-bookworm-slim
ENV npm_config_cache=/tmp/npm-cache NODE_ENV=production CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium CHROMIUM_NO_SANDBOX=true
RUN apt-get update && apt-get install -y --no-install-recommends chromium ca-certificates fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev && rm -rf .cache
COPY --chown=node:node . .
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["npm", "start"]

# syntax=docker/dockerfile:1.7
FROM node:24.21.0-bookworm-slim AS node-base
RUN apt-get -o Acquire::ForceIPv4=true -o Acquire::Retries=3 -o Acquire::http::Timeout=30 update \
  && apt-get -o Acquire::ForceIPv4=true -o Acquire::Retries=3 -o Acquire::http::Timeout=30 install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

FROM node-base AS build
WORKDIR /workspace
ENV CI=1
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
  npm ci --ignore-scripts=false --no-audit --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000
COPY apps/api apps/api
COPY scripts/check-database-boundaries.mjs scripts/check-database-boundaries.mjs
COPY scripts/grant-database-access.mjs scripts/grant-database-access.mjs
RUN npm run build:api

FROM build AS migration
ENV NODE_ENV=production
CMD ["sh", "-c", "npm run db:migrate && npm run db:grant"]

FROM node-base AS runtime-deps
WORKDIR /workspace
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
  npm ci --omit=dev --ignore-scripts=false --no-audit --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000

FROM node-base AS production
WORKDIR /workspace
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=3000
RUN install -d -o node -g node -m 0700 /srv/lamssa/assets
COPY --from=runtime-deps --chown=node:node /workspace/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /workspace/apps/api/package.json ./apps/api/package.json
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "const r=require('http').get({host:'127.0.0.1',port:3000,path:'/api/v1/health',headers:{host:'api'}},v=>{v.resume();if(v.statusCode!==200)process.exit(1)});r.on('error',()=>process.exit(1))"
CMD ["node", "apps/api/dist/main.js"]

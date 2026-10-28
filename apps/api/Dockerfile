# syntax=docker/dockerfile:1.7
FROM node:24.11.0-bookworm-slim AS build
WORKDIR /workspace
ENV CI=1
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --ignore-scripts=false
COPY apps/api apps/api
COPY scripts/check-database-boundaries.mjs scripts/check-database-boundaries.mjs
COPY scripts/grant-database-access.mjs scripts/grant-database-access.mjs
RUN npm run build:api

FROM build AS migration
ENV NODE_ENV=production
CMD ["sh", "-c", "npm run db:migrate && npm run db:grant"]

FROM node:24.11.0-bookworm-slim AS runtime-deps
WORKDIR /workspace
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev --ignore-scripts=false && npm cache clean --force

FROM node:24.11.0-bookworm-slim AS production
WORKDIR /workspace
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=3000
RUN install -d -o node -g node -m 0700 /srv/lamssa/assets
COPY --from=runtime-deps --chown=node:node /workspace/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /workspace/apps/api/package.json ./apps/api/package.json
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/main.js"]

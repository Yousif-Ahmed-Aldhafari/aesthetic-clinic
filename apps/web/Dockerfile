# syntax=docker/dockerfile:1.7
FROM node:24.11.0-bookworm-slim AS build
WORKDIR /workspace
ENV CI=1
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --ignore-scripts=false
COPY apps/web apps/web
RUN npm run build:web

FROM nginxinc/nginx-unprivileged:1.28.0-alpine AS production
COPY deploy/nginx/web.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1

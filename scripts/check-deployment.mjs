import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const requireText = (path, patterns) => {
  const text = read(path);
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${path} is missing deployment invariant ${pattern}`);
  return text;
};

requireText('apps/api/Dockerfile', [/FROM node:24\.11\.0-bookworm-slim/, /USER node/, /HEALTHCHECK/, /ASSET_STORAGE_DIR|\/srv\/lamssa\/assets/]);
requireText('apps/web/Dockerfile', [/nginxinc\/nginx-unprivileged:1\.28\.0-alpine/, /USER 101/, /HEALTHCHECK/]);
const compose = requireText('compose.staging.yaml', [/internal: true/, /condition: service_completed_successfully/, /read_only: true/, /RUNTIME_DATABASE_ROLE: lamssa_app/]);
const postgresSection = compose.match(/  postgres:[\s\S]*?\n  migrate:/)?.[0] ?? '';
if (/\n\s+ports:/.test(postgresSection)) throw new Error('PostgreSQL must not publish a host port.');
const proxy = requireText('deploy/caddy/Caddyfile', [/@operational path \/api\/v1\/metrics/, /respond @operational 404/, /X-Forwarded-Proto https/, /Strict-Transport-Security/, /request_body \{\s*max_size 3MB\s*\}/]);
if (proxy.indexOf('respond @operational 404') > proxy.indexOf('handle @api')) throw new Error('Operational endpoint deny rule must precede API proxying.');
requireText('.dockerignore', [/^\.env$/m, /^var$/m, /^\*\*\/var$/m, /^apps\/api\/test$/m]);
requireText('deploy/staging.env.example', [/GENERATE_48_BYTES_BASE64URL/, /TRUST_PROXY_HOPS=1/, /API_ALLOWED_HOSTS=/]);
const initMode = statSync(resolve(root, 'deploy/postgres/init-roles.sh')).mode & 0o777;
if (initMode !== 0o755) throw new Error('PostgreSQL bootstrap script must be executable with mode 0755.');
console.info('Deployment configuration invariants passed: non-root images, internal database, controlled migrations, proxy telemetry deny rules and artifact exclusions.');

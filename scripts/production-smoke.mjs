import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { config } from 'dotenv';
config({ path: resolve(import.meta.dirname, '../.env'), quiet: true });

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error('TEST_DATABASE_URL is required for isolated production-mode smoke verification.');
const port = 39000 + Math.floor(Math.random() * 1000);
const assets = mkdtempSync(resolve(tmpdir(), 'lamssa-prod-assets-'));
const metricsKey = randomBytes(48).toString('base64url');
const env = {
  ...process.env, NODE_ENV: 'production', API_HOST: '127.0.0.1', API_PORT: String(port),
  DATABASE_URL: testUrl, CORS_ORIGINS: 'https://staging.lamssa.example',
  API_ALLOWED_HOSTS: '127.0.0.1', PLATFORM_BASE_DOMAIN: 'clinics.staging.lamssa.example',
  TRUST_PROXY_HOPS: '1', ASSET_STORAGE_DIR: assets,
  AUTH_CSRF_SECRET: randomBytes(48).toString('base64url'),
  MFA_ENCRYPTION_KEY: randomBytes(32).toString('base64url'), METRICS_SECRET_KEY: metricsKey,
};
const child = spawn(process.execPath, ['apps/api/dist/main.js'], { cwd: resolve(import.meta.dirname, '..'), env, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
child.stdout.on('data', chunk => { output += chunk.toString(); });
child.stderr.on('data', chunk => { output += chunk.toString(); });
const base = `http://127.0.0.1:${port}/api/v1`;
const assertDenied = (response, label) => {
  if (![401, 403].includes(response.status)) {
    throw new Error(`${label} was not rejected (HTTP ${response.status}).`);
  }
};
const waitFor = async () => {
  for (let i = 0; i < 50; i++) {
    if (child.exitCode !== null) throw new Error('Production API exited during startup.');
    try { const response = await fetch(`${base}/health`); if (response.ok) return response; } catch {}
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  throw new Error('Production API did not become live within 5 seconds.');
};
try {
  const live = await waitFor();
  if (live.headers.get('strict-transport-security') !== 'max-age=31536000') throw new Error('Production HSTS header is missing.');
  if ((await fetch(`${base}/health/ready`)).status !== 200) throw new Error('Production readiness did not reach 200 with the isolated test database.');
  assertDenied(await fetch(`${base}/metrics`), 'Anonymous production metrics access');
  if ((await fetch(`${base}/metrics`, { headers: { 'X-Metrics-Key': metricsKey } })).status !== 200) throw new Error('Scoped monitoring credential was not accepted.');
  assertDenied(await fetch(`${base}/health/diagnostics`), 'Anonymous diagnostics access');
  const csrf=await fetch(`${base}/auth/csrf`,{headers:{'X-Forwarded-Proto':'https','Origin':'https://staging.lamssa.example'}});
  if(csrf.status!==200)throw new Error('Trusted TLS proxy request did not reach authentication bootstrap.');
  const cookie=csrf.headers.get('set-cookie')??'';
  if(!cookie.startsWith('__Host-lamssa_preauth=')||!cookie.includes('Secure')||!cookie.includes('HttpOnly')||!cookie.includes('SameSite=Lax'))throw new Error('Production cookie flags are incomplete.');
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolveExit, reject) => child.once('exit', (code, signal) => code === 0 || signal === 'SIGTERM' ? resolveExit(undefined) : reject(new Error(`API shutdown failed (${code ?? signal})`)))),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Graceful shutdown exceeded 5 seconds.')), 5000)),
  ]);
  const outagePort=port+1000;
  const outage=spawn(process.execPath,['apps/api/dist/main.js'],{cwd:resolve(import.meta.dirname,'..'),env:{...env,API_PORT:String(outagePort),DATABASE_URL:'postgresql://unavailable:unavailable@127.0.0.1:1/lamssa'},stdio:'ignore'});
  const outageBase=`http://127.0.0.1:${outagePort}/api/v1`;
  let outageLive=false;
  for(let i=0;i<50;i++){
    try{if((await fetch(`${outageBase}/health`)).status===200){outageLive=true;break;}}catch{}
    await new Promise(resolveWait=>setTimeout(resolveWait,100));
  }
  if(!outageLive)throw new Error('Outage probe API did not become live.');
  if((await fetch(`${outageBase}/health/ready`)).status!==503)throw new Error('Readiness did not fail closed during database outage.');
  if((await fetch(`${outageBase}/health`)).status!==200)throw new Error('Liveness incorrectly depends on the database.');
  outage.kill('SIGTERM');
  await new Promise(resolveExit=>outage.once('exit',resolveExit));
  console.info('Production-mode API smoke passed: liveness/readiness transitions, HSTS, telemetry authorization, database outage and graceful shutdown.');
} catch (error) {
  child.kill('SIGKILL');
  const safeTail = output.split('\n').filter(line => !/postgres(?:ql)?:\/\//i.test(line)).slice(-8).join('\n');
  if (safeTail) console.error(safeTail);
  throw error;
} finally { rmSync(assets, { recursive: true, force: true }); }

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { resolve } from 'node:path';

// Read-only verification of an already running, isolated local staging stack.
// Do not print Docker inspection output: container environments contain secrets.
const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
if (args.length > 1 || (args[0]?.startsWith('--') && !args[0].startsWith('--env-file='))) {
  console.error('Usage: node scripts/verify-deployment-runtime.mjs [--env-file=path]');
  process.exit(1);
}
const envFile = resolve(root, args[0]?.replace(/^--env-file=/, '') || 'deploy/staging.env');
let passed = 0;

function docker(args) {
  const result = spawnSync('docker', args, { cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    throw new Error('Docker inspection failed. Check Docker access and the existing staging stack; no services were changed.');
  }
  return result.stdout.trim();
}

function check(label, verify) {
  try { verify(); } catch { throw new Error(`FAILED: ${label}`); }
  passed++;
  console.info(`PASS ${label}`);
}

function environment(container) {
  return Object.fromEntries(container.Config.Env.map(value => {
    const separator = value.indexOf('=');
    return [value.slice(0, separator), value.slice(separator + 1)];
  }));
}

function request({ port, hostname, ca, path = '/', method = 'GET', headers = {}, plain = false, servername = hostname }) {
  return new Promise((resolveResponse, reject) => {
    // Always connect to loopback. Hostnames only select TLS identity/HTTP routing;
    // this script cannot accidentally send credentials to a public server.
    const req = (plain ? httpRequest : httpsRequest)({
      hostname: '127.0.0.1', port, path, method,
      ...(plain ? {} : { servername, ca, rejectUnauthorized: true }),
      headers: { Host: hostname, ...headers },
    }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        body += chunk;
        if (body.length > 2 * 1024 * 1024) req.destroy(new Error('Response exceeded verification size limit.'));
      });
      response.on('error', reject);
      response.on('end', () => resolveResponse({ status: response.statusCode, headers: response.headers, body }));
    });
    req.setTimeout(10000, () => req.destroy(new Error('Local staging request timed out.')));
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  assert.ok(existsSync(envFile), 'The staging environment file is required; this script never provisions a stack.');
  const containers = {};
  for (const service of ['postgres', 'api', 'web', 'proxy']) {
    const id = docker(['compose', '--env-file', envFile, '-f', 'compose.staging.yaml', 'ps', '-q', service]);
    assert.match(id, /^[a-f0-9]{12,64}$/, `Exactly one existing ${service} container is required.`);
    containers[service] = JSON.parse(docker(['inspect', id]))[0];
    check(`${service} belongs to the running isolated staging project`, () => {
      assert.equal(containers[service].Config.Labels['com.docker.compose.project'], 'lamssa-staging');
      assert.equal(containers[service].State.Running, true);
    });
  }

  const apiEnv = environment(containers.api);
  check('runtime API does not inherit database maintenance or backup secrets', () => {
    for (const name of ['POSTGRES_ADMIN_PASSWORD', 'MIGRATION_DATABASE_PASSWORD', 'MIGRATION_DATABASE_URL', 'BACKUP_ENCRYPTION_KEY']) {
      assert.equal(Object.hasOwn(apiEnv, name), false);
    }
  });
  for (const service of ['api', 'web']) {
    check(`${service} executes without root and has a read-only root filesystem`, () => {
      const uid = docker(['exec', containers[service].Id, 'id', '-u']);
      assert.match(uid, /^[1-9][0-9]*$/);
      assert.equal(containers[service].HostConfig.ReadonlyRootfs, true);
    });
    check(`${service} container healthcheck is passing`, () => {
      assert.equal(containers[service].State.Health?.Status, 'healthy');
    });
  }
  for (const service of ['postgres', 'api']) {
    check(`${service} has no published host port`, () => {
      assert.ok(Object.values(containers[service].NetworkSettings.Ports ?? {}).every(bindings => !bindings?.length));
      assert.ok(!Object.keys(containers[service].HostConfig.PortBindings ?? {}).length);
    });
    check(`${service} only mounts isolated staging volumes and approved bootstrap configuration`, () => {
      for (const mount of containers[service].Mounts) {
        if (mount.Type === 'volume') assert.ok(mount.Name.startsWith('lamssa-staging_'));
        else if (mount.Type === 'bind') {
          assert.equal(service, 'postgres');
          assert.equal(mount.Source, resolve(root, 'deploy/postgres/init-roles.sh'));
          assert.equal(mount.RW, false);
        } else assert.equal(mount.Type, 'tmpfs');
      }
    });
  }

  const proxyPorts = containers.proxy.NetworkSettings.Ports;
  check('proxy publishes HTTP and HTTPS only on loopback', () => {
    assert.ok(proxyPorts['443/tcp']?.length && proxyPorts['80/tcp']?.length);
    for (const bindings of Object.values(proxyPorts)) {
      for (const binding of bindings ?? []) assert.ok(['127.0.0.1', '::1'].includes(binding.HostIp));
    }
  });
  const publicHost = environment(containers.proxy).PUBLIC_HOST;
  assert.ok(publicHost && !publicHost.includes('*'), 'A concrete staging hostname is required.');
  const hostname = new URL(`https://${publicHost}`).hostname;
  const tlsPort = Number(proxyPorts['443/tcp'][0].HostPort);
  const httpPort = Number(proxyPorts['80/tcp'][0].HostPort);
  const ca = docker(['exec', containers.proxy.Id, 'cat', '/data/caddy/pki/authorities/local/root.crt']);
  assert.match(ca, /-----BEGIN CERTIFICATE-----/);
  const local = options => request({ hostname, port: tlsPort, ca, ...options });

  const html = await local({});
  check('real HTTPS serves Arabic RTL HTML with a locally trusted certificate', () => {
    assert.equal(html.status, 200);
    assert.match(html.headers['content-type'], /text\/html/);
    assert.match(html.body, /<html[^>]*lang=["']ar["'][^>]*dir=["']rtl["']|<html[^>]*dir=["']rtl["'][^>]*lang=["']ar["']/i);
  });
  check('HTML receives CSP, HSTS, frame, MIME, referrer and permissions headers', () => {
    const csp = html.headers['content-security-policy'];
    for (const directive of ["default-src 'self'", "script-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'"]) {
      assert.ok(csp?.includes(directive));
    }
    assert.match(html.headers['strict-transport-security'], /max-age=31536000/);
    assert.equal(html.headers['x-frame-options'], 'DENY');
    assert.equal(html.headers['x-content-type-options'], 'nosniff');
    assert.equal(html.headers['referrer-policy'], 'strict-origin-when-cross-origin');
    assert.ok(html.headers['permissions-policy']);
  });
  const redirect = await request({ hostname, port: httpPort, plain: true, path: '/verification-route?probe=1' });
  check('HTTP redirects to the configured local HTTPS port without losing the path', () => {
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.location, `https://${hostname}:${tlsPort}/verification-route?probe=1`);
  });
  for (const [path, status] of [['/api/v1/health', 'ok'], ['/api/v1/health/ready', 'ready']]) {
    const response = await local({ path });
    check(`${path} returns only its safe healthy status`, () => {
      assert.equal(response.status, 200);
      assert.deepEqual(JSON.parse(response.body), { status });
    });
  }

  assert.ok(apiEnv.METRICS_SECRET_KEY, 'Staging must have its explicit monitoring credential.');
  for (const path of ['/api/v1/metrics', '/api/v1/health/diagnostics', '/api/v1/alerts/active']) {
    for (const authenticated of [false, true]) {
      const response = await local({ path, headers: authenticated ? { 'X-Metrics-Key': apiEnv.METRICS_SECRET_KEY } : {} });
      check(`${path} is hidden at the public proxy ${authenticated ? 'even with monitoring credentials' : 'without credentials'}`, () => {
        assert.equal(response.status, 404);
      });
    }
  }
  const origin = apiEnv.CORS_ORIGINS?.split(',')[0]?.trim();
  assert.ok(origin?.startsWith('https://'), 'An explicit HTTPS frontend origin is required.');
  const allowedCors = await local({ path: '/api/v1/auth/login', method: 'OPTIONS', headers: {
    Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-csrf-token',
  } });
  check('allowed CORS preflight grants only the configured origin and credentials', () => {
    assert.equal(allowedCors.status, 204);
    assert.equal(allowedCors.headers['access-control-allow-origin'], origin);
    assert.equal(allowedCors.headers['access-control-allow-credentials'], 'true');
  });
  const deniedCors = await local({ path: '/api/v1/health', headers: { Origin: 'https://untrusted.example.invalid' } });
  check('unlisted origin receives no CORS authorization', () => {
    assert.equal(deniedCors.headers['access-control-allow-origin'], undefined);
    assert.equal(deniedCors.headers['access-control-allow-credentials'], undefined);
  });
  const forgedHost = await local({ path: '/api/v1/health', headers: { Host: 'untrusted.example.invalid' } });
  check('forged HTTP Host cannot route to the application', () => {
    assert.ok([400, 404, 421].includes(forgedHost.status));
  });
  let unknownTlsHostRejected = false;
  try { await local({ servername: 'untrusted.example.invalid' }); } catch { unknownTlsHostRejected = true; }
  check('unknown TLS hostname is rejected', () => assert.equal(unknownTlsHostRejected, true));
  const csrf = await local({ path: '/api/v1/auth/csrf', headers: { Origin: origin } });
  check('authentication bootstrap issues a Secure HttpOnly SameSite host-only cookie', () => {
    assert.equal(csrf.status, 200);
    const cookie = csrf.headers['set-cookie']?.find(value => value.startsWith('__Host-lamssa_preauth='));
    assert.ok(cookie);
    for (const attribute of ['Secure', 'HttpOnly', 'SameSite=Lax', 'Path=/']) assert.ok(cookie.includes(attribute));
    assert.doesNotMatch(cookie, /;\s*Domain=/i);
  });
  console.info(`Deployment runtime verification passed: ${passed} checks. No services or database records were changed.`);
}

main().catch(error => {
  // Assertion inputs, HTTP bodies and Docker stderr may contain credentials.
  // Log only our fixed check label or fixed operational error message.
  const safeMessage = error instanceof Error && /^(FAILED:|Docker inspection failed\.|The staging environment file is required)/.test(error.message)
    ? error.message : 'Deployment runtime verification failed. Inspect the isolated stack privately; secrets were omitted.';
  console.error(safeMessage);
  process.exitCode = 1;
});

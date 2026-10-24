import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Body, Controller, Get, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsString } from 'class-validator';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { PublicRoute } from '../src/auth/access.js';
import { randomBytes } from 'node:crypto';

class ValidationBody {
  @IsString()
  value!: string;
}

// These routes exist only inside the test module, never in AppModule.
@Controller('test')
class FailureController {
  @Get('failure')
  @PublicRoute()
  fail() { throw new Error('private-test-value stack database-password'); }

  @Post('validation')
  @PublicRoute()
  validate(@Body() body: ValidationBody) { return body; }
}

let app: INestApplication;
let base: string;
let databaseAvailable = true;
const lookups: { where: { slug: string; status: string } }[] = [];
const fixtures = [
  { slug: 'ward-demo', displayName: 'عيادة ورد التجريبية', primaryColor: '#7854D9', status: 'ACTIVE' },
  { slug: 'nour-demo', displayName: 'عيادة نور التجريبية', primaryColor: '#087F8C', status: 'ACTIVE' },
  { slug: 'suspended-demo', displayName: 'عيادة موقوفة', primaryColor: '#000000', status: 'SUSPENDED' },
];

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.AUTH_CSRF_SECRET = randomBytes(48).toString('base64url');
  process.env.API_HOST = '127.0.0.1';
  process.env.API_PORT = '3000';
  process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/lamssa_test';
  process.env.CORS_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173';
  const { AppModule } = await import('../src/app.module.js');
  const module = await Test.createTestingModule({ imports: [AppModule], controllers: [FailureController] })
    .overrideProvider(PrismaService).useValue({
      $queryRaw: async (sql:TemplateStringsArray,...values:unknown[]) => {
        if(sql.join('').includes('public_branding')) {
          const slug=values[0] as string;
          lookups.push({where:{slug,status:'ACTIVE'}});
          if(slug==='database-error')throw new Error('private-test-value SQL');
          const fixture=fixtures.find(item=>item.slug===slug && item.status==='ACTIVE');
          return fixture?[{...fixture,hasBranding:true,logoUrl:null,secondaryColor:'#FFFFFF',accentColor:null,legalName:'private-test-value'}]:[];
        }
        if(!databaseAvailable)throw new Error('private-test-value postgres connection');
        return [{value:1}];
      },
    }).compile();
  app = module.createNestApplication({ logger: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});

after(async () => { await app?.close(); });

test('versioned liveness exposes no infrastructure details', async () => {
  const response = await fetch(`${base}/api/v1/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.equal((await fetch(`${base}/health`)).status, 404);
});

test('readiness returns a safe 503 on database failure, independently of liveness', async () => {
  assert.equal((await fetch(`${base}/api/v1/health/ready`)).status, 200);
  databaseAvailable = false;
  try {
    const response = await fetch(`${base}/api/v1/health/ready`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      statusCode: 503, error: { code: 'SERVICE_UNAVAILABLE', message: 'الخدمة غير متاحة مؤقتًا' },
    });
    assert.equal((await fetch(`${base}/api/v1/health`)).status, 200);
  } finally { databaseAvailable = true; }
});

test('CORS permits credentials only for explicit configured origins', async () => {
  for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173']) {
    const response = await fetch(`${base}/api/v1/health`, { headers: { Origin: origin } });
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
  }
  const denied = await fetch(`${base}/api/v1/health`, { headers: { Origin: 'https://untrusted.example' } });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  const preflight = await fetch(`${base}/api/v1/health`, {
    method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'GET' },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:5173');
});

test('two public clinic identities have distinct branding and an exact public field allowlist', async () => {
  const results = [];
  for (const slug of ['ward-demo', 'nour-demo']) {
    const response = await fetch(`${base}/api/v1/public/clinics/${slug}/branding?clinicId=ignored`);
    assert.equal(response.status, 200);
    const body = await response.json() as { slug: string; displayName: string; branding: Record<string, unknown> };
    assert.deepEqual(Object.keys(body).sort(), ['branding', 'displayName', 'slug']);
    assert.deepEqual(Object.keys(body.branding).sort(), ['accentColor', 'logoUrl', 'primaryColor', 'secondaryColor']);
    assert(!JSON.stringify(body).includes('private'));
    results.push(body);
  }
  assert.notEqual(results[0].branding.primaryColor, results[1].branding.primaryColor);
  assert.deepEqual(lookups.slice(-2).map(query => query.where), [
    { slug: 'ward-demo', status: 'ACTIVE' }, { slug: 'nour-demo', status: 'ACTIVE' },
  ]);
});

test('suspended, missing and malformed clinic identities are rejected', async () => {
  for (const slug of ['missing-demo', 'suspended-demo']) {
    assert.equal((await fetch(`${base}/api/v1/public/clinics/${slug}/branding`)).status, 404);
  }
  assert.equal((await fetch(`${base}/api/v1/public/clinics/Bad_Slug/branding`)).status, 400);
});

test('request validation rejects unknown fields and wrong types', async () => {
  const preauth = await fetch(`${base}/api/v1/auth/csrf`);
  const csrfToken = (await preauth.json() as { csrfToken: string }).csrfToken;
  const cookie = preauth.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  for (const body of [{ value: 42 }, { value: 'valid', clinicId: 'mass-assigned' }]) {
    const response = await fetch(`${base}/api/v1/test/validation`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173', Cookie: cookie, 'X-CSRF-Token': csrfToken }, body: JSON.stringify(body),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json() as { error: { code: string } }).error.code, 'INVALID_REQUEST');
  }
});

test('unexpected application and database exceptions never expose secrets or stack traces', async () => {
  for (const path of ['test/failure', 'public/clinics/database-error/branding']) {
    const response = await fetch(`${base}/api/v1/${path}`);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      statusCode: 500, error: { code: 'INTERNAL_ERROR', message: 'حدث خطأ داخلي' },
    });
  }
  assert.equal((await fetch(`${base}/api/v1/patients`)).status, 404);
  assert.equal((await fetch(`${base}/api/v1/users`)).status, 404);
});

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { config } from 'dotenv';
import { isEmail } from 'class-validator';
import { PrismaPg } from '@prisma/adapter-pg';
import { ClinicRole, PrismaClient } from '../src/generated/prisma/client.js';
import { hashPassword } from '../src/auth/password.js';

type MembershipInput = { clinicSlug: string; role: ClinicRole };
export async function provisionUser(prisma: PrismaClient, input: {
  email: string; name: string; password: string; memberships: MembershipInput[]; updateExisting?: boolean;
}) {
  const email = input.email.trim().toLowerCase(), name = input.name.trim();
  if (!isEmail(email) || email.length > 254 || !name || name.length > 150 || input.password.length < 15 || input.password.length > 128 ||
      !Array.isArray(input.memberships) || !input.memberships.length || new Set(input.memberships.map(m=>m.clinicSlug)).size !== input.memberships.length ||
      input.memberships.some(m=>!Object.values(ClinicRole).includes(m.role) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(m.clinicSlug))) {
    throw new Error('Invalid provisioning input');
  }
  const passwordHash = await hashPassword(input.password);
  return prisma.$transaction(async tx => {
    const clinics = await tx.clinic.findMany({ where: { slug: { in: input.memberships.map(m=>m.clinicSlug) }, status: 'ACTIVE' } });
    if (clinics.length !== input.memberships.length) throw new Error('Select active existing clinics');
    const existing = await tx.user.findUnique({ where: { email } });
    if (existing && !input.updateExisting) throw new Error('Existing account requires explicit --update-existing');
    const user = existing
      ? await tx.user.update({ where: { id: existing.id }, data: { name, passwordHash, status: 'ACTIVE', authVersion: { increment: 1 } } })
      : await tx.user.create({ data: { email, name, passwordHash, status: 'ACTIVE' } });
    for (const m of input.memberships) {
      const clinicId = clinics.find(c=>c.slug===m.clinicSlug)!.id;
      await tx.clinicMembership.upsert({ where: { clinicId_userId: { clinicId, userId: user.id } },
        create: { clinicId, userId: user.id, role: m.role, status: 'ACTIVE' }, update: { role: m.role, status: 'ACTIVE' } });
    }
    await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    return { id: user.id, email: user.email, memberships: input.memberships.length };
  });
}

async function passwordPrompt(): Promise<string> {
  if (!stdin.isTTY) throw new Error('Provide password securely through LAMSSA_DEV_PASSWORD');
  stdout.write('Password (15–128 characters; hidden): ');
  const muted = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const rl = createInterface({ input: stdin, output: muted, terminal: true });
  try { return await rl.question(''); } finally { rl.close(); stdout.write('\n'); }
}
async function main() {
  config({ path: resolve(import.meta.dirname, '../../../.env'), quiet: true });
  const target = new URL(process.env.DATABASE_URL ?? '');
  if (process.env.NODE_ENV !== 'development' || !['127.0.0.1','localhost','[::1]'].includes(target.hostname) || !target.pathname.endsWith('_dev')) {
    throw new Error('Provisioning is restricted to an explicit local development database');
  }
  const prompt = async (label: string) => {
    if (!stdin.isTTY) throw new Error('Missing provisioning environment values');
    const rl = createInterface({ input: stdin, output: stdout });
    try { return await rl.question(label); } finally { rl.close(); }
  };
  const email = process.env.LAMSSA_DEV_EMAIL ?? await prompt('Email: ');
  const name = process.env.LAMSSA_DEV_NAME ?? await prompt('Display name: ');
  const membershipText = process.env.LAMSSA_DEV_MEMBERSHIPS ?? await prompt('Memberships as JSON [{"clinicSlug":"...","role":"..."}]: ');
  const password = process.env.LAMSSA_DEV_PASSWORD ?? await passwordPrompt();
  delete process.env.LAMSSA_DEV_PASSWORD;
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 }) });
  try {
    const result = await provisionUser(prisma, { email, name, password, memberships: JSON.parse(membershipText) as MembershipInput[], updateExisting: process.argv.includes('--update-existing') });
    console.info(`Development account provisioned with ${result.memberships} clinic membership(s). Existing sessions revoked. No credentials printed.`);
  } finally { await prisma.$disconnect(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch(() => { console.error('Provisioning failed: verify local development mode, input, clinic membership roles and explicit --update-existing for an existing account. Credentials withheld.'); process.exitCode=1; });
}

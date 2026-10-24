import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const clinics = [
  {
    id: 'a1000000-0000-4000-8000-000000000001', slug: 'ward-demo',
    legalName: 'مؤسسة ورد التجريبية', displayName: 'عيادة ورد التجريبية',
    timezone: 'Asia/Aden', currency: 'YER', hostname: 'ward.lamssa.example',
    primaryColor: '#7854D9', secondaryColor: '#F6F8FC', accentColor: '#A886F3',
  },
  {
    id: 'a1000000-0000-4000-8000-000000000002', slug: 'nour-demo',
    legalName: 'مؤسسة نور التجريبية', displayName: 'عيادة نور التجريبية',
    timezone: 'Asia/Riyadh', currency: 'SAR', hostname: 'nour.lamssa.example',
    primaryColor: '#087F8C', secondaryColor: '#F0FAF8', accentColor: '#F4A261',
  },
];

export async function seedDemoClinics(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(async tx => {
    for (const fixture of clinics) {
      const { hostname, primaryColor, secondaryColor, accentColor, ...data } = fixture;
      const clinic = await tx.clinic.upsert({ where: { id: data.id }, create: data, update: {} });
      if (clinic.slug !== data.slug) throw new Error('Demo clinic identity collision');
      await tx.clinicBranding.upsert({
        where: { clinicId: clinic.id },
        create: { clinicId: clinic.id, primaryColor, secondaryColor, accentColor }, update: {},
      });
      const domain = await tx.clinicDomain.upsert({
        where: { hostname }, create: { clinicId: clinic.id, hostname }, update: {},
      });
      if (domain.clinicId !== clinic.id) throw new Error('Demo domain identity collision');
    }
  });
}

async function main(): Promise<void> {
  config({ path: resolve(import.meta.dirname, '../../../.env'), quiet: true });
  if (!['development', 'test'].includes(process.env.NODE_ENV ?? '')) {
    throw new Error('Demo seed requires explicit development/test mode');
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 }),
  });
  try {
    await seedDemoClinics(prisma);
    console.info('Two fictional clinic identities are available. No users or passwords were created.');
  } finally { await prisma.$disconnect(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch(() => {
    console.error('Demo seed failed. Check development mode, database availability and fixture collisions.');
    process.exitCode = 1;
  });
}

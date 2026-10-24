import { Injectable, OnApplicationShutdown, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../generated/prisma/client.js';
import type { Environment } from '../config/environment.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnApplicationShutdown {
  constructor(config: ConfigService<Environment, true>) {
    const adapter = new PrismaPg({ options: '-c timezone=UTC',
      connectionString: config.get('DATABASE_URL', { infer: true }),
      max: 10,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 10000,
    });
    super({ adapter, log: [] });
  }

  async assertRuntimeRole(tx: Pick<Prisma.TransactionClient,'$queryRaw'>): Promise<void> {
    const [role]=await tx.$queryRaw<{unsafe:boolean}[]>`SELECT (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('Clinic','ClinicBranding','ClinicDomain','ClinicMembership')
        AND pg_catalog.pg_has_role(current_user,c.relowner,'USAGE')
    )) AS unsafe FROM pg_catalog.pg_roles r WHERE r.rolname=current_user`;
    if(!role || role.unsafe)throw new ServiceUnavailableException();
  }

  // Prisma opens its pool lazily. Liveness can run without PostgreSQL;
  // readiness and database-backed endpoints must fail safely if it is unavailable.
  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}

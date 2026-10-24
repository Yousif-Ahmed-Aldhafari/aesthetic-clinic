import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import type { Environment } from '../config/environment.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnApplicationShutdown {
  constructor(config: ConfigService<Environment, true>) {
    const adapter = new PrismaPg({
      connectionString: config.get('DATABASE_URL', { infer: true }),
      max: 10,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 10000,
    });
    super({ adapter, log: [] });
  }

  // Prisma opens its pool lazily. Liveness can run without PostgreSQL;
  // readiness and database-backed endpoints must fail safely if it is unavailable.
  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}

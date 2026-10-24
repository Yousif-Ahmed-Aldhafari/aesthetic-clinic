import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Environment } from '../config/environment.js';
import { digest } from './crypto.js';

export function loginBucketKey(kind: string, value: string, window: number): string { return digest(`${kind}:${value}:${window}`); }
@Injectable()
export class LoginLimiter {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService<Environment, true>) {}
  async consume(ip: string, email: string): Promise<void> {
    const now = Date.now(), window = Math.floor(now / 900000);
    await this.prisma.loginBucket.deleteMany({ where: { expiresAt: { lt: new Date(now) } } });
    for (const [kind, value, limit] of [
      ['ip', ip, this.config.get('AUTH_LOGIN_IP_LIMIT', { infer: true })],
      ['account', email, this.config.get('AUTH_LOGIN_ACCOUNT_LIMIT', { infer: true })],
    ] as const) {
      const bucket = await this.prisma.loginBucket.upsert({
        where: { key: loginBucketKey(kind, value, window) },
        create: { key: loginBucketKey(kind, value, window), expiresAt: new Date((window+1)*900000) },
        update: { attempts: { increment: 1 } },
      });
      if (bucket.attempts > limit) throw new HttpException('Rate limited', 429);
    }
  }
}

import { Controller, Get, Header, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseHealthService } from '../prisma/database-health.service.js';
import { PublicRoute } from '../auth/access.js';

@Controller('health')
@PublicRoute()
export class HealthController {
  constructor(private readonly database: DatabaseHealthService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  @Header('Cache-Control', 'no-store')
  async ready() {
    try {
      await this.database.check();
      return { status: 'ready' };
    } catch {
      throw new ServiceUnavailableException();
    }
  }
}

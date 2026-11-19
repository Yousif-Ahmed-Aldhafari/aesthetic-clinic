import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PediatricsController } from './pediatrics.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [PediatricsController],
})
export class PediatricsModule {}

import { Module } from '@nestjs/common';
import { ClinicalOrdersController } from './clinical-orders.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [ClinicalOrdersController],
})
export class ClinicalOrdersModule {}

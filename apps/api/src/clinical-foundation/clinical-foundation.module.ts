import { Module } from '@nestjs/common';
import { ClinicalFoundationController } from './clinical-foundation.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [ClinicalFoundationController],
})
export class ClinicalFoundationModule {}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ClinicalFollowUpController } from './clinical-followup.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [ClinicalFollowUpController],
  exports: [],
})
export class ClinicalFollowUpModule {}


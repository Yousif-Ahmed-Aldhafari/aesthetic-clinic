import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ClinicalGovernanceRepository } from '../prisma/clinical-governance.repository.js';
import { ClinicalGovernanceController } from './clinical-governance.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [ClinicalGovernanceController],
  providers: [ClinicalGovernanceRepository],
  exports: [ClinicalGovernanceRepository],
})
export class ClinicalGovernanceModule {}

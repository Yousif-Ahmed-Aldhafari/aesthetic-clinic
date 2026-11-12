import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CostingController } from './costing.controller.js';
import { CostingRepository } from '../prisma/costing.repository.js';

@Module({
  imports: [PrismaModule],
  controllers: [CostingController],
  providers: [CostingRepository],
  exports: [CostingRepository],
})
export class CostingModule {}

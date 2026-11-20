import { Module } from '@nestjs/common';
import { OrthopedicsPhysiotherapyController } from './orthopedics-physiotherapy.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [OrthopedicsPhysiotherapyController],
})
export class OrthopedicsPhysiotherapyModule {}

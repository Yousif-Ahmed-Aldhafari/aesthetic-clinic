import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { InteroperabilityController } from './interoperability.controller.js';
import { TerminologyService } from './terminology.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [InteroperabilityController],
  providers: [TerminologyService],
  exports: [TerminologyService],
})
export class InteroperabilityModule {}

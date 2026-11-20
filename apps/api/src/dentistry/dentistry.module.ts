import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { DentistryController } from './dentistry.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [DentistryController],
})
export class DentistryModule {}

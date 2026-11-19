import { Module } from '@nestjs/common';
import { OphthalmologyEntController } from './ophthalmology-ent.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [OphthalmologyEntController],
})
export class OphthalmologyEntModule {}

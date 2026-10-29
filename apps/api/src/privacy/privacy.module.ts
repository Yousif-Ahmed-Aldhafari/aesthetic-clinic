import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrivacyController } from './privacy.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [PrivacyController],
  exports: [],
})
export class PrivacyModule {}

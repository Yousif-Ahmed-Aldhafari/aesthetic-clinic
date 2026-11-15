import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SpecialtyController } from './specialty.controller.js';
import { SpecialtyPrivilegeGuard } from './specialty-auth.guard.js';

@Module({
  imports: [PrismaModule],
  controllers: [SpecialtyController],
  providers: [SpecialtyPrivilegeGuard],
  exports: [SpecialtyPrivilegeGuard],
})
export class SpecialtyModule {}

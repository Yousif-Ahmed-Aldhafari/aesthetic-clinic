import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { BranchController } from './branch.controller.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [BranchController],
})
export class BranchModule {}

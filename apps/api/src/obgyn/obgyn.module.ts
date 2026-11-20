import { Module } from '@nestjs/common';
import { ObGynController } from './obgyn.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [ObGynController],
})
export class ObGynModule {}

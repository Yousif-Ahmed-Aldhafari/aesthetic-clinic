import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [InventoryController],
})
export class InventoryModule {}


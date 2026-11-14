import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ClinicalFormsController } from './clinical-forms.controller.js';
@Module({imports:[PrismaModule],controllers:[ClinicalFormsController]})
export class ClinicalFormsModule{}

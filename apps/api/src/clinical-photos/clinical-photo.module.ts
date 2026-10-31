import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ClinicalPhotoRepository } from '../prisma/clinical-photo.repository.js';
import { ClinicalPhotoController } from './clinical-photo.controller.js';
import { ClinicalMediaCryptoService } from './clinical-media-crypto.service.js';
import { ClinicalMediaProcessingService } from './clinical-media-processing.service.js';
import { ClinicalMediaStore, LocalClinicalMediaStore } from './clinical-media-store.js';

@Module({
  imports: [PrismaModule],
  controllers: [ClinicalPhotoController],
  providers: [
    ClinicalMediaCryptoService,
    ClinicalMediaProcessingService,
    LocalClinicalMediaStore,
    { provide: ClinicalMediaStore, useExisting: LocalClinicalMediaStore },
    ClinicalPhotoRepository,
  ],
  exports: [
    ClinicalMediaCryptoService,
    ClinicalMediaProcessingService,
    ClinicalMediaStore,
    LocalClinicalMediaStore,
    ClinicalPhotoRepository,
  ],
})
export class ClinicalPhotoModule {}

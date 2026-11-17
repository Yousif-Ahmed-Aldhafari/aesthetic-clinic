import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { Environment } from '../config/environment.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { EnvelopeEncryptionService } from './envelope-encryption.service.js';
import { ExternalKmsProvider } from './external-kms.provider.js';
import { KMS_PROVIDER_TOKEN, KeyManagementService } from './key-management.service.js';
import { KeyRotationMigrationService } from './key-rotation-migration.service.js';
import { KmsAdminController, KmsClinicController } from './kms.controller.js';
import type { KmsProvider } from './kms.types.js';
import { LocalKmsProvider } from './local-kms.provider.js';
import { TestKmsProvider } from './test-kms.provider.js';

@Global()
@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [KmsClinicController, KmsAdminController],
  providers: [
    LocalKmsProvider,
    ExternalKmsProvider,
    TestKmsProvider,
    {
      provide: KMS_PROVIDER_TOKEN,
      useFactory: (
        config: ConfigService<Environment, true>,
        local: LocalKmsProvider,
        external: ExternalKmsProvider,
        synthetic: TestKmsProvider,
      ): KmsProvider => {
        const providerChoice = config.get('KMS_PROVIDER', { infer: true }) || 'local';
        if (providerChoice === 'external') {
          return external;
        }
        if (providerChoice === 'synthetic') {
          return synthetic;
        }
        return local;
      },
      inject: [ConfigService, LocalKmsProvider, ExternalKmsProvider, TestKmsProvider],
    },
    KeyManagementService,
    EnvelopeEncryptionService,
    KeyRotationMigrationService,
  ],
  exports: [
    KMS_PROVIDER_TOKEN,
    KeyManagementService,
    EnvelopeEncryptionService,
    KeyRotationMigrationService,
  ],
})
export class KmsModule {}

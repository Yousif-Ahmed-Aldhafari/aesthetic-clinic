import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { VerifiedPrincipal } from './verified-sessions.js';
import { TenantDatabaseService } from './tenant-database.service.js';
import { AuditRepository } from './audit.repository.js';
import { ClinicalMediaCryptoService } from '../clinical-photos/clinical-media-crypto.service.js';
import { ClinicalMediaStore } from '../clinical-photos/clinical-media-store.js';
import {
  ClinicalMediaProcessingService,
  type UploadedFilePayload,
} from '../clinical-photos/clinical-media-processing.service.js';
import type {
  ArchivePhotoDto,
  CreatePhotoAnnotationDto,
  CreatePhotoComparisonDto,
  CreatePhotoSessionDto,
  UploadPhotoDto,
} from '../clinical-photos/clinical-photo-input.js';

const clean = <T extends Record<string, unknown>>(record: T): T =>
  Object.fromEntries(Object.entries(record).filter(([, v]) => v !== undefined)) as T;

@Injectable()
export class ClinicalPhotoRepository {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditRepository,
    private readonly processing: ClinicalMediaProcessingService,
    private readonly crypto: ClinicalMediaCryptoService,
    private readonly store: ClinicalMediaStore,
  ) {}

  /**
   * Creates a clinical photo capture session after strictly verifying valid CLINICAL_PHOTOGRAPHY consent.
   */
  async createSession(proof: VerifiedPrincipal, clinicId: string, input: CreatePhotoSessionDto) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.photos.upload'], async (tx, c) => {
      const patient = await tx.patient.findFirst({
        where: { id: input.patientId, clinicId: c.clinicId, status: 'ACTIVE' },
      });
      if (!patient) throw new NotFoundException('Patient not found or inactive');

      const now = new Date();

      // Strict consent verification: MUST be active, verified, unwithdrawn CLINICAL_PHOTOGRAPHY consent
      const consent = await tx.patientConsent.findFirst({
        where: {
          id: input.consentId,
          clinicId: c.clinicId,
          patientId: input.patientId,
          purpose: 'CLINICAL_PHOTOGRAPHY',
          status: 'ACTIVE',
        },
        include: {
          withdrawal: true,
          signatureEvidence: true,
        },
      });

      if (!consent) {
        await this.audit.record({
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'clinical.photo-session.blocked',
          category: 'CLINICAL',
          targetType: 'ClinicalPhotoSession',
          targetId: input.patientId,
          outcome: 'DENIED',
          metadata: { reason: 'VALID_PHOTOGRAPHY_CONSENT_REQUIRED' },
        });
        throw new ForbiddenException('VALID_PHOTOGRAPHY_CONSENT_REQUIRED');
      }

      if (!consent.verifiedAt || !consent.verifiedByMembershipId) {
        throw new ForbiddenException('Consent has not been verified by a clinician');
      }

      if (!consent.validFrom || consent.validFrom > now || (consent.expiresAt && consent.expiresAt <= now)) {
        throw new ForbiddenException('Consent validity period has expired');
      }

      if (consent.withdrawal) {
        throw new ForbiddenException('Consent has been withdrawn');
      }

      // Validate optional clinical linkages within this clinic and patient
      if (input.encounterId) {
        const encounter = await tx.clinicalEncounter.findFirst({
          where: { id: input.encounterId, clinicId: c.clinicId, patientId: input.patientId },
        });
        if (!encounter) throw new NotFoundException('Clinical encounter not found for this patient');
      }

      if (input.treatmentPlanId) {
        const plan = await tx.treatmentPlan.findFirst({
          where: { id: input.treatmentPlanId, clinicId: c.clinicId, patientId: input.patientId },
        });
        if (!plan) throw new NotFoundException('Treatment plan not found for this patient');
      }

      if (input.treatmentPlanItemId) {
        const item = await tx.treatmentPlanItem.findFirst({
          where: { id: input.treatmentPlanItemId, clinicId: c.clinicId },
        });
        if (!item) throw new NotFoundException('Treatment plan item not found');
      }

      if (input.procedureExecutionId) {
        const exec = await tx.procedureExecution.findFirst({
          where: { id: input.procedureExecutionId, clinicId: c.clinicId, patientId: input.patientId },
        });
        if (!exec) throw new NotFoundException('Procedure execution not found for this patient');
      }

      const session = await tx.clinicalPhotoSession.create({
        data: {
          clinicId: c.clinicId,
          patientId: input.patientId,
          clinicianMembershipId: c.membershipId,
          consentId: input.consentId,
          encounterId: input.encounterId || null,
          treatmentPlanId: input.treatmentPlanId || null,
          treatmentPlanItemId: input.treatmentPlanItemId || null,
          procedureExecutionId: input.procedureExecutionId || null,
          sessionDate: new Date(input.sessionDate),
          notes: input.notes?.trim() || null,
        },
        include: {
          clinician: { select: { id: true, user: { select: { name: true } } } },
          consent: { select: { id: true, purpose: true, status: true } },
        },
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'clinical.photo-session.create',
          category: 'CLINICAL',
          targetType: 'ClinicalPhotoSession',
          targetId: session.id,
          outcome: 'SUCCESS',
          metadata: {
            patientId: input.patientId,
            sessionDate: input.sessionDate,
            consentId: input.consentId,
          },
        },
        tx,
      );

      return clean(session as unknown as Record<string, unknown>);
    });
  }

  /**
   * Lists clinical photo sessions for an active patient.
   */
  async listSessions(proof: VerifiedPrincipal, clinicId: string, patientId: string) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.photos.read'], async (tx, c) => {
      const patient = await tx.patient.findFirst({
        where: { id: patientId, clinicId: c.clinicId },
      });
      if (!patient) throw new NotFoundException('Patient not found');

      const sessions = await tx.clinicalPhotoSession.findMany({
        where: { clinicId: c.clinicId, patientId },
        include: {
          clinician: { select: { id: true, user: { select: { name: true } } } },
          consent: { select: { id: true, purpose: true, status: true, expiresAt: true } },
          encounter: { select: { id: true, createdAt: true } },
          treatmentPlan: { select: { id: true } },
          procedureExecution: { select: { id: true, procedureNameArSnapshot: true, status: true } },
          photos: {
            where: { isArchived: false },
            select: {
              id: true,
              category: true,
              bodyArea: true,
              caption: true,
              takenAt: true,
              mimeType: true,
              width: true,
              height: true,
              sha256Digest: true,
              createdAt: true,
              annotations: { select: { id: true } },
            },
            orderBy: { takenAt: 'asc' },
          },
        },
        orderBy: [{ sessionDate: 'desc' }, { createdAt: 'desc' }],
      });

      return {
        items: sessions.map((s) => clean(s as unknown as Record<string, unknown>)),
      };
    });
  }

  /**
   * Uploads, normalizes, strips EXIF, and encrypts a clinical photograph at rest under an active session.
   */
  async uploadPhoto(
    proof: VerifiedPrincipal,
    clinicId: string,
    sessionId: string,
    file: UploadedFilePayload | undefined,
    input: UploadPhotoDto,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.photos.upload'], async (tx, c) => {
      const session = await tx.clinicalPhotoSession.findFirst({
        where: { id: sessionId, clinicId: c.clinicId },
        include: {
          consent: {
            include: { withdrawal: true },
          },
        },
      });
      if (!session) throw new NotFoundException('Photo capture session not found');

      const now = new Date();
      // Re-verify consent validity at the moment of photo upload
      const consent = session.consent;
      if (
        consent.status !== 'ACTIVE' ||
        consent.withdrawal ||
        (consent.expiresAt && consent.expiresAt <= now) ||
        (consent.validFrom && consent.validFrom > now)
      ) {
        throw new ForbiddenException('Clinical photography consent is no longer active or has been withdrawn');
      }

      // Process, normalize, and strip EXIF metadata using Sharp
      const processed = await this.processing.processAndNormalizeImage(file);

      const photoId = randomUUID();
      const storageKey = `${c.clinicId}/${photoId}.enc`;
      const thumbnailStorageKey = `${c.clinicId}/${photoId}.thumb.enc`;

      // Encrypt canonical master and thumbnail at rest with AES-256-GCM
      const encryptedMaster = this.crypto.encryptMedia(processed.canonicalBytes);
      const encryptedThumbnail = this.crypto.encryptMedia(processed.thumbnailBytes);

      // Store encrypted assets to private storage
      await this.store.put(storageKey, encryptedMaster);
      try {
        await this.store.put(thumbnailStorageKey, encryptedThumbnail);
      } catch (err) {
        await this.store.remove(storageKey);
        throw err;
      }

      try {
        const photo = await tx.clinicalPhoto.create({
          data: {
            id: photoId,
            clinicId: c.clinicId,
            patientId: session.patientId,
            photoSessionId: session.id,
            clinicianMembershipId: c.membershipId,
            category: input.category,
            bodyArea: input.bodyArea.trim(),
            caption: input.caption?.trim() || null,
            storageKey,
            thumbnailStorageKey,
            originalFileName: file?.originalname?.slice(0, 255) || 'photo.webp',
            mimeType: processed.mimeType,
            byteSize: processed.byteSize,
            sha256Digest: processed.sha256Digest,
            width: processed.width,
            height: processed.height,
            takenAt: input.takenAt ? new Date(input.takenAt) : now,
          },
          select: {
            id: true,
            clinicId: true,
            patientId: true,
            photoSessionId: true,
            category: true,
            bodyArea: true,
            caption: true,
            mimeType: true,
            byteSize: true,
            sha256Digest: true,
            width: true,
            height: true,
            takenAt: true,
            version: true,
            createdAt: true,
          },
        });

        await this.audit.record(
          {
            clinicId: c.clinicId,
            actorId: c.userId,
            action: 'clinical.photo.upload',
            category: 'CLINICAL',
            targetType: 'ClinicalPhoto',
            targetId: photo.id,
            outcome: 'SUCCESS',
            metadata: {
              sessionId: session.id,
              category: input.category,
              bodyArea: input.bodyArea.trim(),
              sha256Digest: processed.sha256Digest,
              byteSize: processed.byteSize,
            },
          },
          tx,
        );

        return clean(photo as unknown as Record<string, unknown>);
      } catch (dbErr) {
        // Rollback disk writes if DB transaction fails
        await this.store.remove(storageKey);
        await this.store.remove(thumbnailStorageKey);
        throw dbErr;
      }
    });
  }

  /**
   * Retrieves photo metadata without exposing disk paths.
   */
  async getPhotoMetadata(proof: VerifiedPrincipal, clinicId: string, photoId: string) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.photos.read'], async (tx, c) => {
      const photo = await tx.clinicalPhoto.findFirst({
        where: { id: photoId, clinicId: c.clinicId },
        include: {
          clinician: { select: { id: true, user: { select: { name: true } } } },
          session: {
            select: {
              id: true,
              sessionDate: true,
              consent: { select: { id: true, status: true, purpose: true } },
            },
          },
          annotations: {
            include: { author: { select: { user: { select: { name: true } } } } },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      if (!photo) throw new NotFoundException('Clinical photograph not found');

      return clean({
        id: photo.id,
        patientId: photo.patientId,
        photoSessionId: photo.photoSessionId,
        category: photo.category,
        bodyArea: photo.bodyArea,
        caption: photo.caption,
        mimeType: photo.mimeType,
        byteSize: photo.byteSize,
        sha256Digest: photo.sha256Digest,
        width: photo.width,
        height: photo.height,
        takenAt: photo.takenAt,
        isArchived: photo.isArchived,
        archivedAt: photo.archivedAt,
        archivedReason: photo.archivedReason,
        version: photo.version,
        clinician: photo.clinician,
        session: photo.session,
        annotations: photo.annotations,
        createdAt: photo.createdAt,
      } as unknown as Record<string, unknown>);
    });
  }

  /**
   * Decrypts and streams an authorized clinical photograph or thumbnail.
   */
  async getPhotoDecryptedStream(
    proof: VerifiedPrincipal,
    clinicId: string,
    photoId: string,
    variant: 'original' | 'thumbnail',
  ) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.photos.read'], async (tx, c) => {
      const photo = await tx.clinicalPhoto.findFirst({
        where: { id: photoId, clinicId: c.clinicId },
        select: {
          id: true,
          patientId: true,
          storageKey: true,
          thumbnailStorageKey: true,
          mimeType: true,
          sha256Digest: true,
          isArchived: true,
        },
      });
      if (!photo) throw new NotFoundException('Clinical photo not found');

      const storageKey = variant === 'thumbnail' ? photo.thumbnailStorageKey : photo.storageKey;
      const encryptedBytes = await this.store.read(storageKey);
      const decryptedBytes = this.crypto.decryptMedia(encryptedBytes);

      // Audit download/viewing of full image or thumbnail
      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: variant === 'original' ? 'clinical.photo.read' : 'clinical.photo.thumbnail.read',
          category: 'CLINICAL',
          targetType: 'ClinicalPhoto',
          targetId: photo.id,
          outcome: 'SUCCESS',
          metadata: { variant },
        },
        tx,
      );

      return {
        buffer: decryptedBytes,
        mimeType: photo.mimeType,
        sha256Digest: photo.sha256Digest,
      };
    });
  }

  /**
   * Creates a before-and-after comparison group.
   */
  async createComparison(proof: VerifiedPrincipal, clinicId: string, patientId: string, input: CreatePhotoComparisonDto) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.photos.compare'], async (tx, c) => {
      if (input.beforePhotoId === input.afterPhotoId) {
        throw new BadRequestException('Before and after photographs must be distinct assets');
      }

      const [before, after] = await Promise.all([
        tx.clinicalPhoto.findFirst({
          where: { id: input.beforePhotoId, clinicId: c.clinicId, patientId },
        }),
        tx.clinicalPhoto.findFirst({
          where: { id: input.afterPhotoId, clinicId: c.clinicId, patientId },
        }),
      ]);

      if (!before || !after) {
        throw new NotFoundException('One or both comparison photographs not found for this patient');
      }

      // Verify category logic: beforePhoto should be BEFORE or FOLLOW_UP, afterPhoto should be AFTER or FOLLOW_UP
      if (before.category === 'AFTER' && after.category === 'BEFORE') {
        throw new BadRequestException('Inverted comparison order: before photo has AFTER category');
      }

      const comparison = await tx.photoComparisonGroup.create({
        data: {
          clinicId: c.clinicId,
          patientId,
          clinicianMembershipId: c.membershipId,
          title: input.title.trim(),
          notes: input.notes?.trim() || null,
          beforePhotoId: input.beforePhotoId,
          afterPhotoId: input.afterPhotoId,
        },
        include: {
          clinician: { select: { user: { select: { name: true } } } },
          beforePhoto: { select: { id: true, category: true, bodyArea: true, takenAt: true } },
          afterPhoto: { select: { id: true, category: true, bodyArea: true, takenAt: true } },
        },
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'clinical.photo-comparison.create',
          category: 'CLINICAL',
          targetType: 'PhotoComparisonGroup',
          targetId: comparison.id,
          outcome: 'SUCCESS',
          metadata: {
            patientId,
            beforePhotoId: input.beforePhotoId,
            afterPhotoId: input.afterPhotoId,
          },
        },
        tx,
      );

      return clean(comparison as unknown as Record<string, unknown>);
    });
  }

  /**
   * Lists comparison groups for a patient.
   */
  async listComparisons(proof: VerifiedPrincipal, clinicId: string, patientId: string) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.photos.read'], async (tx, c) => {
      const items = await tx.photoComparisonGroup.findMany({
        where: { clinicId: c.clinicId, patientId },
        include: {
          clinician: { select: { user: { select: { name: true } } } },
          beforePhoto: { select: { id: true, category: true, bodyArea: true, takenAt: true, sha256Digest: true } },
          afterPhoto: { select: { id: true, category: true, bodyArea: true, takenAt: true, sha256Digest: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return {
        items: items.map((i) => clean(i as unknown as Record<string, unknown>)),
      };
    });
  }

  /**
   * Adds an attributable non-destructive annotation to a photo.
   */
  async addAnnotation(proof: VerifiedPrincipal, clinicId: string, photoId: string, input: CreatePhotoAnnotationDto) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.photos.annotate'], async (tx, c) => {
      const photo = await tx.clinicalPhoto.findFirst({
        where: { id: photoId, clinicId: c.clinicId },
      });
      if (!photo) throw new NotFoundException('Clinical photo not found');

      const annotation = await tx.photoAnnotation.create({
        data: {
          clinicId: c.clinicId,
          photoId,
          authorMembershipId: c.membershipId,
          annotationType: input.annotationType.trim(),
          geometryJson: input.geometryJson?.trim() || null,
          comment: input.comment.trim(),
        },
        include: {
          author: { select: { user: { select: { name: true } } } },
        },
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'clinical.photo-annotation.create',
          category: 'CLINICAL',
          targetType: 'PhotoAnnotation',
          targetId: annotation.id,
          outcome: 'SUCCESS',
          metadata: {
            photoId,
            annotationType: input.annotationType,
          },
        },
        tx,
      );

      return clean(annotation as unknown as Record<string, unknown>);
    });
  }

  /**
   * Lists annotations for a photograph.
   */
  async listAnnotations(proof: VerifiedPrincipal, clinicId: string, photoId: string) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.photos.read'], async (tx, c) => {
      const photo = await tx.clinicalPhoto.findFirst({
        where: { id: photoId, clinicId: c.clinicId },
      });
      if (!photo) throw new NotFoundException('Clinical photo not found');

      const annotations = await tx.photoAnnotation.findMany({
        where: { clinicId: c.clinicId, photoId },
        include: {
          author: { select: { user: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'asc' },
      });

      return {
        items: annotations.map((a) => clean(a as unknown as Record<string, unknown>)),
      };
    });
  }

  /**
   * Archives a photograph with mandatory reason and optimistic concurrency version control.
   */
  async archivePhoto(proof: VerifiedPrincipal, clinicId: string, photoId: string, input: ArchivePhotoDto) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.photos.manage'], async (tx, c) => {
      const photo = await tx.clinicalPhoto.findFirst({
        where: { id: photoId, clinicId: c.clinicId },
      });
      if (!photo) throw new NotFoundException('Clinical photo not found');
      if (photo.isArchived) throw new ConflictException('Photo is already archived');
      if (photo.version !== input.expectedVersion) throw new ConflictException('Photo version mismatch');

      const now = new Date();

      const changed = await tx.clinicalPhoto.updateMany({
        where: { id: photoId, clinicId: c.clinicId, isArchived: false, version: input.expectedVersion },
        data: {
          isArchived: true,
          archivedAt: now,
          archivedReason: input.reason.trim(),
          version: { increment: 1 },
        },
      });

      if (changed.count !== 1) throw new ConflictException('Photo was modified concurrently');

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'clinical.photo.archive',
          category: 'CLINICAL',
          targetType: 'ClinicalPhoto',
          targetId: photoId,
          outcome: 'SUCCESS',
          metadata: { reason: input.reason.trim() },
        },
        tx,
      );

      return { success: true, archivedAt: now.toISOString() };
    });
  }
}

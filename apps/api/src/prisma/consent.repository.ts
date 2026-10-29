import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { TenantContext, TenantTransaction } from './tenant-database.service.js';
import { TenantDatabaseService } from './tenant-database.service.js';
import { AuditRepository } from './audit.repository.js';
import type { VerifiedPrincipal } from './verified-sessions.js';
import {
  ConsentListQuery,
  CreateConsentTemplateDto,
  CreateTemplateVersionDto,
  PreparePatientConsentDto,
  RefusePatientConsentDto,
  SignPatientConsentDto,
  TemplateVersionDto,
  UpdateConsentTemplateDto,
  VerifyPatientConsentDto,
  WithdrawPatientConsentDto,
} from '../consent/consent-input.js';

export function digestContent(
  titleAr: string,
  bodyAr: string,
  titleEn: string | null | undefined,
  bodyEn: string | null | undefined,
  risksTextAr: string,
  alternativesTextAr: string,
): string {
  const canonical = [
    titleAr.trim(),
    bodyAr.trim(),
    (titleEn || '').trim(),
    (bodyEn || '').trim(),
    risksTextAr.trim(),
    alternativesTextAr.trim(),
  ].join('\n');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function digestEvidence(
  clinicId: string,
  patientId: string,
  templateVersionId: string,
  contentDigest: string,
  capacity: string,
  signerName: string,
  signatureType: string,
  signatureData: string,
  signedAtIso: string,
): string {
  const canonical = `${clinicId}:${patientId}:${templateVersionId}:${contentDigest}:${capacity}:${signerName.trim()}:${signatureType}:${signatureData}:${signedAtIso}`;
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

const clean = <T extends Record<string, unknown>>(record: T): T =>
  Object.fromEntries(Object.entries(record).filter(([, v]) => v !== undefined)) as T;

@Injectable()
export class ConsentRepository {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditRepository,
  ) {}

  // -------------------------------------------------------------
  // Template Governance
  // -------------------------------------------------------------

  listTemplates(proof: VerifiedPrincipal, clinicId: string, query: ConsentListQuery) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.consent-templates.read'], async (tx, c) => {
      const take = query.pageSize + 1;
      const where: any = { clinicId: c.clinicId };
      if (query.purpose) where.purpose = query.purpose;
      if (query.procedureCatalogId) where.procedureCatalogId = query.procedureCatalogId;

      const rows = await tx.consentTemplate.findMany({
        where,
        take,
        skip: query.cursor ? 1 : 0,
        cursor: query.cursor ? { id: query.cursor } : undefined,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: {
          procedureCatalog: { select: { id: true, nameAr: true, nameEn: true, category: true } },
          versions: {
            orderBy: { versionNumber: 'desc' },
            take: 3,
            select: {
              id: true,
              versionNumber: true,
              status: true,
              titleAr: true,
              contentDigestSha256: true,
              publishedAt: true,
              createdAt: true,
            },
          },
        },
      });

      const nextCursor = rows.length > query.pageSize ? rows[query.pageSize - 1].id : null;
      const items = rows.slice(0, query.pageSize).map(clean);
      return { items, nextCursor };
    });
  }

  getTemplate(proof: VerifiedPrincipal, clinicId: string, id: string) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.consent-templates.read'], async (tx, c) => {
      const row = await tx.consentTemplate.findFirst({
        where: { id, clinicId: c.clinicId },
        include: {
          procedureCatalog: { select: { id: true, nameAr: true, nameEn: true, category: true } },
          versions: {
            orderBy: { versionNumber: 'desc' },
            include: {
              publishedBy: { select: { id: true, user: { select: { name: true } } } },
            },
          },
        },
      });
      if (!row) throw new NotFoundException();
      return clean(row);
    });
  }

  createTemplate(proof: VerifiedPrincipal, clinicId: string, input: CreateConsentTemplateDto) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.consent-templates.manage'], async (tx, c) => {
      if (input.procedureCatalogId) {
        const cat = await tx.aestheticProcedureCatalog.findFirst({
          where: { id: input.procedureCatalogId, clinicId: c.clinicId },
        });
        if (!cat) throw new NotFoundException('Procedure catalog entry not found');
      }

      const contentDigestSha256 = digestContent(
        input.titleAr,
        input.bodyAr,
        input.titleEn,
        input.bodyEn,
        input.risksTextAr,
        input.alternativesTextAr,
      );

      const template = await tx.consentTemplate.create({
        data: {
          clinicId: c.clinicId,
          purpose: input.purpose,
          title: input.title.trim(),
          procedureCatalogId: input.procedureCatalogId || null,
          versions: {
            create: {
              versionNumber: 1,
              status: 'DRAFT',
              titleAr: input.titleAr.trim(),
              bodyAr: input.bodyAr.trim(),
              titleEn: input.titleEn?.trim() || null,
              bodyEn: input.bodyEn?.trim() || null,
              risksTextAr: input.risksTextAr.trim(),
              alternativesTextAr: input.alternativesTextAr.trim(),
              contentDigestSha256,
            },
          },
        },
        include: {
          versions: true,
        },
      });

      await this.log(tx, c, 'clinical.consent.template-create', template.id, {
        purpose: template.purpose,
        title: template.title,
      });

      return clean(template);
    });
  }

  updateTemplate(proof: VerifiedPrincipal, clinicId: string, id: string, input: UpdateConsentTemplateDto) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.consent-templates.manage'], async (tx, c) => {
      const template = await tx.consentTemplate.findFirst({
        where: { id, clinicId: c.clinicId },
      });
      if (!template) throw new NotFoundException();
      if (template.version !== input.expectedVersion) throw new ConflictException('Template version mismatch');

      if (input.procedureCatalogId) {
        const cat = await tx.aestheticProcedureCatalog.findFirst({
          where: { id: input.procedureCatalogId, clinicId: c.clinicId },
        });
        if (!cat) throw new NotFoundException('Procedure catalog entry not found');
      }

      const data: any = { version: { increment: 1 } };
      if (input.title !== undefined) data.title = input.title.trim();
      if (input.active !== undefined) data.active = input.active;
      if (input.procedureCatalogId !== undefined) data.procedureCatalogId = input.procedureCatalogId;

      const row = await tx.consentTemplate.update({
        where: { id },
        data,
      });

      await this.log(tx, c, 'clinical.consent.template-update', id, { active: row.active });
      return clean(row);
    });
  }

  createTemplateVersion(proof: VerifiedPrincipal, clinicId: string, templateId: string, input: CreateTemplateVersionDto) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.consent-templates.manage'], async (tx, c) => {
      const template = await tx.consentTemplate.findFirst({
        where: { id: templateId, clinicId: c.clinicId },
      });
      if (!template) throw new NotFoundException();

      const latest = await tx.consentTemplateVersion.findFirst({
        where: { templateId, clinicId: c.clinicId },
        orderBy: { versionNumber: 'desc' },
      });
      const nextVersionNumber = (latest?.versionNumber || 0) + 1;

      const contentDigestSha256 = digestContent(
        input.titleAr,
        input.bodyAr,
        input.titleEn,
        input.bodyEn,
        input.risksTextAr,
        input.alternativesTextAr,
      );

      const version = await tx.consentTemplateVersion.create({
        data: {
          clinicId: c.clinicId,
          templateId,
          versionNumber: nextVersionNumber,
          status: 'DRAFT',
          titleAr: input.titleAr.trim(),
          bodyAr: input.bodyAr.trim(),
          titleEn: input.titleEn?.trim() || null,
          bodyEn: input.bodyEn?.trim() || null,
          risksTextAr: input.risksTextAr.trim(),
          alternativesTextAr: input.alternativesTextAr.trim(),
          contentDigestSha256,
        },
      });

      await this.log(tx, c, 'clinical.consent.template-version-create', version.id, {
        templateId,
        versionNumber: nextVersionNumber,
      });

      return clean(version);
    });
  }

  publishTemplateVersion(proof: VerifiedPrincipal, clinicId: string, templateId: string, versionId: string, input: TemplateVersionDto) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.consent-templates.manage'], async (tx, c) => {
      const version = await tx.consentTemplateVersion.findFirst({
        where: { id: versionId, templateId, clinicId: c.clinicId },
      });
      if (!version) throw new NotFoundException();
      if (version.version !== input.expectedVersion) throw new ConflictException('Template version mismatch');
      if (version.status !== 'DRAFT') throw new ConflictException('Only DRAFT versions can be published');

      const row = await tx.consentTemplateVersion.update({
        where: { id: versionId },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          publishedByMembershipId: c.membershipId,
          version: { increment: 1 },
        },
      });

      await this.log(tx, c, 'clinical.consent.template-publish', versionId, {
        templateId,
        versionNumber: row.versionNumber,
      });

      return clean(row);
    });
  }

  retireTemplateVersion(proof: VerifiedPrincipal, clinicId: string, templateId: string, versionId: string, input: TemplateVersionDto) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.consent-templates.manage'], async (tx, c) => {
      const version = await tx.consentTemplateVersion.findFirst({
        where: { id: versionId, templateId, clinicId: c.clinicId },
      });
      if (!version) throw new NotFoundException();
      if (version.version !== input.expectedVersion) throw new ConflictException('Template version mismatch');
      if (version.status !== 'PUBLISHED') throw new ConflictException('Only PUBLISHED versions can be retired');

      const row = await tx.consentTemplateVersion.update({
        where: { id: versionId },
        data: {
          status: 'RETIRED',
          version: { increment: 1 },
        },
      });

      await this.log(tx, c, 'clinical.consent.template-retire', versionId, {
        templateId,
        versionNumber: row.versionNumber,
      });

      return clean(row);
    });
  }

  // -------------------------------------------------------------
  // Patient Consent Lifecycle
  // -------------------------------------------------------------

  listPatientConsents(proof: VerifiedPrincipal, clinicId: string, query: ConsentListQuery) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.consents.read'], async (tx, c) => {
      const take = query.pageSize + 1;
      const where: any = { clinicId: c.clinicId };
      if (query.patientId) where.patientId = query.patientId;
      if (query.purpose) where.purpose = query.purpose;
      if (query.status) where.status = query.status;
      if (query.procedureCatalogId) where.procedureCatalogId = query.procedureCatalogId;

      const rows = await tx.patientConsent.findMany({
        where,
        take,
        skip: query.cursor ? 1 : 0,
        cursor: query.cursor ? { id: query.cursor } : undefined,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: {
          patient: { select: { id: true, fullName: true, patientNumber: true } },
          templateVersion: {
            select: {
              id: true,
              titleAr: true,
              versionNumber: true,
              contentDigestSha256: true,
              template: { select: { id: true, title: true } },
            },
          },
          procedureCatalog: { select: { id: true, nameAr: true, nameEn: true, category: true } },
          preparedBy: { select: { id: true, user: { select: { name: true } } } },
          verifiedBy: { select: { id: true, user: { select: { name: true } } } },
          signatureEvidence: {
            select: {
              id: true,
              signerCapacity: true,
              signerName: true,
              signatureType: true,
              evidenceHashSha256: true,
              signedAt: true,
            },
          },
          withdrawal: {
            select: {
              id: true,
              withdrawnAt: true,
              reason: true,
              withdrawnBy: { select: { id: true, user: { select: { name: true } } } },
            },
          },
        },
      });

      const nextCursor = rows.length > query.pageSize ? rows[query.pageSize - 1].id : null;
      const items = rows.slice(0, query.pageSize).map(clean);
      return { items, nextCursor };
    });
  }

  getPatientConsent(proof: VerifiedPrincipal, clinicId: string, id: string) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.consents.read'], async (tx, c) => {
      const row = await tx.patientConsent.findFirst({
        where: { id, clinicId: c.clinicId },
        include: {
          patient: { select: { id: true, fullName: true, patientNumber: true, phone: true } },
          templateVersion: {
            include: {
              template: true,
              publishedBy: { select: { id: true, user: { select: { name: true } } } },
            },
          },
          treatmentPlan: {
            select: {
              id: true,
              status: true,
              currentRevisionNumber: true,
            },
          },
          treatmentPlanItem: {
            select: {
              id: true,
              sessionOrder: true,
              expectedDurationMinutes: true,
            },
          },
          procedureCatalog: true,
          preparedBy: { select: { id: true, user: { select: { name: true } } } },
          verifiedBy: { select: { id: true, user: { select: { name: true } } } },
          signatureEvidence: true,
          withdrawal: {
            include: {
              withdrawnBy: { select: { id: true, user: { select: { name: true } } } },
            },
          },
        },
      });
      if (!row) throw new NotFoundException();
      return clean(row);
    });
  }

  prepareConsent(proof: VerifiedPrincipal, clinicId: string, input: PreparePatientConsentDto) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.consents.prepare'], async (tx, c) => {
      const patient = await tx.patient.findFirst({
        where: { id: input.patientId, clinicId: c.clinicId, status: 'ACTIVE' },
      });
      if (!patient) throw new NotFoundException('Patient not found or inactive');

      const templateVersion = await tx.consentTemplateVersion.findFirst({
        where: { id: input.templateVersionId, clinicId: c.clinicId },
        include: { template: true },
      });
      if (!templateVersion) throw new NotFoundException('Consent template version not found');
      if (templateVersion.status !== 'PUBLISHED') {
        throw new ConflictException('Consent can only be prepared from a PUBLISHED template version');
      }
      if (templateVersion.template.purpose !== input.purpose) {
        throw new ConflictException('Template purpose does not match requested consent purpose');
      }

      let revisionNumber: number | null = null;
      if (input.treatmentPlanId) {
        const plan = await tx.treatmentPlan.findFirst({
          where: { id: input.treatmentPlanId, clinicId: c.clinicId, patientId: input.patientId },
        });
        if (!plan) throw new NotFoundException('Treatment plan not found');
        revisionNumber = plan.currentRevisionNumber;
      }

      if (input.treatmentPlanItemId) {
        const item = await tx.treatmentPlanItem.findFirst({
          where: { id: input.treatmentPlanItemId, clinicId: c.clinicId },
        });
        if (!item) throw new NotFoundException('Treatment plan item not found');
      }

      let procedureCatalogId = input.procedureCatalogId || templateVersion.template.procedureCatalogId || null;
      if (procedureCatalogId) {
        const cat = await tx.aestheticProcedureCatalog.findFirst({
          where: { id: procedureCatalogId, clinicId: c.clinicId },
        });
        if (!cat) throw new NotFoundException('Procedure catalog entry not found');
      }

      const row = await tx.patientConsent.create({
        data: {
          clinicId: c.clinicId,
          patientId: input.patientId,
          templateVersionId: input.templateVersionId,
          purpose: input.purpose,
          status: 'DRAFT',
          treatmentPlanId: input.treatmentPlanId || null,
          treatmentPlanRevisionNumber: revisionNumber,
          treatmentPlanItemId: input.treatmentPlanItemId || null,
          procedureCatalogId,
          preparedByMembershipId: c.membershipId,
          notes: input.notes?.trim() || null,
        },
        include: {
          templateVersion: { select: { titleAr: true, versionNumber: true } },
          patient: { select: { fullName: true } },
        },
      });

      await this.log(tx, c, 'clinical.consent.prepared', row.id, {
        patientId: input.patientId,
        purpose: input.purpose,
        templateVersionId: input.templateVersionId,
      });

      return clean(row);
    });
  }

  signConsent(
    proof: VerifiedPrincipal,
    clinicId: string,
    id: string,
    input: SignPatientConsentDto,
    meta?: { ipAddress?: string; userAgent?: string },
  ) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.consents.sign'], async (tx, c) => {
      const consent = await tx.patientConsent.findFirst({
        where: { id, clinicId: c.clinicId },
        include: { templateVersion: true },
      });
      if (!consent) throw new NotFoundException();
      if (consent.version !== input.expectedVersion) throw new ConflictException('Consent version mismatch');
      if (consent.status !== 'DRAFT') throw new ConflictException('Only DRAFT consents can be signed');

      const signedAt = new Date();
      const signedAtIso = signedAt.toISOString();

      const evidenceHashSha256 = digestEvidence(
        c.clinicId,
        consent.patientId,
        consent.templateVersionId,
        consent.templateVersion.contentDigestSha256,
        input.signerCapacity,
        input.signerName,
        input.signatureType,
        input.signatureData,
        signedAtIso,
      );

      await tx.consentSignatureEvidence.create({
        data: {
          clinicId: c.clinicId,
          patientConsentId: id,
          signerCapacity: input.signerCapacity,
          signerName: input.signerName.trim(),
          signerIdentitySnapshot: input.signerIdentitySnapshot?.trim() || null,
          relationshipDescription: input.relationshipDescription?.trim() || null,
          signatureType: input.signatureType,
          signatureData: input.signatureData,
          evidenceHashSha256,
          signedAt,
          ipAddress: meta?.ipAddress || null,
          userAgent: meta?.userAgent || null,
        },
      });

      const updated = await tx.patientConsent.update({
        where: { id },
        data: {
          status: 'PENDING_VERIFICATION',
          version: { increment: 1 },
        },
        include: {
          signatureEvidence: {
            select: {
              id: true,
              signerCapacity: true,
              signerName: true,
              signatureType: true,
              evidenceHashSha256: true,
              signedAt: true,
            },
          },
        },
      });

      // Audit log records cryptographic hash and signer name; never stores signature image/base64 bytes in general audit log
      await this.log(tx, c, 'clinical.consent.signed', id, {
        signerCapacity: input.signerCapacity,
        signerName: input.signerName.trim(),
        evidenceHashSha256,
      });

      return clean(updated);
    });
  }

  verifyConsent(proof: VerifiedPrincipal, clinicId: string, id: string, input: VerifyPatientConsentDto) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.consents.verify'], async (tx, c) => {
      const consent = await tx.patientConsent.findFirst({
        where: { id, clinicId: c.clinicId },
        include: { signatureEvidence: true },
      });
      if (!consent) throw new NotFoundException();
      if (consent.version !== input.expectedVersion) throw new ConflictException('Consent version mismatch');
      if (consent.status !== 'PENDING_VERIFICATION') {
        throw new ConflictException('Only PENDING_VERIFICATION consents can be verified');
      }
      if (!consent.signatureEvidence) {
        throw new ConflictException('Consent signature evidence missing');
      }

      const now = new Date();
      const expiresAt = input.validUntil ? new Date(input.validUntil) : null;
      if (expiresAt && expiresAt <= now) {
        throw new ConflictException('Consent validity expiration date must be in the future');
      }

      const updated = await tx.patientConsent.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          verifiedAt: now,
          verifiedByMembershipId: c.membershipId,
          validFrom: now,
          expiresAt,
          version: { increment: 1 },
        },
      });

      await this.log(tx, c, 'clinical.consent.verified', id, {
        verifiedAt: now.toISOString(),
        validFrom: now.toISOString(),
        expiresAt: expiresAt?.toISOString() || null,
      });

      return clean(updated);
    });
  }

  withdrawConsent(proof: VerifiedPrincipal, clinicId: string, id: string, input: WithdrawPatientConsentDto) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.consents.withdraw'], async (tx, c) => {
      const consent = await tx.patientConsent.findFirst({
        where: { id, clinicId: c.clinicId },
      });
      if (!consent) throw new NotFoundException();
      if (consent.version !== input.expectedVersion) throw new ConflictException('Consent version mismatch');
      if (consent.status !== 'ACTIVE' && consent.status !== 'PENDING_VERIFICATION') {
        throw new ConflictException('Only ACTIVE or PENDING_VERIFICATION consents can be withdrawn');
      }

      const now = new Date();

      await tx.consentWithdrawal.create({
        data: {
          clinicId: c.clinicId,
          patientConsentId: id,
          withdrawnAt: now,
          withdrawnByMembershipId: c.membershipId,
          reason: input.reason.trim(),
        },
      });

      const updated = await tx.patientConsent.update({
        where: { id },
        data: {
          status: 'WITHDRAWN',
          version: { increment: 1 },
        },
      });

      await this.log(tx, c, 'clinical.consent.withdrawn', id, {
        reason: input.reason.trim(),
        withdrawnAt: now.toISOString(),
      });

      return clean(updated);
    });
  }

  refuseConsent(proof: VerifiedPrincipal, clinicId: string, id: string, input: RefusePatientConsentDto) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.consents.prepare'], async (tx, c) => {
      const consent = await tx.patientConsent.findFirst({
        where: { id, clinicId: c.clinicId },
      });
      if (!consent) throw new NotFoundException();
      if (consent.version !== input.expectedVersion) throw new ConflictException('Consent version mismatch');
      if (consent.status !== 'DRAFT') {
        throw new ConflictException('Only DRAFT consents can be marked as refused');
      }

      const updated = await tx.patientConsent.update({
        where: { id },
        data: {
          status: 'REFUSED',
          refusalReason: input.reason.trim(),
          version: { increment: 1 },
        },
      });

      await this.log(tx, c, 'clinical.consent.refused', id, {
        refusalReason: input.reason.trim(),
      });

      return clean(updated);
    });
  }

  private log(
    tx: TenantTransaction,
    c: TenantContext,
    action: string,
    targetId: string,
    metadata: Record<string, unknown>,
  ) {
    return this.audit.record(
      {
        clinicId: c.clinicId,
        actorId: c.userId,
        action,
        category: 'CLINICAL',
        targetType: 'ConsentRecord',
        targetId,
        outcome: 'SUCCESS',
        metadata,
      },
      tx,
    );
  }
}

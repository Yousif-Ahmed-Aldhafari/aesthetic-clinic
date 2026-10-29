import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Prisma } from '../generated/prisma/client.js';
import { TenantDatabaseService } from './tenant-database.service.js';
import { PrismaService } from './prisma.service.js';
import { AuditRepository } from './audit.repository.js';
import type { VerifiedPrincipal } from './verified-sessions.js';
import { sanitizeFormulaField, sanitizeObjectForExport } from '../privacy/privacy.sanitize.js';
import type {
  CreatePatientExportDto,
  CreatePrivacyRequestDto,
  DecidePrivacyRequestDto,
  PrivacyRequestQueryDto,
  UpdateRetentionPolicyDto,
} from '../privacy/privacy.dto.js';
import type {
  GeneratedExportResult,
  PatientExportDto,
  PrivacyRequestDto,
  RetentionDryRunReport,
  RetentionPolicyDto,
} from '../privacy/privacy.types.js';

const requestSelect = {
  id: true,
  clinicId: true,
  patientId: true,
  patientName: true,
  patientContact: true,
  requestType: true,
  status: true,
  subject: true,
  notes: true,
  decisionReason: true,
  decisionBy: true,
  decisionAt: true,
  completedAt: true,
  legalHold: true,
  legalHoldReason: true,
  requestedAt: true,
  updatedAt: true,
  version: true,
} as const satisfies Prisma.PrivacyRequestSelect;

type RequestRow = Prisma.PrivacyRequestGetPayload<{ select: typeof requestSelect }>;

const formatRequest = (row: RequestRow): PrivacyRequestDto => ({
  id: row.id,
  clinicId: row.clinicId,
  patientId: row.patientId,
  patientName: row.patientName,
  patientContact: row.patientContact,
  requestType: row.requestType,
  status: row.status,
  subject: row.subject,
  notes: row.notes,
  decisionReason: row.decisionReason,
  decisionBy: row.decisionBy,
  decisionAt: row.decisionAt ? row.decisionAt.toISOString() : null,
  completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  legalHold: row.legalHold,
  legalHoldReason: row.legalHoldReason,
  requestedAt: row.requestedAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  version: row.version,
});

const exportSelect = {
  id: true,
  clinicId: true,
  privacyRequestId: true,
  patientId: true,
  generatedBy: true,
  status: true,
  purpose: true,
  expiresAt: true,
  downloadCount: true,
  maxDownloads: true,
  revokedAt: true,
  revokeReason: true,
  fileSizeBytes: true,
  createdAt: true,
} as const satisfies Prisma.PatientExportSelect;

type ExportRow = Prisma.PatientExportGetPayload<{ select: typeof exportSelect }>;

const formatExport = (row: ExportRow): PatientExportDto => ({
  id: row.id,
  clinicId: row.clinicId,
  privacyRequestId: row.privacyRequestId,
  patientId: row.patientId,
  status: row.status,
  purpose: row.purpose,
  expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
  downloadCount: row.downloadCount,
  maxDownloads: row.maxDownloads,
  revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
  revokeReason: row.revokeReason,
  fileSizeBytes: row.fileSizeBytes !== null ? row.fileSizeBytes.toString() : null,
  createdAt: row.createdAt.toISOString(),
});

@Injectable()
export class PrivacyRepository {
  private readonly exportsDir = resolve(process.cwd(), 'var/exports');

  constructor(
    private readonly database: TenantDatabaseService,
    private readonly prisma: PrismaService,
    private readonly auditRepo: AuditRepository,
  ) {}

  private async ensureExportsDir(): Promise<void> {
    if (!existsSync(this.exportsDir)) {
      await mkdir(this.exportsDir, { recursive: true, mode: 0o700 });
    }
  }

  // -------------------------------------------------------------
  // PRIVACY REQUESTS
  // -------------------------------------------------------------

  async listRequests(
    proof: VerifiedPrincipal,
    clinicId: string,
    query: PrivacyRequestQueryDto,
  ): Promise<{ items: PrivacyRequestDto[]; hasMore: boolean; nextCursor: string | null }> {
    return this.database.withClinicContext(proof, clinicId, ['privacy.requests.read'], async (tx, context) => {
      const where: Prisma.PrivacyRequestWhereInput = {
        clinicId: context.clinicId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.requestType ? { requestType: query.requestType } : {}),
        ...(query.patientId ? { patientId: query.patientId } : {}),
      };

      if (query.cursor) {
        const anchor = await tx.privacyRequest.findFirst({
          where: { id: query.cursor, clinicId: context.clinicId },
          select: { requestedAt: true, id: true },
        });
        if (!anchor) throw new NotFoundException();
        where.AND = [
          {
            OR: [
              { requestedAt: { lt: anchor.requestedAt } },
              { requestedAt: anchor.requestedAt, id: { lt: anchor.id } },
            ],
          },
        ];
      }

      const limit = query.limit ?? 20;
      const rows = await tx.privacyRequest.findMany({
        where,
        select: requestSelect,
        orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      });

      const hasMore = rows.length > limit;
      const items = rows.slice(0, limit);
      return {
        items: items.map(formatRequest),
        hasMore,
        nextCursor: hasMore ? items[items.length - 1].id : null,
      };
    });
  }

  async getRequest(proof: VerifiedPrincipal, clinicId: string, requestId: string): Promise<PrivacyRequestDto> {
    return this.database.withClinicContext(proof, clinicId, ['privacy.requests.read'], async (tx, context) => {
      const req = await tx.privacyRequest.findFirst({
        where: { id: requestId, clinicId: context.clinicId },
        select: requestSelect,
      });
      if (!req) throw new NotFoundException();
      return formatRequest(req);
    });
  }

  async createRequest(
    proof: VerifiedPrincipal,
    clinicId: string,
    input: CreatePrivacyRequestDto,
  ): Promise<PrivacyRequestDto> {
    return this.database.withClinicContext(proof, clinicId, ['privacy.requests.manage'], async (tx, context) => {
      if (input.patientId) {
        const patientExists = await tx.patient.findFirst({
          where: { id: input.patientId, clinicId: context.clinicId },
          select: { id: true },
        });
        if (!patientExists) throw new NotFoundException();
      }

      const created = await tx.privacyRequest.create({
        data: {
          clinicId: context.clinicId,
          patientId: input.patientId ?? null,
          patientName: input.patientName,
          patientContact: input.patientContact ?? null,
          requestType: input.requestType,
          subject: input.subject,
          notes: input.notes ?? null,
          status: 'OPEN',
        },
        select: requestSelect,
      });

      await this.auditRepo.record(
        {
          clinicId: context.clinicId,
          actorId: context.userId,
          action: 'privacy.request.create',
          category: 'PRIVACY',
          targetType: 'PrivacyRequest',
          targetId: created.id,
          outcome: 'SUCCESS',
          metadata: {
            requestType: created.requestType,
            patientName: sanitizeFormulaField(created.patientName),
          },
        },
        tx,
      );

      return formatRequest(created);
    });
  }

  async decideRequest(
    proof: VerifiedPrincipal,
    clinicId: string,
    requestId: string,
    input: DecidePrivacyRequestDto,
  ): Promise<PrivacyRequestDto> {
    return this.database.withClinicContext(proof, clinicId, ['privacy.requests.manage'], async (tx, context) => {
      const current = await tx.privacyRequest.findFirst({
        where: { id: requestId, clinicId: context.clinicId },
        select: requestSelect,
      });
      if (!current) throw new NotFoundException();

      if (current.version !== input.expectedVersion) {
        throw new ConflictException();
      }

      // Legal Hold validation
      const isLegalHold = input.legalHold === true;
      if (isLegalHold && !input.legalHoldReason) {
        throw new BadRequestException('Legal hold requires a documented reason');
      }

      const decisionAt = ['APPROVED', 'DENIED', 'COMPLETED', 'WITHDRAWN', 'HELD'].includes(input.status)
        ? new Date()
        : null;
      const completedAt = input.status === 'COMPLETED' ? new Date() : null;

      if (['APPROVED', 'DENIED'].includes(input.status) && !input.decisionReason) {
        throw new BadRequestException('Approved or Denied status requires a documented decision reason');
      }

      const updated = await tx.privacyRequest.update({
        where: { id: requestId },
        data: {
          status: input.status,
          decisionReason: input.decisionReason ?? current.decisionReason,
          decisionBy: context.membershipId,
          decisionAt: decisionAt ?? current.decisionAt,
          completedAt: completedAt ?? current.completedAt,
          legalHold: isLegalHold,
          legalHoldReason: isLegalHold ? input.legalHoldReason : null,
          version: { increment: 1 },
        },
        select: requestSelect,
      });

      await this.auditRepo.record(
        {
          clinicId: context.clinicId,
          actorId: context.userId,
          action: 'privacy.request.decision',
          category: 'PRIVACY',
          targetType: 'PrivacyRequest',
          targetId: requestId,
          outcome: 'SUCCESS',
          metadata: {
            previousStatus: current.status,
            newStatus: updated.status,
            legalHold: updated.legalHold,
            version: updated.version,
          },
        },
        tx,
      );

      return formatRequest(updated);
    });
  }

  // -------------------------------------------------------------
  // SECURE PATIENT EXPORT (WITH MFA STEP-UP)
  // -------------------------------------------------------------

  async createExport(
    proof: VerifiedPrincipal,
    clinicId: string,
    input: CreatePatientExportDto,
  ): Promise<GeneratedExportResult> {
    await this.ensureExportsDir();

    return this.database.withClinicContext(proof, clinicId, ['privacy.export'], async (tx, context) => {
      // 1. Fetch patient profile in current clinic
      const patient = await tx.patient.findFirst({
        where: { id: input.patientId, clinicId: context.clinicId },
      });
      if (!patient) throw new NotFoundException();

      // 2. If privacyRequestId provided, verify it
      if (input.privacyRequestId) {
        const pr = await tx.privacyRequest.findFirst({
          where: { id: input.privacyRequestId, clinicId: context.clinicId },
        });
        if (!pr) throw new NotFoundException();
        if (pr.legalHold) {
          throw new ForbiddenException('Cannot export data for a request currently under legal hold');
        }
      }

      // 3. Fetch appointments in this clinic
      const appointments = await tx.appointment.findMany({
        where: { patientId: patient.id, clinicId: context.clinicId },
        select: {
          id: true,
          startAt: true,
          endAt: true,
          status: true,
          cancellationReason: true,
          createdAt: true,
        },
        orderBy: { startAt: 'desc' },
      });

      // 4. Fetch visits in this clinic
      const visits = await tx.visit.findMany({
        where: { patientId: patient.id, clinicId: context.clinicId },
        select: {
          id: true,
          checkedInAt: true,
          startedAt: true,
          endedAt: true,
          status: true,
          source: true,
        },
        orderBy: { checkedInAt: 'desc' },
      });

      // 5. Fetch invoices in this clinic
      const invoices = await tx.invoice.findMany({
        where: { patientId: patient.id, clinicId: context.clinicId },
        select: {
          id: true,
          number: true,
          status: true,
          issuedAt: true,
          totalMinor: true,
          currency: true,
          lines: {
            select: {
              serviceName: true,
              quantityMilli: true,
              totalMinor: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // 6. Build and sanitize export payload (formula injection protection)
      const clinic = await tx.clinic.findFirstOrThrow({
        where: { id: context.clinicId },
        select: { displayName: true, legalName: true },
      });

      const rawExport = {
        exportedAt: new Date().toISOString(),
        clinic: {
          name: clinic.displayName,
          legalName: clinic.legalName,
        },
        patient: {
          patientNumber: patient.patientNumber,
          fullName: patient.fullName,
          phone: patient.phone,
          email: patient.email,
          dateOfBirth: patient.dateOfBirth ? patient.dateOfBirth.toISOString().slice(0, 10) : null,
          gender: patient.gender,
          status: patient.status,
          createdAt: patient.createdAt.toISOString(),
        },
        appointments: appointments.map((a) => ({
          startAt: a.startAt.toISOString(),
          endAt: a.endAt.toISOString(),
          status: a.status,
          cancellationReason: a.cancellationReason,
        })),
        visits: visits.map((v) => ({
          checkedInAt: v.checkedInAt.toISOString(),
          startedAt: v.startedAt ? v.startedAt.toISOString() : null,
          endedAt: v.endedAt ? v.endedAt.toISOString() : null,
          status: v.status,
          source: v.source,
        })),
        invoices: invoices.map((inv) => ({
          number: inv.number,
          status: inv.status,
          issuedAt: inv.issuedAt ? inv.issuedAt.toISOString() : null,
          totalMinor: inv.totalMinor.toString(),
          currency: inv.currency,
          lines: inv.lines.map((l) => ({
            serviceName: l.serviceName,
            totalMinor: l.totalMinor.toString(),
          })),
        })),
      };

      const sanitizedExport = sanitizeObjectForExport(rawExport);
      const jsonBuffer = Buffer.from(JSON.stringify(sanitizedExport, null, 2), 'utf8');

      // 7. Token and expiration
      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      const exportRecord = await tx.patientExport.create({
        data: {
          clinicId: context.clinicId,
          privacyRequestId: input.privacyRequestId ?? null,
          patientId: patient.id,
          generatedBy: context.membershipId,
          status: 'READY',
          purpose: input.purpose,
          tokenHash,
          expiresAt,
          maxDownloads: 3,
          downloadCount: 0,
          fileSizeBytes: BigInt(jsonBuffer.length),
        },
        select: exportSelect,
      });

      // 8. Write file to disk with 0600 permissions
      const filePath = resolve(this.exportsDir, `${exportRecord.id}.json`);
      await writeFile(filePath, jsonBuffer, { mode: 0o600 });

      // 9. Audit event
      await this.auditRepo.record(
        {
          clinicId: context.clinicId,
          actorId: context.userId,
          action: 'privacy.export.create',
          category: 'PRIVACY',
          targetType: 'PatientExport',
          targetId: exportRecord.id,
          outcome: 'SUCCESS',
          metadata: {
            patientId: patient.id,
            patientNumber: patient.patientNumber,
            purpose: input.purpose,
            fileSizeBytes: jsonBuffer.length,
          },
        },
        tx,
      );

      return {
        exportId: exportRecord.id,
        downloadToken: rawToken,
        downloadUrl: `/api/v1/clinics/${context.clinicId}/privacy/exports/${exportRecord.id}/download?token=${rawToken}`,
        expiresAt: expiresAt.toISOString(),
        maxDownloads: 3,
        fileSizeBytes: jsonBuffer.length,
      };
    });
  }

  async listExports(
    proof: VerifiedPrincipal,
    clinicId: string,
  ): Promise<PatientExportDto[]> {
    return this.database.withClinicContext(proof, clinicId, ['privacy.export'], async (tx, context) => {
      const rows = await tx.patientExport.findMany({
        where: { clinicId: context.clinicId },
        select: exportSelect,
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      return rows.map(formatExport);
    });
  }

  async revokeExport(
    proof: VerifiedPrincipal,
    clinicId: string,
    exportId: string,
    reason: string,
  ): Promise<PatientExportDto> {
    return this.database.withClinicContext(proof, clinicId, ['privacy.export'], async (tx, context) => {
      const current = await tx.patientExport.findFirst({
        where: { id: exportId, clinicId: context.clinicId },
      });
      if (!current) throw new NotFoundException();

      const updated = await tx.patientExport.update({
        where: { id: exportId },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
          revokeReason: reason,
        },
        select: exportSelect,
      });

      // Safely delete file if exists
      const filePath = resolve(this.exportsDir, `${exportId}.json`);
      if (existsSync(filePath)) {
        await unlink(filePath).catch(() => {});
      }

      await this.auditRepo.record(
        {
          clinicId: context.clinicId,
          actorId: context.userId,
          action: 'privacy.export.revoke',
          category: 'PRIVACY',
          targetType: 'PatientExport',
          targetId: exportId,
          outcome: 'SUCCESS',
          metadata: { reason },
        },
        tx,
      );

      return formatExport(updated);
    });
  }

  async downloadExport(
    proof: VerifiedPrincipal,
    clinicId: string,
    exportId: string,
    rawToken: string,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    if (!rawToken || rawToken.length < 32) {
      throw new ForbiddenException('Invalid download token');
    }

    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    return this.database.withClinicContext(proof, clinicId, ['privacy.export'], async (tx, context) => {
      // Atomic download verification and counter increment via tenant transaction
      const exp = await tx.patientExport.findFirst({
        where: {
          id: exportId,
          clinicId: context.clinicId,
        },
      });

      if (!exp) throw new NotFoundException();

      if (exp.tokenHash !== tokenHash) {
        throw new ForbiddenException('Invalid download token');
      }

      if (exp.status !== 'READY') {
        throw new ForbiddenException(`Export is ${exp.status.toLowerCase()}`);
      }

      if (exp.expiresAt && exp.expiresAt < new Date()) {
        await tx.patientExport.update({
          where: { id: exportId },
          data: { status: 'EXPIRED' },
        });
        throw new ForbiddenException('Export download link has expired');
      }

      if (exp.downloadCount >= exp.maxDownloads) {
        throw new ForbiddenException('Maximum download count exceeded');
      }

      const newCount = exp.downloadCount + 1;
      const isNowExpired = newCount >= exp.maxDownloads;

      await tx.patientExport.update({
        where: { id: exportId },
        data: {
          downloadCount: newCount,
          ...(isNowExpired ? { status: 'EXPIRED' } : {}),
        },
      });

      const filePath = resolve(this.exportsDir, `${exportId}.json`);
      if (!existsSync(filePath)) {
        throw new NotFoundException('Export archive file not found on disk');
      }

      const buffer = await readFile(filePath);

      // Audit download within transaction
      await this.auditRepo.record(
        {
          clinicId: context.clinicId,
          actorId: context.userId,
          action: 'privacy.export.download',
          category: 'PRIVACY',
          targetType: 'PatientExport',
          targetId: exportId,
          outcome: 'SUCCESS',
          metadata: { downloadCount: newCount, maxDownloads: exp.maxDownloads },
        },
        tx,
      );

      return {
        buffer,
        fileName: `patient-export-${exp.patientId.slice(0, 8)}.json`,
      };
    });
  }

  // -------------------------------------------------------------
  // RETENTION POLICY & DRY-RUN
  // -------------------------------------------------------------

  async getRetentionPolicy(proof: VerifiedPrincipal, clinicId: string): Promise<RetentionPolicyDto> {
    return this.database.withClinicContext(proof, clinicId, ['privacy.requests.read'], async (tx, context) => {
      const policy = await tx.retentionPolicy.findFirst({
        where: { clinicId: context.clinicId },
      });

      if (!policy) {
        return {
          clinicId: context.clinicId,
          policyVersion: 1,
          dryRunOnly: true,
          patientRecordDays: null,
          appointmentDays: null,
          visitDays: null,
          auditEventDays: 90,
          backupRetentionDays: 30,
          exportRetentionDays: 7,
          privacyRequestDays: null,
          configuredBy: null,
          configuredAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }

      return {
        clinicId: policy.clinicId,
        policyVersion: policy.policyVersion,
        dryRunOnly: policy.dryRunOnly,
        patientRecordDays: policy.patientRecordDays,
        appointmentDays: policy.appointmentDays,
        visitDays: policy.visitDays,
        auditEventDays: policy.auditEventDays,
        backupRetentionDays: policy.backupRetentionDays,
        exportRetentionDays: policy.exportRetentionDays,
        privacyRequestDays: policy.privacyRequestDays,
        configuredBy: policy.configuredBy,
        configuredAt: policy.configuredAt.toISOString(),
        updatedAt: policy.updatedAt.toISOString(),
      };
    });
  }

  async updateRetentionPolicy(
    proof: VerifiedPrincipal,
    clinicId: string,
    input: UpdateRetentionPolicyDto,
  ): Promise<RetentionPolicyDto> {
    return this.database.withClinicContext(proof, clinicId, ['privacy.requests.manage'], async (tx, context) => {
      // Platform minimum guards
      if (input.auditEventDays !== undefined && input.auditEventDays < 90) {
        throw new BadRequestException('Audit event retention cannot be less than 90 days');
      }
      if (input.backupRetentionDays !== undefined && input.backupRetentionDays < 7) {
        throw new BadRequestException('Backup retention cannot be less than 7 days');
      }

      const policy = await tx.retentionPolicy.upsert({
        where: { clinicId: context.clinicId },
        create: {
          clinicId: context.clinicId,
          dryRunOnly: true, // MUST remain true; automatic deletion disabled
          patientRecordDays: input.patientRecordDays ?? null,
          appointmentDays: input.appointmentDays ?? null,
          visitDays: input.visitDays ?? null,
          auditEventDays: input.auditEventDays ?? 90,
          backupRetentionDays: input.backupRetentionDays ?? 30,
          exportRetentionDays: input.exportRetentionDays ?? 7,
          privacyRequestDays: input.privacyRequestDays ?? null,
          configuredBy: context.membershipId,
        },
        update: {
          patientRecordDays: input.patientRecordDays,
          appointmentDays: input.appointmentDays,
          visitDays: input.visitDays,
          auditEventDays: input.auditEventDays,
          backupRetentionDays: input.backupRetentionDays,
          exportRetentionDays: input.exportRetentionDays,
          privacyRequestDays: input.privacyRequestDays,
          configuredBy: context.membershipId,
          policyVersion: { increment: 1 },
        },
      });

      await this.auditRepo.record(
        {
          clinicId: context.clinicId,
          actorId: context.userId,
          action: 'privacy.retention.update',
          category: 'PRIVACY',
          targetType: 'RetentionPolicy',
          targetId: context.clinicId,
          outcome: 'SUCCESS',
          metadata: {
            policyVersion: policy.policyVersion,
            dryRunOnly: policy.dryRunOnly,
          },
        },
        tx,
      );

      return {
        clinicId: policy.clinicId,
        policyVersion: policy.policyVersion,
        dryRunOnly: policy.dryRunOnly,
        patientRecordDays: policy.patientRecordDays,
        appointmentDays: policy.appointmentDays,
        visitDays: policy.visitDays,
        auditEventDays: policy.auditEventDays,
        backupRetentionDays: policy.backupRetentionDays,
        exportRetentionDays: policy.exportRetentionDays,
        privacyRequestDays: policy.privacyRequestDays,
        configuredBy: policy.configuredBy,
        configuredAt: policy.configuredAt.toISOString(),
        updatedAt: policy.updatedAt.toISOString(),
      };
    });
  }

  async runRetentionDryRun(proof: VerifiedPrincipal, clinicId: string): Promise<RetentionDryRunReport> {
    return this.database.withClinicContext(proof, clinicId, ['privacy.requests.manage'], async (tx, context) => {
      // Execute the security definer SQL function
      const rows = await this.prisma.$queryRaw<{ retention_dry_run: RetentionDryRunReport }[]>`
        SELECT lamssa_security.retention_dry_run(${context.clinicId}::uuid);
      `;

      const report = rows[0]?.retention_dry_run;
      if (!report) {
        throw new NotFoundException('Could not generate retention dry-run report');
      }

      await this.auditRepo.record(
        {
          clinicId: context.clinicId,
          actorId: context.userId,
          action: 'privacy.retention.dry_run',
          category: 'PRIVACY',
          targetType: 'RetentionPolicy',
          targetId: context.clinicId,
          outcome: 'SUCCESS',
          metadata: {
            eligiblePatients: report.eligible.patients,
            eligibleAppointments: report.eligible.appointments,
            eligibleAuditEvents: report.eligible.auditEvents,
          },
        },
        tx,
      );

      return report;
    });
  }
}

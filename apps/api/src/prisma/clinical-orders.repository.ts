import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { VerifiedPrincipal } from './verified-sessions.js';
import { TenantDatabaseService, type TenantTransaction } from './tenant-database.service.js';
import { AuditRepository } from './audit.repository.js';
import { SpecialtyRepository } from './specialty.repository.js';
import { BillingRepository } from './billing.repository.js';
import { currencyScale } from '../billing/money.js';
import { ClinicalDocumentCryptoService } from '../clinical-orders/clinical-document-crypto.service.js';
import type {
  CreateGeneralClinicalServiceDto,
  UpdateGeneralClinicalServiceDto,
  GeneralClinicalServiceQueryDto,
  CreateClinicalOrderDto,
  UpdateClinicalOrderStatusDto,
  CancelClinicalOrderDto,
  ClinicalOrderQueryDto,
  RecordOrderResultDto,
  VerifyOrderResultDto,
  CorrectOrderResultDto,
  AcknowledgeCriticalResultDto,
  ReleaseResultToPatientDto,
  CreateClinicalDocumentDto,
  UpdateClinicalDocumentDto,
  ClinicalDocumentQueryDto,
  CreateDraftInvoiceForOrderDto,
  CreateDraftInvoiceForGeneralServiceDto,
} from '../clinical-orders/clinical-orders.dto.js';

@Injectable()
export class ClinicalOrdersRepository {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditRepository,
    private readonly specialtyRepo: SpecialtyRepository,
    private readonly crypto: ClinicalDocumentCryptoService,
    private readonly billingRepo: BillingRepository,
  ) {}

  // =========================================================================
  // 1. GENERAL CLINICAL SERVICES CATALOG
  // =========================================================================

  async createGeneralService(
    proof: VerifiedPrincipal,
    clinicId: string,
    dto: CreateGeneralClinicalServiceDto,
  ) {
    return this.database.withClinicContext(
      proof,
      clinicId,
      ['clinical.services.manage'],
      async (tx, c) => {
        const existing = await tx.generalClinicalService.findFirst({
          where: { clinicId: c.clinicId, serviceCode: dto.serviceCode },
        });
        if (existing) {
          throw new ConflictException(`General clinical service with code '${dto.serviceCode}' already exists`);
        }

        if (dto.specialtyId) {
          const specialty = await tx.medicalSpecialty.findUnique({
            where: { id: dto.specialtyId },
          });
          if (!specialty) throw new NotFoundException('Specified medical specialty not found');
        }

        if (dto.branchId) {
          const branch = await tx.clinicBranch.findFirst({
            where: { clinicId: c.clinicId, id: dto.branchId },
          });
          if (!branch) throw new NotFoundException('Specified clinic branch not found');
        }

        if (dto.clinicServiceId) {
          const cs = await tx.clinicService.findFirst({
            where: { clinicId: c.clinicId, id: dto.clinicServiceId },
          });
          if (!cs) throw new NotFoundException('Specified ClinicService link not found');
        }

        const created = await tx.generalClinicalService.create({
          data: {
            clinicId: c.clinicId,
            serviceCode: dto.serviceCode,
            nameAr: dto.nameAr,
            nameEn: dto.nameEn,
            description: dto.description,
            category: dto.category,
            specialtyId: dto.specialtyId,
            branchId: dto.branchId,
            defaultDurationMinutes: dto.defaultDurationMinutes ?? 30,
            requiredPrivilege: dto.requiredPrivilege,
            basePriceMinor: BigInt(dto.basePriceMinor ?? 0),
            clinicServiceId: dto.clinicServiceId,
            isActive: dto.isActive ?? true,
          },
          include: {
            specialty: { select: { id: true, code: true, arabicName: true, englishName: true } },
            branch: { select: { id: true, nameAr: true, nameEn: true } },
            clinicService: { select: { id: true, name: true, durationMinutes: true } },
          },
        });

        await this.audit.record({
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'clinical.service.create',
          category: 'CLINICAL',
          targetType: 'GeneralClinicalService',
          targetId: created.id,
          metadata: { serviceCode: created.serviceCode, category: created.category },
        });

        return { ...created, basePriceMinor: Number(created.basePriceMinor) };
      },
    );
  }

  async updateGeneralService(
    proof: VerifiedPrincipal,
    clinicId: string,
    serviceId: string,
    dto: UpdateGeneralClinicalServiceDto,
  ) {
    return this.database.withClinicContext(
      proof,
      clinicId,
      ['clinical.services.manage'],
      async (tx, c) => {
        const existing = await tx.generalClinicalService.findFirst({
          where: { clinicId: c.clinicId, id: serviceId },
        });
        if (!existing) throw new NotFoundException('General clinical service not found');

        if (dto.expectedVersion !== undefined && existing.version !== dto.expectedVersion) {
          throw new ConflictException(`Version conflict: expected ${dto.expectedVersion}, actual ${existing.version}`);
        }

        if (dto.specialtyId) {
          const specialty = await tx.medicalSpecialty.findUnique({ where: { id: dto.specialtyId } });
          if (!specialty) throw new NotFoundException('Specified medical specialty not found');
        }

        if (dto.branchId) {
          const branch = await tx.clinicBranch.findFirst({ where: { clinicId: c.clinicId, id: dto.branchId } });
          if (!branch) throw new NotFoundException('Specified clinic branch not found');
        }

        const updated = await tx.generalClinicalService.update({
          where: { clinicId_id: { clinicId: c.clinicId, id: serviceId } },
          data: {
            ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
            ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
            ...(dto.description !== undefined ? { description: dto.description } : {}),
            ...(dto.category !== undefined ? { category: dto.category } : {}),
            ...(dto.specialtyId !== undefined ? { specialtyId: dto.specialtyId } : {}),
            ...(dto.branchId !== undefined ? { branchId: dto.branchId } : {}),
            ...(dto.defaultDurationMinutes !== undefined ? { defaultDurationMinutes: dto.defaultDurationMinutes } : {}),
            ...(dto.requiredPrivilege !== undefined ? { requiredPrivilege: dto.requiredPrivilege } : {}),
            ...(dto.basePriceMinor !== undefined ? { basePriceMinor: BigInt(dto.basePriceMinor) } : {}),
            ...(dto.clinicServiceId !== undefined ? { clinicServiceId: dto.clinicServiceId } : {}),
            ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
            version: { increment: 1 },
          },
          include: {
            specialty: { select: { id: true, code: true, arabicName: true, englishName: true } },
            branch: { select: { id: true, nameAr: true, nameEn: true } },
            clinicService: { select: { id: true, name: true, durationMinutes: true } },
          },
        });

        await this.audit.record({
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'clinical.service.update',
          category: 'CLINICAL',
          targetType: 'GeneralClinicalService',
          targetId: updated.id,
          metadata: { serviceCode: updated.serviceCode },
        });

        return { ...updated, basePriceMinor: Number(updated.basePriceMinor) };
      },
    );
  }

  async listGeneralServices(proof: VerifiedPrincipal, clinicId: string, query: GeneralClinicalServiceQueryDto) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.services.read'], async (tx, c) => {
      const where: Record<string, unknown> = {
        clinicId: c.clinicId,
        ...(query.category ? { category: query.category } : {}),
        ...(query.specialtyId ? { specialtyId: query.specialtyId } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
        ...(query.search
          ? { OR: [{ serviceCode: { contains: query.search, mode: 'insensitive' } }, { nameAr: { contains: query.search } }, { nameEn: { contains: query.search, mode: 'insensitive' } }] }
          : {}),
      };
      const pageSize = query.pageSize ?? 50;
      const items = await tx.generalClinicalService.findMany({
        where,
        take: pageSize + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        orderBy: [{ category: 'asc' }, { serviceCode: 'asc' }],
        include: {
          specialty: { select: { id: true, code: true, arabicName: true, englishName: true } },
          branch: { select: { id: true, nameAr: true, nameEn: true } },
          clinicService: { select: { id: true, name: true, durationMinutes: true } },
        },
      });
      const hasMore = items.length > pageSize;
      const pageItems = hasMore ? items.slice(0, pageSize) : items;
      return { items: pageItems.map((s) => ({ ...s, basePriceMinor: Number(s.basePriceMinor) })), nextCursor: hasMore ? pageItems[pageItems.length - 1].id : null, hasMore };
    });
  }

  async getGeneralServiceById(proof: VerifiedPrincipal, clinicId: string, serviceId: string) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.services.read'], async (tx, c) => {
      const service = await tx.generalClinicalService.findFirst({
        where: { clinicId: c.clinicId, id: serviceId },
        include: {
          specialty: { select: { id: true, code: true, arabicName: true, englishName: true } },
          branch: { select: { id: true, nameAr: true, nameEn: true } },
          clinicService: { select: { id: true, name: true, durationMinutes: true } },
        },
      });
      if (!service) throw new NotFoundException('General clinical service not found');
      return { ...service, basePriceMinor: Number(service.basePriceMinor) };
    });
  }

  // =========================================================================
  // 2. CLINICAL ORDERS
  // =========================================================================

  private async generateNextOrderNumber(tx: TenantTransaction, clinicId: string): Promise<string> {
    const counter = await tx.clinicOrderCounter.upsert({
      where: { clinicId },
      create: { clinicId, nextValue: 2 },
      update: { nextValue: { increment: 1 } },
      select: { nextValue: true },
    });
    return `ORD-${String(counter.nextValue - 1).padStart(6, '0')}`;
  }

  async createOrder(proof: VerifiedPrincipal, clinicId: string, dto: CreateClinicalOrderDto) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.orders.create'], async (tx, c) => {
      const patient = await tx.patient.findFirst({ where: { clinicId: c.clinicId, id: dto.patientId, status: 'ACTIVE' } });
      if (!patient) throw new NotFoundException('Active patient not found');

      if (dto.encounterId) {
        const encounter = await tx.clinicalEncounter.findFirst({ where: { clinicId: c.clinicId, id: dto.encounterId, patientId: dto.patientId } });
        if (!encounter) throw new NotFoundException('Clinical encounter not found for patient');
      }

      if (dto.generalClinicalServiceId) {
        const service = await tx.generalClinicalService.findFirst({ where: { clinicId: c.clinicId, id: dto.generalClinicalServiceId, isActive: true } });
        if (!service) throw new NotFoundException('Active general clinical service not found');
      }

      if (dto.orderType === 'LABORATORY') {
        const ev = await this.specialtyRepo.evaluatePrivilege(proof, c.clinicId, { practitionerMembershipId: c.membershipId, specialtyCode: 'GENERAL_MEDICINE', privilegeCode: 'DIAGNOSTIC_LAB_ORDER', branchId: dto.branchId ?? c.selectedBranchId });
        if (!ev.allowed && c.role !== 'DOCTOR' && c.role !== 'CLINIC_OWNER') throw new ForbiddenException(ev.reason ?? 'Practitioner lacks DIAGNOSTIC_LAB_ORDER privilege');
      } else if (dto.orderType === 'IMAGING') {
        const ev = await this.specialtyRepo.evaluatePrivilege(proof, c.clinicId, { practitionerMembershipId: c.membershipId, specialtyCode: 'GENERAL_MEDICINE', privilegeCode: 'DIAGNOSTIC_IMAGING_ORDER', branchId: dto.branchId ?? c.selectedBranchId });
        if (!ev.allowed && c.role !== 'DOCTOR' && c.role !== 'CLINIC_OWNER') throw new ForbiddenException(ev.reason ?? 'Practitioner lacks DIAGNOSTIC_IMAGING_ORDER privilege');
      }

      const orderNumber = await this.generateNextOrderNumber(tx, c.clinicId);

      const order = await tx.clinicalOrder.create({
        data: { clinicId: c.clinicId, orderNumber, patientId: dto.patientId, encounterId: dto.encounterId, orderingDoctorMembershipId: c.membershipId, specialtyId: dto.specialtyId, branchId: dto.branchId ?? c.selectedBranchId, orderType: dto.orderType, generalClinicalServiceId: dto.generalClinicalServiceId, clinicalIndication: dto.clinicalIndication, priority: dto.priority ?? 'ROUTINE', status: 'REQUESTED', notes: dto.notes },
        include: { patient: { select: { id: true, fullName: true, patientNumber: true } }, orderingDoctor: { select: { id: true, user: { select: { name: true, email: true } } } }, generalClinicalService: true },
      });

      await this.audit.record({ clinicId: c.clinicId, actorId: c.userId, action: 'clinical.order.create', category: 'CLINICAL', targetType: 'ClinicalOrder', targetId: order.id, metadata: { orderNumber: order.orderNumber, orderType: order.orderType, priority: order.priority } });

      return { ...order, generalClinicalService: order.generalClinicalService ? { ...order.generalClinicalService, basePriceMinor: Number(order.generalClinicalService.basePriceMinor) } : null };
    });
  }

  async updateOrderStatus(proof: VerifiedPrincipal, clinicId: string, orderId: string, dto: UpdateClinicalOrderStatusDto) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.orders.update'], async (tx, c) => {
      const order = await tx.clinicalOrder.findFirst({ where: { clinicId: c.clinicId, id: orderId } });
      if (!order) throw new NotFoundException('Clinical order not found');
      if (dto.expectedVersion !== undefined && order.version !== dto.expectedVersion) throw new ConflictException(`Version conflict: expected ${dto.expectedVersion}, actual ${order.version}`);
      if (order.status === 'COMPLETED' || order.status === 'CANCELLED') throw new BadRequestException(`Cannot change status of an order that is already ${order.status}`);

      const data: Record<string, unknown> = { status: dto.status, version: { increment: 1 } };
      if (dto.status === 'CANCELLED') {
        if (!dto.cancellationReason) throw new BadRequestException('cancellationReason is required when cancelling an order');
        data.cancellationReason = dto.cancellationReason;
        data.cancelledByMembershipId = c.membershipId;
        data.cancelledAt = new Date();
      } else if (dto.status === 'COMPLETED') {
        data.completedAt = new Date(); data.reviewedByMembershipId = c.membershipId; data.reviewedAt = new Date();
      }

      const updated = await tx.clinicalOrder.update({ where: { clinicId_id: { clinicId: c.clinicId, id: orderId } }, data, include: { patient: { select: { id: true, fullName: true, patientNumber: true } }, orderingDoctor: { select: { id: true, user: { select: { name: true, email: true } } } }, generalClinicalService: true } });
      await this.audit.record({ clinicId: c.clinicId, actorId: c.userId, action: 'clinical.order.status_update', category: 'CLINICAL', targetType: 'ClinicalOrder', targetId: updated.id, metadata: { orderNumber: updated.orderNumber, status: updated.status } });
      return { ...updated, generalClinicalService: updated.generalClinicalService ? { ...updated.generalClinicalService, basePriceMinor: Number(updated.generalClinicalService.basePriceMinor) } : null };
    });
  }

  async cancelOrder(proof: VerifiedPrincipal, clinicId: string, orderId: string, dto: CancelClinicalOrderDto) {
    return this.updateOrderStatus(proof, clinicId, orderId, { status: 'CANCELLED', cancellationReason: dto.cancellationReason, expectedVersion: dto.expectedVersion });
  }

  async listOrders(proof: VerifiedPrincipal, clinicId: string, query: ClinicalOrderQueryDto) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.orders.read'], async (tx, c) => {
      const where: Record<string, unknown> = { clinicId: c.clinicId, ...(query.patientId ? { patientId: query.patientId } : {}), ...(query.encounterId ? { encounterId: query.encounterId } : {}), ...(query.orderType ? { orderType: query.orderType } : {}), ...(query.status ? { status: query.status } : {}), ...(query.priority ? { priority: query.priority } : {}) };
      const pageSize = query.pageSize ?? 50;
      const items = await tx.clinicalOrder.findMany({
        where, take: pageSize + 1, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}), orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: { patient: { select: { id: true, fullName: true, patientNumber: true } }, orderingDoctor: { select: { id: true, user: { select: { name: true } } } }, generalClinicalService: true, results: { select: { id: true, status: true, isCritical: true, isReleasedToPatient: true, verifiedAt: true } }, documents: { select: { id: true, title: true, mimeType: true, fileSizeBytes: true } } },
      });
      const hasMore = items.length > pageSize;
      const pageItems = hasMore ? items.slice(0, pageSize) : items;
      return { items: pageItems.map((o) => ({ ...o, generalClinicalService: o.generalClinicalService ? { ...o.generalClinicalService, basePriceMinor: Number(o.generalClinicalService.basePriceMinor) } : null, documents: o.documents.map((d) => ({ ...d, fileSizeBytes: Number(d.fileSizeBytes) })) })), nextCursor: hasMore ? pageItems[pageItems.length - 1].id : null, hasMore };
    });
  }

  async getOrderById(proof: VerifiedPrincipal, clinicId: string, orderId: string) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.orders.read'], async (tx, c) => {
      const order = await tx.clinicalOrder.findFirst({
        where: { clinicId: c.clinicId, id: orderId },
        include: {
          patient: { select: { id: true, fullName: true, patientNumber: true, dateOfBirth: true, gender: true } },
          encounter: { select: { id: true, status: true, createdAt: true } },
          orderingDoctor: { select: { id: true, user: { select: { name: true, email: true } } } },
          generalClinicalService: true,
          results: { include: { recordedBy: { select: { id: true, user: { select: { name: true } } } }, verifiedBy: { select: { id: true, user: { select: { name: true } } } } } },
          documents: { select: { id: true, title: true, documentType: true, fileName: true, mimeType: true, fileSizeBytes: true, isConfidential: true, isLegalHold: true, createdAt: true } },
        },
      });
      if (!order) throw new NotFoundException('Clinical order not found');
      return { ...order, generalClinicalService: order.generalClinicalService ? { ...order.generalClinicalService, basePriceMinor: Number(order.generalClinicalService.basePriceMinor) } : null, documents: order.documents.map((d) => ({ ...d, fileSizeBytes: Number(d.fileSizeBytes) })) };
    });
  }

  // =========================================================================
  // 3. CLINICAL ORDER RESULTS & VERIFICATION
  // =========================================================================

  async recordResult(proof: VerifiedPrincipal, clinicId: string, orderId: string, dto: RecordOrderResultDto) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.results.record'], async (tx, c) => {
      const order = await tx.clinicalOrder.findFirst({ where: { clinicId: c.clinicId, id: orderId } });
      if (!order) throw new NotFoundException('Clinical order not found');
      if (order.status === 'CANCELLED') throw new BadRequestException('Cannot record results on a cancelled order');
      if (dto.isCritical && !dto.criticalNotes) throw new BadRequestException('criticalNotes required when result is critical');

      const result = await tx.clinicalOrderResult.create({
        data: { clinicId: c.clinicId, orderId: order.id, patientId: order.patientId, resultType: dto.resultType, status: dto.status ?? 'FINAL', sourceOrganization: dto.sourceOrganization, performedAt: dto.performedAt ? new Date(dto.performedAt) : new Date(), issuedAt: new Date(), recordedByMembershipId: c.membershipId, narrativeFindings: dto.narrativeFindings, impression: dto.impression, structuredData: (dto.structuredData ?? undefined) as any, isCritical: dto.isCritical ?? false, criticalNotes: dto.criticalNotes, isReleasedToPatient: dto.isReleasedToPatient ?? false, ...(dto.isReleasedToPatient ? { releasedAt: new Date(), releasedByMembershipId: c.membershipId } : {}) },
        include: { recordedBy: { select: { id: true, user: { select: { name: true } } } } },
      });

      if (order.status === 'REQUESTED' || order.status === 'ACCEPTED') {
        await tx.clinicalOrder.update({ where: { clinicId_id: { clinicId: c.clinicId, id: order.id } }, data: { status: 'IN_PROGRESS', version: { increment: 1 } } });
      }

      await this.audit.record({ clinicId: c.clinicId, actorId: c.userId, action: 'clinical.result.record', category: 'CLINICAL', targetType: 'ClinicalOrderResult', targetId: result.id, metadata: { orderId: order.id, isCritical: result.isCritical, status: result.status } });
      return result;
    });
  }

  async verifyResult(proof: VerifiedPrincipal, clinicId: string, resultId: string, dto: VerifyOrderResultDto) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.results.verify'], async (tx, c) => {
      const result = await tx.clinicalOrderResult.findFirst({ where: { clinicId: c.clinicId, id: resultId }, include: { order: true } });
      if (!result) throw new NotFoundException('Diagnostic result not found');
      if (dto.expectedVersion !== undefined && result.version !== dto.expectedVersion) throw new ConflictException(`Version conflict: expected ${dto.expectedVersion}, actual ${result.version}`);

      const updated = await tx.clinicalOrderResult.update({ where: { clinicId_id: { clinicId: c.clinicId, id: resultId } }, data: { status: 'FINAL', verifiedByMembershipId: c.membershipId, verifiedAt: new Date(), version: { increment: 1 } }, include: { recordedBy: { select: { id: true, user: { select: { name: true } } } }, verifiedBy: { select: { id: true, user: { select: { name: true } } } } } });

      if (result.order.status !== 'COMPLETED' && result.order.status !== 'CANCELLED') {
        await tx.clinicalOrder.update({ where: { clinicId_id: { clinicId: c.clinicId, id: result.orderId } }, data: { status: 'COMPLETED', completedAt: new Date(), reviewedByMembershipId: c.membershipId, reviewedAt: new Date(), version: { increment: 1 } } });
      }

      await this.audit.record({ clinicId: c.clinicId, actorId: c.userId, action: 'clinical.result.verify', category: 'CLINICAL', targetType: 'ClinicalOrderResult', targetId: updated.id, metadata: { orderId: result.orderId } });
      return updated;
    });
  }

  async correctResult(proof: VerifiedPrincipal, clinicId: string, resultId: string, dto: CorrectOrderResultDto) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.results.record'], async (tx, c) => {
      const existing = await tx.clinicalOrderResult.findFirst({ where: { clinicId: c.clinicId, id: resultId } });
      if (!existing) throw new NotFoundException('Diagnostic result not found');
      if (dto.expectedVersion !== undefined && existing.version !== dto.expectedVersion) throw new ConflictException(`Version conflict: expected ${dto.expectedVersion}, actual ${existing.version}`);
      if (!dto.correctionReason || dto.correctionReason.trim().length < 5) throw new BadRequestException('correctionReason must be at least 5 characters');

      const updated = await tx.clinicalOrderResult.update({ where: { clinicId_id: { clinicId: c.clinicId, id: resultId } }, data: { status: 'CORRECTED', correctionReason: dto.correctionReason, ...(dto.narrativeFindings !== undefined ? { narrativeFindings: dto.narrativeFindings } : {}), ...(dto.impression !== undefined ? { impression: dto.impression } : {}), ...(dto.structuredData !== undefined ? { structuredData: dto.structuredData as any } : {}), ...(dto.isCritical !== undefined ? { isCritical: dto.isCritical } : {}), ...(dto.criticalNotes !== undefined ? { criticalNotes: dto.criticalNotes } : {}), version: { increment: 1 } }, include: { recordedBy: { select: { id: true, user: { select: { name: true } } } }, verifiedBy: { select: { id: true, user: { select: { name: true } } } } } });

      await this.audit.record({ clinicId: c.clinicId, actorId: c.userId, action: 'clinical.result.correct', category: 'CLINICAL', targetType: 'ClinicalOrderResult', targetId: updated.id, metadata: { correctionReason: dto.correctionReason } });
      return updated;
    });
  }

  async acknowledgeCriticalResult(proof: VerifiedPrincipal, clinicId: string, resultId: string, dto: AcknowledgeCriticalResultDto) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.results.record'], async (tx, c) => {
      const result = await tx.clinicalOrderResult.findFirst({ where: { clinicId: c.clinicId, id: resultId } });
      if (!result) throw new NotFoundException('Diagnostic result not found');
      if (!result.isCritical) throw new BadRequestException('Diagnostic result is not marked as critical');
      if (dto.expectedVersion !== undefined && result.version !== dto.expectedVersion) throw new ConflictException(`Version conflict: expected ${dto.expectedVersion}, actual ${result.version}`);

      const updatedNotes = `${result.criticalNotes ? result.criticalNotes + '\n' : ''}[ACKNOWLEDGED]: ${dto.actionTaken}`.substring(0, 1000);

      const updated = await tx.clinicalOrderResult.update({ where: { clinicId_id: { clinicId: c.clinicId, id: resultId } }, data: { criticalAcknowledgedByMembershipId: c.membershipId, criticalAcknowledgedAt: new Date(), criticalNotes: updatedNotes, version: { increment: 1 } }, include: { recordedBy: { select: { id: true, user: { select: { name: true } } } }, verifiedBy: { select: { id: true, user: { select: { name: true } } } } } });

      await this.audit.record({ clinicId: c.clinicId, actorId: c.userId, action: 'clinical.result.acknowledge_critical', category: 'CLINICAL', targetType: 'ClinicalOrderResult', targetId: updated.id, metadata: { actionTaken: dto.actionTaken } });
      return updated;
    });
  }

  async releaseResultToPatient(proof: VerifiedPrincipal, clinicId: string, resultId: string, dto: ReleaseResultToPatientDto) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.results.release'], async (tx, c) => {
      const result = await tx.clinicalOrderResult.findFirst({ where: { clinicId: c.clinicId, id: resultId } });
      if (!result) throw new NotFoundException('Diagnostic result not found');
      if (dto.expectedVersion !== undefined && result.version !== dto.expectedVersion) throw new ConflictException(`Version conflict: expected ${dto.expectedVersion}, actual ${result.version}`);

      const updated = await tx.clinicalOrderResult.update({ where: { clinicId_id: { clinicId: c.clinicId, id: resultId } }, data: { isReleasedToPatient: dto.isReleasedToPatient, releasedAt: dto.isReleasedToPatient ? new Date() : null, releasedByMembershipId: dto.isReleasedToPatient ? c.membershipId : null, version: { increment: 1 } } });

      await this.audit.record({ clinicId: c.clinicId, actorId: c.userId, action: 'clinical.result.release', category: 'CLINICAL', targetType: 'ClinicalOrderResult', targetId: updated.id, metadata: { isReleasedToPatient: dto.isReleasedToPatient } });
      return updated;
    });
  }

  async listResultsForOrder(proof: VerifiedPrincipal, clinicId: string, orderId: string) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.results.read'], async (tx, c) => {
      return tx.clinicalOrderResult.findMany({ where: { clinicId: c.clinicId, orderId }, orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }], include: { recordedBy: { select: { id: true, user: { select: { name: true } } } }, verifiedBy: { select: { id: true, user: { select: { name: true } } } }, documents: { select: { id: true, title: true, fileName: true, mimeType: true, fileSizeBytes: true, createdAt: true } } } });
    });
  }

  // =========================================================================
  // 4. SECURE MEDICAL DOCUMENTS
  // =========================================================================

  async uploadDocument(proof: VerifiedPrincipal, clinicId: string, dto: CreateClinicalDocumentDto, fileBuffer: Buffer) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.documents.upload'], async (tx, c) => {
      const patient = await tx.patient.findFirst({ where: { clinicId: c.clinicId, id: dto.patientId, status: 'ACTIVE' } });
      if (!patient) throw new NotFoundException('Active patient not found');

      if (dto.encounterId) {
        const enc = await tx.clinicalEncounter.findFirst({ where: { clinicId: c.clinicId, id: dto.encounterId, patientId: dto.patientId } });
        if (!enc) throw new NotFoundException('Clinical encounter not found for patient');
      }

      if (dto.orderId) {
        const o = await tx.clinicalOrder.findFirst({ where: { clinicId: c.clinicId, id: dto.orderId, patientId: dto.patientId } });
        if (!o) throw new NotFoundException('Clinical order not found for patient');
      }

      if (dto.resultId) {
        const r = await tx.clinicalOrderResult.findFirst({ where: { clinicId: c.clinicId, id: dto.resultId, patientId: dto.patientId } });
        if (!r) throw new NotFoundException('Clinical order result not found for patient');
      }

      const documentId = randomUUID();
      const encrypted = await this.crypto.storeEncryptedDocument(c.clinicId, documentId, fileBuffer, dto.mimeType);

      const created = await tx.clinicalDocument.create({
        data: { id: documentId, clinicId: c.clinicId, patientId: dto.patientId, encounterId: dto.encounterId, orderId: dto.orderId, resultId: dto.resultId, documentType: dto.documentType, title: dto.title, fileName: dto.fileName, mimeType: encrypted.detectedMime, fileSizeBytes: encrypted.fileSizeBytes, storageKey: encrypted.storageKey, contentSha256: encrypted.contentSha256, encryptionIv: encrypted.encryptionIv, encryptionTag: encrypted.encryptionTag, isConfidential: dto.isConfidential ?? false, uploadedByMembershipId: c.membershipId },
        include: { patient: { select: { id: true, fullName: true, patientNumber: true } }, uploadedBy: { select: { id: true, user: { select: { name: true } } } } },
      });

      await this.audit.record({ clinicId: c.clinicId, actorId: c.userId, action: 'clinical.document.upload', category: 'CLINICAL', targetType: 'ClinicalDocument', targetId: created.id, metadata: { documentType: created.documentType, title: created.title, contentSha256: created.contentSha256 } });
      return { ...created, fileSizeBytes: Number(created.fileSizeBytes) };
    });
  }

  async updateDocument(proof: VerifiedPrincipal, clinicId: string, documentId: string, dto: UpdateClinicalDocumentDto) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.documents.manage'], async (tx, c) => {
      const doc = await tx.clinicalDocument.findFirst({ where: { clinicId: c.clinicId, id: documentId } });
      if (!doc) throw new NotFoundException('Clinical document not found');
      if (dto.expectedVersion !== undefined && doc.version !== dto.expectedVersion) throw new ConflictException(`Version conflict: expected ${dto.expectedVersion}, actual ${doc.version}`);
      if (doc.isLegalHold && dto.isLegalHold === false && (!dto.legalHoldReason || dto.legalHoldReason.trim().length < 5)) throw new BadRequestException('legalHoldReason required when removing legal hold');

      const updated = await tx.clinicalDocument.update({ where: { clinicId_id: { clinicId: c.clinicId, id: documentId } }, data: { ...(dto.title !== undefined ? { title: dto.title } : {}), ...(dto.isConfidential !== undefined ? { isConfidential: dto.isConfidential } : {}), ...(dto.isLegalHold !== undefined ? { isLegalHold: dto.isLegalHold } : {}), ...(dto.legalHoldReason !== undefined ? { legalHoldReason: dto.legalHoldReason } : {}), version: { increment: 1 } } });

      await this.audit.record({ clinicId: c.clinicId, actorId: c.userId, action: 'clinical.document.update', category: 'CLINICAL', targetType: 'ClinicalDocument', targetId: updated.id, metadata: { isLegalHold: updated.isLegalHold } });
      return { ...updated, fileSizeBytes: Number(updated.fileSizeBytes) };
    });
  }

  async getDocumentMetadata(proof: VerifiedPrincipal, clinicId: string, documentId: string) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.documents.read'], async (tx, c) => {
      const doc = await tx.clinicalDocument.findFirst({ where: { clinicId: c.clinicId, id: documentId }, include: { patient: { select: { id: true, fullName: true, patientNumber: true } }, uploadedBy: { select: { id: true, user: { select: { name: true } } } } } });
      if (!doc) throw new NotFoundException('Clinical document not found');
      return { ...doc, fileSizeBytes: Number(doc.fileSizeBytes) };
    });
  }

  async downloadDocument(proof: VerifiedPrincipal, clinicId: string, documentId: string): Promise<{ buffer: Buffer; fileName: string; mimeType: string; contentSha256: string }> {
    return this.database.withClinicContext(proof, clinicId, ['clinical.documents.read'], async (tx, c) => {
      const doc = await tx.clinicalDocument.findFirst({ where: { clinicId: c.clinicId, id: documentId } });
      if (!doc) throw new NotFoundException('Clinical document not found');

      const buffer = await this.crypto.retrieveEncryptedDocument(doc.storageKey, doc.contentSha256, doc.encryptionIv, doc.encryptionTag);

      await this.audit.record({ clinicId: c.clinicId, actorId: c.userId, action: 'clinical.document.download', category: 'CLINICAL', targetType: 'ClinicalDocument', targetId: doc.id, metadata: { fileName: doc.fileName } });
      return { buffer, fileName: doc.fileName, mimeType: doc.mimeType, contentSha256: doc.contentSha256 };
    });
  }

  async listDocuments(proof: VerifiedPrincipal, clinicId: string, query: ClinicalDocumentQueryDto) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.documents.read'], async (tx, c) => {
      const where: Record<string, unknown> = { clinicId: c.clinicId, ...(query.patientId ? { patientId: query.patientId } : {}), ...(query.encounterId ? { encounterId: query.encounterId } : {}), ...(query.orderId ? { orderId: query.orderId } : {}), ...(query.resultId ? { resultId: query.resultId } : {}), ...(query.documentType ? { documentType: query.documentType } : {}), ...(query.isLegalHold !== undefined ? { isLegalHold: query.isLegalHold } : {}) };
      const pageSize = query.pageSize ?? 50;
      const items = await tx.clinicalDocument.findMany({ where, take: pageSize + 1, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}), orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: { patient: { select: { id: true, fullName: true, patientNumber: true } }, uploadedBy: { select: { id: true, user: { select: { name: true } } } } } });
      const hasMore = items.length > pageSize;
      const pageItems = hasMore ? items.slice(0, pageSize) : items;
      return { items: pageItems.map((d) => ({ ...d, fileSizeBytes: Number(d.fileSizeBytes) })), nextCursor: hasMore ? pageItems[pageItems.length - 1].id : null, hasMore };
    });
  }

  // =========================================================================
  // 5. BILLING INTEGRATION
  // =========================================================================

  async createDraftInvoiceForGeneralService(proof: VerifiedPrincipal, clinicId: string, dto: CreateDraftInvoiceForGeneralServiceDto) {
    return this.database.withClinicContext(proof, clinicId, ['invoices.create'], async (tx, c) => {
      const service = await tx.generalClinicalService.findFirst({ where: { clinicId: c.clinicId, id: dto.generalClinicalServiceId, isActive: true } });
      if (!service) throw new NotFoundException('Active general clinical service not found');
      const clinic = await tx.clinic.findFirstOrThrow({ where: { id: c.clinicId }, select: { currency: true } });
      const scale = currencyScale(clinic.currency);
      const unitPrice = (Number(service.basePriceMinor) / 10 ** scale).toFixed(scale);

      return this.billingRepo.create(proof, clinicId, {
        patientId: dto.patientId,
        visitId: dto.visitId ?? null,
        requestKey: dto.requestKey,
        lines: [{ serviceName: service.nameAr, description: service.nameEn ?? null, quantity: '1', unitPrice, discount: '0', taxBasisPoints: 0 }],
      });
    });
  }

  async createDraftInvoiceForOrder(proof: VerifiedPrincipal, clinicId: string, dto: CreateDraftInvoiceForOrderDto) {
    return this.database.withClinicContext(proof, clinicId, ['invoices.create'], async (tx, c) => {
      const order = await tx.clinicalOrder.findFirst({ where: { clinicId: c.clinicId, id: dto.orderId }, include: { generalClinicalService: true } });
      if (!order) throw new NotFoundException('Clinical order not found');
      if (order.status === 'CANCELLED') throw new BadRequestException('Cannot create invoice for a cancelled clinical order');
      if (!order.generalClinicalService) throw new BadRequestException('Clinical order is not linked to a billable general clinical service');

      const service = order.generalClinicalService;
      const clinic = await tx.clinic.findFirstOrThrow({ where: { id: c.clinicId }, select: { currency: true } });
      const scale = currencyScale(clinic.currency);
      const unitPrice = (Number(service.basePriceMinor) / 10 ** scale).toFixed(scale);

      return this.billingRepo.create(proof, clinicId, {
        patientId: order.patientId,
        visitId: dto.visitId ?? null,
        requestKey: dto.requestKey,
        lines: [{ serviceName: service.nameAr, description: `[${order.orderNumber}] ${service.nameEn ?? ''}`.trim() || null, quantity: '1', unitPrice, discount: '0', taxBasisPoints: 0 }],
      });
    });
  }
}

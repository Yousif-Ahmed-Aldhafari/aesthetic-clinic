import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import {
  searchName, normalizePhone, type CreatePatient, type UpdatePatient,
  type PatientQuery, type PatientStatusChange,
} from '../patients/patient-input.js';
import { TenantDatabaseService } from './tenant-database.service.js';
import type { VerifiedPrincipal } from './verified-sessions.js';

// Explicit response allowlist; ownership, search keys and allocator stay internal.
const projection = {
  id: true, patientNumber: true, fullName: true, phone: true, email: true,
  dateOfBirth: true, gender: true, status: true, version: true,
  createdAt: true, updatedAt: true,
} satisfies Prisma.PatientSelect;
type PatientRow = Prisma.PatientGetPayload<{ select: typeof projection }>;
const response = (p: PatientRow) => ({
  id: p.id, patientNumber: p.patientNumber, fullName: p.fullName, phone: p.phone,
  email: p.email, dateOfBirth: p.dateOfBirth?.toISOString().slice(0, 10) ?? null,
  gender: p.gender, status: p.status, version: p.version,
  createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString(),
});
const likeLiteral = (value: string) => value.replace(/[\\%_]/g, '\\$&');
const editableFields = (input: CreatePatient | UpdatePatient) => ({
  ...(input.fullName === undefined ? {} : { fullName: input.fullName, searchName: searchName(input.fullName) }),
  ...(input.phone === undefined ? {} : { phone: input.phone }),
  ...(input.email === undefined ? {} : { email: input.email }),
  ...(input.gender === undefined ? {} : { gender: input.gender }),
  ...(input.dateOfBirth === undefined ? {} : {
    dateOfBirth: input.dateOfBirth ? new Date(`${input.dateOfBirth}T00:00:00.000Z`) : null,
  }),
});

@Injectable()
export class PatientRepository {
  constructor(private readonly database: TenantDatabaseService) {}

  list(proof: VerifiedPrincipal, clinicId: string, query: PatientQuery) {
    const q = searchName(query.q);
    if (query.q.trim() && !q) throw new BadRequestException();
    return this.database.withClinicContext(proof, clinicId, ['patients.read'], async (tx, context) => {
      const where: Prisma.PatientWhereInput = {
        clinicId: context.clinicId,
        ...(query.status === 'ALL' ? {} : { status: query.status }),
      };
      if (q) {
        const terms: Prisma.PatientWhereInput[] = [
          { searchName: { startsWith: likeLiteral(q) } },
          { patientNumber: { startsWith: likeLiteral(q.toUpperCase()) } },
        ];
        const phone = normalizePhone(q);
        if (/^\+?\d+$/.test(phone)) terms.push({ phone: { startsWith: phone } });
        where.OR = terms;
      }
      if (query.cursor) {
        const anchor = await tx.patient.findFirst({
          where: { id: query.cursor, clinicId: context.clinicId }, select: { createdAt: true, id: true },
        });
        if (!anchor) throw new NotFoundException();
        where.AND = [{ OR: [
          { createdAt: { lt: anchor.createdAt } },
          { createdAt: anchor.createdAt, id: { lt: anchor.id } },
        ] }];
      }
      const rows = await tx.patient.findMany({
        where, select: projection, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.pageSize + 1,
      });
      const hasMore = rows.length > query.pageSize, items = rows.slice(0, query.pageSize);
      return {
        items: items.map(response), pageSize: query.pageSize, hasMore,
        nextCursor: hasMore ? items.at(-1)!.id : null,
      };
    });
  }

  get(proof: VerifiedPrincipal, clinicId: string, patientId: string) {
    return this.database.withClinicContext(proof, clinicId, ['patients.read'], async (tx, context) => {
      const patient = await tx.patient.findFirst({
        where: { id: patientId, clinicId: context.clinicId }, select: projection,
      });
      if (!patient) throw new NotFoundException();
      return response(patient);
    });
  }

  async create(proof: VerifiedPrincipal, clinicId: string, input: CreatePatient) {
    try {
      return await this.database.withClinicContext(proof, clinicId, ['patients.create'], async (tx, context) => {
        // A native PostgreSQL upsert locks the clinic counter until commit. Failed
        // registration rolls back both allocation and insertion in this transaction.
        const counter = await tx.patientCounter.upsert({
          where: { clinicId: context.clinicId },
          create: { clinicId: context.clinicId, lastNumber: 1 },
          update: { lastNumber: { increment: 1 } }, select: { lastNumber: true },
        });
        const patient = await tx.patient.create({
          data: {
            ...editableFields(input), fullName: input.fullName, searchName: searchName(input.fullName),
            clinicId: context.clinicId, patientNumber: `P-${String(counter.lastNumber).padStart(6, '0')}`,
          }, select: projection,
        });
        return response(patient);
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException();
      throw error;
    }
  }

  update(proof: VerifiedPrincipal, clinicId: string, patientId: string, input: UpdatePatient) {
    const data = editableFields(input);
    if (!Object.keys(data).length) throw new BadRequestException();
    return this.change(proof, clinicId, patientId, input.expectedVersion, data);
  }

  status(proof: VerifiedPrincipal, clinicId: string, patientId: string, input: PatientStatusChange) {
    return this.change(proof, clinicId, patientId, input.expectedVersion, { status: input.status });
  }

  private change(proof: VerifiedPrincipal, clinicId: string, patientId: string, version: number,
    data: Prisma.PatientUpdateManyMutationInput) {
    return this.database.withClinicContext(proof, clinicId, ['patients.update'], async (tx, context) => {
      const changed = await tx.patient.updateMany({
        where: { id: patientId, clinicId: context.clinicId, version },
        data: { ...data, version: { increment: 1 } },
      });
      const patient = await tx.patient.findFirst({
        where: { id: patientId, clinicId: context.clinicId }, select: projection,
      });
      // Foreign/missing ID is always 404. Only an authorized, visible row can give
      // a version conflict; no cross-clinic existence signal reaches the caller.
      if (!patient) throw new NotFoundException();
      if (changed.count !== 1) throw new ConflictException();
      return response(patient);
    });
  }
}

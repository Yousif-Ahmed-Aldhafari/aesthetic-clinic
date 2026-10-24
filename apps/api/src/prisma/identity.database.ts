import { Injectable } from '@nestjs/common';
import type { ClinicRole, MembershipStatus, ClinicStatus, User, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from './prisma.service.js';

export interface MembershipSnapshot {
  id: string; clinicId: string; role: ClinicRole; status: MembershipStatus;
  clinic: { status: ClinicStatus; slug: string; displayName: string };
}
export type AuthUser = User & { memberships: MembershipSnapshot[] };
type IdentityTransaction = Pick<Prisma.TransactionClient, 'session' | 'loginBucket'> & { userById: (id: string) => Promise<AuthUser | null> };

// Reviewed GLOBAL identity/security boundary. No tenant delegates are exported.
@Injectable()
export class IdentityDatabase {
  constructor(private readonly prisma: PrismaService) {}
  get session() { return this.prisma.session; }
  get loginBucket() { return this.prisma.loginBucket; }
  credentialsByEmail(email: string) { return this.prisma.user.findUnique({ where: { email } }); }
  async userById(id: string) { return this.loadUser(this.prisma, id); }
  async loadUser(tx: Pick<Prisma.TransactionClient, 'user' | '$queryRaw'>, id: string) {
    const user = await tx.user.findUnique({ where: { id } });
    return user ? this.snapshot(tx, user) : null;
  }
  private async snapshot(tx: Pick<Prisma.TransactionClient, '$queryRaw'>, user: User): Promise<AuthUser> {
    const rows = await tx.$queryRaw<(Omit<MembershipSnapshot, 'clinic'> & { clinicStatus: ClinicStatus; slug: string; displayName: string })[]>`
      SELECT * FROM lamssa_security.identity_memberships(${user.id}::uuid)`;
    return { ...user, memberships: rows.map(({clinicStatus,slug,displayName,...m})=>({...m,clinic:{status:clinicStatus,slug,displayName}})) };
  }
  transaction<T>(work: (tx: IdentityTransaction) => Promise<T>) {
    return this.prisma.$transaction(tx=>work({session:tx.session,loginBucket:tx.loginBucket,userById:id=>this.loadUser(tx,id)}));
  }
}

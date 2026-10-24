import { SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { Prisma } from '../generated/prisma/client.js';
import type { Permission } from './permissions.js';

export const ACCESS = 'lamssa.access';
export type AccessPolicy = { kind: 'public' | 'authenticated' | 'clinic'; permissions?: Permission[] };
export const PublicRoute = () => SetMetadata(ACCESS, { kind: 'public' } satisfies AccessPolicy);
export const Authenticated = () => SetMetadata(ACCESS, { kind: 'authenticated' } satisfies AccessPolicy);
export const ClinicPermissions = (...required: Permission[]) => SetMetadata(ACCESS, { kind: 'clinic', permissions: required } satisfies AccessPolicy);
export const authUserInclude = { memberships: { include: { clinic: true } } } satisfies Prisma.UserInclude;
export type AuthUser = Prisma.UserGetPayload<{ include: typeof authUserInclude }>;
export type AuthSession = Prisma.SessionGetPayload<{}>;
export type AuthRequest = Request & { auth?: { user: AuthUser; session: AuthSession }; clinicContext?: ClinicContext };
export type ClinicContext = { clinicId: string; slug: string; displayName: string; role: AuthUser['memberships'][number]['role']; permissions: readonly Permission[]; branding: { logoUrl: string | null; primaryColor: string; secondaryColor: string; accentColor: string | null } | null };

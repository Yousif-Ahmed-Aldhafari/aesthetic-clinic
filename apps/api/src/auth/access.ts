import { SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { Prisma } from '../generated/prisma/client.js';
import type { Permission } from './permissions.js';

export const ACCESS = 'lamssa.access';
export const STEP_UP = 'lamssa.step_up';
export type AccessPolicy = { kind: 'public' | 'authenticated' | 'clinic'; permissions?: Permission[] };
export type StepUpPolicy = { maxAgeMinutes: number };
export const PublicRoute = () => SetMetadata(ACCESS, { kind: 'public' } satisfies AccessPolicy);
export const Authenticated = () => SetMetadata(ACCESS, { kind: 'authenticated' } satisfies AccessPolicy);
export const ClinicPermissions = (...required: Permission[]) => SetMetadata(ACCESS, { kind: 'clinic', permissions: required } satisfies AccessPolicy);
export const RequireStepUp = (maxAgeMinutes = 15) => SetMetadata(STEP_UP, { maxAgeMinutes } satisfies StepUpPolicy);
export type { AuthUser } from '../prisma/identity.database.js';
import type { AuthUser } from '../prisma/identity.database.js';
import type { VerifiedPrincipal } from '../prisma/verified-sessions.js';
export type AuthSession = Prisma.SessionGetPayload<{}>;
export type AuthRequest = Request & { auth?: { user: AuthUser; session: AuthSession; principal: VerifiedPrincipal }; clinicContext?: ClinicContext };
export type ClinicContext = { clinicId: string; slug: string; displayName: string; role: AuthUser['memberships'][number]['role']; permissions: readonly Permission[]; branding: { logoUrl: string | null; primaryColor: string; secondaryColor: string; accentColor: string | null; faviconUrl?:string|null; typography?:string } | null };

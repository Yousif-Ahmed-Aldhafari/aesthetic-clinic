-- CreateEnum
CREATE TYPE "ClinicMfaPolicy" AS ENUM ('OWNER_ONLY', 'ADMINS_AND_OWNER', 'ALL_STAFF', 'OPTIONAL');

-- CreateEnum
CREATE TYPE "MfaStatus" AS ENUM ('PENDING', 'ACTIVE', 'DISABLED');

-- AlterTable Clinic
ALTER TABLE public."Clinic" ADD COLUMN "mfaPolicy" "ClinicMfaPolicy" NOT NULL DEFAULT 'OWNER_ONLY';

-- AlterTable Session
ALTER TABLE public."Session" ADD COLUMN "mfaVerifiedAt" TIMESTAMPTZ(3),
ADD COLUMN "userAgent" VARCHAR(255),
ADD COLUMN "ipAddress" VARCHAR(45),
ADD COLUMN "deviceSummary" VARCHAR(100);

-- CreateTable UserMfa
CREATE TABLE public."UserMfa" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "totpSecretEnc" TEXT NOT NULL,
    "totpIv" VARCHAR(32) NOT NULL,
    "totpTag" VARCHAR(32) NOT NULL,
    "status" "MfaStatus" NOT NULL DEFAULT 'PENDING',
    "enrolledAt" TIMESTAMPTZ(3),
    "lastUsedAt" TIMESTAMPTZ(3),
    "lastReplayStep" BIGINT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "UserMfa_pkey" PRIMARY KEY ("id")
);

-- CreateTable MfaRecoveryCode
CREATE TABLE public."MfaRecoveryCode" (
    "id" UUID NOT NULL,
    "mfaId" UUID NOT NULL,
    "codeHash" CHAR(64) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfaRecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable MfaChallenge
CREATE TABLE public."MfaChallenge" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfaChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserMfa_userId_key" ON public."UserMfa"("userId");

-- CreateIndex
CREATE INDEX "MfaRecoveryCode_mfaId_usedAt_idx" ON public."MfaRecoveryCode"("mfaId", "usedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MfaChallenge_tokenHash_key" ON public."MfaChallenge"("tokenHash");

-- CreateIndex
CREATE INDEX "MfaChallenge_tokenHash_expiresAt_idx" ON public."MfaChallenge"("tokenHash", "expiresAt");

-- CreateIndex
CREATE INDEX "MfaChallenge_userId_consumedAt_idx" ON public."MfaChallenge"("userId", "consumedAt");

-- AddForeignKey
ALTER TABLE public."UserMfa" ADD CONSTRAINT "UserMfa_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE public."MfaRecoveryCode" ADD CONSTRAINT "MfaRecoveryCode_mfaId_fkey" FOREIGN KEY ("mfaId") REFERENCES public."UserMfa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE public."MfaChallenge" ADD CONSTRAINT "MfaChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Grants for runtime roles
DO $$
DECLARE
  runtime_name text;
BEGIN
  FOR runtime_name IN
    SELECT DISTINCT grantee FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='Session' AND privilege_type='SELECT'
      AND grantee NOT IN (current_user, 'PUBLIC')
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public."UserMfa", public."MfaRecoveryCode", public."MfaChallenge" TO %I', runtime_name);
    EXECUTE format('GRANT UPDATE("mfaPolicy") ON public."Clinic" TO %I', runtime_name);
  END LOOP;
END;
$$;

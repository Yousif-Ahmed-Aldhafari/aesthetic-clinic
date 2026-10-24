-- Initial clinic identity foundation. No clinical/demo-browser data is imported.
BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ClinicStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DomainVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('PLATFORM_ADMIN');

-- CreateEnum
CREATE TYPE "ClinicRole" AS ENUM ('CLINIC_OWNER', 'CLINIC_ADMIN', 'DOCTOR', 'RECEPTIONIST', 'ACCOUNTANT');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "Clinic" (
    "id" UUID NOT NULL,
    "legalName" VARCHAR(200) NOT NULL,
    "displayName" VARCHAR(150) NOT NULL,
    "slug" VARCHAR(63) NOT NULL,
    "status" "ClinicStatus" NOT NULL DEFAULT 'ACTIVE',
    "timezone" VARCHAR(100) NOT NULL DEFAULT 'UTC',
    "currency" CHAR(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Clinic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicBranding" (
    "clinicId" UUID NOT NULL,
    "logoUrl" VARCHAR(2048),
    "primaryColor" VARCHAR(7) NOT NULL DEFAULT '#7854D9',
    "secondaryColor" VARCHAR(7) NOT NULL DEFAULT '#F6F8FC',
    "accentColor" VARCHAR(7),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ClinicBranding_pkey" PRIMARY KEY ("clinicId")
);

-- CreateTable
CREATE TABLE "ClinicDomain" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "hostname" VARCHAR(253) NOT NULL,
    "verificationStatus" "DomainVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ClinicDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "passwordHash" VARCHAR(255),
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "platformRole" "PlatformRole",
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicMembership" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "ClinicRole" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'INVITED',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ClinicMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Clinic_slug_key" ON "Clinic"("slug");

-- CreateIndex
CREATE INDEX "Clinic_status_createdAt_idx" ON "Clinic"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicDomain_hostname_key" ON "ClinicDomain"("hostname");

-- CreateIndex
CREATE INDEX "ClinicDomain_clinicId_verificationStatus_idx" ON "ClinicDomain"("clinicId", "verificationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicDomain_clinicId_id_key" ON "ClinicDomain"("clinicId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "ClinicMembership_userId_status_idx" ON "ClinicMembership"("userId", "status");

-- CreateIndex
CREATE INDEX "ClinicMembership_clinicId_status_role_idx" ON "ClinicMembership"("clinicId", "status", "role");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicMembership_clinicId_userId_key" ON "ClinicMembership"("clinicId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicMembership_clinicId_id_key" ON "ClinicMembership"("clinicId", "id");

-- AddForeignKey
ALTER TABLE "ClinicBranding" ADD CONSTRAINT "ClinicBranding_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClinicDomain" ADD CONSTRAINT "ClinicDomain_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClinicMembership" ADD CONSTRAINT "ClinicMembership_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClinicMembership" ADD CONSTRAINT "ClinicMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Reviewed PostgreSQL invariants beyond Prisma's schema representation.
ALTER TABLE "Clinic"
  ADD CONSTRAINT "Clinic_names_nonempty" CHECK (length(btrim("legalName")) > 0 AND length(btrim("displayName")) > 0),
  ADD CONSTRAINT "Clinic_slug_normalized" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ADD CONSTRAINT "Clinic_currency_code" CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "ClinicBranding"
  ADD CONSTRAINT "ClinicBranding_colors_hex" CHECK (
    "primaryColor" ~ '^#[0-9A-Fa-f]{6}$' AND "secondaryColor" ~ '^#[0-9A-Fa-f]{6}$'
    AND ("accentColor" IS NULL OR "accentColor" ~ '^#[0-9A-Fa-f]{6}$')),
  ADD CONSTRAINT "ClinicBranding_logo_https" CHECK ("logoUrl" IS NULL OR "logoUrl" ~ '^https://[^[:space:]]+$');

ALTER TABLE "ClinicDomain"
  ADD CONSTRAINT "ClinicDomain_hostname_normalized" CHECK (
    "hostname" ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'),
  ADD CONSTRAINT "ClinicDomain_primary_verified" CHECK (NOT "isPrimary" OR "verificationStatus" = 'VERIFIED');

CREATE UNIQUE INDEX "ClinicDomain_one_primary_per_clinic"
  ON "ClinicDomain" ("clinicId") WHERE "isPrimary";

-- Auth must normalize email before writing; equivalent casing cannot create another user.
ALTER TABLE "User"
  ADD CONSTRAINT "User_name_nonempty" CHECK (length(btrim("name")) > 0),
  ADD CONSTRAINT "User_email_normalized" CHECK (
    "email" = lower(btrim("email")) AND "email" ~ '^[^[:space:]@]+@[^[:space:]@]+$');

COMMIT;

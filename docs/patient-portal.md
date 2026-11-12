# Lamssa — Patient Portal & Secure Self-Service Booking

## 1. Architectural Overview

The **Lamssa Patient Portal** delivers a secure, Arabic-first, RTL self-service web experience for aesthetic clinic patients. It operates alongside the core clinical SaaS while enforcing strict security boundaries between patient and employee principals.

### Key Architectural Principles

1. **Strict Principal Separation**: Patient accounts (`PatientAccount` / `PatientSession`) are completely decoupled from employee accounts (`User` / `Session`). Staff cookies never authenticate patient endpoints, and patient sessions cannot authenticate any staff, clinical, or financial API.
2. **Clinic-Scoped Multi-Tenancy**: Patient identity is strictly clinic-scoped `(clinicId, patientId)`. A patient receiving care at Clinic A and Clinic B maintains isolated credentials and records with zero cross-clinic leakage or record mixing.
3. **Defense-in-Depth RLS & Server Ownership**: In addition to server-side ownership enforcement, PostgreSQL `FORCE ROW LEVEL SECURITY` policies ensure a patient can only SELECT their own record and appointments within their authorized clinic.
4. **Unified Scheduling Engine**: Patient booking directly leverages Lamssa's existing scheduling architecture, timezone/DST calculations, doctor/room availability checks, and exclusion constraints (`23P01`), preventing any double-booking.
5. **No Exposure of Sensitive Internal Data**: Portal endpoints project only patient-approved fields. Doctors' internal clinical notes, staff remarks, consent evidence files, invoices, and payment histories are never exposed in the patient portal.
6. **No Phantom Financial/Clinical Writes**: Self-service booking creates `SCHEDULED` appointments only. It never creates completed visits, billing invoices, payments, or procedure executions.

---

## 2. Patient Identity & Authentication Design

### 2.1 Database Models

- **`PatientAccount`**:
  - `id` (UUID PRIMARY KEY)
  - `clinicId` (UUID, immutable)
  - `patientId` (UUID, immutable composite foreign key to `Patient(clinicId, id)`)
  - `phone` (VARCHAR(20), normalized, unique per clinic)
  - `email` (VARCHAR(254), nullable, lowercase unique per clinic)
  - `passwordHash` (VARCHAR(255), Argon2id)
  - `status` (`PENDING_ACTIVATION`, `ACTIVE`, `SUSPENDED`)
  - `phoneVerifiedAt`, `emailVerifiedAt` (TIMESTAMPTZ)
  - `failedLoginAttempts` (INTEGER, resets upon successful login)
  - `lockedUntil` (TIMESTAMPTZ, lockout expiration)
  - `lastLoginAt` (TIMESTAMPTZ)
  - `version` (INTEGER, monotonic increment)

- **`PatientSession`**:
  - `id` (UUID PRIMARY KEY)
  - `clinicId` (UUID)
  - `patientAccountId` (UUID, foreign key to `PatientAccount(clinicId, id)`)
  - `sessionTokenHash` (VARCHAR(64), SHA-256 of raw session secret)
  - `csrfTokenHash` (VARCHAR(64), SHA-256 of CSRF token)
  - `ipAddress`, `userAgent`
  - `expiresAt` (TIMESTAMPTZ, 24-hour lifetime)
  - `revokedAt` (TIMESTAMPTZ, set upon logout or password reset)
  - `lastSeenAt` (TIMESTAMPTZ)

- **`PatientVerificationToken`**:
  - `id` (UUID PRIMARY KEY)
  - `clinicId`, `patientAccountId`
  - `tokenType` (`ACTIVATION`, `PASSWORD_RESET`, `CONTACT_CHANGE`)
  - `tokenHash` (VARCHAR(64), SHA-256 of raw token)
  - `expiresAt` (72 hours for activation, 15 minutes for password reset)
  - `usedAt` (TIMESTAMPTZ)

- **`PatientPortalAuditEvent`**:
  - `id`, `clinicId`, `patientAccountId`, `patientId`
  - `action` (`portal.account_activated`, `portal.login_success`, `portal.login_failed`, `portal.appointment_booked`, `portal.appointment_rescheduled`, `portal.appointment_cancelled`, `portal.password_reset`, `portal.logout`)
  - `metadata` (JSONB, sanitized without credentials or medical details)
  - `ipAddress`, `userAgent`, `createdAt`

### 2.2 Security Controls

- **Password Hashing**: Argon2id with 64MB memory cost (`m=65536`), time cost 3 (`t=3`), and parallelism 1 (`p=1`).
- **Account Enumeration Defense**:
  - Login attempts against non-existent accounts run a constant-time dummy Argon2id hash comparison before returning a generic `401 Unauthorized`.
  - Password reset requests always return `{ success: true }` regardless of whether the phone or birth date exists in the database.
- **Brute-Force Rate Limiting & Lockout**:
  - IP-based rate limiting (50 attempts per 15-minute window).
  - Account-based rate limiting (5 attempts per 15-minute window).
  - Account automatically locked for 15 minutes (`lockedUntil = now + 15m`) after 5 consecutive failed login attempts.
- **CSRF Protection**:
  - State-mutating requests (`POST`, `PATCH`, `DELETE`) require an `X-CSRF-Token` header.
  - The CSRF token is cryptographically derived via HMAC-SHA256 from the session secret and server secret: `mac(AUTH_CSRF_SECRET, 'patient-session-csrf:' + rawSession)`.
  - Origin header validation strictly enforces configured origins (`CORS_ORIGINS`).
- **Browser Storage Invariants**:
  - Raw session tokens are stored exclusively in HttpOnly, SameSite=Lax, Secure cookies (`lamssa_patient_session` in dev, `__Host-lamssa_patient_session` in production).
  - No medical records, patient PII, or authentication secrets are ever stored in `localStorage` or `sessionStorage`.

---

## 3. Row-Level Security & Tenant Isolation

### 3.1 Security Functions

- **`lamssa_security.patient_clinic_allows(target_clinic uuid)`**:
  Verifies that `target_clinic = current_setting('lamssa.clinic_id')` and an active, unrevoked `PatientSession` exists for the current patient session ID and account ID where clinic, patient, and account are active.
- **`lamssa_security.patient_account_allows(target_clinic uuid, target_account uuid)`**:
  Ensures the patient can access only their own `PatientAccount` and `PatientSession` records.
- **`lamssa_security.patient_context_allows(target_clinic uuid, target_patient uuid)`**:
  Ensures that queries on `Patient` and `Appointment` return rows strictly matching `patientId = current_setting('lamssa.patient_id')`.

### 3.2 Database Policies

| Table | Patient Permitted Operations | RLS Condition |
| :--- | :--- | :--- |
| `PatientAccount` | `SELECT`, `UPDATE` | `patient_account_allows(clinicId, id)` |
| `PatientSession` | `SELECT`, `INSERT`, `UPDATE` | `patient_account_allows(clinicId, patientAccountId)` |
| `PatientVerificationToken` | `SELECT`, `INSERT`, `UPDATE` | `patient_clinic_allows(clinicId)` |
| `PatientPortalAuditEvent` | `INSERT` | `patient_clinic_allows(clinicId)` |
| `Patient` | `SELECT` only | `patient_context_allows(clinicId, id)` |
| `Appointment` | `SELECT`, `INSERT`, `UPDATE` | `patient_context_allows(clinicId, patientId)` |
| `Clinic` & `ClinicBranding` | `SELECT` | `patient_clinic_allows(clinicId)` |
| `ClinicService` | `SELECT` | `patient_clinic_allows(clinicId)` |
| `BookableResource` | `SELECT` | `patient_clinic_allows(clinicId)` |
| `ResourceAvailability` | `SELECT` | `patient_clinic_allows(clinicId)` |
| `ResourceTimeOff` | `SELECT` | `patient_clinic_allows(clinicId)` |
| `SchedulingState` | `SELECT`, `UPDATE` | `patient_clinic_allows(clinicId)` |

---

## 4. Self-Service Booking & Scheduling Integration

1. **Public Availability Engine**:
   - Computes candidate 15-minute time slots for a given date in the clinic's local timezone.
   - Evaluates clinician weekly availability, room availability (if service `requiresRoom`), active time-offs (`ResourceTimeOff`), and existing non-cancelled appointments.
   - Handles DST boundaries and ambiguous/gap clock times safely using `@js-temporal/polyfill`.
2. **Concurrency & Exclusion Constraints**:
   - Self-service booking acquires a shared advisory transaction lock and performs an atomic upsert on `SchedulingState`.
   - PostgreSQL `GiST` exclusion constraint (`23P01`) enforces no doctor or room resource collisions at the database engine level.
3. **Idempotency**:
   - Each booking request includes a client-generated UUID `bookingKey`.
   - Simultaneous or repeated requests with identical payloads return the existing appointment with status 201.
   - Conflicting payloads with an existing key fail safely with `409 Conflict`.
4. **Rescheduling & Cancellation Policies**:
   - Patients can reschedule up to 2 hours before the scheduled appointment start time.
   - Past appointments cannot be cancelled or rescheduled.
   - Rescheduling atomically updates doctor/room slots under monotonic version checking (`expectedVersion`).
   - Cancellations record the reason `PATIENT_REQUEST`.

---

## 5. API Reference

### 5.1 Public / Authentication Endpoints

- `GET /api/v1/portal/clinics/:slug`: Public clinic branding, logo, colors, display name, and contact details.
- `POST /api/v1/portal/auth/activate`: Activate account using token, verified phone, birthdate, and initial password. Sets session cookie.
- `POST /api/v1/portal/auth/login`: Authenticate with phone and password. Sets session cookie.
- `POST /api/v1/portal/auth/logout`: Revokes active session and clears session cookie.
- `POST /api/v1/portal/auth/forgot-password`: Requests password reset token (timing-safe).
- `POST /api/v1/portal/auth/reset-password`: Resets password using verification token; revokes all existing sessions.

### 5.2 Authenticated Patient Endpoints (`PatientAuthGuard`)

- `GET /api/v1/portal/me`: Current patient profile (fullName, patientNumber, verified phone, email, DOB, gender) and clinic branding.
- `GET /api/v1/portal/services`: Active bookable services for the clinic.
- `GET /api/v1/portal/doctors`: Active bookable clinicians.
- `GET /api/v1/portal/availability?date=YYYY-MM-DD&serviceId=UUID&doctorResourceId=UUID`: Available slots.
- `GET /api/v1/portal/appointments`: Patient's appointments (upcoming and past).
- `POST /api/v1/portal/appointments`: Book self-service appointment.
- `POST /api/v1/portal/appointments/:id/reschedule`: Reschedule appointment within policy window.
- `POST /api/v1/portal/appointments/:id/cancel`: Cancel appointment.

### 5.3 Staff Endpoint

- `POST /api/v1/clinics/:clinicId/patients/:patientId/portal-invitation`: Requires `patients.update` permission. Generates activation token and sets account to `PENDING_ACTIVATION`.

---

## 6. Frontend Architecture

- **Path**: Mounts at `/portal` or `/portal/:slug` (e.g. `/portal/derma-glow`).
- **Styling**: `portal.css` incorporates clinic branding colors (`--brand-primary`, `--brand-secondary`, `--brand-accent`).
- **Components**:
  - `PatientPortalApp.tsx`: Wizard booking flow, appointment status tracking, profile pane, login, activation, and recovery dialogs.
  - Full Arabic RTL accessibility (`dir="rtl"`, aria-live alerts, dialog focus management).

---

## 7. Security Acceptance (Step 5.6)

As verified during the Phase 5 final security acceptance audit:
- Patient identity is strictly isolated via PostgreSQL `FORCE ROW LEVEL SECURITY` and `lamssa_security.patient_row_allows`.
- Activation tokens are cryptographically generated, stored as SHA-256 hashes, and invalidated immediately upon first use.
- Rate limiting and lockout thresholds protect against credential stuffing.
- Direct booking enforces doctor and room conflict checks (`23P01`) and idempotency deduplication.
- Full details in [docs/phase-5-final-acceptance.md](phase-5-final-acceptance.md).

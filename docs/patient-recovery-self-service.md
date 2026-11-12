# Patient Consent Review, Recovery Check-Ins & Follow-up Self-Service (Phase 5, Step 5.2)

## Overview

Lamssa Phase 5, Step 5.2 expands the Patient Portal with self-service capabilities for:
1. **Informed Consent Review & Digital Signing**: Patients can review pending consents in Arabic, self-sign using digital canvas or typed confirmation, view cryptographic evidence digests, and withdraw or refuse consents.
2. **Post-Procedure Recovery Check-Ins**: Patients can report their visual analog scale (VAS) pain score (0–10), log structured recovery symptoms, receive immediate automated emergency guidance when red-flag symptoms or high pain are detected, and review clinician guidance.
3. **Clinician Recovery Review Queue**: Treating doctors and clinical staff can monitor escalated recovery check-ins, assess symptoms, record clinical guidance, and update check-in status.
4. **Patient-Reported Outcomes (PROMs)**: Patients can submit validated outcome scores across standard aesthetic measurement scales (`GLOBAL_AESTHETIC_IMPROVEMENT_SCALE`, `PATIENT_SATISFACTION_5_POINT`, `NUMERIC_RATING_SCALE_11_POINT`), tagged with `PATIENT_PORTAL` provenance.
5. **Intra-Clinic & Tenant Row-Level Security**: PostgreSQL RLS is enforced at the database layer via `lamssa_security.patient_row_allows(target_clinic, target_patient)` to ensure clinic membership alone never grants cross-patient record visibility.

---

## 1. Patient Consent Self-Service

### Architecture & Security Invariants

- **Arabic Content Review**: Patients review published consent templates in authentic Arabic (`titleAr`, `bodyAr`, `risksTextAr`, `alternativesTextAr`), procedure catalog metadata, and notes.
- **Signer Capacity Enforcement**: Portal signing strictly enforces `signerCapacity === 'PATIENT'`. Any attempt to sign with `LEGAL_REPRESENTATIVE` or `GUARDIAN` capacity via the portal is rejected with `400 Bad Request` (`REPRESENTATIVE_SIGNING_REQUIRES_IN_PERSON_VERIFICATION`) because legal representation requires in-person document verification by clinic staff.
- **Cryptographic Evidence Digest**:
  ```text
  evidenceHashSha256 = SHA256(
    clinicId | patientId | templateVersionId | contentDigestSha256 |
    signerCapacity | signerName | signatureType | signatureData | signedAtIso
  )
  ```
- **PENDING_VERIFICATION Status Transition**: Signing via the portal transitions the consent from `DRAFT` to `PENDING_VERIFICATION` (not `ACTIVE`).
- **Fail-Closed Clinical Eligibility**: `ConsentEligibilityService` requires consents to be in `ACTIVE` status. Consents in `PENDING_VERIFICATION` remain ineligible for procedure execution until verified by an authorized clinician (`clinical.consents.verify`).
- **Refusal & Withdrawal Workflows**:
  - Patients can refuse a pending consent with a documented reason (`REFUSED` status).
  - Patients can withdraw an active or pending consent with an explicit reason (`WITHDRAWN` status), generating an immutable withdrawal audit trail.
- **Printable Confirmation**: The portal provides a printable view detailing consent metadata, template version hash, signature evidence digest, timestamp, and verification status.

---

## 2. Post-Procedure Recovery Check-Ins

### Pain Scoring & Symptom Tracking

- **VAS Pain Score**: Integer between `0` (no pain) and `10` (worst imaginable pain). Values outside this range are rejected by `CreateRecoveryCheckInDto`.
- **Structured Symptoms**: JSON object capturing post-procedure observations:
  - Red-flag symptoms: `continuous_bleeding`, `fever`, `severe_swelling`, `vision_changes`, `skin_necrosis_signs`.
  - Normal symptoms: `mild_swelling`, `mild_bruising`, `redness`, `dryness`.
- **Automatic Clinical Escalation**:
  - When `painScore >= 8` OR any red-flag symptom is selected:
    - `isEscalated` is set to `true`.
    - `status` transitions immediately to `ESCALATED`.
    - `escalationReason` documents the triggering condition (`VAS_PAIN_SCORE_CRITICAL`, `PATIENT_REPORTED_RED_FLAG_SYMPTOMS`, or combination).
    - `emergencyNotice` banner is returned in the API response and displayed prominently in red on the portal UI:
      > تنبيه: تم تسجيل مؤشرات تتطلب عناية طبية عاجلة. إذا كنت تعاني من أعراض خطيرة، يرجى التوجه فوراً لأقرب قسم طوارئ أو الاتصال بالإسعاف.
  - When no red flags are present, check-ins are recorded with `status: 'PENDING_REVIEW'` and `isEscalated: false`.

### Clinician Review Queue

- Endpoints under `/api/v1/clinics/:clinicId/clinical/recovery-check-ins`:
  - `GET /` (`clinical.follow-ups.read`): Lists recovery check-ins with filters (`status`, `patientId`), sorted with escalated items prioritized.
  - `GET /:checkInId` (`clinical.follow-ups.read`): Returns single check-in details with patient information and linked follow-up.
  - `POST /:checkInId/review` (`clinical.follow-ups.update`): Clinician submits `ReviewCheckInDto` (`expectedVersion`, `status: 'REVIEWED'`, `clinicianNotes`). Transitions check-in to `REVIEWED`, recording `reviewedAt` and `reviewedByMembershipId`.
- Patients can view clinician guidance notes directly on their portal recovery history timeline once reviewed.

---

## 3. Patient-Reported Outcomes (PROMs)

- Portal endpoint: `POST /api/v1/portal/outcomes`.
- Scale boundaries:
  - `GLOBAL_AESTHETIC_IMPROVEMENT_SCALE`: Integer `1` to `5`.
  - `PATIENT_SATISFACTION_5_POINT`: Integer `1` to `5`.
  - `NUMERIC_RATING_SCALE_11_POINT`: Number `0` to `10`.
- Stored in `PatientReportedOutcome` table with composite tenant key `(clinicId, patientId, id)` and recorded in `PatientPortalAuditEvent` with action `portal.outcome_submitted`.

---

## 4. Security & Tenant Isolation Architecture

### Database Row-Level Security (RLS)

All patient-facing tables enforce `FORCE ROW LEVEL SECURITY`.

The security definer function `lamssa_security.patient_row_allows(target_clinic uuid, target_patient uuid)` guarantees intra-clinic isolation:

```sql
CREATE OR REPLACE FUNCTION lamssa_security.patient_row_allows(target_clinic uuid, target_patient uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT COALESCE(
    lamssa_security.context_allows(target_clinic) AND (
      lamssa_security.context_uuid('lamssa.session_id') IS NOT NULL
      OR
      (
        lamssa_security.context_uuid('lamssa.patient_session_id') IS NOT NULL
        AND target_patient = lamssa_security.context_uuid('lamssa.patient_id')
      )
    ), false);
$$;
```

### Invariants:
1. **Staff Sessions**: When `lamssa.session_id` is present, staff members can access patient records within their active clinic subject to RBAC permissions.
2. **Patient Sessions**: When `lamssa.patient_session_id` is present, queries can only access rows where `patientId = lamssa.patient_id`. Cross-patient access within the same clinic is denied at the database engine level even if application filters were omitted.
3. **Foreign Keys**: All tables use composite foreign keys `("clinicId", "patientId")` referencing `public."Patient"("clinicId", "id")`.
4. **Append-Only Triggers**: Database immutability triggers prevent deletion or tampering of `PatientConsent`, `ConsentSignatureEvidence`, and `ConsentWithdrawal` records.

---

## 5. Automated Verification & Quality Gates

The implementation is verified by:
- **Unit Tests**: 133 API tests + 26 Web tests = 159 unit tests passed cleanly (`npm test`).
- **Database Integration Tests**: 274 passed, 1 intentional restore skip (`npm run test:db`).
- **Browser Smoke Suite**: 39 browser checks passed with 0 runtime errors (`npm run test:browser`).
- **Architectural Boundary Enforcement**: `scripts/check-database-boundaries.mjs` and `scripts/check-deployment.mjs` passed.

---

## 6. Clinical Safety & Acceptance Review (Step 5.6)

During the Phase 5 final acceptance audit:
- Intra-clinic patient isolation was re-verified with positive and negative SQL tests under `lamssa_security.patient_row_allows`.
- Severe pain escalation thresholds (VAS $\ge 8$) and red-flag symptoms are documented as **unapproved clinical rules** pending formal medical director approval prior to live production use.
- Patient-facing guidance prominently states that recovery check-ins are not an emergency monitoring service.
- See [docs/phase-5-final-acceptance.md](phase-5-final-acceptance.md).

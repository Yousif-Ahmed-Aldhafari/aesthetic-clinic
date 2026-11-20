# Clinical Governance, Patient Safety & Clinical Risk Management — Phase 7, Step 7.4

This document defines Lamssa's clinical governance hierarchy, patient safety protocols, adverse event management, emergency break-glass procedures, and anti-tamper security controls implemented in Phase 7, Step 7.4.

---

## 1. Clinical Governance & Organizational Hierarchy

In healthcare software, administrative clinic ownership must be strictly decoupled from clinical decision-making authority. In Lamssa:

1. **Administrative Roles (`CLINIC_OWNER`, `CLINIC_ADMIN`)**:
   - Authorized for clinic resource configuration, financial billing, branch management, and business operations.
   - **Explicitly denied** all confidential clinical operations, patient medical notes, treatment plans, clinical encounters, clinical safety policy approval, and break-glass authorizations.

2. **Practitioners (`DOCTOR`)**:
   - Authorized for clinical encounters, clinical forms, diagnoses, prescriptions, diagnostic orders, and clinical incident reporting.
   - Can request emergency break-glass access under life-threatening patient care situations.

3. **Medical Directors / Governance Authorities**:
   - Senior clinical practitioners possessing elevated governance permissions:
     - `clinical.safety-policies.approve`
     - `clinical.incidents.investigate`
     - `clinical.break-glass.audit`
     - `clinical.governance.manage`
   - Subject to database-enforced separation of duties: cannot approve their own authored policies, cannot self-audit their own break-glass sessions, and cannot conduct privilege reviews on themselves.

---

## 2. Clinical Safety Policies & Protocol Lifecycle

Clinical safety policies (`ClinicalSafetyPolicy` and `ClinicalSafetyPolicyVersion`) govern clinical decision support rules, contraindication warnings, dosage limits, and emergency protocols across medical specialties.

### Policy Lifecycle States
- `DRAFT`: Newly proposed safety policy version being authored.
- `APPROVED`: Formally reviewed and signed off by an authorized Medical Director.
- `ACTIVATED`: Live operational policy actively enforced across clinical workflows.
- `SUPERSEDED`: Replaced by a subsequent active version.
- `RETIRED`: Explicitly deactivated policy.

### Deterministic Rules Hashing & Immutability
- Every version contains structured rules (`rulesJson`).
- A deterministic SHA-256 digest (`rulesHashSha256`) is computed over canonical, key-sorted JSON to guarantee content integrity and non-repudiation.
- **Database Trigger Guard (`clinical_safety_policy_version_guard`)**:
  - Prohibits modification or deletion of any version once it is `APPROVED` or `ACTIVATED`.
  - Enforces **anti-self-approval**: `approvedByMembershipId` MUST NOT equal `authorMembershipId`.

### Version Rollback
- If a live policy introduces unintended clinical friction or requires rapid retraction, Medical Directors can trigger a deterministic rollback via `POST /api/v1/clinics/:clinicId/clinical-governance/policies/:id/rollback`.
- Rollback operates non-destructively: it creates a new active version duplicating the historical target version's verified rules while recording a full audit trail.

---

## 3. Clinical Incident & Near-Miss Reporting (`INC-CLIN-XXXXXX`)

Patient safety depends on transparent, non-punitive, and structured incident reporting.

### Incident Numbering & Monotonic Sequencing
- Every incident is assigned a sequential, human-readable identifier (`INC-CLIN-000001`) via transactional row-level locking on `ClinicalIncidentCounter`.

### Severity Tiers
1. `NEAR_MISS`: Potential incident caught before reaching the patient; zero harm.
2. `NO_HARM`: Event reached the patient but caused no perceptible injury or physiological change.
3. `MINOR_HARM`: Temporary injury requiring minor intervention or additional monitoring.
4. `MODERATE_HARM`: Significant impairment or injury requiring medical intervention and extended recovery.
5. `SEVERE_HARM`: Permanent injury, organ loss, or life-threatening impairment.
6. `SENTINEL_EVENT`: Unexpected occurrence resulting in death, permanent disability, or severe physiological trauma (triggers urgent 24-hour escalation).

### Categories
- `MEDICATION_SAFETY`: Dosing, formulation, administration, or Look-Alike Sound-Alike (LASA) errors.
- `ALLERGY_SAFETY`: Exposure to documented contraindications or allergens.
- `PROCEDURAL_SAFETY`: Technique, device, or aseptic protocol deviations.
- `DOCUMENTATION_SAFETY`: Misidentification, transcription, or chart indexing errors.
- `EQUIPMENT_SAFETY`: Hardware, diagnostic tool, or sterilization failures.
- `COMMUNICATION_SAFETY`: Handover, referral, or discharge instruction breakdowns.

### Investigation & Root Cause Analysis (RCA) Runbook
1. **Reporting (`clinical.incidents.report`)**: Any clinical staff member reports the event immediately with `occurredAt`, detailed narrative, and optional patient/encounter references.
2. **Immediate Triage**: Medical Director reviews severity within 4 hours for `SENTINEL_EVENT` / `SEVERE_HARM` or 24 hours for other tiers.
3. **Formal Investigation (`clinical.incidents.investigate`)**:
   - Structured findings documented in `investigationFindings`.
   - 5-Whys or Fishbone root cause analysis recorded in `rootCauseAnalysis`.
   - SMART corrective and preventative actions (CAPA) recorded in `correctiveActions`.
4. **Resolution**: Incident transitions to `RESOLVED` with traceable reviewer attribution and tamper-evident audit logging.

---

## 4. Emergency Break-Glass Access Controls

In emergency situations (e.g., patient unconscious, acute anaphylaxis, trauma resuscitation), clinicians may need immediate access to medical history, allergies, and previous surgical notes outside normal assignment bounds.

### Invariants & Boundaries
1. **Strictly Time-Bounded**: Access is granted for a specific duration bounded between 1 and 120 minutes (`durationMinutes <= 120`). Access automatically expires after this window.
2. **Mandatory Clinical Justification**: Requires an explicit justification of at least 20 characters (`clinicalJustification.length >= 20`) stating the nature of the emergency.
3. **Patient-Scoped**: Granted exclusively for a specific target patient (`patientId`). Blanket clinic-wide or multi-patient overrides are architecturally prohibited.
4. **Verified Practitioner Requirement**: Only practitioners with verified medical qualification status (`verificationStatus === 'VERIFIED'`) are authorized to initiate break-glass sessions.
5. **Mandatory Post-Hoc Audit Review**:
   - Every break-glass activation appears in the Medical Director audit queue.
   - Outcome recorded as `APPROVED_JUSTIFIED` or `FLAGGED_UNJUSTIFIED`.
   - **Database Trigger Guard (`break_glass_guard`)**:
     - Enforces **anti-self-audit**: `reviewedByMembershipId` MUST NOT equal `requestedByMembershipId`.

### Endpoint-Level Clinical Read Enforcement
In Step 7.6, clinical encounter read authorization in `ClinicalRepository` was upgraded to evaluate active emergency break-glass sessions:
- **`ClinicalRepository.get()`**:
  - If the requested encounter is owned by the calling clinician, access is granted normally.
  - If owned by another clinician, `ClinicalGovernanceRepository.isEmergencyAccessActive()` is evaluated for `(clinicId, membershipId, target.patientId)`.
  - If an active, non-expired, non-revoked break-glass session exists for that patient, access is granted and audited under action `clinical.break-glass.encounter.read` with patient, status, and original author metadata.
  - If no active break-glass session exists, it fails closed returning `404 Not Found`.
- **`ClinicalRepository.list()`**:
  - Dynamically scopes the query to all encounters for the patient across clinicians if an active break-glass session is present; otherwise scopes strictly to `clinicianMembershipId: c.membershipId`.
  - Emits `clinical.break-glass.encounters.listed` audit event when emergency encounters are retrieved.
- **Immediate Fail-Closed on Revocation or Expiry**:
  - Early revocation via `POST /api/v1/clinics/:clinicId/clinical-governance/break-glass/:id/revoke` sets `revokedAt = now()`.
  - Both `get()` and `list()` immediately revert to denying access, verified via automated integration tests (`step-7-4-security-audit.integration.test.ts`).

---

## 5. Practitioner Privilege Reviews & Credentialing Governance

Medical privileges define the specific procedures and clinical activities a practitioner is authorized to perform.

### Review Types
- `INITIAL_CREDENTIALING`: Onboarding credential and qualification validation.
- `ANNUAL_REAPPOINTMENT`: Periodic competence and outcome review.
- `FOR_CAUSE_REVIEW`: Targeted review following an incident or clinical complaint.
- `EMERGENCY_SUSPENSION`: Immediate precautionary withdrawal of specific clinical privileges.

### Governance Guardrails
- **Database Trigger Guard (`privilege_review_guard`)**:
  - Enforces **anti-self-review**: `conductedByMembershipId` MUST NOT equal the practitioner's underlying `membershipId`. A clinician cannot evaluate, grant, or suspend their own privileges.
- Expiration and recredentialing alerts surfaced proactively in the Arabic-first clinical governance workspace.

---

## 6. Audit Trail & Security Policy Reference

All clinical governance events are centralized in `AuditEvent` with tamper-evident SHA-256 chaining:
- Category: `CLINICAL` (policies, incidents, reviews) and `SECURITY` (break-glass requests and reviews).
- High-risk governance mutations emit structured JSON logs with IP masking and zero exposure of confidential clinical text.
- FORCE Row Level Security is active on all 6 governance tables with strict clinic tenant isolation (`lamssa_security.context_allows("clinicId")`).

---

## 7. Phase 8 Multi-Specialty Clinical Decision Support Governance

In Phase 8, the clinical governance framework was extended to oversee all specialty-specific algorithmic rules and clinical decision support systems:
1. **Clinical Decision Support Validation:** Detailed in [docs/phase-8-clinical-safety-validation-matrix.md](phase-8-clinical-safety-validation-matrix.md).
2. **Mandatory Production Credentialing Gate:** Live clinical use of automated decision support rules (ACOG 700 obstetric dating, WHO 2006 pediatric growth, pediatric drug contraindications, IOP/CDR ophthalmic alerting, ISO 8253-1 audiometry, and AAOS goniometry) is gated on written ratification by the clinic's Medical Director.
3. **Independent Release Acceptance:** Verified in [docs/phase-8-final-acceptance.md](phase-8-final-acceptance.md).

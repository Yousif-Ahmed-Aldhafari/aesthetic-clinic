# Healthcare Interoperability & Integration Readiness — Phase 7, Step 7.4

This document defines Lamssa's healthcare interoperability architecture, HL7® FHIR® R4 mapping specifications, external provider adapter boundaries, standard medical terminology licensing requirements, and jurisdictional compliance matrices for the Kingdom of Saudi Arabia (KSA) and the United Arab Emirates (UAE).

---

## 1. Architectural Principles & Isolation Boundaries

Healthcare integration involves transmitting highly sensitive Protected Health Information (PHI) across institutional and network boundaries. Lamssa enforces strict fail-closed boundaries:

1. **Disabled by Default**:
   - All external provider adapters are initialized with `enabled: false`. No external network calls are made unless an adapter is explicitly activated via configuration and passes runtime preflight checks.
2. **Sandbox-Only Enforcement**:
   - In non-production environments, all adapters run in simulated sandbox mode. External outbound network requests to live healthcare networks are strictly prevented.
3. **Endpoint Allowlisting**:
   - External service endpoints must strictly conform to an approved regex allowlist (`^https:\/\/[a-zA-Z0-9.-]+\.(gov\.sa|seha\.sa|nphies\.sa|wasfaty\.sa|gov\.ae|malaffi\.ae|nabidh\.ae)(:[0-9]+)?(\/.*)?$`).
   - Plaintext HTTP (`http://`) and unapproved domains are rejected with `Error: Insecure or unapproved external endpoint`.
4. **Zero-PII in Logs**:
   - Adapter logging is sanitized. Clinical text, patient national IDs, phone numbers, and raw payloads are never emitted to application logs.

---

## 2. HL7® FHIR® Release 4 (v4.0.1) Resource Mappings

Lamssa implements explicit, typed mappers for 12 core HL7 FHIR R4 clinical concepts:

| FHIR R4 Resource | Lamssa Internal Domain Model | Mapping Semantic Notes & Limitations |
| :--- | :--- | :--- |
| `Patient` | `Patient` + `PatientAccount` | Identity-isolated; national ID masked in ordinary representations. |
| `Practitioner` | `PractitionerProfile` | Professional license, medical council registration, qualification details. |
| `PractitionerRole` | `Membership` + `PractitionerPrivilege` | Links practitioner to clinic tenant, specialty code, and approved privileges. |
| `Encounter` | `ClinicalEncounter` | Clinical status (`planned`, `in-progress`, `finished`), timestamps, service types. |
| `Observation` | `ClinicalObservation` | Vital signs, physical measurements, structured assessment scales. |
| `Condition` | `ClinicalDiagnosis` | Active/resolved status, ICD-10 coding, clinical notes. |
| `AllergyIntolerance` | `PatientAllergy` | Criticality, verification status, allergen code, reaction manifestations. |
| `MedicationRequest` | `ClinicalPrescription` | Status, dosage instructions, dispense requests, Wasfaty compatibility. |
| `ServiceRequest` | `DiagnosticOrder` | Diagnostic requisition for laboratory or imaging procedures. |
| `DiagnosticReport` | `DiagnosticResult` | Laboratory panel results, imaging findings, verification status. |
| `DocumentReference` | `SecureMedicalDocument` | Metadata pointer to encrypted document storage; never includes raw bytes inline. |
| `Consent` | `PatientConsent` | Scope, purpose (`PROCEDURE`, `RESEARCH`), signer capacity, evidence hash. |

### Semantic Loss & Translation Disclosures
- Certain specialty-specific parameters (such as aesthetic unit maps or facial grid coordinates) do not have 1:1 representations in standard FHIR resources and are mapped into `Observation.extension` or summarized in `DocumentReference` clinical notes.

---

## 3. Provider Adapter Specifications

### A. Laboratory Orders Adapter (`LabOrderAdapter`)
- Requisition dispatch via FHIR `ServiceRequest` bundles.
- Asynchronous result fetching (`DiagnosticReport`).
- Fail-safe fallback: when disabled or in sandbox mode, returns simulated lab panel results with reference ranges (`SANDBOX_MOCK_SUCCESS`).

### B. Imaging & PACS Adapter (`ImagingAdapter`)
- Integration with Picture Archiving and Communication Systems (PACS) and Radiology Information Systems (RIS).
- Generates DICOM Modality Worklist (MWL) entries.
- Resolves DICOM Study UIDs, series instances, and WADO-RS image locator endpoints without storing raw DICOM objects in the transactional database.

### C. Pharmacy & E-Prescribing Adapter (`PharmacyAdapter`)
- Formatted for national electronic prescription routing (e.g., Wasfaty in KSA).
- Encapsulates medication requests with dispense quantities, days supply, and practitioner license verification.

### D. National Health Information Exchange Adapter (`HealthExchangeAdapter`)
- Formatted for longitudinal clinical record sharing across national health exchanges:
  - **KSA**: Seha / Nphies platform.
  - **UAE**: Malaffi (Abu Dhabi Health Data Services), Nabidh (Dubai Health Authority), Riayati (Federal).
- Generates comprehensive FHIR Document Bundles containing encounters, conditions, allergies, and observations.

---

## 4. Standard Medical Terminology & Licensing Disclosures

Lamssa integrates validation for global standard medical terminologies:

1. **ICD-10 (International Classification of Diseases, 10th Revision)**:
   - Structure: `^[A-Z][0-9]{2}(\.[0-9]{1,4})?$` (e.g., `J45.909`, `E11.9`).
   - Open standard governed by the World Health Organization (WHO).
2. **LOINC® (Logical Observation Identifiers Names and Codes)**:
   - Structure: `^[0-9]{3,5}-[0-9]$` (e.g., `883-9` ABO group, `2345-7` Glucose).
   - Copyright © Regenstrief Institute, Inc. Free for commercial and non-commercial use under LOINC terms.
3. **WHO-ATC (Anatomical Therapeutic Chemical Classification)**:
   - Structure: `^[A-Z][0-9]{2}[A-Z]{2}[0-9]{2}$` (e.g., `N02BE01` Paracetamol).
   - Open classification maintained by the WHO Collaborating Centre for Drug Statistics Methodology.
4. **SNOMED CT® (Systematized Nomenclature of Medicine -- Clinical Terms)**:
   - **Crucial Licensing Disclosure**: SNOMED CT is owned and distributed by SNOMED International. Use of SNOMED CT codes in production clinical software requires an active Affiliate License from SNOMED International or the respective National Release Center (e.g., Saudi National Health Information Center / UAE Ministry of Health).
   - In Lamssa Phase 7, SNOMED CT syntax validation is provided for sandbox testing only. Production activation requires independent verification of the clinic's or national authority's SNOMED license.

---

## 5. Jurisdiction Compliance Matrix

### Kingdom of Saudi Arabia (KSA)
| Regulatory Domain | Authority / System | Status in Lamssa | Compliance Controls |
| :--- | :--- | :--- | :--- |
| Healthcare Licensing | Ministry of Health (MOH) | Ready | Practitioner profile validation, license tracking, privilege reviews. |
| Health Insurance Claims | Nphies | Ready | FHIR R4 claims mapping, ICD-10 diagnosis, procedure coding. |
| E-Prescribing | Wasfaty | Ready | Wasfaty adapter ready, dosage checking, active practitioner license requirement. |
| Tax & E-Invoicing | ZATCA Phase 2 | Integrated | Cryptographic invoice hashing, ECDSA signatures, XML UBL 2.1 compliance. |
| Personal Data Protection | Saudi PDPL | Enforced | Tenant data isolation, argon2id, audit chaining, KMS envelope encryption. |

### United Arab Emirates (UAE)
| Regulatory Domain | Authority / System | Status in Lamssa | Compliance Controls |
| :--- | :--- | :--- | :--- |
| Health Regulation | DoH (Abu Dhabi) / DHA (Dubai) / MoHAP | Ready | Credentialing reviews, specialty classification, license verification. |
| Health Data Exchange | Malaffi (Abu Dhabi) / Nabidh (Dubai) | Ready | FHIR R4 bundle generation, allergy and clinical observation export. |
| E-Prescribing | National e-Rx Gateways | Ready | E-prescription payloads, ATC coding, dispensing tracking. |
| Data Protection | Federal Decree Law No. 45 (2021) | Enforced | Cross-border data residency compliance, right to erasure, purpose limitation. |

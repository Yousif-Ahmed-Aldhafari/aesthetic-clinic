# Dentistry & Oral Health Module Architecture & Clinical Guide

## 1. Overview

The **Dentistry & Oral Health** module (`DENTISTRY`) is Lamssa's first advanced medical specialty module delivered under Phase 8. It extends Lamssa's modular monolith shared clinical foundation with domain-specific dental examination, periodontology, and multi-stage treatment planning workflows while strictly honoring patient safety, clinical privilege boundaries, and database immutability.

## 2. Anatomical Odontogram & Tooth Notation

### 2.1 Tooth Numbering Systems
Lamssa stores all dental records canonically using **FDI World Dental Federation ISO 3950** two-digit numbering:
- **Permanent Dentition (11–48):**
  - Quadrant 1 (Maxillary Right): 18 down to 11
  - Quadrant 2 (Maxillary Left): 21 up to 28
  - Quadrant 3 (Mandibular Left): 31 up to 38
  - Quadrant 4 (Mandibular Right): 48 down to 41
- **Primary / Deciduous Dentition (51–85):**
  - Quadrant 5 (Maxillary Right): 55 down to 51
  - Quadrant 6 (Maxillary Left): 61 up to 65
  - Quadrant 7 (Mandibular Left): 71 up to 75
  - Quadrant 8 (Mandibular Right): 85 down to 81
- **Supernumerary Extensions:**
  - Supported via `isSupernumerary: true` and standardized alphanumeric identifiers (e.g. `51S`, `91`).
- **Bidirectional System Conversion:**
  - Standard Universal Numbering System (1–32 for permanent, A–T for primary).
  - Palmer Notation Method with quadrant grid symbols (UR, UL, LL, LR).

### 2.2 Anatomical Surface Validation
Lamssa validates surfaces according to tooth morphology:
- **Anterior Teeth (Incisors & Canines — FDI x1, x2, x3):** Must only have `INCISAL` surface. Attempting to assign `OCCLUSAL` fails closed with validation error.
- **Posterior Teeth (Premolars & Molars — FDI x4, x5, x6, x7, x8):** Must only have `OCCLUSAL` surface. Attempting to assign `INCISAL` fails closed with validation error.
- **Shared Surfaces:** `MESIAL`, `DISTAL`, `BUCCAL` (or `FACIAL` / `LABIAL`), `LINGUAL` (mandibular), and `PALATAL` (maxillary).

## 3. Periodontal Examination & CAL Calculation

Lamssa implements standardized 6-site circumferential periodontal probing per tooth:
- **Sites:** Disto-Buccal (`DB`), Mid-Buccal (`B`), Mesio-Buccal (`MB`), Disto-Lingual (`DL`), Mid-Lingual (`L`), Mesio-Lingual (`ML`).
- **Probing Depth (PD):** Physiological range 0–15 mm. Depths $\ge 4\text{ mm}$ indicate pathological periodontal pockets.
- **Gingival Margin (GM):** Validated in range -10 to +10 mm.
  - Positive ($GM > 0$): Gingival recession (loss of marginal gingiva).
  - Zero ($GM = 0$): Normal gingival margin at cementoenamel junction (CEJ).
  - Negative ($GM < 0$): Gingival hyperplasia / overgrowth coronal to CEJ.
- **Clinical Attachment Level (CAL):**
  $$\text{CAL} = \text{PD} + \text{GM}$$
  Computed deterministically in real time and verified by both backend invariants and client visualization.
- **Additional Periodontal Indicators:**
  - Bleeding on Probing (BOP): 6-site boolean array.
  - Suppuration: 6-site boolean array.
  - Furcation Grade: `CLASS_0`, `CLASS_I`, `CLASS_II`, `CLASS_III` (Glickman classification).
  - Tooth Mobility Grade: `GRADE_0`, `GRADE_1`, `GRADE_2`, `GRADE_3` (Miller classification).
  - Plaque Index presence.

## 4. Multi-Stage Dental Treatment Plans

Dental treatment frequently spans multiple phased visits (e.g. Endodontics -> Core Build-Up -> Crown Placement):
- Stored as ordered stages in `DentalTreatmentStage` linked to `DentalOdontogram`, `ClinicalEncounter`, and `GeneralClinicalService`.
- **Status Lifecycle:** `DRAFT` -> `PROPOSED` -> `APPROVED` -> `IN_PROGRESS` -> `COMPLETED` (or `CANCELLED` / `SUPERSEDED`).
- **Informed Consent Gate:** An approved stage cannot transition to `COMPLETED` unless linked to an `ACTIVE` verified patient informed consent (`PatientConsent`).
- **Shared Billing Integration:** Completed stages can be billed directly through Lamssa's financial pipeline (`billTreatmentStage`), generating an `InvoiceLine` with 15% VAT and linking back to the stage idempotently. Double billing is strictly rejected.
- **Inventory Material Consumption:** Completed procedures allow logging consumed dental supplies (anesthetic carpules, composite resins, rotary files, bonding agents) against `InventoryBatch` and `InventoryLocation`, updating real-time batch balances and creating audited `InventoryStockMovement` records.

## 5. Security Boundaries & Immutability Triggers

1. **Role-Based Privilege Enforcement:**
   - Recording odontograms, findings, and periodontal measurements requires active `DENTAL_EXAMINATION_RECORD` privilege.
   - Planning procedures requires `DENTAL_PROCEDURE_PLAN`.
   - Approving treatment plans requires `DENTAL_PROCEDURE_APPROVE`.
   - Performing and completing procedures requires `DENTAL_PROCEDURE_PERFORM`.
2. **PostgreSQL Database Triggers:**
   - `trg_dental_finding_immutability` & `trg_dental_periodontal_immutability`:
     Invokes `lamssa_security.dental_record_immutability_guard()`. Strictly prevents `INSERT`, `UPDATE`, or `DELETE` on findings or periodontal records belonging to a `FINALIZED` or `SUPERSEDED` odontogram.
   - `trg_dental_odontogram_status`:
     Invokes `lamssa_security.dental_odontogram_status_guard()`. Strictly blocks modifications to `FINALIZED` or `SUPERSEDED` odontograms, allowing only valid transition from `FINALIZED` to `SUPERSEDED` (via amendment) or `ENTERED_IN_ERROR`.
3. **Cryptographic SHA-256 Digest Sealing:**
   - Upon finalization, a canonical JSON representation of the odontogram, all findings, and periodontal records is hashed using SHA-256 and stored in `contentDigest`, creating an tamper-evident digital seal.
4. **Tenant Isolation:**
   - All four dental relations (`DentalOdontogram`, `DentalToothFinding`, `DentalPeriodontalRecord`, `DentalTreatmentStage`) have `ROW LEVEL SECURITY` enabled and forced (`FORCE ROW LEVEL SECURITY`), with tenant isolation enforced via `lamssa_security.context_allows("clinicId")`.

## 6. Arabic-First RTL Clinical Interface

- **SVG Interactive Odontogram:**
  - Anatomical orientation: Patient right (Quadrants 1 & 4) on screen left; patient left (Quadrants 2 & 3) on screen right.
  - Midline divider clearly marked.
  - Interactive clickable surfaces with color-coded condition badges.
- **Accessible Table Alternative (WCAG 2.1 AA):**
  - Full tabular presentation with ARIA semantics for screen readers and keyboard navigation.
- **6-Site Periodontal Matrix:**
  - Real-time CAL calculation and visual alerts for periodontal pockets ($\ge 4\text{ mm}$) and severe attachment loss ($\ge 5\text{ mm}$).
- **Staged Treatment Workspace:**
  - Procedure status badges, consent indicator, and billing triggers.

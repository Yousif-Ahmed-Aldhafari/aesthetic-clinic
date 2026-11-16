/**
 * HL7 FHIR Release 4 (R4) Model Mappers for Lamssa Platform
 * Standard: HL7 FHIR R4 (v4.0.1)
 *
 * MAPPING DISCLOSURES & ARCHITECTURAL BOUNDARIES:
 * 1. Semantic Loss: Internal domain models carry multi-tenant metadata (clinicId, version, audit trails)
 *    which are mapped to resource meta tags and extensions, not standard FHIR core elements.
 * 2. Terminology Licensing: Free-text codes and local code systems are mapped as-is. SNOMED CT and LOINC
 *    codes require verified commercial subscriptions before live exchange with national HIEs.
 * 3. Identity Isolation: Raw national IDs / Iqama are pseudonymized or masked according to tenant security
 *    policy before export to FHIR resources unless specifically requested under authorized clinical scope.
 * 4. Authorization Boundary: Conversion to FHIR does not grant export authorization; callers must verify
 *    patient consent and tenant authorization prior to serialization.
 */

import {
  FhirPatient,
  FhirPractitioner,
  FhirPractitionerRole,
  FhirEncounter,
  FhirObservation,
  FhirCondition,
  FhirAllergyIntolerance,
  FhirMedicationRequest,
  FhirServiceRequest,
  FhirDiagnosticReport,
  FhirDocumentReference,
  FhirConsent,
} from './fhir-r4.types.js';

export class FhirR4Mapper {
  /**
   * 1. Map Lamssa Patient to FHIR R4 Patient
   */
  static toFhirPatient(patient: {
    id: string;
    patientNumber: string;
    fullName: string;
    phone?: string | null;
    email?: string | null;
    gender?: string | null;
    dateOfBirth?: Date | string | null;
    nationalId?: string | null;
    address?: string | null;
    clinicId?: string;
  }): FhirPatient {
    const fhirGender = patient.gender?.toLowerCase();
    const validGender = fhirGender === 'male' || fhirGender === 'female' || fhirGender === 'other'
      ? fhirGender
      : 'unknown';

    return {
      resourceType: 'Patient',
      id: patient.id,
      meta: {
        profile: ['http://hl7.org/fhir/StructureDefinition/Patient'],
        tag: patient.clinicId ? [{ system: 'urn:lamssa:clinic', code: patient.clinicId }] : undefined,
      },
      identifier: [
        {
          use: 'official',
          system: 'urn:lamssa:patient-number',
          value: patient.patientNumber,
        },
        ...(patient.nationalId ? [{
          use: 'official' as const,
          system: 'urn:iso:std:iso:3166:-2:SA',
          value: patient.nationalId,
        }] : []),
      ],
      active: true,
      name: [
        {
          use: 'official',
          text: patient.fullName,
        },
      ],
      telecom: [
        ...(patient.phone ? [{
          system: 'phone' as const,
          value: patient.phone,
          use: 'mobile' as const,
        }] : []),
        ...(patient.email ? [{
          system: 'email' as const,
          value: patient.email,
          use: 'home' as const,
        }] : []),
      ],
      gender: validGender,
      birthDate: patient.dateOfBirth
        ? (patient.dateOfBirth instanceof Date ? patient.dateOfBirth.toISOString().split('T')[0] : String(patient.dateOfBirth).split('T')[0])
        : undefined,
      address: patient.address ? [{ text: patient.address, use: 'home' }] : undefined,
    };
  }

  /**
   * 2. Map Lamssa Practitioner Profile to FHIR R4 Practitioner
   */
  static toFhirPractitioner(practitioner: {
    id: string;
    membershipId: string;
    licenseNumber?: string | null;
    professionalTitleEn?: string | null;
    professionalTitleAr?: string | null;
    user?: {
      name?: string | null;
      email?: string | null;
    } | null;
    clinicId?: string;
  }): FhirPractitioner {
    return {
      resourceType: 'Practitioner',
      id: practitioner.id,
      meta: {
        profile: ['http://hl7.org/fhir/StructureDefinition/Practitioner'],
        tag: practitioner.clinicId ? [{ system: 'urn:lamssa:clinic', code: practitioner.clinicId }] : undefined,
      },
      identifier: practitioner.licenseNumber ? [
        {
          use: 'official',
          system: 'urn:lamssa:practitioner:license',
          value: practitioner.licenseNumber,
        },
      ] : undefined,
      active: true,
      name: [
        {
          use: 'official',
          text: practitioner.user?.name || practitioner.professionalTitleEn || practitioner.professionalTitleAr || 'Practitioner',
          prefix: practitioner.professionalTitleEn ? [practitioner.professionalTitleEn] : undefined,
        },
      ],
    };
  }

  /**
   * 3. Map Lamssa Practitioner Role & Specialty to FHIR R4 PractitionerRole
   */
  static toFhirPractitionerRole(role: {
    id: string;
    practitionerProfileId: string;
    clinicId: string;
    specialtyNameEn?: string | null;
    specialtyCode?: string | null;
    isActive?: boolean;
  }): FhirPractitionerRole {
    return {
      resourceType: 'PractitionerRole',
      id: role.id,
      active: role.isActive ?? true,
      practitioner: {
        reference: `Practitioner/${role.practitionerProfileId}`,
      },
      organization: {
        reference: `Organization/${role.clinicId}`,
      },
      specialty: role.specialtyNameEn ? [
        {
          coding: [
            {
              system: 'urn:lamssa:specialty',
              code: role.specialtyCode || 'GENERAL',
              display: role.specialtyNameEn,
            },
          ],
          text: role.specialtyNameEn,
        },
      ] : undefined,
    };
  }

  /**
   * 4. Map Lamssa ClinicalEncounter to FHIR R4 Encounter
   */
  static toFhirEncounter(encounter: {
    id: string;
    clinicId: string;
    patientId: string;
    clinicianMembershipId: string;
    status: string;
    startedAt?: Date | string | null;
    endedAt?: Date | string | null;
    chiefComplaint?: string | null;
  }): FhirEncounter {
    const statusMap: Record<string, FhirEncounter['status']> = {
      IN_PROGRESS: 'in-progress',
      COMPLETED: 'finished',
      CANCELLED: 'cancelled',
      PLANNED: 'planned',
    };

    return {
      resourceType: 'Encounter',
      id: encounter.id,
      status: statusMap[encounter.status] || 'unknown',
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: 'AMB',
        display: 'ambulatory',
      },
      subject: {
        reference: `Patient/${encounter.patientId}`,
      },
      participant: [
        {
          individual: {
            reference: `Practitioner/${encounter.clinicianMembershipId}`,
          },
        },
      ],
      period: {
        start: encounter.startedAt instanceof Date ? encounter.startedAt.toISOString() : (encounter.startedAt || undefined),
        end: encounter.endedAt instanceof Date ? encounter.endedAt.toISOString() : (encounter.endedAt || undefined),
      },
      reasonCode: encounter.chiefComplaint ? [
        {
          text: encounter.chiefComplaint,
        },
      ] : undefined,
    };
  }

  /**
   * 5. Map Lamssa ClinicalObservation to FHIR R4 Observation
   */
  static toFhirObservation(obs: {
    id: string;
    clinicId: string;
    patientId: string;
    encounterId?: string | null;
    observationType: string;
    numericValue?: any;
    textValue?: string | null;
    unit: string;
    measuredAt: Date | string;
    status?: string;
  }): FhirObservation {
    return {
      resourceType: 'Observation',
      id: obs.id,
      status: 'final',
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
              code: 'vital-signs',
              display: 'Vital Signs',
            },
          ],
        },
      ],
      code: {
        coding: [
          {
            system: 'urn:lamssa:observation-type',
            code: obs.observationType,
            display: obs.observationType.replace(/_/g, ' '),
          },
        ],
        text: obs.observationType,
      },
      subject: {
        reference: `Patient/${obs.patientId}`,
      },
      encounter: obs.encounterId ? { reference: `Encounter/${obs.encounterId}` } : undefined,
      effectiveDateTime: obs.measuredAt instanceof Date ? obs.measuredAt.toISOString() : String(obs.measuredAt),
      valueQuantity: obs.numericValue !== null && obs.numericValue !== undefined ? {
        value: Number(obs.numericValue),
        unit: obs.unit,
        system: 'http://unitsofmeasure.org',
        code: obs.unit,
      } : undefined,
      valueString: obs.textValue || undefined,
    };
  }

  /**
   * 6. Map Lamssa EncounterDiagnosis to FHIR R4 Condition
   */
  static toFhirCondition(diag: {
    id: string;
    clinicId: string;
    patientId: string;
    encounterId?: string | null;
    code: string;
    codingSystem: string;
    displayEn?: string | null;
    displayAr?: string | null;
    clinicalStatus: string;
    verificationStatus: string;
    onsetDate?: Date | string | null;
  }): FhirCondition {
    const clinicalStatusMap: Record<string, string> = {
      ACTIVE: 'active',
      RESOLVED: 'resolved',
      INACTIVE: 'inactive',
      PROVISIONAL: 'active',
      CHRONIC: 'active',
    };

    return {
      resourceType: 'Condition',
      id: diag.id,
      clinicalStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
            code: clinicalStatusMap[diag.clinicalStatus] || 'active',
          },
        ],
      },
      verificationStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
            code: diag.verificationStatus.toLowerCase() === 'confirmed' ? 'confirmed' : 'provisional',
          },
        ],
      },
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/condition-category',
              code: 'encounter-diagnosis',
              display: 'Encounter Diagnosis',
            },
          ],
        },
      ],
      code: {
        coding: [
          {
            system: diag.codingSystem === 'ICD_10' ? 'http://hl7.org/fhir/sid/icd-10' : `urn:lamssa:${diag.codingSystem.toLowerCase()}`,
            code: diag.code,
            display: (diag.displayEn || diag.displayAr) ?? undefined,
          },
        ],
        text: (diag.displayEn || diag.displayAr || diag.code) ?? undefined,
      },
      subject: {
        reference: `Patient/${diag.patientId}`,
      },
      encounter: diag.encounterId ? { reference: `Encounter/${diag.encounterId}` } : undefined,
      recordedDate: diag.onsetDate instanceof Date ? diag.onsetDate.toISOString() : (diag.onsetDate || undefined),
    };
  }

  /**
   * 7. Map Lamssa PatientAllergy to FHIR R4 AllergyIntolerance
   */
  static toFhirAllergyIntolerance(allergy: {
    id: string;
    clinicId: string;
    patientId: string;
    encounterId?: string | null;
    substance: string;
    substanceCode?: string | null;
    codingSystem?: string | null;
    severity?: string | null;
    clinicalStatus: string;
    reaction?: string | null;
    recordedAt: Date | string;
  }): FhirAllergyIntolerance {
    const sevMap: Record<string, 'mild' | 'moderate' | 'severe'> = {
      MILD: 'mild',
      MODERATE: 'moderate',
      SEVERE: 'severe',
      LIFE_THREATENING: 'severe',
    };

    return {
      resourceType: 'AllergyIntolerance',
      id: allergy.id,
      clinicalStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
            code: allergy.clinicalStatus.toLowerCase() === 'active' ? 'active' : 'inactive',
          },
        ],
      },
      verificationStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
            code: 'confirmed',
          },
        ],
      },
      criticality: allergy.severity === 'LIFE_THREATENING' || allergy.severity === 'SEVERE' ? 'high' : 'low',
      code: {
        coding: allergy.substanceCode ? [
          {
            system: allergy.codingSystem || 'urn:lamssa:allergen',
            code: allergy.substanceCode,
            display: allergy.substance,
          },
        ] : undefined,
        text: allergy.substance,
      },
      patient: {
        reference: `Patient/${allergy.patientId}`,
      },
      encounter: allergy.encounterId ? { reference: `Encounter/${allergy.encounterId}` } : undefined,
      recordedDate: allergy.recordedAt instanceof Date ? allergy.recordedAt.toISOString() : String(allergy.recordedAt),
      reaction: allergy.reaction ? [
        {
          manifestation: [{ text: allergy.reaction }],
          severity: allergy.severity ? sevMap[allergy.severity] : undefined,
        },
      ] : undefined,
    };
  }

  /**
   * 8. Map Lamssa Prescription & Item to FHIR R4 MedicationRequest
   */
  static toFhirMedicationRequest(prescription: {
    id: string;
    clinicId: string;
    patientId: string;
    encounterId?: string | null;
    prescriberMembershipId: string;
    status: string;
    createdAt: Date | string;
  }, item: {
    id: string;
    medicationName: string;
    genericName?: string | null;
    strength: string;
    route: string;
    frequency: string;
    duration: string;
    quantity: number;
    instructions: string;
    refillsAllowed?: number;
  }): FhirMedicationRequest {
    const statusMap: Record<string, FhirMedicationRequest['status']> = {
      SIGNED: 'active',
      DRAFT: 'draft',
      CANCELLED: 'cancelled',
      COMPLETED: 'completed',
    };

    return {
      resourceType: 'MedicationRequest',
      id: `${prescription.id}-${item.id}`,
      identifier: [
        {
          system: 'urn:lamssa:prescription-item',
          value: item.id,
        },
      ],
      status: statusMap[prescription.status] || 'active',
      intent: 'order',
      medicationCodeableConcept: {
        text: `${item.medicationName} ${item.strength}`,
        coding: item.genericName ? [
          {
            system: 'urn:lamssa:generic-medication',
            display: item.genericName,
          },
        ] : undefined,
      },
      subject: {
        reference: `Patient/${prescription.patientId}`,
      },
      encounter: prescription.encounterId ? { reference: `Encounter/${prescription.encounterId}` } : undefined,
      authoredOn: prescription.createdAt instanceof Date ? prescription.createdAt.toISOString() : String(prescription.createdAt),
      requester: {
        reference: `Practitioner/${prescription.prescriberMembershipId}`,
      },
      dosageInstruction: [
        {
          text: item.instructions || `${item.strength} ${item.route} ${item.frequency} for ${item.duration}`,
          route: { text: item.route },
          timing: { code: { text: item.frequency } },
        },
      ],
      dispenseRequest: {
        numberOfRepeatsAllowed: item.refillsAllowed ?? 0,
        quantity: {
          value: item.quantity,
          unit: 'packages',
        },
      },
    };
  }

  /**
   * 9. Map Lamssa ClinicalOrder to FHIR R4 ServiceRequest
   */
  static toFhirServiceRequest(order: {
    id: string;
    clinicId: string;
    orderNumber: string;
    patientId: string;
    encounterId?: string | null;
    orderingDoctorMembershipId: string;
    orderType: string;
    priority: string;
    status: string;
    clinicalIndication?: string | null;
    createdAt: Date | string;
    generalClinicalService?: {
      nameEn?: string | null;
      nameAr?: string | null;
      serviceCode?: string | null;
    } | null;
  }): FhirServiceRequest {
    const statusMap: Record<string, FhirServiceRequest['status']> = {
      REQUESTED: 'active',
      IN_PROGRESS: 'active',
      COMPLETED: 'completed',
      CANCELLED: 'revoked',
    };

    const priorityMap: Record<string, FhirServiceRequest['priority']> = {
      ROUTINE: 'routine',
      URGENT: 'urgent',
      STAT: 'stat',
    };

    return {
      resourceType: 'ServiceRequest',
      id: order.id,
      identifier: [
        {
          use: 'official',
          system: 'urn:lamssa:order-number',
          value: order.orderNumber,
        },
      ],
      status: statusMap[order.status] || 'active',
      intent: 'order',
      category: [
        {
          coding: [
            {
              system: 'urn:lamssa:order-type',
              code: order.orderType,
              display: order.orderType,
            },
          ],
        },
      ],
      priority: priorityMap[order.priority] || 'routine',
      code: {
        text: order.generalClinicalService?.nameEn || order.generalClinicalService?.nameAr || order.clinicalIndication || order.orderType,
        coding: order.generalClinicalService?.serviceCode ? [
          {
            system: 'urn:lamssa:clinical-service',
            code: order.generalClinicalService.serviceCode,
            display: order.generalClinicalService.nameEn || order.generalClinicalService.nameAr || undefined,
          },
        ] : undefined,
      },
      subject: {
        reference: `Patient/${order.patientId}`,
      },
      encounter: order.encounterId ? { reference: `Encounter/${order.encounterId}` } : undefined,
      authoredOn: order.createdAt instanceof Date ? order.createdAt.toISOString() : String(order.createdAt),
      requester: {
        reference: `Practitioner/${order.orderingDoctorMembershipId}`,
      },
    };
  }

  /**
   * 10. Map Lamssa ClinicalOrderResult to FHIR R4 DiagnosticReport
   */
  static toFhirDiagnosticReport(result: {
    id: string;
    clinicId: string;
    orderId: string;
    patientId: string;
    resultType: string;
    status: string;
    issuedAt: Date | string;
    performedAt?: Date | string | null;
    recordedByMembershipId: string;
    verifiedByMembershipId?: string | null;
    impression?: string | null;
    narrativeFindings?: string | null;
  }): FhirDiagnosticReport {
    const statusMap: Record<string, FhirDiagnosticReport['status']> = {
      FINAL: 'final',
      PRELIMINARY: 'preliminary',
      CORRECTED: 'corrected',
      CANCELLED: 'cancelled',
      DRAFT: 'registered',
    };

    return {
      resourceType: 'DiagnosticReport',
      id: result.id,
      basedOn: [
        {
          reference: `ServiceRequest/${result.orderId}`,
        },
      ],
      status: statusMap[result.status] || 'final',
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v2-0074',
              code: result.resultType === 'LABORATORY' ? 'LAB' : 'RAD',
              display: result.resultType,
            },
          ],
        },
      ],
      code: {
        text: `${result.resultType} Diagnostic Report`,
      },
      subject: {
        reference: `Patient/${result.patientId}`,
      },
      effectiveDateTime: result.performedAt instanceof Date ? result.performedAt.toISOString() : (result.performedAt || undefined),
      issued: result.issuedAt instanceof Date ? result.issuedAt.toISOString() : String(result.issuedAt),
      performer: [
        {
          reference: `Practitioner/${result.recordedByMembershipId}`,
        },
      ],
      resultsInterpreter: result.verifiedByMembershipId ? [
        {
          reference: `Practitioner/${result.verifiedByMembershipId}`,
        },
      ] : undefined,
      conclusion: result.impression || result.narrativeFindings || undefined,
    };
  }

  /**
   * 11. Map Lamssa ClinicalDocument to FHIR R4 DocumentReference
   */
  static toFhirDocumentReference(doc: {
    id: string;
    clinicId: string;
    patientId: string;
    documentType: string;
    title: string;
    fileSizeBytes: number;
    mimeType: string;
    sha256Hash: string;
    createdAt: Date | string;
  }): FhirDocumentReference {
    return {
      resourceType: 'DocumentReference',
      id: doc.id,
      status: 'current',
      type: {
        coding: [
          {
            system: 'urn:lamssa:clinical-document-type',
            code: doc.documentType,
            display: doc.documentType.replace(/_/g, ' '),
          },
        ],
        text: doc.title,
      },
      subject: {
        reference: `Patient/${doc.patientId}`,
      },
      date: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : String(doc.createdAt),
      content: [
        {
          attachment: {
            contentType: doc.mimeType,
            size: doc.fileSizeBytes,
            hash: doc.sha256Hash,
            title: doc.title,
          },
        },
      ],
    };
  }

  /**
   * 12. Map Lamssa PatientConsent to FHIR R4 Consent
   */
  static toFhirConsent(consent: {
    id: string;
    clinicId: string;
    patientId: string;
    purpose: string;
    createdAt: Date | string;
    status?: string;
  }): FhirConsent {
    return {
      resourceType: 'Consent',
      id: consent.id,
      status: 'active',
      scope: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/consentscope',
            code: 'patient-privacy',
            display: 'Privacy Consent',
          },
        ],
      },
      category: [
        {
          coding: [
            {
              system: 'urn:lamssa:consent-purpose',
              code: consent.purpose,
              display: consent.purpose.replace(/_/g, ' '),
            },
          ],
        },
      ],
      patient: {
        reference: `Patient/${consent.patientId}`,
      },
      dateTime: consent.createdAt instanceof Date ? consent.createdAt.toISOString() : String(consent.createdAt),
      provision: {
        type: 'permit',
      },
    };
  }
}

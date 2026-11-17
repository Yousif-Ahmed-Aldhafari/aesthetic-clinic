/**
 * HL7 FHIR Release 4 (R4) Type Definitions for Lamssa Interoperability Readiness
 * Standard: HL7 FHIR R4 (v4.0.1)
 */

export interface FhirCoding {
  system?: string;
  version?: string;
  code?: string;
  display?: string;
  userSelected?: boolean;
}

export interface FhirCodeableConcept {
  coding?: FhirCoding[];
  text?: string;
}

export interface FhirIdentifier {
  use?: 'usual' | 'official' | 'temp' | 'secondary' | 'old';
  type?: FhirCodeableConcept;
  system?: string;
  value?: string;
  period?: { start?: string; end?: string };
  assigner?: FhirReference;
}

export interface FhirReference {
  reference?: string;
  type?: string;
  identifier?: FhirIdentifier;
  display?: string;
}

export interface FhirPeriod {
  start?: string;
  end?: string;
}

export interface FhirHumanName {
  use?: 'usual' | 'official' | 'temp' | 'nickname' | 'anonymous' | 'old' | 'maiden';
  text?: string;
  family?: string;
  given?: string[];
  prefix?: string[];
  suffix?: string[];
}

export interface FhirContactPoint {
  system?: 'phone' | 'fax' | 'email' | 'pager' | 'url' | 'sms' | 'other';
  value?: string;
  use?: 'home' | 'work' | 'temp' | 'old' | 'mobile';
  rank?: number;
}

export interface FhirQuantity {
  value?: number;
  comparator?: '<' | '<=' | '>=' | '>';
  unit?: string;
  system?: string;
  code?: string;
}

export interface FhirResourceBase {
  resourceType: string;
  id?: string;
  meta?: {
    versionId?: string;
    lastUpdated?: string;
    profile?: string[];
    security?: FhirCoding[];
    tag?: FhirCoding[];
  };
  language?: string;
}

// 1. Patient
export interface FhirPatient extends FhirResourceBase {
  resourceType: 'Patient';
  identifier?: FhirIdentifier[];
  active?: boolean;
  name?: FhirHumanName[];
  telecom?: FhirContactPoint[];
  gender?: 'male' | 'female' | 'other' | 'unknown';
  birthDate?: string;
  address?: Array<{
    use?: 'home' | 'work' | 'temp' | 'old' | 'billing';
    text?: string;
    line?: string[];
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  }>;
}

// 2. Practitioner
export interface FhirPractitioner extends FhirResourceBase {
  resourceType: 'Practitioner';
  identifier?: FhirIdentifier[];
  active?: boolean;
  name?: FhirHumanName[];
  qualification?: Array<{
    identifier?: FhirIdentifier[];
    code: FhirCodeableConcept;
    period?: FhirPeriod;
    issuer?: FhirReference;
  }>;
}

// 3. PractitionerRole
export interface FhirPractitionerRole extends FhirResourceBase {
  resourceType: 'PractitionerRole';
  identifier?: FhirIdentifier[];
  active?: boolean;
  practitioner?: FhirReference;
  organization?: FhirReference;
  code?: FhirCodeableConcept[];
  specialty?: FhirCodeableConcept[];
}

// 4. Encounter
export interface FhirEncounter extends FhirResourceBase {
  resourceType: 'Encounter';
  identifier?: FhirIdentifier[];
  status: 'planned' | 'arrived' | 'triaged' | 'in-progress' | 'onleave' | 'finished' | 'cancelled' | 'entered-in-error' | 'unknown';
  class: FhirCoding;
  type?: FhirCodeableConcept[];
  subject?: FhirReference;
  participant?: Array<{
    type?: FhirCodeableConcept[];
    individual?: FhirReference;
  }>;
  period?: FhirPeriod;
  reasonCode?: FhirCodeableConcept[];
}

// 5. Observation
export interface FhirObservation extends FhirResourceBase {
  resourceType: 'Observation';
  identifier?: FhirIdentifier[];
  status: 'registered' | 'preliminary' | 'final' | 'amended' | 'corrected' | 'cancelled' | 'entered-in-error' | 'unknown';
  category?: FhirCodeableConcept[];
  code: FhirCodeableConcept;
  subject?: FhirReference;
  encounter?: FhirReference;
  effectiveDateTime?: string;
  issued?: string;
  performer?: FhirReference[];
  valueQuantity?: FhirQuantity;
  valueString?: string;
  note?: Array<{ text: string }>;
}

// 6. Condition (Diagnosis / Problem)
export interface FhirCondition extends FhirResourceBase {
  resourceType: 'Condition';
  identifier?: FhirIdentifier[];
  clinicalStatus?: FhirCodeableConcept;
  verificationStatus?: FhirCodeableConcept;
  category?: FhirCodeableConcept[];
  severity?: FhirCodeableConcept;
  code?: FhirCodeableConcept;
  subject: FhirReference;
  encounter?: FhirReference;
  recordedDate?: string;
  recorder?: FhirReference;
}

// 7. AllergyIntolerance
export interface FhirAllergyIntolerance extends FhirResourceBase {
  resourceType: 'AllergyIntolerance';
  identifier?: FhirIdentifier[];
  clinicalStatus?: FhirCodeableConcept;
  verificationStatus?: FhirCodeableConcept;
  type?: 'allergy' | 'intolerance';
  category?: Array<'food' | 'medication' | 'environment' | 'biologic'>;
  criticality?: 'low' | 'high' | 'unable-to-assess';
  code?: FhirCodeableConcept;
  patient: FhirReference;
  encounter?: FhirReference;
  recordedDate?: string;
  recorder?: FhirReference;
  reaction?: Array<{
    substance?: FhirCodeableConcept;
    manifestation: FhirCodeableConcept[];
    severity?: 'mild' | 'moderate' | 'severe';
  }>;
}

// 8. MedicationRequest (Prescription)
export interface FhirMedicationRequest extends FhirResourceBase {
  resourceType: 'MedicationRequest';
  identifier?: FhirIdentifier[];
  status: 'active' | 'on-hold' | 'cancelled' | 'completed' | 'entered-in-error' | 'stopped' | 'draft' | 'unknown';
  intent: 'proposal' | 'plan' | 'order' | 'original-order' | 'reflex-order' | 'filler-order' | 'instance-order' | 'option';
  medicationCodeableConcept?: FhirCodeableConcept;
  subject: FhirReference;
  encounter?: FhirReference;
  authoredOn?: string;
  requester?: FhirReference;
  dosageInstruction?: Array<{
    text?: string;
    timing?: { code?: FhirCodeableConcept };
    route?: FhirCodeableConcept;
    doseAndRate?: Array<{
      doseQuantity?: FhirQuantity;
    }>;
  }>;
  dispenseRequest?: {
    numberOfRepeatsAllowed?: number;
    quantity?: FhirQuantity;
    expectedSupplyDuration?: FhirQuantity;
  };
}

// 9. ServiceRequest (Clinical Order)
export interface FhirServiceRequest extends FhirResourceBase {
  resourceType: 'ServiceRequest';
  identifier?: FhirIdentifier[];
  status: 'draft' | 'active' | 'on-hold' | 'revoked' | 'completed' | 'entered-in-error' | 'unknown';
  intent: 'proposal' | 'plan' | 'directive' | 'order' | 'original-order' | 'reflex-order' | 'filler-order' | 'instance-order' | 'option';
  category?: FhirCodeableConcept[];
  priority?: 'routine' | 'urgent' | 'asap' | 'stat';
  code?: FhirCodeableConcept;
  subject: FhirReference;
  encounter?: FhirReference;
  authoredOn?: string;
  requester?: FhirReference;
}

// 10. DiagnosticReport
export interface FhirDiagnosticReport extends FhirResourceBase {
  resourceType: 'DiagnosticReport';
  identifier?: FhirIdentifier[];
  basedOn?: FhirReference[];
  status: 'registered' | 'partial' | 'preliminary' | 'final' | 'amended' | 'corrected' | 'appended' | 'cancelled' | 'entered-in-error' | 'unknown';
  category?: FhirCodeableConcept[];
  code: FhirCodeableConcept;
  subject?: FhirReference;
  encounter?: FhirReference;
  effectiveDateTime?: string;
  issued?: string;
  performer?: FhirReference[];
  resultsInterpreter?: FhirReference[];
  conclusion?: string;
  presentedForm?: Array<{
    contentType?: string;
    data?: string;
    url?: string;
    title?: string;
  }>;
}

// 11. DocumentReference
export interface FhirDocumentReference extends FhirResourceBase {
  resourceType: 'DocumentReference';
  identifier?: FhirIdentifier[];
  status: 'current' | 'superseded' | 'entered-in-error';
  type?: FhirCodeableConcept;
  category?: FhirCodeableConcept[];
  subject?: FhirReference;
  date?: string;
  author?: FhirReference[];
  description?: string;
  content: Array<{
    attachment: {
      contentType?: string;
      language?: string;
      url?: string;
      size?: number;
      hash?: string;
      title?: string;
    };
  }>;
}

// 12. Consent
export interface FhirConsent extends FhirResourceBase {
  resourceType: 'Consent';
  identifier?: FhirIdentifier[];
  status: 'draft' | 'proposed' | 'active' | 'rejected' | 'inactive' | 'entered-in-error';
  scope: FhirCodeableConcept;
  category: FhirCodeableConcept[];
  patient?: FhirReference;
  dateTime?: string;
  performer?: FhirReference[];
  policyRule?: FhirCodeableConcept;
  provision?: {
    type?: 'deny' | 'permit';
    period?: FhirPeriod;
  };
}

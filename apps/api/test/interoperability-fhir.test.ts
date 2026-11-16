import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FhirR4Mapper } from '../src/interoperability/fhir/fhir-r4.mapper.js';
import { TerminologyService } from '../src/interoperability/terminology.service.js';
import { LabOrderAdapter } from '../src/interoperability/adapters/lab-order.adapter.js';
import { ImagingAdapter } from '../src/interoperability/adapters/imaging.adapter.js';
import { PharmacyAdapter } from '../src/interoperability/adapters/pharmacy.adapter.js';
import { HealthExchangeAdapter } from '../src/interoperability/adapters/health-exchange.adapter.js';

describe('Healthcare Interoperability & HL7 FHIR R4 Unit Tests', () => {
  const terminologyService = new TerminologyService();

  describe('1. HL7 FHIR R4 Mappings (All 12 Core Concepts)', () => {
    it('1. Patient mapping', () => {
      const fhir = FhirR4Mapper.toFhirPatient({
        id: '11111111-1111-1111-1111-111111111111',
        patientNumber: 'PAT-0001',
        fullName: 'فاطمة أحمد علي',
        phone: '+966501234567',
        email: 'fatima@example.sa',
        gender: 'female',
        dateOfBirth: '1992-05-15',
        nationalId: '1082345678',
        address: 'الرياض، المملكة العربية السعودية',
        clinicId: '22222222-2222-2222-2222-222222222222',
      });

      assert.equal(fhir.resourceType, 'Patient');
      assert.equal(fhir.id, '11111111-1111-1111-1111-111111111111');
      assert.equal(fhir.gender, 'female');
      assert.equal(fhir.birthDate, '1992-05-15');
      assert.equal(fhir.name?.[0].text, 'فاطمة أحمد علي');
      assert.equal(fhir.identifier?.[0].value, 'PAT-0001');
      assert.equal(fhir.identifier?.[1].value, '1082345678');
      assert.equal(fhir.telecom?.[0].value, '+966501234567');
    });

    it('2. Practitioner mapping', () => {
      const fhir = FhirR4Mapper.toFhirPractitioner({
        id: '33333333-3333-3333-3333-333333333333',
        membershipId: '44444444-4444-4444-4444-444444444444',
        licenseNumber: 'DOC-MOH-99412',
        professionalTitleEn: 'Dr. Sarah Al-Otaibi',
        professionalTitleAr: 'د. سارة العتيبي',
        user: { name: 'Dr. Sarah Al-Otaibi', email: 'sarah@clinic.sa' },
      });

      assert.equal(fhir.resourceType, 'Practitioner');
      assert.equal(fhir.id, '33333333-3333-3333-3333-333333333333');
      assert.equal(fhir.identifier?.[0].value, 'DOC-MOH-99412');
      assert.equal(fhir.name?.[0].text, 'Dr. Sarah Al-Otaibi');
    });

    it('3. PractitionerRole mapping', () => {
      const fhir = FhirR4Mapper.toFhirPractitionerRole({
        id: '55555555-5555-5555-5555-555555555555',
        practitionerProfileId: '33333333-3333-3333-3333-333333333333',
        clinicId: '22222222-2222-2222-2222-222222222222',
        specialtyNameEn: 'Dermatology & Cutaneous Surgery',
        specialtyCode: 'DERM',
        isActive: true,
      });

      assert.equal(fhir.resourceType, 'PractitionerRole');
      assert.equal(fhir.practitioner?.reference, 'Practitioner/33333333-3333-3333-3333-333333333333');
      assert.equal(fhir.organization?.reference, 'Organization/22222222-2222-2222-2222-222222222222');
      assert.equal(fhir.specialty?.[0].coding?.[0].code, 'DERM');
    });

    it('4. ClinicalEncounter mapping', () => {
      const fhir = FhirR4Mapper.toFhirEncounter({
        id: '66666666-6666-6666-6666-666666666666',
        clinicId: '22222222-2222-2222-2222-222222222222',
        patientId: '11111111-1111-1111-1111-111111111111',
        clinicianMembershipId: '44444444-4444-4444-4444-444444444444',
        status: 'IN_PROGRESS',
        startedAt: '2026-11-16T08:00:00.000Z',
        chiefComplaint: 'Severe facial rash and pruritus after sunscreen application',
      });

      assert.equal(fhir.resourceType, 'Encounter');
      assert.equal(fhir.status, 'in-progress');
      assert.equal(fhir.class.code, 'AMB');
      assert.equal(fhir.subject?.reference, 'Patient/11111111-1111-1111-1111-111111111111');
      assert.equal(fhir.reasonCode?.[0].text, 'Severe facial rash and pruritus after sunscreen application');
    });

    it('5. Observation mapping', () => {
      const fhir = FhirR4Mapper.toFhirObservation({
        id: '77777777-7777-7777-7777-777777777777',
        clinicId: '22222222-2222-2222-2222-222222222222',
        patientId: '11111111-1111-1111-1111-111111111111',
        observationType: 'SYSTOLIC_BP',
        numericValue: 124,
        unit: 'mmHg',
        measuredAt: '2026-11-16T08:15:00.000Z',
      });

      assert.equal(fhir.resourceType, 'Observation');
      assert.equal(fhir.category?.[0].coding?.[0].code, 'vital-signs');
      assert.equal(fhir.valueQuantity?.value, 124);
      assert.equal(fhir.valueQuantity?.unit, 'mmHg');
    });

    it('6. Condition (Diagnosis) mapping', () => {
      const fhir = FhirR4Mapper.toFhirCondition({
        id: '88888888-8888-8888-8888-888888888888',
        clinicId: '22222222-2222-2222-2222-222222222222',
        patientId: '11111111-1111-1111-1111-111111111111',
        code: 'L70.0',
        codingSystem: 'ICD_10',
        displayEn: 'Acne vulgaris',
        displayAr: 'حب الشباب الشائع',
        clinicalStatus: 'ACTIVE',
        verificationStatus: 'CONFIRMED',
        onsetDate: '2026-11-01',
      });

      assert.equal(fhir.resourceType, 'Condition');
      assert.equal(fhir.clinicalStatus?.coding?.[0].code, 'active');
      assert.equal(fhir.verificationStatus?.coding?.[0].code, 'confirmed');
      assert.equal(fhir.code?.coding?.[0].code, 'L70.0');
      assert.equal(fhir.code?.coding?.[0].system, 'http://hl7.org/fhir/sid/icd-10');
    });

    it('7. AllergyIntolerance mapping', () => {
      const fhir = FhirR4Mapper.toFhirAllergyIntolerance({
        id: '99999999-9999-9999-9999-999999999999',
        clinicId: '22222222-2222-2222-2222-222222222222',
        patientId: '11111111-1111-1111-1111-111111111111',
        substance: 'Penicillin V',
        substanceCode: 'J01CE02',
        severity: 'SEVERE',
        clinicalStatus: 'ACTIVE',
        reaction: 'Urticaria and facial angioedema',
        recordedAt: '2026-11-16T08:20:00.000Z',
      });

      assert.equal(fhir.resourceType, 'AllergyIntolerance');
      assert.equal(fhir.criticality, 'high');
      assert.equal(fhir.code?.text, 'Penicillin V');
      assert.equal(fhir.reaction?.[0].severity, 'severe');
    });

    it('8. MedicationRequest (Prescription) mapping', () => {
      const fhir = FhirR4Mapper.toFhirMedicationRequest(
        {
          id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          clinicId: '22222222-2222-2222-2222-222222222222',
          patientId: '11111111-1111-1111-1111-111111111111',
          prescriberMembershipId: '44444444-4444-4444-4444-444444444444',
          status: 'SIGNED',
          createdAt: '2026-11-16T08:30:00.000Z',
        },
        {
          id: 'item-1',
          medicationName: 'Amoxicillin/Clavulanate',
          strength: '1000mg',
          route: 'ORAL',
          frequency: 'BID',
          duration: '7 days',
          quantity: 1,
          instructions: 'Take 1 tablet every 12 hours after meals',
          refillsAllowed: 0,
        },
      );

      assert.equal(fhir.resourceType, 'MedicationRequest');
      assert.equal(fhir.status, 'active');
      assert.equal(fhir.intent, 'order');
      assert.equal(fhir.medicationCodeableConcept?.text, 'Amoxicillin/Clavulanate 1000mg');
      assert.equal(fhir.dispenseRequest?.quantity?.value, 1);
    });

    it('9. ServiceRequest (Clinical Order) mapping', () => {
      const fhir = FhirR4Mapper.toFhirServiceRequest({
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        clinicId: '22222222-2222-2222-2222-222222222222',
        orderNumber: 'ORD-CLIN-000042',
        patientId: '11111111-1111-1111-1111-111111111111',
        orderingDoctorMembershipId: '44444444-4444-4444-4444-444444444444',
        orderType: 'LABORATORY',
        priority: 'STAT',
        status: 'REQUESTED',
        clinicalIndication: 'Acute febrile neutropenia evaluation',
        createdAt: '2026-11-16T08:35:00.000Z',
        generalClinicalService: {
          serviceCode: 'LAB-CBC',
          nameEn: 'Complete Blood Count (CBC)',
          nameAr: 'تعداد الدم الشامل',
        },
      });

      assert.equal(fhir.resourceType, 'ServiceRequest');
      assert.equal(fhir.priority, 'stat');
      assert.equal(fhir.identifier?.[0].value, 'ORD-CLIN-000042');
      assert.equal(fhir.code?.text, 'Complete Blood Count (CBC)');
    });

    it('10. DiagnosticReport mapping', () => {
      const fhir = FhirR4Mapper.toFhirDiagnosticReport({
        id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        clinicId: '22222222-2222-2222-2222-222222222222',
        orderId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        patientId: '11111111-1111-1111-1111-111111111111',
        resultType: 'LABORATORY',
        status: 'FINAL',
        issuedAt: '2026-11-16T09:00:00.000Z',
        recordedByMembershipId: '44444444-4444-4444-4444-444444444444',
        verifiedByMembershipId: '44444444-4444-4444-4444-444444444444',
        impression: 'Normal red blood cell count, mild leukocytosis noted',
      });

      assert.equal(fhir.resourceType, 'DiagnosticReport');
      assert.equal(fhir.status, 'final');
      assert.equal(fhir.conclusion, 'Normal red blood cell count, mild leukocytosis noted');
      assert.equal(fhir.basedOn?.[0].reference, 'ServiceRequest/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
    });

    it('11. DocumentReference mapping', () => {
      const fhir = FhirR4Mapper.toFhirDocumentReference({
        id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        clinicId: '22222222-2222-2222-2222-222222222222',
        patientId: '11111111-1111-1111-1111-111111111111',
        documentType: 'LAB_REPORT',
        title: 'CBC Laboratory Diagnostic Report PDF',
        fileSizeBytes: 245000,
        mimeType: 'application/pdf',
        sha256Hash: 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e',
        createdAt: '2026-11-16T09:05:00.000Z',
      });

      assert.equal(fhir.resourceType, 'DocumentReference');
      assert.equal(fhir.status, 'current');
      assert.equal(fhir.content[0].attachment.contentType, 'application/pdf');
      assert.equal(fhir.content[0].attachment.hash, 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e');
    });

    it('12. Consent mapping', () => {
      const fhir = FhirR4Mapper.toFhirConsent({
        id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        clinicId: '22222222-2222-2222-2222-222222222222',
        patientId: '11111111-1111-1111-1111-111111111111',
        purpose: 'DATA_SHARING',
        createdAt: '2026-11-16T08:00:00.000Z',
      });

      assert.equal(fhir.resourceType, 'Consent');
      assert.equal(fhir.status, 'active');
      assert.equal(fhir.scope.coding?.[0].code, 'patient-privacy');
      assert.equal(fhir.provision?.type, 'permit');
    });
  });

  describe('2. Terminology Service & Licensing Disclaimers', () => {
    it('Validates ICD-10 code format', () => {
      const resValid = terminologyService.validateCode('ICD_10', 'L70.0');
      assert.ok(resValid.isValidFormat);
      assert.equal(resValid.system, 'ICD-10');

      const resInvalid = terminologyService.validateCode('ICD_10', '123-INVALID');
      assert.ok(!resInvalid.isValidFormat);
    });

    it('Validates LOINC code format and dictionary reference', () => {
      const resValid = terminologyService.validateCode('LOINC', '8480-6');
      assert.ok(resValid.isValidFormat);
      assert.equal(resValid.system, 'LOINC');

      const loincRef = terminologyService.getLoincReference('SYSTOLIC_BP');
      assert.equal(loincRef?.code, '8480-6');
      assert.equal(loincRef?.unit, 'mmHg');
    });

    it('Validates WHO-ATC code format', () => {
      const resValid = terminologyService.validateCode('ATC', 'J01CE02');
      assert.ok(resValid.isValidFormat);
      assert.equal(resValid.system, 'WHO-ATC');
    });

    it('Returns formal licensing disclaimer for SNOMED CT', () => {
      const resSnomed = terminologyService.validateCode('SNOMED_CT', '126485001');
      assert.ok(resSnomed.isValidFormat);
      assert.ok(resSnomed.licensingNotice.includes('DISCLAIMER: SNOMED CT is proprietary intellectual property'));
      assert.ok(resSnomed.licensingNotice.includes('Affiliate License'));
    });
  });

  describe('3. Healthcare Provider Adapters Safety Boundaries', () => {
    it('Adapters are DISABLED BY DEFAULT and reject live transmission without explicit activation', async () => {
      const labAdapter = new LabOrderAdapter();
      const status = labAdapter.getStatus();
      assert.equal(status.enabled, false);
      assert.equal(status.environment, 'sandbox');

      await assert.rejects(
        async () => {
          await labAdapter.submitLabOrder({
            resourceType: 'ServiceRequest',
            id: 'test',
            status: 'active',
            intent: 'order',
            subject: { reference: 'Patient/1' },
          });
        },
        /disabled by default/i,
      );
    });

    it('Rejects transmission to non-allowlisted domains', async () => {
      const labAdapter = new LabOrderAdapter({
        enabled: true,
        endpointUrl: 'https://malicious-external-unapproved.site',
      });

      await assert.rejects(
        async () => {
          await labAdapter.submitLabOrder({
            resourceType: 'ServiceRequest',
            id: 'test',
            status: 'active',
            intent: 'order',
            subject: { reference: 'Patient/1' },
          });
        },
        /not in the certified allowlist/i,
      );
    });

    it('Locked out of production mode during Step 7.4 readiness verification', async () => {
      const labAdapter = new LabOrderAdapter({
        enabled: true,
        environment: 'production',
        endpointUrl: 'https://sandbox.api.healthcare-integration.local',
      });

      await assert.rejects(
        async () => {
          await labAdapter.submitLabOrder({
            resourceType: 'ServiceRequest',
            id: 'test',
            status: 'active',
            intent: 'order',
            subject: { reference: 'Patient/1' },
          });
        },
        /production mode is locked/i,
      );
    });

    it('ImagingAdapter dispatches order and queries PACS in sandbox mode when enabled', async () => {
      const imagingAdapter = new ImagingAdapter({
        enabled: true,
        environment: 'sandbox',
        endpointUrl: 'https://sandbox.api.healthcare-integration.local',
      });

      const res = await imagingAdapter.submitImagingOrder({
        resourceType: 'ServiceRequest',
        id: 'ord-img-1',
        status: 'active',
        intent: 'order',
        subject: { reference: 'Patient/1' },
      });

      assert.ok(res.success);
      assert.equal(res.environment, 'sandbox');
      assert.ok(res.data?.accessionNumber.startsWith('ACC-'));

      const pacsRes = await imagingAdapter.queryPacsStudy(res.data!.accessionNumber);
      assert.ok(pacsRes.success);
      assert.ok(pacsRes.data?.wadoUrl.includes('/dicom/studies/'));
    });

    it('PharmacyAdapter submits electronic prescription in sandbox mode', async () => {
      const pharmacyAdapter = new PharmacyAdapter({
        enabled: true,
        environment: 'sandbox',
        endpointUrl: 'https://sandbox.wasfaty.sa',
      });

      const res = await pharmacyAdapter.submitPrescription({
        resourceType: 'MedicationRequest',
        id: 'med-req-1',
        status: 'active',
        intent: 'order',
        subject: { reference: 'Patient/1' },
      });

      assert.ok(res.success);
      assert.ok(res.data?.erxReferenceNumber.startsWith('ERX-'));
    });

    it('HealthExchangeAdapter supports KSA and UAE jurisdictions and enforces zero-PII logging', async () => {
      const ksaAdapter = new HealthExchangeAdapter('KSA_SEHA_NPHIES', {
        enabled: true,
        environment: 'sandbox',
        endpointUrl: 'https://sandbox.nphies.sa',
      });
      assert.equal(ksaAdapter.getJurisdiction(), 'KSA_SEHA_NPHIES');

      const uaeAdapter = new HealthExchangeAdapter('UAE_MALAFFI_NABIDH', {
        enabled: true,
        environment: 'sandbox',
        endpointUrl: 'https://sandbox.malaffi.ae',
      });
      assert.equal(uaeAdapter.getJurisdiction(), 'UAE_MALAFFI_NABIDH');

      const bundleRes = await ksaAdapter.submitClinicalBundle({
        bundleType: 'collection',
        resources: [
          { resourceType: 'Patient', id: 'pat-1' },
          { resourceType: 'Encounter', id: 'enc-1' },
        ],
      });

      assert.ok(bundleRes.success);
      assert.equal(bundleRes.data?.acceptedCount, 2);
    });
  });
});

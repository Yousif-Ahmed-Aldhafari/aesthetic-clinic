import { Injectable, BadRequestException } from '@nestjs/common';

export interface TerminologyValidationResult {
  system: string;
  code: string;
  isValidFormat: boolean;
  standardName: string;
  licensingNotice: string;
  normalizedCode?: string;
  suggestedDisplay?: string;
}

@Injectable()
export class TerminologyService {
  private static readonly ICD10_REGEX = /^[A-Z][0-9]{2}(\.[0-9]{1,4})?$/;
  private static readonly LOINC_REGEX = /^[0-9]{3,5}-[0-9]$/;
  private static readonly ATC_REGEX = /^[A-Z][0-9]{2}[A-Z]{2}[0-9]{2}$/;

  /**
   * Validates a clinical terminology code against standard syntax rules.
   * Discloses licensing prerequisites for SNOMED CT, LOINC, and national registries.
   */
  validateCode(system: string, code: string): TerminologyValidationResult {
    const cleanSystem = system.trim().toUpperCase();
    const cleanCode = code.trim().toUpperCase();

    if (!cleanCode) {
      throw new BadRequestException('Clinical code cannot be empty.');
    }

    switch (cleanSystem) {
      case 'ICD_10':
      case 'ICD-10':
      case 'ICD10':
      case 'ICD_10_AM': {
        const isValid = TerminologyService.ICD10_REGEX.test(cleanCode);
        return {
          system: 'ICD-10',
          code: cleanCode,
          isValidFormat: isValid,
          standardName: 'International Classification of Diseases, 10th Revision (WHO / National Modifications)',
          licensingNotice: 'ICD-10 is an open international standard by the World Health Organization. National modifications (e.g. ICD-10-AM in KSA) follow country-specific guidelines.',
          normalizedCode: cleanCode,
        };
      }

      case 'LOINC': {
        const isValid = TerminologyService.LOINC_REGEX.test(cleanCode);
        return {
          system: 'LOINC',
          code: cleanCode,
          isValidFormat: isValid,
          standardName: 'Logical Observation Identifiers Names and Codes (Regenstrief Institute)',
          licensingNotice: 'LOINC is available at no cost under Regenstrief license terms. Distribution in national HIE systems requires attribution.',
          normalizedCode: cleanCode,
        };
      }

      case 'ATC': {
        const isValid = TerminologyService.ATC_REGEX.test(cleanCode);
        return {
          system: 'WHO-ATC',
          code: cleanCode,
          isValidFormat: isValid,
          standardName: 'Anatomical Therapeutic Chemical Classification System (WHO)',
          licensingNotice: 'WHO Collaborating Centre for Drug Statistics Methodology guidelines apply.',
          normalizedCode: cleanCode,
        };
      }

      case 'SNOMED_CT':
      case 'SNOMED':
      case 'SNOMED-CT': {
        // SNOMED requires formal commercial / national affiliation license
        const isNumeric = /^[0-9]{6,18}$/.test(cleanCode);
        return {
          system: 'SNOMED CT',
          code: cleanCode,
          isValidFormat: isNumeric,
          standardName: 'Systematized Nomenclature of Medicine -- Clinical Terms (SNOMED International)',
          licensingNotice: 'DISCLAIMER: SNOMED CT is proprietary intellectual property of SNOMED International. Real-world clinical operation requires a formal Affiliate License issued through national release centers (e.g., KSA Seha / UAE MoHAP). Free-text entry does not constitute certified SNOMED mapping.',
          normalizedCode: cleanCode,
        };
      }

      default: {
        return {
          system: cleanSystem,
          code: cleanCode,
          isValidFormat: cleanCode.length > 0 && cleanCode.length <= 64,
          standardName: `Local / Proprietary Code System (${cleanSystem})`,
          licensingNotice: 'Local clinical code system. No national or international standard accreditation verified.',
          normalizedCode: cleanCode,
        };
      }
    }
  }

  /**
   * Common clinical vital signs LOINC dictionary reference
   */
  getLoincReference(observationType: string): { code: string; display: string; unit: string } | null {
    const references: Record<string, { code: string; display: string; unit: string }> = {
      SYSTOLIC_BP: { code: '8480-6', display: 'Systolic blood pressure', unit: 'mmHg' },
      DIASTOLIC_BP: { code: '8462-4', display: 'Diastolic blood pressure', unit: 'mmHg' },
      HEART_RATE: { code: '8867-4', display: 'Heart rate', unit: '/min' },
      RESPIRATORY_RATE: { code: '9279-1', display: 'Respiratory rate', unit: '/min' },
      BODY_TEMPERATURE: { code: '8310-5', display: 'Body temperature', unit: 'Cel' },
      OXYGEN_SATURATION: { code: '2708-6', display: 'Oxygen saturation in Arterial blood', unit: '%' },
      BODY_WEIGHT: { code: '29463-7', display: 'Body weight', unit: 'kg' },
      BODY_HEIGHT: { code: '8302-2', display: 'Body height', unit: 'cm' },
      BMI: { code: '39156-5', display: 'Body mass index', unit: 'kg/m2' },
    };
    return references[observationType] || null;
  }
}

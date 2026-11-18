import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidFdiToothNumber,
  isValidSupernumeraryIdentifier,
  PERMANENT_FDI_TEETH,
  PRIMARY_FDI_TEETH,
  fdiToUniversal,
  universalToFdi,
  fdiToPalmer,
  palmerToFdi,
  getToothMetadata,
  validateSurfacesForTooth,
  calculateClinicalAttachmentLevel,
  validatePeriodontalSiteValues,
} from '../src/dentistry/tooth-numbering.js';

describe('Dental Informatics: Tooth Numbering & Surface Engine', () => {
  describe('FDI ISO 3950 Numbering Validation', () => {
    it('accepts all 32 valid permanent teeth (quadrants 1-4, positions 1-8)', () => {
      assert.equal(PERMANENT_FDI_TEETH.length, 32);
      for (const tooth of PERMANENT_FDI_TEETH) {
        assert.equal(isValidFdiToothNumber(tooth), true, `Tooth ${tooth} should be valid permanent FDI`);
      }
    });

    it('accepts all 20 valid deciduous teeth (quadrants 5-8, positions 1-5)', () => {
      assert.equal(PRIMARY_FDI_TEETH.length, 20);
      for (const tooth of PRIMARY_FDI_TEETH) {
        assert.equal(isValidFdiToothNumber(tooth), true, `Tooth ${tooth} should be valid primary FDI`);
      }
    });

    it('rejects invalid quadrant/position combinations', () => {
      const invalidCodes = [
        0, 10, 19, 20, 29, 30, 39, 40, 49, // Position 9 and 0 in permanent quadrants
        50, 56, 57, 58, 59,                // Position 6-9 in primary Q5
        60, 66, 67, 68, 69,                // Position 6-9 in primary Q6
        70, 76, 77, 78, 79,                // Position 6-9 in primary Q7
        80, 86, 87, 88, 89,                // Position 6-9 in primary Q8
        91, 92, 95, 99, 100, -11, NaN,     // Non-existent quadrants
      ];

      for (const code of invalidCodes) {
        assert.equal(isValidFdiToothNumber(code), false, `Code ${code} must be rejected`);
      }
    });

    it('validates supernumerary notation extensions', () => {
      assert.equal(isValidSupernumeraryIdentifier(11, '11-S'), true);
      assert.equal(isValidSupernumeraryIdentifier(21, 'MESIODENS'), true);
      assert.equal(isValidSupernumeraryIdentifier(18, 'DISTOMOLAR_4TH'), true);
      assert.equal(isValidSupernumeraryIdentifier(19, 'INVALID_TOOTH'), false); // Invalid base FDI
      assert.equal(isValidSupernumeraryIdentifier(11, 'x'), false); // Too short
    });
  });

  describe('Universal Numbering System Bi-Directional Mapping', () => {
    it('accurately maps all 32 permanent teeth between FDI and Universal', () => {
      for (const fdi of PERMANENT_FDI_TEETH) {
        const universal = fdiToUniversal(fdi);
        const roundTripFdi = universalToFdi(universal);
        assert.equal(roundTripFdi, fdi, `Round-trip mismatch for FDI ${fdi} -> Universal ${universal}`);
      }
    });

    it('accurately maps all 20 primary teeth between FDI and Universal', () => {
      for (const fdi of PRIMARY_FDI_TEETH) {
        const universal = fdiToUniversal(fdi);
        const roundTripFdi = universalToFdi(universal);
        assert.equal(roundTripFdi, fdi, `Round-trip mismatch for FDI ${fdi} -> Universal ${universal}`);
      }
    });

    it('handles canonical corner cases (tooth 1, 16, 17, 32, A, T)', () => {
      assert.equal(universalToFdi('1'), 18);   // Upper Right 3rd Molar
      assert.equal(universalToFdi('16'), 28);  // Upper Left 3rd Molar
      assert.equal(universalToFdi('17'), 38);  // Lower Left 3rd Molar
      assert.equal(universalToFdi('32'), 48);  // Lower Right 3rd Molar
      assert.equal(universalToFdi('A'), 55);   // Upper Right 2nd Primary Molar
      assert.equal(universalToFdi('T'), 85);   // Lower Right 2nd Primary Molar
      assert.equal(fdiToUniversal(11), '8');   // Upper Right Central Incisor
      assert.equal(fdiToUniversal(21), '9');   // Upper Left Central Incisor
    });

    it('rejects invalid Universal identifiers', () => {
      assert.throws(() => universalToFdi('0'), /Invalid Universal/);
      assert.throws(() => universalToFdi('33'), /Invalid Universal/);
      assert.throws(() => universalToFdi('U'), /Invalid Universal/);
      assert.throws(() => universalToFdi('Z'), /Invalid Universal/);
    });
  });

  describe('Palmer Notation Bi-Directional Mapping', () => {
    it('correctly maps permanent teeth to quadrant bracket notation', () => {
      assert.equal(fdiToPalmer(18), '8┘'); // Upper Right 8
      assert.equal(fdiToPalmer(21), '└1'); // Upper Left 1
      assert.equal(fdiToPalmer(36), '┌6'); // Lower Left 6
      assert.equal(fdiToPalmer(43), '3┐'); // Lower Right 3
    });

    it('correctly maps primary teeth to letter bracket notation', () => {
      assert.equal(fdiToPalmer(51), 'A┘'); // Upper Right Deciduous Central Incisor
      assert.equal(fdiToPalmer(65), '└E'); // Upper Left Deciduous 2nd Molar
      assert.equal(fdiToPalmer(73), '┌C'); // Lower Left Deciduous Canine
      assert.equal(fdiToPalmer(84), 'D┐'); // Lower Right Deciduous 1st Molar
    });

    it('round-trips Palmer notation accurately', () => {
      assert.equal(palmerToFdi('8┘'), 18);
      assert.equal(palmerToFdi('└1'), 21);
      assert.equal(palmerToFdi('┌6'), 36);
      assert.equal(palmerToFdi('3┐'), 43);
      assert.equal(palmerToFdi('A┘', true), 51);
      assert.equal(palmerToFdi('└E', true), 65);
    });
  });

  describe('Anatomical Metadata & Surface Compatibility', () => {
    it('correctly identifies patient anatomical side vs screen view', () => {
      // Patient Right teeth (Quadrants 1, 4, 5, 8)
      assert.equal(getToothMetadata(11).patientSide, 'RIGHT');
      assert.equal(getToothMetadata(46).patientSide, 'RIGHT');
      assert.equal(getToothMetadata(55).patientSide, 'RIGHT');
      
      // Patient Left teeth (Quadrants 2, 3, 6, 7)
      assert.equal(getToothMetadata(21).patientSide, 'LEFT');
      assert.equal(getToothMetadata(36).patientSide, 'LEFT');
      assert.equal(getToothMetadata(65).patientSide, 'LEFT');
    });

    it('distinguishes anterior incisal from posterior occlusal surfaces', () => {
      const centralIncisor = getToothMetadata(11);
      assert.equal(centralIncisor.isAnterior, true);
      assert.equal(centralIncisor.validSurfaces.includes('INCISAL'), true);
      assert.equal(centralIncisor.validSurfaces.includes('OCCLUSAL'), false);

      const firstMolar = getToothMetadata(16);
      assert.equal(firstMolar.isAnterior, false);
      assert.equal(firstMolar.validSurfaces.includes('OCCLUSAL'), true);
      assert.equal(firstMolar.validSurfaces.includes('INCISAL'), false);
    });

    it('enforces surface validation rules', () => {
      // Anterior tooth with INCISAL -> valid
      const res1 = validateSurfacesForTooth(11, ['MESIAL', 'INCISAL']);
      assert.equal(res1.valid, true);

      // Anterior tooth with OCCLUSAL -> invalid
      const res2 = validateSurfacesForTooth(11, ['MESIAL', 'OCCLUSAL']);
      assert.equal(res2.valid, false);
      assert.match(res2.reason!, /anterior tooth and cannot have an OCCLUSAL surface/);

      // Posterior tooth with INCISAL -> invalid
      const res3 = validateSurfacesForTooth(16, ['OCCLUSAL', 'INCISAL']);
      assert.equal(res3.valid, false);
      assert.match(res3.reason!, /posterior tooth and cannot have an INCISAL surface/);
    });
  });

  describe('Periodontal Calculations & Sign Convention (CAL = PD + GM)', () => {
    it('calculates CAL correctly for gingival recession (GM > 0)', () => {
      // PD = 4mm, GM = +2mm recession -> CAL = 6mm
      const cal = calculateClinicalAttachmentLevel(4, 2);
      assert.equal(cal, 6);
    });

    it('calculates CAL correctly for gingival hyperplasia (GM < 0)', () => {
      // PD = 5mm, GM = -2mm pseudo-pocket/hyperplasia -> CAL = 3mm
      const cal = calculateClinicalAttachmentLevel(5, -2);
      assert.equal(cal, 3);
    });

    it('calculates CAL correctly for normal gingival margin at CEJ (GM = 0)', () => {
      const cal = calculateClinicalAttachmentLevel(3, 0);
      assert.equal(cal, 3);
    });

    it('validates periodontal parameter physiological bounds', () => {
      assert.equal(validatePeriodontalSiteValues({ probingDepthMm: 3, gingivalMarginMm: 0 }).valid, true);
      assert.equal(validatePeriodontalSiteValues({ probingDepthMm: 15, gingivalMarginMm: 5 }).valid, true);
      assert.equal(validatePeriodontalSiteValues({ probingDepthMm: 16, gingivalMarginMm: 0 }).valid, false);
      assert.equal(validatePeriodontalSiteValues({ probingDepthMm: -1, gingivalMarginMm: 0 }).valid, false);
      assert.equal(validatePeriodontalSiteValues({ probingDepthMm: 4, gingivalMarginMm: 12 }).valid, false);
      assert.equal(validatePeriodontalSiteValues({ probingDepthMm: 4, gingivalMarginMm: -12 }).valid, false);
    });
  });
});

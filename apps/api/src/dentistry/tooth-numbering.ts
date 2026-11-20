/**
 * Lamssa Dental Informatics — Tooth Numbering & Anatomical Surface Engine
 *
 * Implements authoritative standards:
 * - FDI World Dental Federation two-digit notation (ISO 3950) — Canonical storage standard
 * - Universal Numbering System (American Dental Association) — Bi-directional validated mapping
 * - Palmer Notation — Bi-directional quadrant mapping
 * - Anatomical surface definitions distinguishing anterior (Incisal) and posterior (Occlusal) teeth
 * - Periodontal six-site calculation standard (AAP/EFP convention: CAL = PD + GM)
 */

export type DentitionScope = 'PERMANENT' | 'PRIMARY' | 'MIXED';

export type ToothSurfaceCode =
  | 'MESIAL'
  | 'DISTAL'
  | 'OCCLUSAL'
  | 'INCISAL'
  | 'BUCCAL'
  | 'FACIAL'
  | 'LINGUAL'
  | 'PALATAL'
  | 'CERVICAL'
  | 'WHOLE_TOOTH';

export type PeriodontalSiteCode =
  | 'MESIO_BUCCAL'
  | 'MID_BUCCAL'
  | 'DISTO_BUCCAL'
  | 'MESIO_LINGUAL'
  | 'MID_LINGUAL'
  | 'DISTO_LINGUAL';

export interface ToothMetadata {
  fdiNumber: number;
  universalNumber: string;
  palmerNotation: string;
  arch: 'MAXILLARY' | 'MANDIBULAR';
  quadrant: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  position: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  isDeciduous: boolean;
  isAnterior: boolean;
  patientSide: 'RIGHT' | 'LEFT';
  englishName: string;
  arabicName: string;
  validSurfaces: ToothSurfaceCode[];
}

/**
 * Validates whether an integer is a valid FDI ISO 3950 tooth code.
 *
 * Permanent: Quadrants 1-4, Positions 1-8 (11-18, 21-28, 31-38, 41-48)
 * Primary (Deciduous): Quadrants 5-8, Positions 1-5 (51-55, 61-65, 71-75, 81-85)
 *
 * Explicitly rejects invalid values such as 19, 29, 49, 56, 86, etc.
 */
export function isValidFdiToothNumber(code: number): boolean {
  if (!Number.isInteger(code)) return false;
  const quadrant = Math.floor(code / 10);
  const position = code % 10;

  if (quadrant >= 1 && quadrant <= 4) {
    return position >= 1 && position <= 8;
  }
  if (quadrant >= 5 && quadrant <= 8) {
    return position >= 1 && position <= 5;
  }
  return false;
}

/**
 * Validates supernumerary notation.
 * Standard format: closest FDI tooth number + optional alphanumeric identifier
 * e.g., FDI 11 + "11-S", FDI 21 + "MESIODENS"
 */
export function isValidSupernumeraryIdentifier(fdiNumber: number, identifier?: string): boolean {
  if (!isValidFdiToothNumber(fdiNumber)) return false;
  if (!identifier) return true;
  return /^[A-Za-z0-9\-_]{2,32}$/.test(identifier);
}

// Canonical permanent FDI teeth (32 teeth)
export const PERMANENT_FDI_TEETH: readonly number[] = Object.freeze([
  // Maxillary Right (Q1) & Left (Q2)
  18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
  // Mandibular Left (Q3) & Right (Q4)
  48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38,
]);

// Canonical deciduous FDI teeth (20 teeth)
export const PRIMARY_FDI_TEETH: readonly number[] = Object.freeze([
  // Maxillary Right (Q5) & Left (Q6)
  55, 54, 53, 52, 51, 61, 62, 63, 64, 65,
  // Mandibular Left (Q7) & Right (Q8)
  85, 84, 83, 82, 81, 71, 72, 73, 74, 75,
]);

// Universal Numbering System mapping: FDI -> Universal
const FDI_TO_UNIVERSAL: Readonly<Record<number, string>> = Object.freeze({
  // Permanent Maxillary
  18: '1',  17: '2',  16: '3',  15: '4',  14: '5',  13: '6',  12: '7',  11: '8',
  21: '9',  22: '10', 23: '11', 24: '12', 25: '13', 26: '14', 27: '15', 28: '16',
  // Permanent Mandibular
  38: '17', 37: '18', 36: '19', 35: '20', 34: '21', 33: '22', 32: '23', 31: '24',
  41: '25', 42: '26', 43: '27', 44: '28', 45: '29', 46: '30', 47: '31', 48: '32',
  // Deciduous Maxillary
  55: 'A',  54: 'B',  53: 'C',  52: 'D',  51: 'E',
  61: 'F',  62: 'G',  63: 'H',  64: 'I',  65: 'J',
  // Deciduous Mandibular
  75: 'K',  74: 'L',  73: 'M',  72: 'N',  71: 'O',
  81: 'P',  82: 'Q',  83: 'R',  84: 'S',  85: 'T',
});

// Reverse mapping: Universal -> FDI
const UNIVERSAL_TO_FDI: Readonly<Record<string, number>> = Object.freeze(
  Object.entries(FDI_TO_UNIVERSAL).reduce<Record<string, number>>((acc, [fdi, uni]) => {
    acc[uni] = Number(fdi);
    return acc;
  }, {})
);

// Palmer notation quadrant symbols: UR: ┘, UL: └, LL: ┌, LR: ┐
const PALMER_LETTERS = ['A', 'B', 'C', 'D', 'E'];

export function fdiToPalmer(fdiNumber: number): string {
  if (!isValidFdiToothNumber(fdiNumber)) {
    throw new Error(`Invalid FDI tooth number: ${fdiNumber}`);
  }
  const quadrant = Math.floor(fdiNumber / 10);
  const position = fdiNumber % 10;
  const isDeciduous = quadrant >= 5;
  const posLabel = isDeciduous ? PALMER_LETTERS[position - 1] : String(position);

  switch (quadrant) {
    case 1:
    case 5:
      return `${posLabel}┘`; // Upper Right
    case 2:
    case 6:
      return `└${posLabel}`; // Upper Left
    case 3:
    case 7:
      return `┌${posLabel}`; // Lower Left
    case 4:
    case 8:
      return `${posLabel}┐`; // Lower Right
    default:
      throw new Error(`Invalid quadrant: ${quadrant}`);
  }
}

export function palmerToFdi(palmer: string, isDeciduous = false): number {
  const trimmed = palmer.trim();
  let quadrant = 0;
  let posChar = '';

  if (trimmed.endsWith('┘')) {
    quadrant = isDeciduous ? 5 : 1;
    posChar = trimmed.slice(0, -1);
  } else if (trimmed.startsWith('└')) {
    quadrant = isDeciduous ? 6 : 2;
    posChar = trimmed.slice(1);
  } else if (trimmed.startsWith('┌')) {
    quadrant = isDeciduous ? 7 : 3;
    posChar = trimmed.slice(1);
  } else if (trimmed.endsWith('┐')) {
    quadrant = isDeciduous ? 8 : 4;
    posChar = trimmed.slice(0, -1);
  } else {
    throw new Error(`Unrecognized Palmer notation format: "${palmer}"`);
  }

  let position = 0;
  if (isDeciduous || PALMER_LETTERS.includes(posChar.toUpperCase())) {
    quadrant = quadrant <= 4 ? quadrant + 4 : quadrant;
    position = PALMER_LETTERS.indexOf(posChar.toUpperCase()) + 1;
  } else {
    position = Number.parseInt(posChar, 10);
  }

  const fdi = quadrant * 10 + position;
  if (!isValidFdiToothNumber(fdi)) {
    throw new Error(`Palmer "${palmer}" mapped to invalid FDI number: ${fdi}`);
  }
  return fdi;
}

export function fdiToUniversal(fdiNumber: number): string {
  const uni = FDI_TO_UNIVERSAL[fdiNumber];
  if (!uni) throw new Error(`Invalid FDI tooth number for Universal mapping: ${fdiNumber}`);
  return uni;
}

export function universalToFdi(universalCode: string): number {
  const normalized = universalCode.trim().toUpperCase();
  const fdi = UNIVERSAL_TO_FDI[normalized];
  if (!fdi) throw new Error(`Invalid Universal tooth identifier: "${universalCode}"`);
  return fdi;
}

const TOOTH_NAMES_EN: Record<number, string> = {
  1: 'Central Incisor',
  2: 'Lateral Incisor',
  3: 'Canine',
  4: 'First Premolar',
  5: 'Second Premolar',
  6: 'First Molar',
  7: 'Second Molar',
  8: 'Third Molar (Wisdom Tooth)',
};

const DECIDUOUS_NAMES_EN: Record<number, string> = {
  1: 'Primary Central Incisor',
  2: 'Primary Lateral Incisor',
  3: 'Primary Canine',
  4: 'Primary First Molar',
  5: 'Primary Second Molar',
};

const TOOTH_NAMES_AR: Record<number, string> = {
  1: 'القاطع المركزي',
  2: 'القاطع الجانبي',
  3: 'الناب',
  4: 'الضاحك الأول',
  5: 'الضاحك الثاني',
  6: 'الضرس الأول',
  7: 'الضرس الثاني',
  8: 'ضرس العقل (الضرس الثالث)',
};

const DECIDUOUS_NAMES_AR: Record<number, string> = {
  1: 'القاطع اللبني المركزي',
  2: 'القاطع اللبني الجانبي',
  3: 'الناب اللبني',
  4: 'الضرس اللبني الأول',
  5: 'الضرس اللبني الثاني',
};

/**
 * Returns comprehensive anatomical metadata for an FDI tooth number.
 */
export function getToothMetadata(fdiNumber: number): ToothMetadata {
  if (!isValidFdiToothNumber(fdiNumber)) {
    throw new Error(`Invalid FDI tooth number: ${fdiNumber}`);
  }

  const quadrant = Math.floor(fdiNumber / 10) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  const position = (fdiNumber % 10) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  const isDeciduous = quadrant >= 5;
  const arch: 'MAXILLARY' | 'MANDIBULAR' = [1, 2, 5, 6].includes(quadrant) ? 'MAXILLARY' : 'MANDIBULAR';
  const patientSide: 'RIGHT' | 'LEFT' = [1, 4, 5, 8].includes(quadrant) ? 'RIGHT' : 'LEFT';
  
  // Incisors (pos 1-2) and canines (pos 3) are anterior; premolars and molars are posterior
  const isAnterior = position <= 3;

  // Anterior teeth have INCISAL edges; posterior teeth have OCCLUSAL biting surfaces.
  // Lingual is mandibular; Palatal is maxillary (both treated under LINGUAL/PALATAL in clinical UI)
  const validSurfaces: ToothSurfaceCode[] = [
    'MESIAL',
    'DISTAL',
    isAnterior ? 'INCISAL' : 'OCCLUSAL',
    'BUCCAL',
    'LINGUAL',
    'CERVICAL',
    'WHOLE_TOOTH',
  ];

  const universalNumber = FDI_TO_UNIVERSAL[fdiNumber]!;
  const palmerNotation = fdiToPalmer(fdiNumber);
  const englishName = isDeciduous ? DECIDUOUS_NAMES_EN[position]! : TOOTH_NAMES_EN[position]!;
  const arabicName = isDeciduous ? DECIDUOUS_NAMES_AR[position]! : TOOTH_NAMES_AR[position]!;

  return {
    fdiNumber,
    universalNumber,
    palmerNotation,
    arch,
    quadrant,
    position,
    isDeciduous,
    isAnterior,
    patientSide,
    englishName,
    arabicName,
    validSurfaces,
  };
}

/**
 * Validates that requested surfaces are anatomically valid for the specific tooth.
 * e.g., Anterior teeth cannot have an OCCLUSAL surface; posterior teeth cannot have an INCISAL surface.
 */
export function validateSurfacesForTooth(fdiNumber: number, surfaces: string[]): { valid: boolean; reason?: string } {
  if (!isValidFdiToothNumber(fdiNumber)) {
    return { valid: false, reason: `Invalid FDI tooth number: ${fdiNumber}` };
  }
  const meta = getToothMetadata(fdiNumber);

  for (const s of surfaces) {
    const upper = s.toUpperCase() as ToothSurfaceCode;
    if (upper === 'OCCLUSAL' && meta.isAnterior) {
      return {
        valid: false,
        reason: `Tooth FDI ${fdiNumber} (${meta.englishName}) is an anterior tooth and cannot have an OCCLUSAL surface. Use INCISAL instead.`,
      };
    }
    if (upper === 'INCISAL' && !meta.isAnterior) {
      return {
        valid: false,
        reason: `Tooth FDI ${fdiNumber} (${meta.englishName}) is a posterior tooth and cannot have an INCISAL surface. Use OCCLUSAL instead.`,
      };
    }
    if (!meta.validSurfaces.includes(upper) && upper !== 'FACIAL' && upper !== 'PALATAL') {
      return { valid: false, reason: `Surface "${s}" is not valid for tooth ${fdiNumber}` };
    }
  }

  return { valid: true };
}

/**
 * Periodontal calculation and validation.
 *
 * Clinical Attachment Level (CAL) formula:
 * CAL = Probing Depth (PD) + Gingival Margin (GM)
 *
 * Convention:
 * - PD >= 0 mm (pocket depth)
 * - GM > 0: Gingival recession (root exposed, increases attachment loss)
 * - GM < 0: Gingival hyperplasia / pseudo-pocket (decreases apparent attachment loss)
 * - GM = 0: Normal gingival margin at cementoenamel junction (CEJ)
 */
export function calculateClinicalAttachmentLevel(probingDepthMm: number, gingivalMarginMm: number): number {
  return probingDepthMm + gingivalMarginMm;
}

export function validatePeriodontalSiteValues(params: {
  probingDepthMm: number;
  gingivalMarginMm: number;
}): { valid: boolean; reason?: string } {
  const { probingDepthMm, gingivalMarginMm } = params;

  if (probingDepthMm < 0 || probingDepthMm > 15) {
    return { valid: false, reason: `Probing depth (${probingDepthMm} mm) must be between 0 and 15 mm.` };
  }
  if (gingivalMarginMm < -10 || gingivalMarginMm > 10) {
    return { valid: false, reason: `Gingival margin (${gingivalMarginMm} mm) must be between -10 and +10 mm.` };
  }

  return { valid: true };
}

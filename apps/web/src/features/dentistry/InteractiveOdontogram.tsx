import React, { useState } from 'react';
import type {
  DentalOdontogramItem,
  DentalToothFindingItem,
  ToothCondition,
  ToothNumberingSystem,
  ToothSurface,
  DentitionType,
} from './types';

export interface InteractiveOdontogramProps {
  odontogram: DentalOdontogramItem;
  readOnly?: boolean;
  onSaveFinding?: (finding: DentalToothFindingItem) => Promise<void>;
  numberingSystem?: ToothNumberingSystem;
}

// FDI to Universal Mapping
const FDI_TO_UNIVERSAL: Record<number, string> = {
  18: '1', 17: '2', 16: '3', 15: '4', 14: '5', 13: '6', 12: '7', 11: '8',
  21: '9', 22: '10', 23: '11', 24: '12', 25: '13', 26: '14', 27: '15', 28: '16',
  38: '17', 37: '18', 36: '19', 35: '20', 34: '21', 33: '22', 32: '23', 31: '24',
  41: '25', 42: '26', 43: '27', 44: '28', 45: '29', 46: '30', 47: '31', 48: '32',
  // Primary
  55: 'A', 54: 'B', 53: 'C', 52: 'D', 51: 'E',
  61: 'F', 62: 'G', 63: 'H', 64: 'I', 65: 'J',
  75: 'K', 74: 'L', 73: 'M', 72: 'N', 71: 'O',
  81: 'P', 82: 'Q', 83: 'R', 84: 'S', 85: 'T',
};

// Condition Arabic Labels & Colors
export const CONDITION_CONFIG: Record<
  ToothCondition,
  { labelAr: string; color: string; border: string }
> = {
  SOUND: { labelAr: 'سليم', color: '#f8fafc', border: '#94a3b8' },
  CARIES: { labelAr: 'تسوس / نخر نشط', color: '#ef4444', border: '#b91c1c' },
  RESTORATION: { labelAr: 'حشوة / ترميم', color: '#3b82f6', border: '#1d4ed8' },
  CROWN: { labelAr: 'تاج كامل', color: '#f59e0b', border: '#b45309' },
  ROOT_CANAL: { labelAr: 'علاج جذور وسحب عصب', color: '#a855f7', border: '#7e22ce' },
  IMPLANT: { labelAr: 'زرعة سنية', color: '#06b6d4', border: '#0e7490' },
  FRACTURE: { labelAr: 'كسر تاجي / جذري', color: '#f97316', border: '#c2410c' },
  IMPACTION: { labelAr: 'سن منطمر', color: '#eab308', border: '#a16207' },
  MISSING_TOOTH: { labelAr: 'مفقود خلقياً', color: '#64748b', border: '#334155' },
  EXTRACTION_HISTORY: { labelAr: 'مقلوع سابقاً', color: '#475569', border: '#1e293b' },
  UNERUPTED: { labelAr: 'غير بازغ بعد', color: '#94a3b8', border: '#64748b' },
  SUPERNUMERARY: { labelAr: 'سن زائد', color: '#ec4899', border: '#be185d' },
  OTHER: { labelAr: 'أخرى', color: '#8b5cf6', border: '#6d28d9' },
};

export const InteractiveOdontogram: React.FC<InteractiveOdontogramProps> = ({
  odontogram,
  readOnly = false,
  onSaveFinding,
  numberingSystem = 'FDI_ISO_3950',
}) => {
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null);
  const [condition, setCondition] = useState<ToothCondition>('CARIES');
  const [surfaces, setSurfaces] = useState<ToothSurface[]>(['OCCLUSAL']);
  const [severity, setSeverity] = useState<'MILD' | 'MODERATE' | 'SEVERE'>('MODERATE');
  const [description, setDescription] = useState('');
  const [dentitionView, setDentitionView] = useState<DentitionType>('PERMANENT');
  const [saving, setSaving] = useState(false);

  // Quadrants definition:
  // Patient Right (Screen Left): Maxillary Q1, Mandibular Q4
  // Patient Left (Screen Right): Maxillary Q2, Mandibular Q3
  const permanentUpperRight = [18, 17, 16, 15, 14, 13, 12, 11];
  const permanentUpperLeft = [21, 22, 23, 24, 25, 26, 27, 28];
  const permanentLowerRight = [48, 47, 46, 45, 44, 43, 42, 41];
  const permanentLowerLeft = [31, 32, 33, 34, 35, 36, 37, 38];

  const primaryUpperRight = [55, 54, 53, 52, 51];
  const primaryUpperLeft = [61, 62, 63, 64, 65];
  const primaryLowerRight = [85, 84, 83, 82, 81];
  const primaryLowerLeft = [71, 72, 73, 74, 75];

  const isAnterior = (toothFdi: number) => {
    const unit = toothFdi % 10;
    return unit >= 1 && unit <= 3;
  };

  const getToothFinding = (toothFdi: number) => {
    return (odontogram.findings ?? []).find((f) => f.toothNumberFdi === toothFdi);
  };

  const getDisplayNumber = (toothFdi: number) => {
    if (numberingSystem === 'UNIVERSAL') {
      return FDI_TO_UNIVERSAL[toothFdi] ?? toothFdi.toString();
    }
    if (numberingSystem === 'PALMER') {
      const q = Math.floor(toothFdi / 10);
      const num = toothFdi % 10;
      return `${num} (Q${q})`;
    }
    return toothFdi.toString();
  };

  const handleToothClick = (toothFdi: number) => {
    setSelectedTooth(toothFdi);
    const existing = getToothFinding(toothFdi);
    if (existing) {
      setCondition(existing.condition);
      setSurfaces(existing.surfacesAffected);
      setSeverity(existing.severity ?? 'MODERATE');
      setDescription(existing.clinicalDescription ?? '');
    } else {
      setCondition('CARIES');
      setSurfaces([isAnterior(toothFdi) ? 'INCISAL' : 'OCCLUSAL']);
      setSeverity('MODERATE');
      setDescription('');
    }
  };

  const toggleSurface = (surf: ToothSurface) => {
    if (surfaces.includes(surf)) {
      setSurfaces(surfaces.filter((s) => s !== surf));
    } else {
      setSurfaces([...surfaces, surf]);
    }
  };

  const handleSave = async () => {
    if (!selectedTooth || !onSaveFinding) return;
    setSaving(true);
    try {
      await onSaveFinding({
        toothNumberFdi: selectedTooth,
        condition,
        surfacesAffected: surfaces,
        severity,
        clinicalDescription: description,
      });
      setSelectedTooth(null);
    } finally {
      setSaving(false);
    }
  };

  // Render SVG representation for a single tooth
  const renderToothSvg = (toothFdi: number) => {
    const finding = getToothFinding(toothFdi);
    const toothIsAnterior = isAnterior(toothFdi);
    const isSelected = selectedTooth === toothFdi;
    const condConfig = finding ? CONDITION_CONFIG[finding.condition] : null;

    // Check surfaces
    const hasSurface = (s: ToothSurface) => finding?.surfacesAffected?.includes(s);

    const isPatientRight = [1, 4, 5, 8].includes(Math.floor(toothFdi / 10));

    // Mesial is toward midline:
    // For patient right (screen left), midline is to the RIGHT (x = 35..50)
    // For patient left (screen right), midline is to the LEFT (x = 0..15)
    const mesialSurface: ToothSurface = 'MESIAL';
    const distalSurface: ToothSurface = 'DISTAL';
    const centerSurface: ToothSurface = toothIsAnterior ? 'INCISAL' : 'OCCLUSAL';
    const facialSurface: ToothSurface = 'BUCCAL';
    const lingualSurface: ToothSurface = 'LINGUAL';

    const mesialColor = hasSurface(mesialSurface) ? condConfig?.color ?? '#ef4444' : '#ffffff';
    const distalColor = hasSurface(distalSurface) ? condConfig?.color ?? '#ef4444' : '#ffffff';
    const centerColor = hasSurface(centerSurface) ? condConfig?.color ?? '#ef4444' : '#ffffff';
    const facialColor = hasSurface(facialSurface) ? condConfig?.color ?? '#ef4444' : '#ffffff';
    const lingualColor = hasSurface(lingualSurface) ? condConfig?.color ?? '#ef4444' : '#ffffff';

    const isMissing =
      finding?.condition === 'EXTRACTION_HISTORY' || finding?.condition === 'MISSING_TOOTH';
    const isCrown = finding?.condition === 'CROWN';

    return (
      <div
        key={toothFdi}
        className={`dental-tooth-cell ${isSelected ? 'selected' : ''} ${finding ? 'has-finding' : ''}`}
        onClick={() => handleToothClick(toothFdi)}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '4px',
          cursor: readOnly ? 'default' : 'pointer',
          border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0',
          borderRadius: '6px',
          background: isSelected ? '#eff6ff' : '#ffffff',
          minWidth: '42px',
        }}
        title={`السن ${getDisplayNumber(toothFdi)} (FDI: ${toothFdi}) ${finding ? `· ${CONDITION_CONFIG[finding.condition].labelAr}` : ''}`}
      >
        <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#334155', marginBottom: '2px' }}>
          {getDisplayNumber(toothFdi)}
        </span>

        <svg width="44" height="44" viewBox="0 0 50 50">
          {/* Facial / Buccal (Top trapezoid) */}
          <polygon
            points="5,5 45,5 35,15 15,15"
            fill={facialColor}
            stroke="#64748b"
            strokeWidth="1.5"
          />

          {/* Lingual / Palatal (Bottom trapezoid) */}
          <polygon
            points="15,35 35,35 45,45 5,45"
            fill={lingualColor}
            stroke="#64748b"
            strokeWidth="1.5"
          />

          {/* Left trapezoid */}
          <polygon
            points="5,5 15,15 15,35 5,45"
            fill={isPatientRight ? distalColor : mesialColor}
            stroke="#64748b"
            strokeWidth="1.5"
          />

          {/* Right trapezoid */}
          <polygon
            points="45,5 45,45 35,35 35,15"
            fill={isPatientRight ? mesialColor : distalColor}
            stroke="#64748b"
            strokeWidth="1.5"
          />

          {/* Center (Occlusal or Incisal) */}
          <rect
            x="15"
            y="15"
            width="20"
            height="20"
            fill={centerColor}
            stroke="#64748b"
            strokeWidth="1.5"
          />

          {/* Crown border overlay */}
          {isCrown && (
            <rect
              x="3"
              y="3"
              width="44"
              height="44"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="2.5"
              strokeDasharray="4 2"
            />
          )}

          {/* Missing X overlay */}
          {isMissing && (
            <g stroke="#475569" strokeWidth="2.5">
              <line x1="4" y1="4" x2="46" y2="46" />
              <line x1="46" y1="4" x2="4" y2="46" />
            </g>
          )}

          {/* Root canal indicator line */}
          {finding?.condition === 'ROOT_CANAL' && (
            <circle cx="25" cy="25" r="5" fill="#a855f7" />
          )}

          {/* Implant indicator */}
          {finding?.condition === 'IMPLANT' && (
            <circle cx="25" cy="25" r="5" fill="#06b6d4" stroke="#0e7490" strokeWidth="1.5" />
          )}
        </svg>

        {finding && (
          <span
            style={{
              fontSize: '10px',
              padding: '1px 3px',
              borderRadius: '3px',
              background: condConfig?.color ?? '#cbd5e1',
              color: '#ffffff',
              marginTop: '2px',
              maxWidth: '42px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {condConfig?.labelAr.slice(0, 5)}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="interactive-odontogram" style={{ direction: 'rtl' }}>
      {/* Dentition Toggle */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
          padding: '8px 12px',
          background: '#f8fafc',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
        }}
      >
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className={`cf-tab-button ${dentitionView === 'PERMANENT' ? 'active' : ''}`}
            onClick={() => setDentitionView('PERMANENT')}
          >
            🦷 الأسنان الدائمة (32 سن)
          </button>
          <button
            type="button"
            className={`cf-tab-button ${dentitionView === 'PRIMARY' ? 'active' : ''}`}
            onClick={() => setDentitionView('PRIMARY')}
          >
            👶 الأسنان اللبنية (20 سن)
          </button>
          <button
            type="button"
            className={`cf-tab-button ${dentitionView === 'MIXED' ? 'active' : ''}`}
            onClick={() => setDentitionView('MIXED')}
          >
            🔄 الإطباق المختلط
          </button>
        </div>

        <div style={{ fontSize: '13px', color: '#64748b' }}>
          نظام الترقيم: <b>{numberingSystem}</b> · التوجيه: <b>يمين المريض يسار الشاشة</b>
        </div>
      </div>

      {/* Anatomical Orientation Banner */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '4px 16px',
          background: '#f1f5f9',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: 'bold',
          color: '#475569',
          marginBottom: '8px',
        }}
      >
        <span>الجهة اليمنى للمريض (يمين الفك)</span>
        <span style={{ color: '#2563eb' }}>⟵ الخط الناصف (Midline) ⟶</span>
        <span>الجهة اليسرى للمريض (يسار الفك)</span>
      </div>

      {/* Main Arch Charts */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          padding: '16px',
          background: '#ffffff',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
        }}
      >
        {/* Upper Arch (Maxillary) */}
        <div>
          <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', marginBottom: '4px' }}>
            الفك العلوي (Maxilla)
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
            {/* Q1: Upper Right */}
            <div style={{ display: 'flex', gap: '4px' }}>
              {(dentitionView === 'PRIMARY' ? primaryUpperRight : permanentUpperRight).map(renderToothSvg)}
            </div>

            {/* Midline divider */}
            <div style={{ width: '2px', background: '#3b82f6', margin: '0 4px' }} />

            {/* Q2: Upper Left */}
            <div style={{ display: 'flex', gap: '4px' }}>
              {(dentitionView === 'PRIMARY' ? primaryUpperLeft : permanentUpperLeft).map(renderToothSvg)}
            </div>
          </div>
        </div>

        {/* Lower Arch (Mandibular) */}
        <div>
          <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', marginBottom: '4px' }}>
            الفك السفلي (Mandible)
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
            {/* Q4: Lower Right */}
            <div style={{ display: 'flex', gap: '4px' }}>
              {(dentitionView === 'PRIMARY' ? primaryLowerRight : permanentLowerRight).map(renderToothSvg)}
            </div>

            {/* Midline divider */}
            <div style={{ width: '2px', background: '#3b82f6', margin: '0 4px' }} />

            {/* Q3: Lower Left */}
            <div style={{ display: 'flex', gap: '4px' }}>
              {(dentitionView === 'PRIMARY' ? primaryLowerLeft : permanentLowerLeft).map(renderToothSvg)}
            </div>
          </div>
        </div>
      </div>

      {/* Tooth Inspection & Finding Editor */}
      {selectedTooth && !readOnly && (
        <div
          style={{
            marginTop: '1rem',
            padding: '16px',
            background: '#f8fafc',
            border: '2px solid #3b82f6',
            borderRadius: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h4 style={{ margin: 0, color: '#1e293b' }}>
              🦷 توثيق حالة السن {getDisplayNumber(selectedTooth)} (FDI: {selectedTooth})
            </h4>
            <button
              type="button"
              className="table-btn"
              onClick={() => setSelectedTooth(null)}
            >
              إلغاء
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
                الحالة السريرية للسن
              </label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as ToothCondition)}
                style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
              >
                {Object.entries(CONDITION_CONFIG).map(([key, conf]) => (
                  <option key={key} value={key}>
                    {conf.labelAr}
                  </option>
                ))}
              </select>

              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginTop: '12px', marginBottom: '4px' }}>
                شدة الحالة
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['MILD', 'MODERATE', 'SEVERE'] as const).map((s) => (
                  <label key={s} style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      type="radio"
                      name="severity"
                      value={s}
                      checked={severity === s}
                      onChange={() => setSeverity(s)}
                    />
                    {s === 'MILD' ? 'بسيطة' : s === 'MODERATE' ? 'متوسطة' : 'شديدة'}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
                السطوح المتأثرة
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                {(isAnterior(selectedTooth)
                  ? ['INCISAL', 'MESIAL', 'DISTAL', 'BUCCAL', 'LINGUAL', 'PALATAL']
                  : ['OCCLUSAL', 'MESIAL', 'DISTAL', 'BUCCAL', 'LINGUAL', 'PALATAL']
                ).map((surf) => (
                  <button
                    key={surf}
                    type="button"
                    onClick={() => toggleSurface(surf as ToothSurface)}
                    style={{
                      padding: '6px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      borderRadius: '4px',
                      border: '1px solid #94a3b8',
                      background: surfaces.includes(surf as ToothSurface) ? '#2563eb' : '#ffffff',
                      color: surfaces.includes(surf as ToothSurface) ? '#ffffff' : '#334155',
                      cursor: 'pointer',
                    }}
                  >
                    {surf === 'OCCLUSAL'
                      ? 'إطباقي (O)'
                      : surf === 'INCISAL'
                      ? 'قاطع (I)'
                      : surf === 'MESIAL'
                      ? 'أنسي (M)'
                      : surf === 'DISTAL'
                      ? 'وحشي (D)'
                      : surf === 'BUCCAL'
                      ? 'دهليزي (B)'
                      : surf === 'LINGUAL'
                      ? 'لساني (L)'
                      : 'حنكي (P)'}
                  </button>
                ))}
              </div>

              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginTop: '12px', marginBottom: '4px' }}>
                ملاحظات الفحص السريري
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="تفاصيل الفحص، عمق النخر، الأعراض..."
                style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
              />
            </div>
          </div>

          <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              className="primary-btn"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'جارٍ الحفظ...' : 'حفظ حالة السن'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import type {
  DentalOdontogramItem,
  DentalPeriodontalRecordItem,
  PeriodontalFurcationGrade,
  ToothMobilityGrade,
} from './types';

export interface PeriodontalGridProps {
  odontogram: DentalOdontogramItem;
  readOnly?: boolean;
  onSaveRecord?: (record: DentalPeriodontalRecordItem) => Promise<void>;
}

const SITES = [
  { key: 'DB', labelAr: 'وحشي دهليزي (DB)' },
  { key: 'B', labelAr: 'وسط دهليزي (B)' },
  { key: 'MB', labelAr: 'أنسي دهليزي (MB)' },
  { key: 'DL', labelAr: 'وحشي لساني (DL)' },
  { key: 'L', labelAr: 'وسط لساني (L)' },
  { key: 'ML', labelAr: 'أنسي لساني (ML)' },
];

export const PeriodontalGrid: React.FC<PeriodontalGridProps> = ({
  odontogram,
  readOnly = false,
  onSaveRecord,
}) => {
  const [selectedTooth, setSelectedTooth] = useState<number>(16);
  const [probingDepths, setProbingDepths] = useState<number[]>([3, 2, 3, 2, 2, 3]);
  const [gingivalMargins, setGingivalMargins] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [bop, setBop] = useState<boolean[]>([false, false, false, false, false, false]);
  const [suppuration, setSuppuration] = useState<boolean[]>([false, false, false, false, false, false]);
  const [furcation, setFurcation] = useState<PeriodontalFurcationGrade>('CLASS_0');
  const [mobility, setMobility] = useState<ToothMobilityGrade>('GRADE_0');
  const [plaque, setPlaque] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  // Available teeth in permanent dentition
  const permanentTeeth = [
    18, 17, 16, 15, 14, 13, 12, 11,
    21, 22, 23, 24, 25, 26, 27, 28,
    48, 47, 46, 45, 44, 43, 42, 41,
    31, 32, 33, 34, 35, 36, 37, 38,
  ];

  // Calculated CAL = PD + GM
  const calculatedCal = probingDepths.map((pd, idx) => pd + (gingivalMargins[idx] ?? 0));

  const handleSelectTooth = (toothFdi: number) => {
    setSelectedTooth(toothFdi);
    const existing = odontogram.periodontalRecords.find((p) => p.toothNumberFdi === toothFdi);
    if (existing) {
      setProbingDepths(existing.probingDepthsMm);
      setGingivalMargins(existing.gingivalMarginMm);
      setBop(existing.bleedingOnProbing);
      setSuppuration(existing.suppuration);
      setFurcation(existing.furcationGrade ?? 'CLASS_0');
      setMobility(existing.mobilityGrade ?? 'GRADE_0');
      setPlaque(existing.plaquePresent ?? false);
      setNotes(existing.notes ?? '');
    } else {
      setProbingDepths([3, 2, 3, 2, 2, 3]);
      setGingivalMargins([0, 0, 0, 0, 0, 0]);
      setBop([false, false, false, false, false, false]);
      setSuppuration([false, false, false, false, false, false]);
      setFurcation('CLASS_0');
      setMobility('GRADE_0');
      setPlaque(false);
      setNotes('');
    }
  };

  const handleSave = async () => {
    if (!onSaveRecord) return;
    setSaving(true);
    try {
      await onSaveRecord({
        toothNumberFdi: selectedTooth,
        probingDepthsMm: probingDepths,
        gingivalMarginMm: gingivalMargins,
        bleedingOnProbing: bop,
        suppuration,
        furcationGrade: furcation,
        mobilityGrade: mobility,
        plaquePresent: plaque,
        notes,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="periodontal-chart" style={{ direction: 'rtl' }}>
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
        <h4 style={{ margin: 0, color: '#1e293b' }}>
          📐 مخطط فحص دواعم السن السداسي (6-Site Periodontal Charting)
        </h4>
        <span style={{ fontSize: '13px', color: '#64748b' }}>
          قاعدة الحساب السريري: <b>CAL = Probing Depth (PD) + Gingival Margin (GM)</b>
        </span>
      </div>

      {/* Tooth Selector Pills */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', marginBottom: '4px' }}>
          اختر السن لإدخال قياسات دواعم السن:
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {permanentTeeth.map((tooth) => {
            const hasRecord = odontogram.periodontalRecords.some((p) => p.toothNumberFdi === tooth);
            const isSelected = selectedTooth === tooth;
            return (
              <button
                key={tooth}
                type="button"
                onClick={() => handleSelectTooth(tooth)}
                style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: isSelected ? 'bold' : 'normal',
                  border: isSelected ? '2px solid #2563eb' : '1px solid #cbd5e1',
                  background: isSelected ? '#eff6ff' : hasRecord ? '#dcfce7' : '#ffffff',
                  color: isSelected ? '#1e40af' : hasRecord ? '#166534' : '#334155',
                  cursor: 'pointer',
                }}
              >
                {tooth} {hasRecord ? '✓' : ''}
              </button>
            );
          })}
        </div>
      </div>

      {/* 6-Site Interactive Grid */}
      <div
        style={{
          padding: '16px',
          background: '#ffffff',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h5 style={{ margin: 0, fontSize: '15px', color: '#1e293b' }}>
            قياسات السن {selectedTooth}
          </h5>
          {odontogram.periodontalRecords.some((p) => p.toothNumberFdi === selectedTooth) && (
            <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: 'bold' }}>
              ✓ مسجل مسبقاً في هذا المخطط
            </span>
          )}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                <th style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'right' }}>المؤشر السريري</th>
                {SITES.map((site) => (
                  <th key={site.key} style={{ padding: '8px', border: '1px solid #cbd5e1' }}>
                    {site.labelAr}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Probing Depth */}
              <tr>
                <td style={{ padding: '8px', border: '1px solid #cbd5e1', fontWeight: 'bold', textAlign: 'right' }}>
                  عمق السبر (PD) مم
                </td>
                {probingDepths.map((pd, idx) => (
                  <td key={idx} style={{ padding: '4px', border: '1px solid #cbd5e1' }}>
                    <input
                      type="number"
                      min={0}
                      max={15}
                      value={pd}
                      disabled={readOnly}
                      onChange={(e) => {
                        const newPd = [...probingDepths];
                        newPd[idx] = Math.max(0, Math.min(15, parseInt(e.target.value) || 0));
                        setProbingDepths(newPd);
                      }}
                      style={{
                        width: '45px',
                        textAlign: 'center',
                        padding: '4px',
                        fontWeight: 'bold',
                        color: pd >= 4 ? '#b91c1c' : '#1e293b',
                        background: pd >= 4 ? '#fee2e2' : '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '4px',
                      }}
                    />
                  </td>
                ))}
              </tr>

              {/* Gingival Margin */}
              <tr>
                <td style={{ padding: '8px', border: '1px solid #cbd5e1', fontWeight: 'bold', textAlign: 'right' }}>
                  الحافة اللثوية (GM) مم (+ انحسار، - تضخم)
                </td>
                {gingivalMargins.map((gm, idx) => (
                  <td key={idx} style={{ padding: '4px', border: '1px solid #cbd5e1' }}>
                    <input
                      type="number"
                      min={-10}
                      max={10}
                      value={gm}
                      disabled={readOnly}
                      onChange={(e) => {
                        const newGm = [...gingivalMargins];
                        newGm[idx] = Math.max(-10, Math.min(10, parseInt(e.target.value) || 0));
                        setGingivalMargins(newGm);
                      }}
                      style={{
                        width: '45px',
                        textAlign: 'center',
                        padding: '4px',
                        color: gm > 0 ? '#d97706' : gm < 0 ? '#2563eb' : '#1e293b',
                        border: '1px solid #cbd5e1',
                        borderRadius: '4px',
                      }}
                    />
                  </td>
                ))}
              </tr>

              {/* Clinical Attachment Level (CAL = PD + GM) */}
              <tr style={{ background: '#f8fafc' }}>
                <td style={{ padding: '8px', border: '1px solid #cbd5e1', fontWeight: 'bold', textAlign: 'right', color: '#1e40af' }}>
                  مستوى الالتصاق السريري (CAL = PD + GM)
                </td>
                {calculatedCal.map((cal, idx) => (
                  <td
                    key={idx}
                    style={{
                      padding: '8px',
                      border: '1px solid #cbd5e1',
                      fontWeight: 'bold',
                      color: cal >= 5 ? '#b91c1c' : cal >= 3 ? '#d97706' : '#166534',
                      background: cal >= 5 ? '#fef2f2' : 'transparent',
                    }}
                  >
                    {cal} مم
                  </td>
                ))}
              </tr>

              {/* Bleeding on Probing (BOP) */}
              <tr>
                <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'right' }}>
                  النزف عند السبر (BOP) 🩸
                </td>
                {bop.map((val, idx) => (
                  <td key={idx} style={{ padding: '4px', border: '1px solid #cbd5e1', background: val ? '#fee2e2' : 'transparent' }}>
                    <input
                      type="checkbox"
                      checked={val}
                      disabled={readOnly}
                      onChange={(e) => {
                        const newBop = [...bop];
                        newBop[idx] = e.target.checked;
                        setBop(newBop);
                      }}
                    />
                  </td>
                ))}
              </tr>

              {/* Suppuration */}
              <tr>
                <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'right' }}>
                  التقيّح (Suppuration) ⚠️
                </td>
                {suppuration.map((val, idx) => (
                  <td key={idx} style={{ padding: '4px', border: '1px solid #cbd5e1', background: val ? '#fef3c7' : 'transparent' }}>
                    <input
                      type="checkbox"
                      checked={val}
                      disabled={readOnly}
                      onChange={(e) => {
                        const newSup = [...suppuration];
                        newSup[idx] = e.target.checked;
                        setSuppuration(newSup);
                      }}
                    />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Mobility & Furcation */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginTop: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
              إصابة مفترق الجذور (Furcation)
            </label>
            <select
              value={furcation}
              disabled={readOnly}
              onChange={(e) => setFurcation(e.target.value as PeriodontalFurcationGrade)}
              style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
            >
              <option value="CLASS_0">الدرجة 0: سليم / لا توجد إصابة</option>
              <option value="CLASS_I">الدرجة I: إصابة أولية طفيفة</option>
              <option value="CLASS_II">الدرجة II: إصابة جزئية دون نفاذ كامل</option>
              <option value="CLASS_III">الدرجة III: نفاذ كامل للمسبار عبر المفترق</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
              حركة السن (Mobility)
            </label>
            <select
              value={mobility}
              disabled={readOnly}
              onChange={(e) => setMobility(e.target.value as ToothMobilityGrade)}
              style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
            >
              <option value="GRADE_0">الدرجة 0: حركة فيزيولوجية طبيعية</option>
              <option value="GRADE_1">الدرجة 1: حركة أفقية حتى 1 مم</option>
              <option value="GRADE_2">الدرجة 2: حركة أفقية أكثر من 1 مم</option>
              <option value="GRADE_3">الدرجة 3: حركة أفقية وعمودية (انغراز)</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', paddingTop: '20px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={plaque}
                disabled={readOnly}
                onChange={(e) => setPlaque(e.target.checked)}
              />
              وجود لويحة جرثومية (Plaque Index)
            </label>
          </div>
        </div>

        {/* Notes & Save Button */}
        <div style={{ marginTop: '16px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
            ملاحظات فحص دواعم السن
          </label>
          <input
            type="text"
            value={notes}
            disabled={readOnly}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="حالة الأنسجة اللثوية، استجابة العلاج، التوصيات..."
            style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', marginBottom: '12px' }}
          />

          {!readOnly && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="primary-btn"
                disabled={saving}
                onClick={handleSave}
              >
                {saving ? 'جارٍ الحفظ...' : `حفظ قياسات السن ${selectedTooth}`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

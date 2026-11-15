import React, { useState, useEffect, useCallback } from 'react';
import {
  listObservations,
  recordObservation,
  amendObservation,
  type ClinicalObservationItem,
  type ObservationType,
  type ClinicalProvenance,
} from './clinical-foundation-api';

interface VitalSignsObservationPanelProps {
  clinicId: string;
  patientId: string;
  encounterId?: string;
  csrfToken?: string;
  onRefreshSummary?: () => void;
}

const observationTypeLabels: Record<ObservationType, { label: string; unit: string }> = {
  BLOOD_PRESSURE_SYSTOLIC: { label: 'ضغط الدم الانقباضي (Systolic)', unit: 'mmHg' },
  BLOOD_PRESSURE_DIASTOLIC: { label: 'ضغط الدم الانبساطي (Diastolic)', unit: 'mmHg' },
  HEART_RATE: { label: 'معدل ضربات القلب (Heart Rate)', unit: 'bpm' },
  RESPIRATORY_RATE: { label: 'معدل التنفس (Respiratory Rate)', unit: '/min' },
  BODY_TEMPERATURE: { label: 'درجة الحرارة (Temperature)', unit: '°C' },
  OXYGEN_SATURATION: { label: 'تشبع الأكسجين (SpO2)', unit: '%' },
  WEIGHT: { label: 'الوزن (Weight)', unit: 'kg' },
  HEIGHT: { label: 'الطول (Height)', unit: 'cm' },
  BODY_MASS_INDEX: { label: 'مؤشر كتلة الجسم (BMI)', unit: 'kg/m²' },
  GENERAL_OBSERVATION: { label: 'ملاحظة سريرية عامة', unit: '' },
};

export const VitalSignsObservationPanel: React.FC<VitalSignsObservationPanelProps> = ({
  clinicId,
  patientId,
  encounterId,
  csrfToken,
  onRefreshSummary,
}) => {
  const [observations, setObservations] = useState<ClinicalObservationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form State
  const [selectedType, setSelectedType] = useState<ObservationType>('BLOOD_PRESSURE_SYSTOLIC');
  const [numericValue, setNumericValue] = useState<string>('');
  const [unit, setUnit] = useState<string>('mmHg');
  const [textValue, setTextValue] = useState<string>('');
  const [provenance, setProvenance] = useState<ClinicalProvenance>('CLINICIAN_MEASURED');
  const [interpretation, setInterpretation] = useState<string>('');

  // Quick Vitals Entry State
  const [quickWeight, setQuickWeight] = useState<string>('');
  const [quickHeight, setQuickHeight] = useState<string>('');

  // Amendment Modal State
  const [amendingItem, setAmendingItem] = useState<ClinicalObservationItem | null>(null);
  const [amendmentReason, setAmendmentReason] = useState<string>('');
  const [amendNumericValue, setAmendNumericValue] = useState<string>('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listObservations(clinicId, patientId, { encounterId }, csrfToken);
      setObservations(res.items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل المؤشرات الحيوية');
    } finally {
      setLoading(false);
    }
  }, [clinicId, patientId, encounterId, csrfToken]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleTypeChange = (type: ObservationType) => {
    setSelectedType(type);
    setUnit(observationTypeLabels[type].unit);
  };

  const calculateQuickBmi = (): number | null => {
    const w = parseFloat(quickWeight);
    const h = parseFloat(quickHeight);
    if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
      const hm = h / 100;
      return Math.round((w / (hm * hm)) * 100) / 100;
    }
    return null;
  };

  const handleRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const numVal = numericValue !== '' ? parseFloat(numericValue) : undefined;
    if (selectedType !== 'GENERAL_OBSERVATION' && (numVal === undefined || isNaN(numVal))) {
      setError('يرجى إدخال قيمة عددية صالحة للقياس الحيوي');
      return;
    }

    try {
      await recordObservation(
        clinicId,
        patientId,
        {
          encounterId,
          observationType: selectedType,
          numericValue: numVal,
          textValue: textValue || undefined,
          unit,
          provenance,
          interpretation: interpretation || undefined,
        },
        csrfToken,
      );

      setSuccessMessage('تم تسجيل القياس الحيوي بنجاح');
      setNumericValue('');
      setTextValue('');
      setInterpretation('');
      await loadData();
      if (onRefreshSummary) onRefreshSummary();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'فشل تسجيل القياس الحيوي');
    }
  };

  const handleRecordQuickBmi = async () => {
    const bmi = calculateQuickBmi();
    if (!bmi) return;

    setError(null);
    try {
      // Record Weight
      if (quickWeight) {
        await recordObservation(
          clinicId,
          patientId,
          {
            encounterId,
            observationType: 'WEIGHT',
            numericValue: parseFloat(quickWeight),
            unit: 'kg',
            provenance: 'CLINICIAN_MEASURED',
          },
          csrfToken,
        );
      }
      // Record Height
      if (quickHeight) {
        await recordObservation(
          clinicId,
          patientId,
          {
            encounterId,
            observationType: 'HEIGHT',
            numericValue: parseFloat(quickHeight),
            unit: 'cm',
            provenance: 'CLINICIAN_MEASURED',
          },
          csrfToken,
        );
      }
      // Record BMI
      await recordObservation(
        clinicId,
        patientId,
        {
          encounterId,
          observationType: 'BODY_MASS_INDEX',
          numericValue: bmi,
          unit: 'kg/m²',
          provenance: 'CLINICIAN_MEASURED',
          interpretation:
            bmi < 18.5
              ? 'نقص في الوزن (Underweight)'
              : bmi < 25
              ? 'وزن طبيعي (Normal)'
              : bmi < 30
              ? 'زيادة وزن (Overweight)'
              : 'سمنة (Obesity)',
        },
        csrfToken,
      );

      setSuccessMessage('تم تسجيل الوزن والطول وحساب مؤشر كتلة الجسم (BMI) بنجاح');
      setQuickWeight('');
      setQuickHeight('');
      await loadData();
      if (onRefreshSummary) onRefreshSummary();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'فشل تسجيل وحساب مؤشر كتلة الجسم');
    }
  };

  const handleAmend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amendingItem) return;
    if (!amendmentReason.trim()) {
      setError('يرجى توضيح سبب التصحيح الموثق');
      return;
    }

    try {
      await amendObservation(
        clinicId,
        amendingItem.id,
        {
          amendmentReason: amendmentReason.trim(),
          numericValue: amendNumericValue !== '' ? parseFloat(amendNumericValue) : undefined,
          expectedVersion: amendingItem.version,
        },
        csrfToken,
      );

      setSuccessMessage('تم تصحيح وتعديل القياس بنجاح مع الحفاظ على الأثر التوثيقي');
      setAmendingItem(null);
      setAmendmentReason('');
      setAmendNumericValue('');
      await loadData();
      if (onRefreshSummary) onRefreshSummary();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'فشل تصحيح القياس');
    }
  };

  return (
    <div className="clinical-foundation-container">
      {error && <div className="cf-alert cf-alert-danger">{error}</div>}
      {successMessage && <div className="cf-alert cf-alert-success">{successMessage}</div>}

      {/* Record Observation Form */}
      <div className="cf-card">
        <div className="cf-header">
          <h3>تسجيل المؤشرات الحيوية والملاحظات السريرية</h3>
          <span className="cf-meta">سجل محمي ومقيد للطبيب المرخص</span>
        </div>

        <form onSubmit={handleRecord}>
          <div className="cf-grid">
            <div className="cf-field">
              <label>نوع القياس الحيوي *</label>
              <select
                className="cf-select"
                value={selectedType}
                onChange={e => handleTypeChange(e.target.value as ObservationType)}
              >
                {Object.entries(observationTypeLabels).map(([key, info]) => (
                  <option key={key} value={key}>
                    {info.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="cf-field">
              <label>القيمة العددية {selectedType !== 'GENERAL_OBSERVATION' ? '*' : ''}</label>
              <input
                type="number"
                step="any"
                className="cf-input"
                placeholder={selectedType === 'BODY_TEMPERATURE' ? '37.0' : '120'}
                value={numericValue}
                onChange={e => setNumericValue(e.target.value)}
              />
            </div>

            <div className="cf-field">
              <label>الوحدة *</label>
              <input
                type="text"
                className="cf-input"
                value={unit}
                onChange={e => setUnit(e.target.value)}
                required
              />
            </div>

            <div className="cf-field">
              <label>مصدر القياس السريري</label>
              <select
                className="cf-select"
                value={provenance}
                onChange={e => setProvenance(e.target.value as ClinicalProvenance)}
              >
                <option value="CLINICIAN_MEASURED">قياس الطبيب/الممارس في العيادة</option>
                <option value="DEVICE_RECORDED">مسجل عبر جهاز طبي معتمد</option>
                <option value="PATIENT_REPORTED">مبلغ من المريض</option>
                <option value="HISTORICAL_TRANSCRIPTION">منقول من سجل سابق</option>
              </select>
            </div>
          </div>

          <div className="cf-grid" style={{ marginTop: '0.75rem' }}>
            <div className="cf-field" style={{ gridColumn: 'span 2' }}>
              <label>التفسير السريري / ملاحظات الفحص</label>
              <input
                type="text"
                className="cf-input"
                placeholder="طبيعي، مرتفع، منخفض، أعراض مصاحبة..."
                value={interpretation}
                onChange={e => setInterpretation(e.target.value)}
              />
            </div>
          </div>

          <div className="cf-actions">
            <button type="submit" className="cf-btn-primary" disabled={loading}>
              حفظ القياس الحيوي
            </button>
          </div>
        </form>
      </div>

      {/* Quick BMI Calculator Helper */}
      <div className="cf-card" style={{ backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }}>
        <div className="cf-header">
          <h4>حاسبة مؤشر كتلة الجسم الحتمية (BMI Auto-Calculation)</h4>
          <span className="cf-meta">حساب وحفظ الطول، الوزن، والـ BMI بضغطة واحدة</span>
        </div>
        <div className="cf-grid">
          <div className="cf-field">
            <label>الوزن (kg)</label>
            <input
              type="number"
              step="0.1"
              className="cf-input"
              placeholder="70.5"
              value={quickWeight}
              onChange={e => setQuickWeight(e.target.value)}
            />
          </div>
          <div className="cf-field">
            <label>الطول (cm)</label>
            <input
              type="number"
              step="0.5"
              className="cf-input"
              placeholder="175"
              value={quickHeight}
              onChange={e => setQuickHeight(e.target.value)}
            />
          </div>
          <div className="cf-field">
            <label>مؤشر كتلة الجسم الناتج</label>
            <div
              style={{
                padding: '0.55rem',
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                fontWeight: 700,
                color: '#15803d',
              }}
            >
              {calculateQuickBmi() ? `${calculateQuickBmi()} kg/m²` : '---'}
            </div>
          </div>
        </div>
        <div className="cf-actions" style={{ marginTop: '0.75rem' }}>
          <button
            type="button"
            className="cf-btn-primary"
            style={{ backgroundColor: '#16a34a' }}
            disabled={!calculateQuickBmi() || loading}
            onClick={handleRecordQuickBmi}
          >
            تسجيل وحفظ القياسات ومؤشر كتلة الجسم
          </button>
        </div>
      </div>

      {/* Observations History Table */}
      <div className="cf-card">
        <div className="cf-header">
          <h3>سجل القياسات والمؤشرات الحيوية السابقة</h3>
          <span className="cf-meta">{observations.length} قياس مسجل</span>
        </div>

        {observations.length === 0 ? (
          <p style={{ color: '#64748b' }}>لا توجد قياسات حيوية مسجلة لهذا المريض بعد.</p>
        ) : (
          <div className="cf-table-container">
            <table className="cf-table">
              <thead>
                <tr>
                  <th>تاريخ القياس</th>
                  <th>نوع القياس</th>
                  <th>القيمة</th>
                  <th>المصدر</th>
                  <th>التفسير السريري</th>
                  <th>الحالة</th>
                  <th>الموثق</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {observations.map(obs => (
                  <tr key={obs.id}>
                    <td>{new Date(obs.measuredAt).toLocaleString('ar-SA')}</td>
                    <td>{observationTypeLabels[obs.observationType]?.label ?? obs.observationType}</td>
                    <td style={{ fontWeight: 600 }}>
                      {obs.numericValue !== null ? `${obs.numericValue} ${obs.unit}` : obs.textValue ?? '---'}
                    </td>
                    <td>
                      <span className="cf-badge cf-badge-info">
                        {obs.provenance === 'CLINICIAN_MEASURED'
                          ? 'طبيب العيادة'
                          : obs.provenance === 'DEVICE_RECORDED'
                          ? 'جهاز'
                          : 'مريض'}
                      </span>
                    </td>
                    <td>{obs.interpretation || '---'}</td>
                    <td>
                      <span
                        className={`cf-badge ${
                          obs.status === 'AMENDED'
                            ? 'cf-badge-warning'
                            : obs.status === 'ENTERED_IN_ERROR'
                            ? 'cf-badge-danger'
                            : 'cf-badge-success'
                        }`}
                      >
                        {obs.status === 'RECORDED'
                          ? 'مسجل'
                          : obs.status === 'AMENDED'
                          ? 'معدل ومصحح'
                          : obs.status}
                      </span>
                    </td>
                    <td>{obs.authorName || 'طبيب'}</td>
                    <td>
                      {obs.status !== 'ENTERED_IN_ERROR' && (
                        <button
                          type="button"
                          className="cf-btn-secondary"
                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
                          onClick={() => {
                            setAmendingItem(obs);
                            setAmendNumericValue(obs.numericValue !== null ? String(obs.numericValue) : '');
                            setAmendmentReason('');
                          }}
                        >
                          تصحيح
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Amendment Modal */}
      {amendingItem && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div className="cf-card" style={{ maxWidth: '500px', width: '90%' }}>
            <div className="cf-header">
              <h4>تصحيح قياس حيوي موثق</h4>
              <button
                type="button"
                className="cf-btn-secondary"
                style={{ padding: '0.2rem 0.6rem' }}
                onClick={() => setAmendingItem(null)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleAmend}>
              <div className="cf-field">
                <label>نوع القياس</label>
                <div style={{ fontWeight: 600 }}>
                  {observationTypeLabels[amendingItem.observationType]?.label}
                </div>
              </div>
              <div className="cf-field" style={{ marginTop: '0.5rem' }}>
                <label>القيمة المصححة الجديدة *</label>
                <input
                  type="number"
                  step="any"
                  className="cf-input"
                  value={amendNumericValue}
                  onChange={e => setAmendNumericValue(e.target.value)}
                  required
                />
              </div>
              <div className="cf-field" style={{ marginTop: '0.5rem' }}>
                <label>سبب التصحيح الموثق *</label>
                <textarea
                  className="cf-textarea"
                  rows={3}
                  placeholder="بيان سبب التعديل للتدقيق السريري..."
                  value={amendmentReason}
                  onChange={e => setAmendmentReason(e.target.value)}
                  required
                />
              </div>
              <div className="cf-actions" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button
                  type="button"
                  className="cf-btn-secondary"
                  onClick={() => setAmendingItem(null)}
                >
                  إلغاء
                </button>
                <button type="submit" className="cf-btn-primary">
                  حفظ التعديل الموثق
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

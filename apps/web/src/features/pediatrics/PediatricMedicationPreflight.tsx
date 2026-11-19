import React, { useState } from 'react';
import type {
  PediatricMedicationPreflightResult,
  PediatricGrowthRecordItem,
  PediatricBirthHistoryItem,
} from './types.js';
import { preflightMedicationSafety } from './pediatrics-api.js';

interface PediatricMedicationPreflightProps {
  clinicId: string;
  patientId: string;
  birthHistory: PediatricBirthHistoryItem | null;
  records: PediatricGrowthRecordItem[];
  csrfToken?: string;
  onAuthError?: (e?: unknown) => void;
}

export const PediatricMedicationPreflight: React.FC<PediatricMedicationPreflightProps> = ({
  clinicId,
  patientId,
  birthHistory,
  records,
  csrfToken,
  onAuthError,
}) => {
  // Find latest recorded weight
  const latestWeightRecord = (records || [])
    .filter((r) => r.status !== 'ENTERED_IN_ERROR' && r.weightKg !== null && r.weightKg !== undefined)
    .sort((a, b) => new Date(b.measuredAt).getTime() - new Date(a.measuredAt).getTime())[0];

  const [medicationName, setMedicationName] = useState('');
  const [currentWeightKg, setCurrentWeightKg] = useState<number | ''>(latestWeightRecord?.weightKg ?? '');
  const [gestationalAgeWeeks, setGestationalAgeWeeks] = useState<number | ''>(
    birthHistory?.gestationalAgeWeeks ?? '',
  );
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PediatricMedicationPreflightResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePreflight = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!medicationName.trim()) {
      setError('يرجى إدخال اسم الدواء المراد فحصه');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await preflightMedicationSafety(
        clinicId,
        patientId,
        {
          medicationName: medicationName.trim(),
          currentWeightKg: currentWeightKg !== '' ? Number(currentWeightKg) : undefined,
          gestationalAgeWeeksAtBirth: gestationalAgeWeeks !== '' ? Number(gestationalAgeWeeks) : undefined,
        },
        csrfToken,
        onAuthError,
      );
      setResult(res);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pediatric-medication-preflight" data-testid="pediatric-medication-preflight" dir="rtl">
      <div className="section-header" style={{ marginBottom: '1rem' }}>
        <h3 style={{ margin: 0 }}>💊 فحص السلامة الدوائية للأطفال (Pediatric Medication Safety Preflight)</h3>
        <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.875rem' }}>
          تدقيق أمان الوصفة الدوائية قبل الاعتماد: حداثة قياس الوزن، موانع الاستعمال العمرية والولادية، وتعارض الحساسية الموثقة.
        </p>
      </div>

      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.25rem', marginBottom: '1.25rem' }}>
        <form onSubmit={handlePreflight} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              اسم الدواء / المادة الفعالة*
            </label>
            <input
              type="text"
              required
              className="form-control"
              placeholder="مثال: Amoxicillin, Aspirin, Doxycycline, Codeine"
              value={medicationName}
              onChange={(e) => setMedicationName(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
              data-testid="preflight-medication-name"
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              الوزن الحالي المعتمد (كجم)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.3"
              max="250"
              placeholder="مثال: 15.5"
              value={currentWeightKg}
              onChange={(e) => setCurrentWeightKg(e.target.value ? Number(e.target.value) : '')}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
              data-testid="preflight-weight-kg"
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              العمر الحملي عند الولادة (أسابيع)
            </label>
            <input
              type="number"
              min="20"
              max="45"
              placeholder="مثال: 38"
              value={gestationalAgeWeeks}
              onChange={(e) => setGestationalAgeWeeks(e.target.value ? Number(e.target.value) : '')}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
              data-testid="preflight-gestational-age"
            />
          </div>

          <div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
              style={{ width: '100%', padding: '0.55rem' }}
              data-testid="preflight-submit-btn"
            >
              {submitting ? 'جارٍ الفحص الطبي...' : '🔍 فحص السلامة الدوائية'}
            </button>
          </div>
        </form>

        {latestWeightRecord && (
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>
            آخر وزن مسجل في الملف: {latestWeightRecord.weightKg} كجم (بتاريخ {new Date(latestWeightRecord.measuredAt).toLocaleDateString('ar-YE')})
          </div>
        )}
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '4px' }}>
          ⚠️ {error}
        </div>
      )}

      {/* PREFLIGHT RESULT DISPLAY */}
      {result && (
        <div
          className={`preflight-result-card ${result.isSafeToProceed ? 'safe' : 'unsafe'}`}
          style={{
            border: result.isSafeToProceed ? '2px solid #22c55e' : '2px solid #ef4444',
            borderRadius: '8px',
            padding: '1.25rem',
            backgroundColor: result.isSafeToProceed ? '#f0fdf4' : '#fef2f2',
            marginBottom: '1rem',
          }}
          data-testid="preflight-result"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.5rem' }}>{result.isSafeToProceed ? '✅' : '🛑'}</span>
              <div>
                <h4 style={{ margin: 0, color: result.isSafeToProceed ? '#166534' : '#991b1b' }}>
                  {result.isSafeToProceed
                    ? 'التحقق السريري مجاز: لا توجد موانع استعمال أو تعارضات حرجة مسجلة'
                    : 'محظور سريرياً: توجد تنبيهات حرجة تمنع وصف أو صرف هذا الدواء'}
                </h4>
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  عمر الطفل المقدر:{' '}
                  {result.weightRecency
                    ? (result.weightRecency.ageDays / 365.25).toFixed(1)
                    : '—'}{' '}
                  سنة | صلاحية قياس الوزن: {result.weightRecency?.maxAllowedAgeDays ?? '—'} يوم
                </div>
              </div>
            </div>

            <span
              className={`badge ${result.isSafeToProceed ? 'badge-success' : 'badge-danger'}`}
              style={{
                backgroundColor: result.isSafeToProceed ? '#dcfce7' : '#fee2e2',
                color: result.isSafeToProceed ? '#166534' : '#991b1b',
                padding: '0.35rem 0.75rem',
                borderRadius: '6px',
                fontWeight: 'bold',
                fontSize: '0.85rem',
              }}
            >
              {result.isSafeToProceed ? 'مجاز سريرياً' : 'ممنوع الوصف'}
            </span>
          </div>

          {result.alerts.length > 0 ? (
            <div className="preflight-alerts-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {result.alerts.map((alert, idx) => {
                const isCritical = alert.severity === 'CRITICAL';
                return (
                  <div
                    key={idx}
                    style={{
                      border: isCritical ? '1px solid #fca5a5' : '1px solid #fcd34d',
                      borderRadius: '6px',
                      padding: '0.75rem',
                      backgroundColor: isCritical ? '#ffffff' : '#fffbeb',
                    }}
                    data-testid={`preflight-alert-${alert.code}`}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                      <strong style={{ color: isCritical ? '#b91c1c' : '#b45309' }}>
                        {isCritical ? '🚨 تنبيه حرج (CRITICAL):' : '⚠️ تحذير (WARNING):'} {alert.titleAr}
                      </strong>
                      <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.35rem', borderRadius: '4px', backgroundColor: isCritical ? '#fee2e2' : '#fef3c7', color: isCritical ? '#991b1b' : '#92400e' }}>
                        {isCritical ? 'حرج' : 'تحذير'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#334155' }}>
                      {alert.messageAr}
                    </div>
                    {alert.clinicalRationale && (
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                        المسوغ السريري: {alert.clinicalRationale}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: '0.85rem', color: '#166534' }}>
              تم التحقق من حداثة الوزن المسجل، وموانع الاستعمال العمرية القياسية، وخلو سجل الحساسية من أي تعارض.
            </div>
          )}

          <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #e2e8f0', fontSize: '0.75rem', color: '#64748b' }}>
            ℹ️ تنبيه سلامة المرضى: هذا الفحص المسبق يهدف إلى منع الأخطاء الدوائية الشائعة لدى الأطفال (متلازمة راي، تصبغ الأسنان، توقف التنفس). يتولى الطبيب المعالج تحديد الجرعة العلاجية ومسار الإعطاء وفق المعايير الدوائية المعتمدة.
          </div>
        </div>
      )}
    </div>
  );
};

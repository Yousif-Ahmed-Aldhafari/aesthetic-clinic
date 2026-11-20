import React, { useState } from 'react';
import type {
  PediatricGrowthRecordItem,
  StatureMeasurementMethod,
  MeasurementSource,
  PediatricBirthHistoryItem,
} from './types.js';
import { recordGrowth, enterInErrorGrowthRecord } from './pediatrics-api.js';

interface GrowthRecordsSectionProps {
  clinicId: string;
  patientId: string;
  birthHistory: PediatricBirthHistoryItem | null;
  patientDob?: string;
  records: PediatricGrowthRecordItem[];
  onRefresh: () => Promise<void>;
  csrfToken?: string;
  onAuthError?: (e?: unknown) => void;
}

export const GrowthRecordsSection: React.FC<GrowthRecordsSectionProps> = ({
  clinicId,
  patientId,
  birthHistory,
  records,
  onRefresh,
  csrfToken,
  onAuthError,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [erroringRecord, setErroringRecord] = useState<PediatricGrowthRecordItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form states
  const [weightKg, setWeightKg] = useState<number | ''>('');
  const [statureCm, setStatureCm] = useState<number | ''>('');
  const [statureMethod, setStatureMethod] = useState<StatureMeasurementMethod>('RECUMBENT_LENGTH');
  const [headCircumferenceCm, setHeadCircumferenceCm] = useState<number | ''>('');
  const [useCorrectedAge, setUseCorrectedAge] = useState<boolean>(
    (birthHistory?.gestationalAgeWeeks ?? 40) < 37,
  );
  const [measurementSource, setMeasurementSource] = useState<MeasurementSource>('CLINICAL_ENCOUNTER');
  const [deviceIdentifier, setDeviceIdentifier] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');

  // Enter-in-error state
  const [errorReason, setErrorReason] = useState('');

  const resetForm = () => {
    setWeightKg('');
    setStatureCm('');
    setHeadCircumferenceCm('');
    setDeviceIdentifier('');
    setClinicalNotes('');
    setIsRecording(false);
    setErroringRecord(null);
    setErrorReason('');
  };

  const handleRecordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (weightKg === '' && statureCm === '' && headCircumferenceCm === '') {
      setError('يجب تسجيل قياس واحد على الأقل (الوزن، الطول، أو محيط الرأس)');
      return;
    }
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      await recordGrowth(
        clinicId,
        patientId,
        {
          weightKg: weightKg !== '' ? Number(weightKg) : undefined,
          statureCm: statureCm !== '' ? Number(statureCm) : undefined,
          statureMethod: statureCm !== '' ? statureMethod : undefined,
          headCircumferenceCm: headCircumferenceCm !== '' ? Number(headCircumferenceCm) : undefined,
          useCorrectedAgeForZScores: useCorrectedAge,
          measurementSource,
          deviceIdentifier: deviceIdentifier.trim() || undefined,
          clinicalNotes: clinicalNotes.trim() || undefined,
        },
        csrfToken,
        onAuthError,
      );
      setSuccess('تم توثيق قياسات النمو واحتساب مؤشرات ومعايير منظمة الصحة العالمية (WHO) بنجاح');
      resetForm();
      await onRefresh();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleErrorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!erroringRecord) return;
    if (!errorReason.trim()) {
      setError('سبب تمييز السجل كخطأ إدخال إلزامي');
      return;
    }
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      await enterInErrorGrowthRecord(
        clinicId,
        erroringRecord.id,
        {
          expectedVersion: erroringRecord.version,
          errorReason: errorReason.trim(),
        },
        csrfToken,
        onAuthError,
      );
      setSuccess('تم تمييز السجل كخطأ إدخال بنجاح مع الاحتفاظ بالأثر الرقابي');
      resetForm();
      await onRefresh();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const activeRecords = (records || []).filter((r) => r.status !== 'ENTERED_IN_ERROR');
  const errorRecords = (records || []).filter((r) => r.status === 'ENTERED_IN_ERROR');

  return (
    <div className="growth-records-section" data-testid="growth-records-section" dir="rtl">
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h3 style={{ margin: 0 }}>📏 القياسات الجسمانية ومخططات النمو (Pediatric Anthropometry & Growth)</h3>
          <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.875rem' }}>
            رصد ومتابعة الوزن، الطول/الارتفاع، محيط الرأس، مؤشر كتلة الجسم (BMI) والانحراف المعياري (Z-Score) وفق منظمة الصحة العالمية (WHO 2006).
          </p>
        </div>
        {!isRecording && !erroringRecord && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              resetForm();
              setIsRecording(true);
            }}
            data-testid="record-growth-btn"
          >
            ➕ تسجيل قياسات نمو جديدة
          </button>
        )}
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '4px' }}>
          ⚠️ {error}
        </div>
      )}

      {success && (
        <div className="alert alert-success" style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#dcfce7', color: '#166534', borderRadius: '4px' }}>
          ✅ {success}
        </div>
      )}

      {/* ENTER IN ERROR FORM */}
      {erroringRecord && (
        <form
          onSubmit={handleErrorSubmit}
          style={{ border: '2px solid #ef4444', borderRadius: '8px', padding: '1.25rem', backgroundColor: '#fef2f2', marginBottom: '1.5rem' }}
          data-testid="enter-in-error-form"
        >
          <h4 style={{ margin: '0 0 0.5rem', color: '#991b1b' }}>
            🚫 تمييز قياس النمو كخطأ إدخال (Entered in Error)
          </h4>
          <p style={{ fontSize: '0.875rem', color: '#b91c1c', marginBottom: '1rem' }}>
            وفقاً لضوابط السلامة السريرية، لا يتم حذف سجل القياس بل يتم إبطاله مع وجوب بيان السبب الطبي/الإجرائي.
          </p>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontWeight: 600, color: '#991b1b', marginBottom: '0.25rem' }}>
              سبب التمييز كخطأ*:
            </label>
            <input
              type="text"
              required
              value={errorReason}
              onChange={(e) => setErrorReason(e.target.value)}
              placeholder="مثال: خطأ في قراءة الميزان / قياس مريض آخر بالخطأ"
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #fca5a5' }}
              data-testid="growth-error-reason-input"
            />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={resetForm} disabled={submitting}>
              إلغاء
            </button>
            <button type="submit" className="btn btn-danger" disabled={submitting} data-testid="confirm-error-btn" style={{ backgroundColor: '#dc2626', color: '#ffffff' }}>
              {submitting ? 'جارٍ الإبطال...' : 'تأكيد الإبطال'}
            </button>
          </div>
        </form>
      )}

      {/* NEW MEASUREMENT FORM */}
      {isRecording && (
        <form
          onSubmit={handleRecordSubmit}
          style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '1.25rem', backgroundColor: '#f8fafc', marginBottom: '1.5rem' }}
          data-testid="growth-record-form"
        >
          <h4 style={{ margin: '0 0 1rem' }}>تسجيل قياسات نمو جديدة للطفل</h4>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                الوزن (كجم)*
              </label>
              <input
                type="number"
                step="0.01"
                min="0.3"
                max="250"
                placeholder="مثال: 12.5"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value ? Number(e.target.value) : '')}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                data-testid="growth-weight-kg"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                الطول / القامة (سم)
              </label>
              <input
                type="number"
                step="0.1"
                min="20"
                max="230"
                placeholder="مثال: 88.0"
                value={statureCm}
                onChange={(e) => setStatureCm(e.target.value ? Number(e.target.value) : '')}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                data-testid="growth-stature-cm"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                طريقة قياس القامة
              </label>
              <select
                value={statureMethod}
                onChange={(e) => setStatureMethod(e.target.value as StatureMeasurementMethod)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                data-testid="growth-stature-method"
              >
                <option value="RECUMBENT_LENGTH">طول مستلقٍ على الظهر (Recumbent Length - أقل من سنتين)</option>
                <option value="STANDING_HEIGHT">طول واقف (Standing Height - سنتان فأكثر)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                محيط الرأس (سم)
              </label>
              <input
                type="number"
                step="0.1"
                min="15"
                max="65"
                placeholder="مثال: 46.5"
                value={headCircumferenceCm}
                onChange={(e) => setHeadCircumferenceCm(e.target.value ? Number(e.target.value) : '')}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                data-testid="growth-head-cm"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                مصدر القياس
              </label>
              <select
                value={measurementSource}
                onChange={(e) => setMeasurementSource(e.target.value as MeasurementSource)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
              >
                <option value="CLINICAL_ENCOUNTER">استشارة سريرية (Clinical Encounter)</option>
                <option value="NURSE_TRIAGE">فرز تمريضي (Nurse Triage)</option>
                <option value="COMMUNITY_SCREENING">مسح مجتمعي (Community Screening)</option>
                <option value="HISTORICAL_RECORD">سجل تاريخي سابق (Historical Record)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                معرّف الجهاز / الميزان
              </label>
              <input
                type="text"
                placeholder="مثال: SECA-756-CAL-2026"
                value={deviceIdentifier}
                onChange={(e) => setDeviceIdentifier(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
              />
            </div>
          </div>

          {(birthHistory?.gestationalAgeWeeks ?? 40) < 37 && (
            <div style={{ marginBottom: '1rem', background: '#fffbeb', padding: '0.75rem', borderRadius: '6px', border: '1px solid #fde68a' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer', color: '#92400e' }}>
                <input
                  type="checkbox"
                  checked={useCorrectedAge}
                  onChange={(e) => setUseCorrectedAge(e.target.checked)}
                  data-testid="use-corrected-age"
                />
                <strong>احتساب الانحراف المعياري والمئينات بناءً على العمر المصحح للخداج (Corrected Age for Prematurity)</strong>
              </label>
              <div style={{ fontSize: '0.75rem', color: '#b45309', marginTop: '0.25rem', paddingRight: '1.5rem' }}>
                ولد الطفل في الأسبوع {birthHistory?.gestationalAgeWeeks} (عجز: {Math.max(0, (40 - (birthHistory?.gestationalAgeWeeks ?? 40)) * 7 - (birthHistory?.gestationalAgeDays ?? 0))} يوم). يوصى باستخدام العمر المصحح حتى عمر 24 شهراً.
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={resetForm} disabled={submitting}>
              إلغاء
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting} data-testid="submit-growth-btn">
              {submitting ? 'جارٍ الحفظ والاحتساب...' : 'حفظ واحتساب مؤشرات النمو'}
            </button>
          </div>
        </form>
      )}

      {/* ACTIVE RECORDS CARDS / SUMMARY */}
      <div className="growth-records-summary" style={{ marginBottom: '1.5rem' }}>
        {activeRecords.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
            {activeRecords.map((rec) => {
              const ageYears = (rec.chronologicalAgeDays / 365.25).toFixed(1);
              return (
                <div
                  key={rec.id}
                  className="growth-record-card"
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '1rem',
                    backgroundColor: '#ffffff',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  }}
                  data-testid={`growth-card-${rec.id}`}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <div>
                      <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#0f172a' }}>
                        📅 {new Date(rec.measuredAt).toLocaleDateString('ar-YE')}
                      </span>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        العمر الزمني: {ageYears} سنة ({rec.chronologicalAgeDays} يوم)
                        {rec.correctedAgeDays !== null && rec.correctedAgeDays !== undefined && rec.correctedAgeDays !== rec.chronologicalAgeDays && (
                          <span style={{ color: '#0284c7', marginRight: '0.25rem' }}>
                            | مصحح: {(rec.correctedAgeDays / 30.4375).toFixed(1)} شهر
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="badge badge-success" style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>
                      نهائي
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
                    <div style={{ background: '#f8fafc', padding: '0.5rem', borderRadius: '4px' }}>
                      <div style={{ color: '#64748b', fontSize: '0.75rem' }}>الوزن</div>
                      <div style={{ fontWeight: 'bold' }}>{rec.weightKg ? `${rec.weightKg} كجم` : '—'}</div>
                      {rec.weightForAgeZScore !== null && rec.weightForAgeZScore !== undefined && (
                        <div style={{ fontSize: '0.75rem', color: Math.abs(rec.weightForAgeZScore) > 2 ? '#b91c1c' : '#15803d' }}>
                          Z: {rec.weightForAgeZScore > 0 ? `+${rec.weightForAgeZScore}` : rec.weightForAgeZScore} ({rec.weightForAgePercentile}%)
                        </div>
                      )}
                    </div>

                    <div style={{ background: '#f8fafc', padding: '0.5rem', borderRadius: '4px' }}>
                      <div style={{ color: '#64748b', fontSize: '0.75rem' }}>الطول / القامة</div>
                      <div style={{ fontWeight: 'bold' }}>{rec.statureCm ? `${rec.statureCm} سم` : '—'}</div>
                      {rec.lengthForAgeZScore !== null && rec.lengthForAgeZScore !== undefined && (
                        <div style={{ fontSize: '0.75rem', color: Math.abs(rec.lengthForAgeZScore) > 2 ? '#b91c1c' : '#15803d' }}>
                          Z: {rec.lengthForAgeZScore > 0 ? `+${rec.lengthForAgeZScore}` : rec.lengthForAgeZScore} ({rec.lengthForAgePercentile}%)
                        </div>
                      )}
                    </div>

                    <div style={{ background: '#f8fafc', padding: '0.5rem', borderRadius: '4px' }}>
                      <div style={{ color: '#64748b', fontSize: '0.75rem' }}>محيط الرأس</div>
                      <div style={{ fontWeight: 'bold' }}>{rec.headCircumferenceCm ? `${rec.headCircumferenceCm} سم` : '—'}</div>
                      {rec.headCircumferenceZScore !== null && rec.headCircumferenceZScore !== undefined && (
                        <div style={{ fontSize: '0.75rem', color: Math.abs(rec.headCircumferenceZScore) > 2 ? '#b91c1c' : '#15803d' }}>
                          Z: {rec.headCircumferenceZScore > 0 ? `+${rec.headCircumferenceZScore}` : rec.headCircumferenceZScore} ({rec.headCircumferencePercentile}%)
                        </div>
                      )}
                    </div>

                    <div style={{ background: '#f8fafc', padding: '0.5rem', borderRadius: '4px' }}>
                      <div style={{ color: '#64748b', fontSize: '0.75rem' }}>مؤشر الكتلة (BMI)</div>
                      <div style={{ fontWeight: 'bold' }}>{rec.bodyMassIndex ? `${rec.bodyMassIndex} كجم/م²` : '—'}</div>
                      {rec.bmiForAgeZScore !== null && rec.bmiForAgeZScore !== undefined && (
                        <div style={{ fontSize: '0.75rem', color: Math.abs(rec.bmiForAgeZScore) > 2 ? '#b91c1c' : '#15803d' }}>
                          Z: {rec.bmiForAgeZScore > 0 ? `+${rec.bmiForAgeZScore}` : rec.bmiForAgeZScore} ({rec.bmiForAgePercentile}%)
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #f1f5f9', paddingTop: '0.5rem' }}>
                    <button
                      type="button"
                      className="btn btn-outline-danger btn-xs"
                      onClick={() => {
                        setErroringRecord(rec);
                        setErrorReason('');
                        setIsRecording(false);
                      }}
                      style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', color: '#dc2626', borderColor: '#fca5a5' }}
                      data-testid={`error-record-btn-${rec.id}`}
                    >
                      🚫 خطأ في الإدخال
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          !isRecording && (
            <div style={{ textAlign: 'center', padding: '2rem', border: '2px dashed #cbd5e1', borderRadius: '8px', color: '#64748b' }}>
              لا توجد قياسات نمو مسجلة للطفل حتى الآن. انقر فوق &quot;تسجيل قياسات نمو جديدة&quot;.
            </div>
          )
        )}
      </div>

      {/* ENTERED IN ERROR AUDIT LIST */}
      {errorRecords.length > 0 && (
        <details style={{ marginTop: '1rem', border: '1px solid #fee2e2', borderRadius: '6px', padding: '0.5rem 1rem', background: '#fff5f5' }}>
          <summary style={{ cursor: 'pointer', color: '#991b1b', fontSize: '0.85rem', fontWeight: 600 }}>
            السجلات الملغاة كخطأ في الإدخال ({errorRecords.length})
          </summary>
          <div style={{ marginTop: '0.5rem' }}>
            {errorRecords.map((rec) => (
              <div key={rec.id} style={{ fontSize: '0.8rem', color: '#7f1d1d', borderBottom: '1px solid #fed7d7', padding: '0.35rem 0' }}>
                بتاريخ {new Date(rec.measuredAt).toLocaleDateString('ar-YE')}: وزن {rec.weightKg ?? '—'} كجم | سبب الإلغاء: {rec.errorReason}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};

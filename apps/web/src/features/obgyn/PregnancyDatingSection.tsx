import React, { useState } from 'react';
import type { PregnancyEpisodeItem, DatingMethod } from './types.js';
import { reviewPregnancyDating } from './obgyn-api.js';

interface PregnancyDatingSectionProps {
  clinicId: string;
  episode: PregnancyEpisodeItem;
  csrfToken?: string;
  onUpdated: (updated: PregnancyEpisodeItem) => void;
  onAuthError?: (e?: unknown) => void;
}

export const PregnancyDatingSection: React.FC<PregnancyDatingSectionProps> = ({
  clinicId,
  episode,
  csrfToken,
  onUpdated,
  onAuthError,
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state initialized from episode
  const [confirmedEdd, setConfirmedEdd] = useState(episode.estimatedDueDate || '');
  const [datingMethod, setDatingMethod] = useState<DatingMethod>(episode.datingMethod || 'LMP_CERTAIN');
  const [datingRationale, setDatingRationale] = useState(episode.datingRationale || '');
  const [crlMm, setCrlMm] = useState<string>(episode.crownRumpLengthMm ? String(episode.crownRumpLengthMm) : '');
  const [scanDate, setScanDate] = useState<string>(episode.ultrasoundDatingDate || '');

  // Live client-side CRL formula preview (Robinson-Fleming)
  const calculateCrlGaDays = (crl: number): number | null => {
    if (isNaN(crl) || crl < 10 || crl > 84) return null;
    return Math.round(8.052 * Math.sqrt(crl) + 23.73);
  };

  const parsedCrl = parseFloat(crlMm);
  const crlGaDays = calculateCrlGaDays(parsedCrl);
  const crlGaWeeks = crlGaDays !== null ? Math.floor(crlGaDays / 7) : null;
  const crlGaRemDays = crlGaDays !== null ? crlGaDays % 7 : null;

  // Calculate ultrasound EDD preview if scanDate and CRL available
  const calculateUltrasoundEdd = (): string | null => {
    if (!scanDate || crlGaDays === null) return null;
    const scanTime = new Date(scanDate + 'T00:00:00Z').getTime();
    const remainingDays = 280 - crlGaDays;
    return new Date(scanTime + remainingDays * 86400000).toISOString().slice(0, 10);
  };

  const usEddPreview = calculateUltrasoundEdd();

  const handleApplyUsEdd = () => {
    if (usEddPreview) {
      setConfirmedEdd(usEddPreview);
      setDatingMethod('ULTRASOUND_FIRST_TRIMESTER');
      setDatingRationale(
        `تعديل موعد الولادة المتوقع بناءً على قياس الطول القفوي الجنيني (${crlMm} مم) بتاريخ فحص ${scanDate}`
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      if (!confirmedEdd) throw new Error('يرجى تحديد الموعد المتوقع للولادة');
      if (!datingRationale || datingRationale.trim().length < 5) {
        throw new Error('يرجى كتابة تبرير سريري لتوثيق طريقة تحديد موعد الولادة (5 أحرف على الأقل)');
      }

      const updated = await reviewPregnancyDating(
        clinicId,
        episode.id,
        {
          confirmedEstimatedDueDate: confirmedEdd,
          datingMethod,
          datingRationale: datingRationale.trim(),
          crownRumpLengthMm: crlMm ? parseFloat(crlMm) : undefined,
          ultrasoundDatingDate: scanDate || undefined,
        },
        csrfToken,
        onAuthError,
      );

      setSuccess('تم اعتماد وتوثيق موعد الولادة سريرياً بنجاح.');
      onUpdated(updated);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pregnancy-dating-section" data-testid="pregnancy-dating-section" style={{ marginTop: '1rem' }}>
      <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.25rem' }}>
        <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', color: '#0f172a' }}>
          🩺 تدقيق واعتماد عمر الحمل والموعد المتوقع للولادة (EDD Provenance & Dating)
        </h3>

        {/* Current status display */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
          <div style={{ backgroundColor: '#f1f5f9', padding: '0.75rem', borderRadius: '6px' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>حساب قاعدة نايغل (LMP Naegele Rule)</div>
            <div style={{ fontWeight: 'bold', fontSize: '1rem', color: '#0f172a' }}>
              {episode.lastMenstrualPeriodDate ? `آخر دورة: ${episode.lastMenstrualPeriodDate}` : 'غير متوفر'}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '0.2rem' }}>
              الحالة: {episode.lmpCertainty ? 'دورة مؤكدة ومنتظمة' : 'دورة غير مؤكدة'}
            </div>
          </div>

          <div style={{ backgroundColor: '#f0fdf4', padding: '0.75rem', borderRadius: '6px' }}>
            <div style={{ fontSize: '0.75rem', color: '#166534' }}>الموعد المعتمد حالياً في السجل</div>
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#166534' }}>
              {episode.estimatedDueDate}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#15803d', marginTop: '0.2rem' }}>
              الطريقة: {episode.datingMethod} {episode.isDatingFinalized ? '(معتمد سريرياً ✓)' : '(قيد المراجعة)'}
            </div>
          </div>
        </div>

        {error && (
          <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '4px' }}>
            ⚠️ {error}
          </div>
        )}

        {success && (
          <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#dcfce7', color: '#166534', borderRadius: '4px' }}>
            ✓ {success}
          </div>
        )}

        {/* Biometry & Reconciliation Form */}
        <form onSubmit={handleSubmit} style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1.25rem' }}>
          <div style={{ fontWeight: 600, marginBottom: '0.75rem', color: '#334155' }}>
            قياسات الموجات فوق الصوتية (Ultrasound CRL Biometry):
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                تاريخ الفحص التلفزيوني (Scan Date)
              </label>
              <input
                type="date"
                className="input-field"
                value={scanDate}
                onChange={(e) => setScanDate(e.target.value)}
                style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                طول الجنين التاجي المقعدي (CRL مم)
              </label>
              <input
                type="number"
                step="0.1"
                min="10"
                max="84"
                placeholder="10 - 84 مم"
                className="input-field"
                value={crlMm}
                onChange={(e) => setCrlMm(e.target.value)}
                style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
              />
            </div>

            {crlGaDays !== null && (
              <div style={{ backgroundColor: '#eff6ff', padding: '0.5rem', borderRadius: '4px', fontSize: '0.8rem' }}>
                <div style={{ color: '#1e40af', fontWeight: 600 }}>عمر الحمل المحسوب بالسونار (Robinson-Fleming):</div>
                <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#1d4ed8' }}>
                  {crlGaWeeks}+{crlGaRemDays} أسابيع ({crlGaDays} يوماً)
                </div>
                {usEddPreview && (
                  <div style={{ marginTop: '0.25rem' }}>
                    <span>الموعد بالسونار: <strong>{usEddPreview}</strong></span>
                    <button
                      type="button"
                      onClick={handleApplyUsEdd}
                      style={{
                        marginRight: '0.5rem',
                        fontSize: '0.75rem',
                        padding: '0.2rem 0.5rem',
                        backgroundColor: '#2563eb',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                      }}
                    >
                      استخدام هذا الموعد ↤
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                الموعد المتوقع للولادة المعتمد (EDD) *
              </label>
              <input
                type="date"
                required
                className="input-field"
                value={confirmedEdd}
                onChange={(e) => setConfirmedEdd(e.target.value)}
                style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                طريقة التحديد (Dating Method) *
              </label>
              <select
                className="select-field"
                value={datingMethod}
                onChange={(e) => setDatingMethod(e.target.value as DatingMethod)}
                style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
              >
                <option value="LMP_CERTAIN">تاريخ آخر دورة مؤكد (LMP Certain)</option>
                <option value="ULTRASOUND_FIRST_TRIMESTER">الموجات فوق الصوتية - الثلث الأول (CRL)</option>
                <option value="ULTRASOUND_SECOND_TRIMESTER">الموجات فوق الصوتية - الثلث الثاني (BPD/FL)</option>
                <option value="LMP_UNCERTAIN">تاريخ آخر دورة غير مؤكد</option>
                <option value="CLINICAL_ESTIMATE">تقدير سريري</option>
                <option value="ASSISTED_REPRODUCTION">إخصاب مساعد / طفل أنبوب (IVF)</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              التبرير السريري لاعتماد الموعد (Clinical Rationale) *
            </label>
            <textarea
              required
              rows={2}
              className="textarea-field"
              value={datingRationale}
              onChange={(e) => setDatingRationale(e.target.value)}
              placeholder="مثال: مطابقة قياس السونار لعمر الحمل بفارق أقل من 7 أيام وتم اعتماد تاريخ الدورة..."
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary"
            style={{
              padding: '0.5rem 1.25rem',
              backgroundColor: '#0284c7',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'جارٍ الاعتماد والتوثيق...' : '✍️ اعتماد وتوثيق موعد الولادة سريرياً'}
          </button>
        </form>
      </div>
    </div>
  );
};

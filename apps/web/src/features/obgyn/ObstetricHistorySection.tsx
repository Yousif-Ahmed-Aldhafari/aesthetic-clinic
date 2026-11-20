import React, { useState } from 'react';
import type { ObstetricHistoryItem, DeliveryOutcome, DeliveryMode } from './types.js';
import { createObstetricHistory } from './obgyn-api.js';

interface ObstetricHistorySectionProps {
  clinicId: string;
  patientId: string;
  history: ObstetricHistoryItem[];
  csrfToken?: string;
  onRefreshHistory: () => void;
  onAuthError?: (e?: unknown) => void;
}

export const ObstetricHistorySection: React.FC<ObstetricHistorySectionProps> = ({
  clinicId,
  patientId,
  history,
  csrfToken,
  onRefreshHistory,
  onAuthError,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [pregnancyNumber, setPregnancyNumber] = useState(history.length + 1);
  const [yearOfDelivery, setYearOfDelivery] = useState<string>(String(new Date().getFullYear() - 2));
  const [gaWeeks, setGaWeeks] = useState<string>('39');
  const [deliveryOutcome, setDeliveryOutcome] = useState<DeliveryOutcome>('LIVE_BIRTH_SPONTANEOUS_VAGINAL');
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('VAGINAL');
  const [birthWeight, setBirthWeight] = useState<string>('3100');
  const [babyGender, setBabyGender] = useState<'MALE' | 'FEMALE' | 'OTHER' | 'UNDISCLOSED'>('MALE');
  const [prevUterineSurgery, setPrevUterineSurgery] = useState(false);
  const [surgeryDetails, setSurgeryDetails] = useState('');
  const [complications, setComplications] = useState('');
  const [neonatalOutcome, setNeonatalOutcome] = useState('');
  const [notes, setNotes] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await createObstetricHistory(
        clinicId,
        {
          patientId,
          pregnancyNumber: Number(pregnancyNumber),
          yearOfDelivery: yearOfDelivery ? parseInt(yearOfDelivery, 10) : undefined,
          gestationalAgeWeeks: gaWeeks ? parseInt(gaWeeks, 10) : undefined,
          deliveryOutcome,
          deliveryMode,
          birthWeightGrams: birthWeight ? parseInt(birthWeight, 10) : undefined,
          babyGender,
          previousUterineSurgery: prevUterineSurgery,
          uterineSurgeryDetails: prevUterineSurgery ? surgeryDetails.trim() || undefined : undefined,
          complications: complications.trim() || undefined,
          neonatalOutcome: neonatalOutcome.trim() || undefined,
          notes: notes.trim() || undefined,
        },
        csrfToken,
        onAuthError,
      );

      setShowAddForm(false);
      onRefreshHistory();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="obstetric-history-section" data-testid="obstetric-history-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>
            📜 التاريخ التوليدي والولادات السابقة (Obstetric & Delivery History)
          </h3>
          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.2rem' }}>
            توثيق نتائج ومسارات الحمل والولادات السابقة، وسوابق الجراحات الرحمية والندبات.
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          style={{
            padding: '0.4rem 0.85rem',
            backgroundColor: '#0284c7',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            fontSize: '0.85rem',
            cursor: 'pointer',
          }}
        >
          {showAddForm ? 'إلغاء النموذج ✖' : '+ إضافة حمل سابق'}
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '4px' }}>
          ⚠️ {error}
        </div>
      )}

      {/* ADD FORM */}
      {showAddForm && (
        <div style={{ backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '1rem', marginBottom: '1.25rem' }}>
          <h4 style={{ margin: '0 0 0.75rem 0', color: '#1e293b' }}>إضافة بيانات حمل / ولادة سابقة</h4>
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>رقم الحمل (Gravida #) *</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={pregnancyNumber}
                  onChange={(e) => setPregnancyNumber(parseInt(e.target.value, 10))}
                  style={{ width: '100%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>سنة الولادة / الانتهاء</label>
                <input
                  type="number"
                  min="1970"
                  max={new Date().getFullYear()}
                  value={yearOfDelivery}
                  onChange={(e) => setYearOfDelivery(e.target.value)}
                  style={{ width: '100%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>عمر الحمل (أسابيع)</label>
                <input
                  type="number"
                  min="4"
                  max="44"
                  value={gaWeeks}
                  onChange={(e) => setGaWeeks(e.target.value)}
                  style={{ width: '100%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>طريقة الولادة (Mode)</label>
                <select
                  value={deliveryMode}
                  onChange={(e) => {
                    const m = e.target.value as DeliveryMode;
                    setDeliveryMode(m);
                    if (m === 'CESAREAN_EMERGENCY' || m === 'CESAREAN_PLANNED') {
                      setPrevUterineSurgery(true);
                    }
                  }}
                  style={{ width: '100%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                >
                  <option value="VAGINAL">طبيعية مهبلية (Vaginal)</option>
                  <option value="CESAREAN_PLANNED">قيصرية مجدولة (Planned C-Section)</option>
                  <option value="CESAREAN_EMERGENCY">قيصرية طارئة (Emergency C-Section)</option>
                  <option value="ASSISTED_VACUUM">مهبلية مساعدة بالشفاط (Vacuum)</option>
                  <option value="ASSISTED_FORCEPS">مهبلية مساعدة بالملقط (Forceps)</option>
                  <option value="OTHER">أخرى</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>نتيجة الحمل (Outcome)</label>
                <select
                  value={deliveryOutcome}
                  onChange={(e) => setDeliveryOutcome(e.target.value as DeliveryOutcome)}
                  style={{ width: '100%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                >
                  <option value="LIVE_BIRTH_SPONTANEOUS_VAGINAL">وليد حي - ولادة مهبلية</option>
                  <option value="LIVE_BIRTH_CESAREAN_PLANNED">وليد حي - قيصرية مجدولة</option>
                  <option value="LIVE_BIRTH_CESAREAN_EMERGENCY">وليد حي - قيصرية طارئة</option>
                  <option value="STILLBIRTH">إملاص (Stillbirth)</option>
                  <option value="MISCARRIAGE_EARLY">إجهاض مبكر (&lt; 12 أسبوع)</option>
                  <option value="MISCARRIAGE_LATE">إجهاض متأخر (12 - 24 أسبوع)</option>
                  <option value="ECTOPIC_PREGNANCY">حمل خارج الرحم (Ectopic)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>وزن المولود (جرام)</label>
                <input
                  type="number"
                  value={birthWeight}
                  onChange={(e) => setBirthWeight(e.target.value)}
                  style={{ width: '100%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>جنس المولود</label>
                <select
                  value={babyGender}
                  onChange={(e) => setBabyGender(e.target.value as 'MALE' | 'FEMALE' | 'OTHER' | 'UNDISCLOSED')}
                  style={{ width: '100%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                >
                  <option value="MALE">ذكر (Male)</option>
                  <option value="FEMALE">أنثى (Female)</option>
                  <option value="OTHER">أخرى</option>
                  <option value="UNDISCLOSED">غير محدد</option>
                </select>
              </div>
            </div>

            {/* Uterine Surgery Safeguard */}
            <div style={{ backgroundColor: '#fff7ed', border: '1px solid #fdba74', padding: '0.75rem', borderRadius: '4px', marginBottom: '0.75rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, color: '#9a3412', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={prevUterineSurgery}
                  onChange={(e) => setPrevUterineSurgery(e.target.checked)}
                />
                ⚠️ سوابق جراحة بالرحم أو ندبة قيصرية (Previous Uterine Surgery / C-Section Scar)
              </label>

              {prevUterineSurgery && (
                <div style={{ marginTop: '0.5rem' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#9a3412' }}>
                    تفاصيل الجراحة ونوع الشق الرحمي (تحديد إن كان شق كلاسيكي علوي أو مستعرض سفلي) *
                  </label>
                  <input
                    type="text"
                    required
                    value={surgeryDetails}
                    onChange={(e) => setSurgeryDetails(e.target.value)}
                    placeholder="مثال: قيصرية سابقة بشق مستعرض سفلي، أو استئصال ورم ليفي نَفَذ إلى جوف الرحم..."
                    style={{ width: '100%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  />
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>المضاعفات (إن وجدت)</label>
                <input
                  type="text"
                  value={complications}
                  onChange={(e) => setComplications(e.target.value)}
                  style={{ width: '100%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>حالة المولود والملاحظات</label>
                <input
                  type="text"
                  value={neonatalOutcome}
                  onChange={(e) => setNeonatalOutcome(e.target.value)}
                  style={{ width: '100%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>ملاحظات إضافية</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ملاحظات سريرية حول فترة النفاس والرضاعة..."
                style={{ width: '100%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '0.45rem 1.25rem',
                backgroundColor: '#16a34a',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                fontWeight: 600,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'جارٍ الحفظ...' : 'حفظ الحمل السابق ✓'}
            </button>
          </form>
        </div>
      )}

      {/* TABLE */}
      {history.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', backgroundColor: '#f8fafc', borderRadius: '6px', color: '#64748b' }}>
          لا توجد سجلات ولادات أو أحمال سابقة مسجلة للمريضة (البكرية / Primigravida).
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'right' }}>
            <thead>
              <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #cbd5e1', color: '#334155' }}>
                <th style={{ padding: '0.5rem' }}># الحمل</th>
                <th style={{ padding: '0.5rem' }}>السنة</th>
                <th style={{ padding: '0.5rem' }}>عمر الحمل</th>
                <th style={{ padding: '0.5rem' }}>النتيجة وطريقة الولادة</th>
                <th style={{ padding: '0.5rem' }}>وزن المولود</th>
                <th style={{ padding: '0.5rem' }}>جراحة بالرحم / ندبة</th>
                <th style={{ padding: '0.5rem' }}>المضاعفات والملاحظات</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '0.5rem', fontWeight: 600 }}>G{h.pregnancyNumber}</td>
                  <td style={{ padding: '0.5rem' }}>{h.yearOfDelivery ?? '—'}</td>
                  <td style={{ padding: '0.5rem' }}>{h.gestationalAgeWeeks ? `${h.gestationalAgeWeeks} أسبوع` : '—'}</td>
                  <td style={{ padding: '0.5rem' }}>
                    <div><strong>{h.deliveryOutcome}</strong></div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{h.deliveryMode}</div>
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    {h.birthWeightGrams ? `${h.birthWeightGrams} جم` : '—'} {h.babyGender ? `(${h.babyGender})` : ''}
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    {h.previousUterineSurgery ? (
                      <span
                        style={{
                          backgroundColor: '#fee2e2',
                          color: '#991b1b',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          fontWeight: 600,
                          fontSize: '0.75rem',
                          display: 'inline-block',
                        }}
                      >
                        ⚠️ نعم: {h.uterineSurgeryDetails || 'ندبة سابقة'}
                      </span>
                    ) : (
                      <span style={{ color: '#16a34a' }}>لا توجد</span>
                    )}
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    {h.complications && <div>مضاعفات: {h.complications}</div>}
                    {h.neonatalOutcome && <div style={{ color: '#64748b' }}>{h.neonatalOutcome}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

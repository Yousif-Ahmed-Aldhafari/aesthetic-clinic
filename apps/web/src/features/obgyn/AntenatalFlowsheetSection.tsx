import React, { useState } from 'react';
import type {
  PregnancyEpisodeItem,
  AntenatalVisitRecordItem,
  FetalPresentation,
} from './types.js';
import { recordAntenatalVisit, enterInErrorAntenatalVisit } from './obgyn-api.js';

interface AntenatalFlowsheetSectionProps {
  clinicId: string;
  episode: PregnancyEpisodeItem;
  visits: AntenatalVisitRecordItem[];
  csrfToken?: string;
  onRefreshVisits: () => void;
  onAuthError?: (e?: unknown) => void;
}

export const AntenatalFlowsheetSection: React.FC<AntenatalFlowsheetSectionProps> = ({
  clinicId,
  episode,
  visits,
  csrfToken,
  onRefreshVisits,
  onAuthError,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');

  // New visit form state
  const [gaWeeks, setGaWeeks] = useState(24);
  const [gaDays, setGaDays] = useState(0);
  const [systolic, setSystolic] = useState(120);
  const [diastolic, setDiastolic] = useState(80);
  const [weightKg, setWeightKg] = useState<string>('');
  const [fundalHeightCm, setFundalHeightCm] = useState<string>('');
  const [fhrBpm, setFhrBpm] = useState<string>('140');
  const [presentation, setPresentation] = useState<FetalPresentation>('CEPHALIC');
  const [movementPresent, setMovementPresent] = useState(true);
  const [urineProtein, setUrineProtein] = useState('NEGATIVE');
  const [urineGlucose, setUrineGlucose] = useState('NEGATIVE');
  const [peripheralEdema, setPeripheralEdema] = useState('NONE');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [managementPlan, setManagementPlan] = useState('');
  const [nextWeeks, setNextWeeks] = useState(4);
  const [hasSevereHeadache, setHasSevereHeadache] = useState(false);
  const [hasVisualChanges, setHasVisualChanges] = useState(false);
  const [hasEpigastricPain, setHasEpigastricPain] = useState(false);

  // Pre-eclampsia screening evaluation helper (ACOG Practice Bulletin No. 222 & ISSHP)
  const isHighBp = systolic >= 140 || diastolic >= 90;
  const isSevereBp = systolic >= 160 || diastolic >= 110;
  const hasProteinuria = urineProtein !== 'NEGATIVE' && urineProtein !== 'TRACE';
  const hasSevereSymptoms = hasSevereHeadache || hasVisualChanges || hasEpigastricPain;
  const isPreTwentyWeeks = Number(gaWeeks) < 20;

  const preeclampsiaAlert = isHighBp || isSevereBp || (hasProteinuria && !isHighBp);

  const handleCreateVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      // Find an active encounter or generate encounter reference
      // For standalone demo/flowsheet, generate standard UUID if none passed
      const encounterId = crypto.randomUUID();

      await recordAntenatalVisit(
        clinicId,
        {
          patientId: episode.patientId,
          pregnancyEpisodeId: episode.id,
          encounterId,
          gestationalAgeWeeks: Number(gaWeeks),
          gestationalAgeDays: Number(gaDays),
          systolicBp: Number(systolic),
          diastolicBp: Number(diastolic),
          weightKg: weightKg ? parseFloat(weightKg) : undefined,
          fundalHeightCm: fundalHeightCm ? parseFloat(fundalHeightCm) : undefined,
          fetalHeartRateBpm: fhrBpm ? parseInt(fhrBpm, 10) : undefined,
          fetalPresentation: presentation,
          fetalMovementPresent: movementPresent,
          urineProtein,
          urineGlucose,
          peripheralEdema,
          hasSevereHeadache: hasSevereHeadache || undefined,
          hasVisualDisturbances: hasVisualChanges || undefined,
          hasEpigastricOrRupPain: hasEpigastricPain || undefined,
          clinicalNotes: clinicalNotes.trim() || undefined,
          managementPlan: managementPlan.trim() || undefined,
          nextVisitRecommendedWeeks: Number(nextWeeks),
        },
        csrfToken,
        onAuthError,
      );

      setShowAddForm(false);
      onRefreshVisits();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoidVisit = async (visitId: string) => {
    if (!voidReason || voidReason.trim().length < 5) {
      setError('يرجى ذكر سبب إلغاء الزيارة (5 أحرف على الأقل)');
      return;
    }

    try {
      setError(null);
      await enterInErrorAntenatalVisit(clinicId, visitId, voidReason.trim(), csrfToken, onAuthError);
      setVoidingId(null);
      setVoidReason('');
      onRefreshVisits();
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="antenatal-flowsheet-section" data-testid="antenatal-flowsheet-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>
          📋 سجل ومخطط زيارات متابعة الحمل (Antenatal Care Flowsheet)
        </h3>
        <button
          type="button"
          className="btn btn-primary"
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
          {showAddForm ? 'إلغاء النموذج ✖' : '+ تسجيل زيارة حمل جديدة'}
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '4px' }}>
          ⚠️ {error}
        </div>
      )}

      {/* RECORD VISIT FORM */}
      {showAddForm && (
        <div style={{ backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '1rem', marginBottom: '1.25rem' }}>
          <h4 style={{ margin: '0 0 0.75rem 0', color: '#1e293b' }}>تسجيل زيارة متابعة حمل جديدة</h4>

          {preeclampsiaAlert && (
            <div style={{ backgroundColor: '#fee2e2', border: '1px solid #f87171', color: '#991b1b', padding: '0.65rem', borderRadius: '4px', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
              <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>
                🚨 {isPreTwentyWeeks ? 'تنبيه: اشتباه ارتفاع ضغط دم مزمن (قبل الأسبوع 20)' : isSevereBp ? 'تنبيه سريري حرج: ارتفاع ضغط دم شديد (>= 160/110 مم زئبق)' : hasProteinuria ? 'تنبيه سريري: اشتباه ما قبل الإرجاج مع زلال' : hasSevereSymptoms ? 'تنبيه سريري: اشتباه ما قبل الإرجاج مع مظاهر شديدة (Non-proteinuric)' : 'تنبيه سريري: ارتفاع ضغط دم حملي محتمل'}
              </div>
              <div>
                القياس: ({systolic}/{diastolic} مم زئبق) — الزلال: ({urineProtein}) {hasSevereSymptoms ? '— مصحوب بأعراض سريرية حرجة' : ''}
              </div>
              <div style={{ fontSize: '0.75rem', marginTop: '0.35rem', color: '#7f1d1d', borderTop: '1px dashed #fca5a5', paddingTop: '0.3rem' }}>
                ℹ️ تنبيه استرشادي لدعم القرار السريري؛ يلزم التأكيد بالقياس المتكرر وفحص الطبيب ولا يعد تشخيصاً تلقائياً أو وصفاً للعلاج.
              </div>
            </div>
          )}

          <form onSubmit={handleCreateVisit}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>عمر الحمل (أسابيع + أيام) *</label>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <input
                    type="number"
                    min="4"
                    max="45"
                    value={gaWeeks}
                    onChange={(e) => setGaWeeks(parseInt(e.target.value, 10))}
                    style={{ width: '60%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                    placeholder="أسابيع"
                  />
                  <input
                    type="number"
                    min="0"
                    max="6"
                    value={gaDays}
                    onChange={(e) => setGaDays(parseInt(e.target.value, 10))}
                    style={{ width: '40%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                    placeholder="أيام"
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>ضغط دم الأم (انقباضي / انبساطي) *</label>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <input
                    type="number"
                    min="70"
                    max="260"
                    value={systolic}
                    onChange={(e) => setSystolic(parseInt(e.target.value, 10))}
                    style={{ width: '50%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                    placeholder="انقباضي"
                  />
                  <input
                    type="number"
                    min="40"
                    max="160"
                    value={diastolic}
                    onChange={(e) => setDiastolic(parseInt(e.target.value, 10))}
                    style={{ width: '50%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                    placeholder="انبساطي"
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>الوزن (كجم)</label>
                <input
                  type="number"
                  step="0.1"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  style={{ width: '100%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>ارتفاع قعر الرحم (سم)</label>
                <input
                  type="number"
                  step="0.5"
                  value={fundalHeightCm}
                  onChange={(e) => setFundalHeightCm(e.target.value)}
                  style={{ width: '100%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>نبض الجنين (ن/دقيقة)</label>
                <input
                  type="number"
                  min="60"
                  max="220"
                  value={fhrBpm}
                  onChange={(e) => setFhrBpm(e.target.value)}
                  style={{ width: '100%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>مجيء الجنين (Presentation)</label>
                <select
                  value={presentation}
                  onChange={(e) => setPresentation(e.target.value as FetalPresentation)}
                  style={{ width: '100%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                >
                  <option value="CEPHALIC">رأسي (Cephalic)</option>
                  <option value="BREECH">مقعدي (Breech)</option>
                  <option value="TRANSVERSE">مستعرض (Transverse)</option>
                  <option value="OBLIQUE">مائل (Oblique)</option>
                  <option value="UNSTABLE">غير مستقر (Unstable)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>زلال البول (Protein)</label>
                <select
                  value={urineProtein}
                  onChange={(e) => setUrineProtein(e.target.value)}
                  style={{ width: '100%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                >
                  <option value="NEGATIVE">سلبي (Negative)</option>
                  <option value="TRACE">أثر خفيف (Trace)</option>
                  <option value="1_PLUS">+1</option>
                  <option value="2_PLUS">+2</option>
                  <option value="3_PLUS">+3</option>
                  <option value="4_PLUS">+4</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>سكر البول (Glucose)</label>
                <select
                  value={urineGlucose}
                  onChange={(e) => setUrineGlucose(e.target.value)}
                  style={{ width: '100%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                >
                  <option value="NEGATIVE">سلبي (Negative)</option>
                  <option value="TRACE">أثر خفيف (Trace)</option>
                  <option value="1_PLUS">+1</option>
                  <option value="2_PLUS">+2</option>
                  <option value="3_PLUS">+3</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>الوذمة / التورم (Edema)</label>
                <select
                  value={peripheralEdema}
                  onChange={(e) => setPeripheralEdema(e.target.value)}
                  style={{ width: '100%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                >
                  <option value="NONE">لا توجد وذمة (None)</option>
                  <option value="MILD_ANKLES">خفيفة بالكاحلين (Mild Ankles)</option>
                  <option value="MODERATE_LOWER_EXTREMITIES">متوسطة بالأطراف السفلية</option>
                  <option value="SEVERE_GENERALIZED">شديدة عامة (Generalized)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>الموعد القادم (أسابيع)</label>
                <input
                  type="number"
                  min="1"
                  max="8"
                  value={nextWeeks}
                  onChange={(e) => setNextWeeks(parseInt(e.target.value, 10))}
                  style={{ width: '100%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
              </div>
            </div>

            {/* Severe features check for preeclampsia screening */}
            <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '4px', padding: '0.6rem', marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#92400e', marginBottom: '0.35rem' }}>
                تقييم الأعراض والمظاهر الشديدة (Severe Features Evaluation):
              </div>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.75rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={hasSevereHeadache}
                    onChange={(e) => setHasSevereHeadache(e.target.checked)}
                  />
                  صداع شديد ومستمر
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={hasVisualChanges}
                    onChange={(e) => setHasVisualChanges(e.target.checked)}
                  />
                  اضطرابات بصرية / وميض
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={hasEpigastricPain}
                    onChange={(e) => setHasEpigastricPain(e.target.checked)}
                  />
                  ألم حاد في فم المعدة / الربع العلوي الأيمن
                </label>
              </div>
            </div>

            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={movementPresent}
                  onChange={(e) => setMovementPresent(e.target.checked)}
                />
                حركة الجنين محسوسة وطبيعية (Fetal Movement Present)
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>ملاحظات الفحص السريري</label>
                <textarea
                  rows={2}
                  value={clinicalNotes}
                  onChange={(e) => setClinicalNotes(e.target.value)}
                  style={{ width: '100%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  placeholder="حالة الأم، الشكاوى، الأعراض..."
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>خطة العلاج والمتابعة</label>
                <textarea
                  rows={2}
                  value={managementPlan}
                  onChange={(e) => setManagementPlan(e.target.value)}
                  style={{ width: '100%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  placeholder="الفيتامينات، الفحوصات المطلوبة، التوصيات..."
                />
              </div>
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
              {submitting ? 'جارٍ الحفظ...' : 'حفظ زيارة الحمل ✓'}
            </button>
          </form>
        </div>
      )}

      {/* FLOWSHEET TABLE */}
      {visits.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', backgroundColor: '#f8fafc', borderRadius: '6px', color: '#64748b' }}>
          لا توجد زيارات متابعة حمل مسجلة حتى الآن لدورة الحمل هذه.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'right' }}>
            <thead>
              <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #cbd5e1', color: '#334155' }}>
                <th style={{ padding: '0.5rem' }}>التاريخ</th>
                <th style={{ padding: '0.5rem' }}>عمر الحمل</th>
                <th style={{ padding: '0.5rem' }}>ضغط الدم</th>
                <th style={{ padding: '0.5rem' }}>الوزن (كجم)</th>
                <th style={{ padding: '0.5rem' }}>قعر الرحم (سم)</th>
                <th style={{ padding: '0.5rem' }}>نبض الجنين</th>
                <th style={{ padding: '0.5rem' }}>المجيء والحركة</th>
                <th style={{ padding: '0.5rem' }}>زلال / سكر</th>
                <th style={{ padding: '0.5rem' }}>الطبيب المعاين</th>
                <th style={{ padding: '0.5rem' }}>الحالة / الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {visits.map((v) => {
                const highBp = v.systolicBp >= 140 || v.diastolicBp >= 90;
                const severeBp = v.systolicBp >= 160 || v.diastolicBp >= 110;
                const isError = v.status === 'ENTERED_IN_ERROR';

                return (
                  <tr
                    key={v.id}
                    style={{
                      borderBottom: '1px solid #e2e8f0',
                      backgroundColor: isError ? '#fef2f2' : highBp ? '#fffbeb' : '#ffffff',
                      textDecoration: isError ? 'line-through' : 'none',
                      color: isError ? '#94a3b8' : 'inherit',
                    }}
                  >
                    <td style={{ padding: '0.5rem' }}>{v.visitDate.slice(0, 10)}</td>
                    <td style={{ padding: '0.5rem', fontWeight: 600 }}>
                      {v.gestationalAgeWeeks}+{v.gestationalAgeDays} أسابيع
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <span
                        style={{
                          fontWeight: highBp ? 'bold' : 'normal',
                          color: severeBp ? '#dc2626' : highBp ? '#d97706' : 'inherit',
                        }}
                      >
                        {v.systolicBp}/{v.diastolicBp}
                      </span>
                      {severeBp && <span title="ارتفاع ضغط شديد"> ⚠️</span>}
                    </td>
                    <td style={{ padding: '0.5rem' }}>{v.weightKg ?? '—'}</td>
                    <td style={{ padding: '0.5rem' }}>{v.fundalHeightCm ?? '—'}</td>
                    <td style={{ padding: '0.5rem' }}>{v.fetalHeartRateBpm ? `${v.fetalHeartRateBpm} ن/د` : '—'}</td>
                    <td style={{ padding: '0.5rem' }}>
                      {v.fetalPresentation ?? '—'} {v.fetalMovementPresent ? '(حركة +)' : '(حركة -)'}
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <span>{v.urineProtein ?? '—'}</span> / <span>{v.urineGlucose ?? '—'}</span>
                    </td>
                    <td style={{ padding: '0.5rem' }}>{v.recordedBy?.user?.name ?? '—'}</td>
                    <td style={{ padding: '0.5rem' }}>
                      {isError ? (
                        <span style={{ color: '#dc2626', fontSize: '0.75rem' }}>
                          ملغاة: {v.errorReason}
                        </span>
                      ) : (
                        <div>
                          {voidingId === v.id ? (
                            <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                              <input
                                type="text"
                                placeholder="سبب الإلغاء..."
                                value={voidReason}
                                onChange={(e) => setVoidReason(e.target.value)}
                                style={{ fontSize: '0.75rem', padding: '0.2rem' }}
                              />
                              <button
                                type="button"
                                onClick={() => handleVoidVisit(v.id)}
                                style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem', backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: '3px' }}
                              >
                                تأكيد
                              </button>
                              <button
                                type="button"
                                onClick={() => setVoidingId(null)}
                                style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem' }}
                              >
                                إلغاء
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setVoidingId(v.id)}
                              style={{
                                fontSize: '0.7rem',
                                padding: '0.15rem 0.4rem',
                                color: '#dc2626',
                                background: 'none',
                                border: '1px solid #fca5a5',
                                borderRadius: '3px',
                                cursor: 'pointer',
                              }}
                            >
                              إلغاء بخطأ
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

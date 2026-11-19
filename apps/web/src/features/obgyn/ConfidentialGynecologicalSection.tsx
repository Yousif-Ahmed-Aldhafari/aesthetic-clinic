import React, { useState } from 'react';
import type {
  GynecologicalExaminationItem,
  GynecologicalExamType,
} from './types.js';
import { recordGynecologicalExam, getGynecologicalExam } from './obgyn-api.js';

interface ConfidentialGynecologicalSectionProps {
  clinicId: string;
  patientId: string;
  exams: GynecologicalExaminationItem[];
  csrfToken?: string;
  onRefreshExams: () => void;
  onAuthError?: (e?: unknown) => void;
}

export const ConfidentialGynecologicalSection: React.FC<ConfidentialGynecologicalSectionProps> = ({
  clinicId,
  patientId,
  exams,
  csrfToken,
  onRefreshExams,
  onAuthError,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedExam, setSelectedExam] = useState<GynecologicalExaminationItem | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Form state
  const [examType, setExamType] = useState<GynecologicalExamType>('GENERAL_PELVIC');
  const [isConfidential, setIsConfidential] = useState(true);
  const [chaperoneOption, setChaperoneOption] = useState<'PRESENT' | 'DECLINED' | 'EMERGENCY_EXEMPT'>('PRESENT');
  const [chaperoneName, setChaperoneName] = useState('');
  const [chaperoneDeclinedReason, setChaperoneDeclinedReason] = useState('');
  const [chaperoneEmergencyReason, setChaperoneEmergencyReason] = useState('');
  const [indications, setIndications] = useState('');
  const [lmpDate, setLmpDate] = useState('');
  const [cycleDays, setCycleDays] = useState('28');
  const [flowDays, setFlowDays] = useState('5');
  const [dysmenorrhea, setDysmenorrhea] = useState(false);
  const [abnormalBleeding, setAbnormalBleeding] = useState('');
  const [externalFindings, setExternalFindings] = useState('');
  const [speculumFindings, setSpeculumFindings] = useState('');
  const [bimanualFindings, setBimanualFindings] = useState('');
  const [cervicalSample, setCervicalSample] = useState(false);
  const [cervicalTestType, setCervicalTestType] = useState('PAP_SMEAR_LIQUID');
  const [assessment, setAssessment] = useState('');
  const [managementPlan, setManagementPlan] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (chaperoneOption === 'PRESENT' && !chaperoneName.trim()) {
        throw new Error('يرجى كتابة اسم أو صفة المرافقة / الممرضة الحاضرة أثناء الفحص (Chaperone)');
      }
      if (chaperoneOption === 'DECLINED' && !chaperoneDeclinedReason.trim()) {
        throw new Error('يرجى توثيق سبب رفض المريضة لحضور المرافقة السريرية');
      }
      if (chaperoneOption === 'EMERGENCY_EXEMPT' && !chaperoneEmergencyReason.trim()) {
        throw new Error('يرجى توثيق التبرير السريري الطارئ للاستثناء من حضور المرافقة');
      }

      const encounterId = crypto.randomUUID();

      const chaperonePresent = chaperoneOption === 'PRESENT';
      const chaperoneNameOrId = chaperoneOption === 'PRESENT'
        ? chaperoneName.trim()
        : chaperoneOption === 'DECLINED'
          ? `DECLINED: ${chaperoneDeclinedReason.trim()}`
          : `EXEMPT: ${chaperoneEmergencyReason.trim()}`;

      await recordGynecologicalExam(
        clinicId,
        {
          patientId,
          encounterId,
          examinationType: examType,
          isConfidential,
          chaperonePresent,
          chaperoneNameOrId,
          chaperoneStatus: chaperoneOption === 'PRESENT' ? 'OFFERED_ACCEPTED' : chaperoneOption === 'DECLINED' ? 'OFFERED_DECLINED' : 'EMERGENCY_EXEMPT',
          chaperoneDeclinedReason: chaperoneOption === 'DECLINED' ? chaperoneDeclinedReason.trim() : undefined,
          chaperoneEmergencyJustification: chaperoneOption === 'EMERGENCY_EXEMPT' ? chaperoneEmergencyReason.trim() : undefined,
          indicationsSymptoms: indications.trim() || undefined,
          lastMenstrualPeriodDate: lmpDate || undefined,
          menstrualCycleDays: cycleDays ? parseInt(cycleDays, 10) : undefined,
          menstrualFlowDurationDays: flowDays ? parseInt(flowDays, 10) : undefined,
          dysmenorrheaReported: dysmenorrhea,
          abnormalBleedingPattern: abnormalBleeding.trim() || undefined,
          externalGenitaliaFindings: externalFindings.trim() || undefined,
          speculumExaminationFindings: speculumFindings.trim() || undefined,
          bimanualExaminationFindings: bimanualFindings.trim() || undefined,
          cervicalScreeningSampleCollected: cervicalSample,
          cervicalScreeningTestType: cervicalSample ? cervicalTestType : undefined,
          clinicalAssessment: assessment.trim() || undefined,
          managementPlan: managementPlan.trim() || undefined,
        },
        csrfToken,
        onAuthError,
      );

      setShowAddForm(false);
      onRefreshExams();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewDetail = async (examId: string) => {
    setLoadingDetail(true);
    setError(null);
    try {
      const full = await getGynecologicalExam(clinicId, examId, csrfToken, onAuthError);
      setSelectedExam(full);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoadingDetail(false);
    }
  };

  return (
    <div className="confidential-gynecological-section" data-testid="confidential-gynecological-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>
            🔒 الفحوصات النسائية والسريرية السرية (Confidential Gynecological Records)
          </h3>
          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.2rem' }}>
            سجلات محمية بسرية سريرية خاصة. يتم حجب وتشفير تفاصيل الفحص العيني واليدوي لغير الأطباء المصرح لهم.
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
          {showAddForm ? 'إلغاء النموذج ✖' : '+ تسجيل فحص نسائي سريري'}
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '4px' }}>
          ⚠️ {error}
        </div>
      )}

      {/* NEW EXAM FORM */}
      {showAddForm && (
        <div style={{ backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '1rem', marginBottom: '1.25rem' }}>
          <h4 style={{ margin: '0 0 0.75rem 0', color: '#1e293b' }}>تسجيل فحص نسائي سريري جديد</h4>
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>نوع الفحص (Exam Type) *</label>
                <select
                  value={examType}
                  onChange={(e) => setExamType(e.target.value as GynecologicalExamType)}
                  style={{ width: '100%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                >
                  <option value="GENERAL_PELVIC">فحص الحوض السريري العام (General Pelvic)</option>
                  <option value="CERVICAL_SCREENING">مسحة عنق الرحم (Cervical Screening)</option>
                  <option value="COLPOSCOPY">تنظير المهبل وعنق الرحم (Colposcopy)</option>
                  <option value="VULVAR_EXAMINATION">فحص الفرج والأعضاء الخارجية (Vulvar)</option>
                  <option value="ULTRASOUND_TRANSVAGINAL">سونار مهبلي (Transvaginal US)</option>
                  <option value="POST_OPERATIVE">فحص ما بعد الجراحة (Post-operative)</option>
                  <option value="OTHER">أخرى</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>تاريخ آخر دورة شهرية (LMP)</label>
                <input
                  type="date"
                  value={lmpDate}
                  onChange={(e) => setLmpDate(e.target.value)}
                  style={{ width: '100%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>طول الدورة / أيام الطمث</label>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <input
                    type="number"
                    value={cycleDays}
                    onChange={(e) => setCycleDays(e.target.value)}
                    placeholder="الدورة (يوم)"
                    style={{ width: '50%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  />
                  <input
                    type="number"
                    value={flowDays}
                    onChange={(e) => setFlowDays(e.target.value)}
                    placeholder="الطمث (يوم)"
                    style={{ width: '50%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>نمط النزيف غير الطبيعي (إن وجد)</label>
                <input
                  type="text"
                  value={abnormalBleeding}
                  onChange={(e) => setAbnormalBleeding(e.target.value)}
                  placeholder="نزيف بين الدورات، بعد الجماع، غزارة طمث..."
                  style={{ width: '100%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', paddingTop: '1.25rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={dysmenorrhea}
                    onChange={(e) => setDysmenorrhea(e.target.checked)}
                  />
                  عسر طمث / آلام شديدة مصاحبة للدورة (Dysmenorrhea)
                </label>
              </div>
            </div>

            {/* Chaperone & Confidentiality Safeguards */}
            <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #86efac', padding: '0.75rem', borderRadius: '4px', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                <div>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#166534', marginLeft: '0.5rem' }}>
                    حوكمة المرافقة السريرية (Chaperone Governance) *:
                  </span>
                  <select
                    value={chaperoneOption}
                    onChange={(e) => setChaperoneOption(e.target.value as 'PRESENT' | 'DECLINED' | 'EMERGENCY_EXEMPT')}
                    style={{ padding: '0.3rem 0.5rem', borderRadius: '4px', border: '1px solid #86efac', fontSize: '0.8rem' }}
                  >
                    <option value="PRESENT">حاضرة أثناء الفحص (Chaperone Present)</option>
                    <option value="DECLINED">عُرضت ورُفضت من قبل المريضة (Offered & Declined)</option>
                    <option value="EMERGENCY_EXEMPT">استثناء طارئ سريري / غير متوفرة (Emergency Exemption)</option>
                  </select>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600, color: '#1e40af', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={isConfidential}
                    onChange={(e) => setIsConfidential(e.target.checked)}
                  />
                  سجل سري محمي (Confidential Intimate Record)
                </label>
              </div>

              {chaperoneOption === 'PRESENT' && (
                <div style={{ marginTop: '0.5rem' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#166534' }}>
                    اسم المرافقة / الممرضة الحاضرة (أو رقم الكادر) *
                  </label>
                  <input
                    type="text"
                    required
                    value={chaperoneName}
                    onChange={(e) => setChaperoneName(e.target.value)}
                    placeholder="مثال: الممرضة فاطمة عبد الله (RN)..."
                    style={{ width: '100%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  />
                </div>
              )}

              {chaperoneOption === 'DECLINED' && (
                <div style={{ marginTop: '0.5rem' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#9a3412' }}>
                    سبب رفض المريضة لحضور المرافقة السريرية (Patient Declination Rationale) *
                  </label>
                  <input
                    type="text"
                    required
                    value={chaperoneDeclinedReason}
                    onChange={(e) => setChaperoneDeclinedReason(e.target.value)}
                    placeholder="تم إعلام المريضة بحقها في المرافقة وفضلت إجراء الفحص دون حضور مرافقة..."
                    style={{ width: '100%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #fed7aa' }}
                  />
                </div>
              )}

              {chaperoneOption === 'EMERGENCY_EXEMPT' && (
                <div style={{ marginTop: '0.5rem' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#991b1b' }}>
                    التبرير السريري الطارئ للاستثناء من المرافقة (Emergency Exemption Justification) *
                  </label>
                  <input
                    type="text"
                    required
                    value={chaperoneEmergencyReason}
                    onChange={(e) => setChaperoneEmergencyReason(e.target.value)}
                    placeholder="فحص طارئ عاجل لوقف نزيف حاد، تم توثيق الضرورة السريرية..."
                    style={{ width: '100%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #fca5a5' }}
                  />
                </div>
              )}
            </div>

            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>دواعي الفحص والأعراض (Indications)</label>
              <input
                type="text"
                value={indications}
                onChange={(e) => setIndications(e.target.value)}
                placeholder="ألم الحوض، نزيف غير منتظم، إفرازات، مسحة روتينية..."
                style={{ width: '100%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
              />
            </div>

            {/* Intimate findings section */}
            <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0.75rem', backgroundColor: '#fff', marginBottom: '0.75rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#334155', marginBottom: '0.5rem' }}>
                نتائج الفحص العيني واليدوي (Intimate Clinical Findings):
              </div>

              <div style={{ marginBottom: '0.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>الأعضاء التناسلية الخارجية (External Genitalia)</label>
                <input
                  type="text"
                  value={externalFindings}
                  onChange={(e) => setExternalFindings(e.target.value)}
                  placeholder="سليم، بدون تقرحات أو ثآليل..."
                  style={{ width: '100%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
              </div>

              <div style={{ marginBottom: '0.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>فحص منظار المهبل (Speculum Examination Findings)</label>
                <textarea
                  rows={2}
                  value={speculumFindings}
                  onChange={(e) => setSpeculumFindings(e.target.value)}
                  placeholder="حالة جدران المهبل، عنق الرحم، وجود إفرازات أو قروح..."
                  style={{ width: '100%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>الفحص اليدوي المزدوج (Bimanual Examination Findings)</label>
                <textarea
                  rows={2}
                  value={bimanualFindings}
                  onChange={(e) => setBimanualFindings(e.target.value)}
                  placeholder="حجم الرحم وحركته وموقعه، الملحقات، وجود كتل أو إيلام..."
                  style={{ width: '100%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
              </div>
            </div>

            {/* Cervical screening checkbox */}
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={cervicalSample}
                  onChange={(e) => setCervicalSample(e.target.checked)}
                />
                تم أخذ عينة مسحة عنق الرحم (Cervical Screening Sample Collected)
              </label>

              {cervicalSample && (
                <div style={{ marginTop: '0.4rem', marginRight: '1.25rem' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>نوع المسحة المخبرية</label>
                  <select
                    value={cervicalTestType}
                    onChange={(e) => setCervicalTestType(e.target.value)}
                    style={{ padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  >
                    <option value="PAP_SMEAR_LIQUID">مسحة عنق الرحم بالسائل (Liquid-Based Cytology)</option>
                    <option value="HPV_DNA">فحص الحمض النووي لفيروس الورم الحليمي (HPV DNA)</option>
                    <option value="CO_TESTING">فحص مزدوج مشترك (Co-testing LBC + HPV)</option>
                  </select>
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>التقييم السريري (Clinical Assessment)</label>
                <textarea
                  rows={2}
                  value={assessment}
                  onChange={(e) => setAssessment(e.target.value)}
                  style={{ width: '100%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>خطة العلاج والإحالة</label>
                <textarea
                  rows={2}
                  value={managementPlan}
                  onChange={(e) => setManagementPlan(e.target.value)}
                  style={{ width: '100%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
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
              {submitting ? 'جارٍ الحفظ...' : 'حفظ الفحص النسائي ✓'}
            </button>
          </form>
        </div>
      )}

      {/* EXAMS LIST */}
      {exams.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', backgroundColor: '#f8fafc', borderRadius: '6px', color: '#64748b' }}>
          لا توجد فحوصات نسائية مسجلة للمريضة.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {exams.map((ex) => (
            <div
              key={ex.id}
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                padding: '0.85rem',
                backgroundColor: '#ffffff',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontWeight: 'bold', color: '#0f172a' }}>
                    {ex.examinationType}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    ({ex.examinationDate.slice(0, 10)})
                  </span>
                  {ex.isConfidential && (
                    <span
                      style={{
                        fontSize: '0.7rem',
                        padding: '0.15rem 0.4rem',
                        borderRadius: '9999px',
                        backgroundColor: '#fef3c7',
                        color: '#92400e',
                        fontWeight: 600,
                      }}
                    >
                      🔒 سري
                    </span>
                  )}
                  {ex.chaperonePresent && (
                    <span style={{ fontSize: '0.75rem', color: '#166534' }}>
                      ✓ حضور مرافقة ({ex.chaperoneNameOrId || 'نعم'})
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleViewDetail(ex.id)}
                  disabled={loadingDetail}
                  style={{
                    fontSize: '0.75rem',
                    padding: '0.2rem 0.5rem',
                    backgroundColor: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    cursor: loadingDetail ? 'not-allowed' : 'pointer',
                  }}
                >
                  {loadingDetail ? 'جارٍ التحميل...' : 'عرض التفاصيل السريرية 🔍'}
                </button>
              </div>

              <div style={{ fontSize: '0.8rem', color: '#334155', marginTop: '0.5rem' }}>
                <strong>دواعي الفحص:</strong> {ex.indicationsSymptoms || '—'}
              </div>

              {/* Redaction indicator if intimate fields were redacted */}
              {ex.speculumExaminationFindings === null && ex.isConfidential && (
                <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: '#9a3412', backgroundColor: '#fff7ed', padding: '0.3rem 0.5rem', borderRadius: '4px' }}>
                  🛡️ التفاصيل السريرية الحميمة محجوبة طبقاً لسياسة الخصوصية. يتطلب الاطلاع صلاحية فحص نسائي مصرح بها.
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* DETAIL MODAL */}
      {selectedExam && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '8px',
              padding: '1.5rem',
              maxWidth: '650px',
              width: '90%',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>تفاصيل الفحص النسائي السريري الكامل</h3>
              <button type="button" onClick={() => setSelectedExam(null)} style={{ border: 'none', background: 'none', fontSize: '1.25rem', cursor: 'pointer' }}>✖</button>
            </div>

            <div style={{ display: 'grid', gap: '0.75rem', fontSize: '0.85rem' }}>
              <div><strong>نوع الفحص:</strong> {selectedExam.examinationType}</div>
              <div><strong>تاريخ الفحص:</strong> {selectedExam.examinationDate.slice(0, 10)}</div>
              <div><strong>المرافقة الحاضرة:</strong> {selectedExam.chaperoneNameOrId || 'مسجلة'}</div>
              <div><strong>الفاحص:</strong> {selectedExam.examiner?.user?.name || '—'}</div>
              <div><strong>دواعي الفحص والأعراض:</strong> {selectedExam.indicationsSymptoms || '—'}</div>
              <div><strong>الأعضاء التناسلية الخارجية:</strong> {selectedExam.externalGenitaliaFindings || '—'}</div>
              <div><strong>فحص المنظار:</strong> {selectedExam.speculumExaminationFindings || '—'}</div>
              <div><strong>الفحص اليدوي المزدوج:</strong> {selectedExam.bimanualExaminationFindings || '—'}</div>
              <div><strong>التقييم السريري:</strong> {selectedExam.clinicalAssessment || '—'}</div>
              <div><strong>خطة العلاج:</strong> {selectedExam.managementPlan || '—'}</div>
            </div>

            <div style={{ marginTop: '1.5rem', textAlign: 'left' }}>
              <button
                type="button"
                onClick={() => setSelectedExam(null)}
                style={{ padding: '0.4rem 1rem', backgroundColor: '#64748b', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

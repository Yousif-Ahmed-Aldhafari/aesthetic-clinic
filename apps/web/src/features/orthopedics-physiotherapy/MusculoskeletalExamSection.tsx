import React, { useState, useEffect } from 'react';
import type {
  MusculoskeletalExaminationRecord,
  AnatomicalRegion,
  Laterality,
  SpecialManeuverItem,
} from './types';
import {
  recordMusculoskeletalExam,
  listMusculoskeletalExams,
  enterInErrorMusculoskeletalExam,
} from './orthopedics-physiotherapy-api';

interface MusculoskeletalExamSectionProps {
  clinicId: string;
  patientId: string;
  encounterId: string;
  csrfToken?: string;
}

export const MusculoskeletalExamSection: React.FC<MusculoskeletalExamSectionProps> = ({
  clinicId,
  patientId,
  encounterId,
  csrfToken,
}) => {
  const [exams, setExams] = useState<MusculoskeletalExaminationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form State
  const [anatomicalRegion, setAnatomicalRegion] = useState<AnatomicalRegion>('KNEE');
  const [joint, setJoint] = useState('KNEE');
  const [laterality, setLaterality] = useState<Laterality>('RIGHT');
  const [reasonForExam, setReasonForExam] = useState('فحص روتيني لآلام الركبة وعدم الاستقرار الحركي');
  const [historyOfInjury, setHistoryOfInjury] = useState('');
  const [tendernessLocationsText, setTendernessLocationsText] = useState('Medial joint line');
  const [swellingGrade, setSwellingGrade] = useState('NONE');
  const [deformityNotes, setDeformityNotes] = useState('');
  const [neurovascularIntact, setNeurovascularIntact] = useState(true);
  const [motorStrengthMrcScale, setMotorStrengthMrcScale] = useState<number>(5);
  const [sensationFindings, setSensationFindings] = useState('');
  const [specialManeuverName, setSpecialManeuverName] = useState('Lachman Test');
  const [specialManeuverResult, setSpecialManeuverResult] = useState('NEGATIVE');
  const [clinicalAssessment, setClinicalAssessment] = useState('');

  // Enter in Error Dialog State
  const [errorModalId, setErrorModalId] = useState<string | null>(null);
  const [errorReason, setErrorReason] = useState('');

  const loadExams = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await listMusculoskeletalExams(clinicId, patientId, csrfToken);
      setExams(res.items);
    } catch (err: any) {
      setErrorMsg(err.message || 'تعذر تحميل فحوصات الجهاز العضلي الهيكلي.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExams();
  }, [clinicId, patientId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!encounterId) {
      setErrorMsg('الزيارة السريرية غير جاهزة بعد، يُرجى الانتظار.');
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const tenderness = tendernessLocationsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const maneuvers: SpecialManeuverItem[] = specialManeuverName.trim()
        ? [{ name: specialManeuverName.trim(), result: specialManeuverResult }]
        : [];

      await recordMusculoskeletalExam(
        clinicId,
        encounterId,
        {
          anatomicalRegion,
          joint: joint.trim() || anatomicalRegion,
          laterality,
          reasonForExam: reasonForExam.trim() || 'فحص الجهاز العضلي الهيكلي',
          historyOfInjury: historyOfInjury.trim() || undefined,
          tendernessLocations: tenderness.length > 0 ? tenderness : undefined,
          swellingGrade: swellingGrade || 'NONE',
          deformityNotes: deformityNotes.trim() || undefined,
          neurovascularIntact,
          motorStrengthMrcScale: Number(motorStrengthMrcScale),
          sensationFindings: sensationFindings.trim() || undefined,
          specialManeuvers: maneuvers.length > 0 ? maneuvers : undefined,
          clinicalAssessment: clinicalAssessment.trim() || undefined,
        },
        csrfToken,
      );

      setSuccessMsg('تم توثيق فحص الجهاز العضلي الهيكلي بنجاح.');
      setDeformityNotes('');
      setHistoryOfInjury('');
      setClinicalAssessment('');
      await loadExams();
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل توثيق الفحص العضلي الهيكلي.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEnterInError = async () => {
    if (!errorModalId || !errorReason.trim()) return;
    try {
      await enterInErrorMusculoskeletalExam(clinicId, errorModalId, errorReason.trim(), 1, csrfToken);
      setErrorModalId(null);
      setErrorReason('');
      setSuccessMsg('تم وسم الفحص كمدخل بالخطأ بنجاح.');
      await loadExams();
    } catch (err: any) {
      setErrorMsg(err.message || 'تعذر إلغاء الفحص كمدخل بالخطأ.');
    }
  };

  return (
    <div className="musculoskeletal-section space-y-6" dir="rtl">
      {/* Alert Messages */}
      {errorMsg && (
        <div className="p-3 bg-red-50 border-r-4 border-red-500 text-red-700 text-xs rounded">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="p-3 bg-green-50 border-r-4 border-green-500 text-green-700 text-xs rounded">
          {successMsg}
        </div>
      )}

      {/* Form Card */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-5">
        <div className="border-b border-gray-100 pb-3">
          <h3 className="text-base font-bold text-gray-900">
            توثيق فحص الجهاز العضلي الهيكلي (Musculoskeletal Physical Examination)
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            فحص شامل للمفاصل والأربطة والقوة العضلية وفق مقياس مجلس البحوث الطبية (MRC) والتكامل الوعائي العصبي.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Target Region and Laterality */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="font-bold text-gray-700 block mb-1">المنطقة التشريحية (Region) *</label>
              <select
                value={anatomicalRegion}
                onChange={(e) => {
                  const reg = e.target.value as AnatomicalRegion;
                  setAnatomicalRegion(reg);
                  setJoint(reg);
                }}
                className="w-full p-2 border border-gray-300 rounded bg-white text-xs font-semibold"
                required
              >
                <option value="KNEE">الركبة (Knee)</option>
                <option value="HIP">مفصل الورك (Hip)</option>
                <option value="SHOULDER">الكتف (Shoulder)</option>
                <option value="ELBOW">المرفق (Elbow)</option>
                <option value="WRIST_HAND">الرسغ واليد (Wrist & Hand)</option>
                <option value="ANKLE_FOOT">الكاحل والقدم (Ankle & Foot)</option>
                <option value="CERVICAL_SPINE">العمود الفقري العنقي (Cervical Spine)</option>
                <option value="LUMBAR_SPINE">العمود الفقري القطني (Lumbar Spine)</option>
                <option value="THORACIC_SPINE">العمود الفقري الصدري (Thoracic Spine)</option>
                <option value="SACROILIAC_PELVIS">الحوض والمفصل العجزي الحرقفي (Pelvis/SI)</option>
              </select>
            </div>

            <div>
              <label className="font-bold text-gray-700 block mb-1">المفصل المحدد (Joint) *</label>
              <input
                type="text"
                value={joint}
                onChange={(e) => setJoint(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded bg-white text-xs font-semibold"
                required
              />
            </div>

            <div>
              <label className="font-bold text-gray-700 block mb-1">الجانب (Laterality) *</label>
              <select
                value={laterality}
                onChange={(e) => setLaterality(e.target.value as Laterality)}
                className="w-full p-2 border border-gray-300 rounded bg-white text-xs"
                required
              >
                <option value="RIGHT">أيمن (Right)</option>
                <option value="LEFT">أيسر (Left)</option>
                <option value="BILATERAL">ثنائي الجانب (Bilateral)</option>
                <option value="AXIAL">محوري (Axial)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="font-bold text-gray-700 block mb-1">سبب الفحص السريري (Reason for Exam) *</label>
            <input
              type="text"
              value={reasonForExam}
              onChange={(e) => setReasonForExam(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded bg-white text-xs"
              required
            />
          </div>

          {/* Section 1: Inspection & Palpation */}
          <div className="border border-gray-100 bg-gray-50/50 p-3 rounded-lg space-y-3">
            <h4 className="font-bold text-gray-800 text-xs">1. المعاينة والجس (Inspection & Palpation)</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-gray-700 block mb-1">ملاحظات التشوه والاصطفاف (Deformity / Alignment):</label>
                <input
                  type="text"
                  placeholder="مثل: Valgus alignment, recurvatum, scoliosis..."
                  value={deformityNotes}
                  onChange={(e) => setDeformityNotes(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded bg-white text-xs"
                />
              </div>

              <div>
                <label className="text-gray-700 block mb-1">مواقع الألم عند الجس (Tenderness Locations):</label>
                <input
                  type="text"
                  placeholder="مفصولة بفاصلة، مثل: Medial joint line, patellar tendon..."
                  value={tendernessLocationsText}
                  onChange={(e) => setTendernessLocationsText(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded bg-white text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-gray-700 block mb-1">درجة التورم / الانصباب (Swelling Grade):</label>
                <select
                  value={swellingGrade}
                  onChange={(e) => setSwellingGrade(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded bg-white text-xs"
                >
                  <option value="NONE">بدون تورم (NONE)</option>
                  <option value="MILD">خفيف (MILD)</option>
                  <option value="MODERATE">معتدل (MODERATE)</option>
                  <option value="SEVERE">شديد (SEVERE)</option>
                </select>
              </div>

              <div>
                <label className="text-gray-700 block mb-1">تاريخ الإصابة (History of Injury):</label>
                <input
                  type="text"
                  placeholder="سقوط، التواء أثناء الرياضة، حادث مروري..."
                  value={historyOfInjury}
                  onChange={(e) => setHistoryOfInjury(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded bg-white text-xs"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Motor Power (MRC Scale) & Neurovascular */}
          <div className="border border-gray-100 bg-gray-50/50 p-3 rounded-lg space-y-3">
            <h4 className="font-bold text-gray-800 text-xs">2. القوة العضلية والسلامة العصبية الوعائية</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="font-bold text-gray-700 block mb-1">
                  درجة القوة العضلية بمقياس MRC (0–5) *
                </label>
                <select
                  value={motorStrengthMrcScale}
                  onChange={(e) => setMotorStrengthMrcScale(Number(e.target.value))}
                  className="w-full p-2 border border-gray-300 rounded bg-white text-xs font-semibold"
                  required
                >
                  <option value={5}>درجة 5: قوة طبيعية كاملة ضد المقاومة الكاملة (Grade 5)</option>
                  <option value={4}>درجة 4: حركة نشطة ضد الجاذبية وبعض المقاومة (Grade 4)</option>
                  <option value={3}>درجة 3: حركة نشطة ضد الجاذبية فقط بدون مقاومة (Grade 3)</option>
                  <option value={2}>درجة 2: حركة نشطة عند إلغاء تأثير الجاذبية (Grade 2)</option>
                  <option value={1}>درجة 1: وميض أو أثر انقباض طفيف دون حركة للمفصل (Grade 1)</option>
                  <option value={0}>درجة 0: شلل تام / انعدام أي انقباض عضلي (Grade 0)</option>
                </select>
              </div>

              <div>
                <label className="text-gray-700 block mb-1">نتائج الإحساس العصبي (Sensation Findings):</label>
                <input
                  type="text"
                  placeholder="مثل: Intact L4-S1 dermatomes bilaterally..."
                  value={sensationFindings}
                  onChange={(e) => setSensationFindings(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded bg-white text-xs"
                />
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={neurovascularIntact}
                  onChange={(e) => setNeurovascularIntact(e.target.checked)}
                  className="rounded text-blue-600"
                />
                <span className="font-semibold text-gray-800">
                  السلامة العصبية والوعائية سليمة ومحسوسة (Neurovascular Intact)
                </span>
              </label>
            </div>
          </div>

          {/* Section 3: Special Maneuvers & Assessment */}
          <div className="border border-gray-100 bg-gray-50/50 p-3 rounded-lg space-y-3">
            <h4 className="font-bold text-gray-800 text-xs">3. المناورات والاختبارات العظمية الخاصة والتقييم السريري</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-gray-700 block mb-1">اسم الاختبار العظمي الخاص:</label>
                <input
                  type="text"
                  value={specialManeuverName}
                  onChange={(e) => setSpecialManeuverName(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded bg-white text-xs font-mono"
                />
              </div>

              <div>
                <label className="text-gray-700 block mb-1">نتيجة الاختبار:</label>
                <select
                  value={specialManeuverResult}
                  onChange={(e) => setSpecialManeuverResult(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded bg-white text-xs font-bold"
                >
                  <option value="NEGATIVE">سلبي (NEGATIVE)</option>
                  <option value="POSITIVE">إيجابي (POSITIVE)</option>
                  <option value="EQUIVOCAL">مشكوك فيه (EQUIVOCAL)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="font-bold text-gray-700 block mb-1">التقييم السريري الشامل (Clinical Assessment):</label>
              <textarea
                rows={2}
                placeholder="التشخيص السريري التوجيهي أو الشك التشخيصي وخطة العلاج..."
                value={clinicalAssessment}
                onChange={(e) => setClinicalAssessment(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded bg-white text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={submitting || !encounterId}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow transition-colors disabled:opacity-50"
            >
              {submitting ? 'جارٍ الحفظ...' : 'حفظ وتوثيق الفحص السريري'}
            </button>
          </div>
        </form>
      </div>

      {/* History Table */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
        <div className="flex justify-between items-center">
          <h4 className="font-bold text-gray-900 text-sm">سجل الفحوصات العظمية السابقة للمريض</h4>
          <span className="text-xs text-gray-500">إجمالي السجلات: {exams.length}</span>
        </div>

        {loading ? (
          <div className="text-center py-6 text-gray-500 text-xs">جارٍ تحميل السجلات...</div>
        ) : exams.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 border border-dashed rounded-lg text-gray-500 text-xs">
            لا توجد فحوصات عظمية مسجلة لهذا المريض بعد.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-xs text-right">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="px-3 py-2 font-bold">التاريخ</th>
                  <th className="px-3 py-2 font-bold">المنطقة / الجانب</th>
                  <th className="px-3 py-2 font-bold">قوة العضلات (MRC)</th>
                  <th className="px-3 py-2 font-bold">سبب الفحص</th>
                  <th className="px-3 py-2 font-bold">الحالة</th>
                  <th className="px-3 py-2 font-bold text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {exams.map((ex) => (
                  <tr key={ex.id} className={ex.status === 'ENTERED_IN_ERROR' ? 'bg-red-50/40 opacity-75' : ''}>
                    <td className="px-3 py-2.5 text-gray-600">
                      {new Date(ex.createdAt).toLocaleDateString('ar-SA')}
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-gray-900">
                      {ex.anatomicalRegion} ({ex.laterality})
                    </td>
                    <td className="px-3 py-2.5 font-bold text-blue-700">
                      {ex.motorStrengthMrcScale != null ? `MRC ${ex.motorStrengthMrcScale}/5` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-gray-700 max-w-[200px] truncate" title={ex.reasonForExam}>
                      {ex.reasonForExam}
                    </td>
                    <td className="px-3 py-2.5">
                      {ex.status === 'ENTERED_IN_ERROR' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800">
                          مدخل بالخطأ
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-800">
                          معتمد
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {ex.status !== 'ENTERED_IN_ERROR' && (
                        <button
                          type="button"
                          onClick={() => {
                            setErrorModalId(ex.id);
                            setErrorReason('');
                          }}
                          className="text-red-600 hover:text-red-800 font-medium text-[11px] underline"
                        >
                          إلغاء كخطأ
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

      {/* Enter in Error Modal */}
      {errorModalId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <h4 className="font-bold text-base text-gray-900">وسم الفحص السريري كمدخل بالخطأ</h4>
            <p className="text-xs text-gray-500">
              وفق ضوابط الحوكمة السريرية، السجلات الطبية غير قابلة للحذف وإنما يتم إلغاؤها مع توثيق السبب والفاعل في سجل التدقيق.
            </p>
            <div>
              <label className="font-bold text-gray-700 block mb-1 text-xs">سبب الإلغاء السريري *</label>
              <textarea
                rows={3}
                placeholder="أدخل مبرر الإلغاء بالتفصيل..."
                value={errorReason}
                onChange={(e) => setErrorReason(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded text-xs"
              />
            </div>
            <div className="flex justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setErrorModalId(null)}
                className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
              >
                تراجع
              </button>
              <button
                type="button"
                disabled={!errorReason.trim()}
                onClick={handleEnterInError}
                className="px-4 py-2 bg-red-600 text-white rounded font-bold hover:bg-red-700 disabled:opacity-50"
              >
                تأكيد الإلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

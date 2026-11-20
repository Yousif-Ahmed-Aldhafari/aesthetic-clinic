import React, { useState, useEffect } from 'react';
import type {
  PhysiotherapySessionRecord,
  PhysiotherapyRehabilitationEpisode,
  ExerciseItem,
} from './types';
import {
  recordPhysiotherapySession,
  listPhysiotherapySessions,
  listRehabilitationEpisodes,
  enterInErrorPhysiotherapySession,
} from './orthopedics-physiotherapy-api';

interface PhysiotherapySessionSectionProps {
  clinicId: string;
  patientId: string;
  encounterId: string;
  csrfToken?: string;
}

const COMMON_MODALITIES = [
  'العلاج الحراري (Thermotherapy / Hot Pack)',
  'العلاج بالتبريد (Cryotherapy / Ice Pack)',
  'التحفيز الكهربائي العصبي (TENS / NMES)',
  'الموجات فوق الصوتية العلاجية (Therapeutic Ultrasound)',
  'العلاج اليدوي وتحريك المفاصل (Manual Therapy & Joint Mobilization)',
  'تمارين التقوية الحركية (Strengthening Exercises)',
  'تمارين الإطالة والمرونة (Flexibility & Stretching)',
  'تدريب المشي والتوازن (Gait & Balance Training)',
  'التحرير الليفي العضلي (Myofascial Release)',
];

export const PhysiotherapySessionSection: React.FC<PhysiotherapySessionSectionProps> = ({
  clinicId,
  patientId,
  encounterId,
  csrfToken,
}) => {
  const [sessions, setSessions] = useState<PhysiotherapySessionRecord[]>([]);
  const [episodes, setEpisodes] = useState<PhysiotherapyRehabilitationEpisode[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form State
  const [episodeId, setEpisodeId] = useState<string>('');
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState<number>(45);
  const [selectedModalities, setSelectedModalities] = useState<string[]>([
    'تمارين التقوية الحركية (Strengthening Exercises)',
  ]);
  const [preSessionVasPain, setPreSessionVasPain] = useState<number>(6);
  const [postSessionVasPain, setPostSessionVasPain] = useState<number>(3);
  const [functionalProgressNotes, setFunctionalProgressNotes] = useState(
    'تحسن ملحوظ في الثبات المفصلي والمدى الحركي مع انخفاض الألم بعد الجلسة.',
  );
  const [patientToleranceNotes, setPatientToleranceNotes] = useState('تحمل جيد للجلسة دون إجهاد مفرط');
  const [adverseEvents, setAdverseEvents] = useState('');

  // Exercises
  const [exercises, setExercises] = useState<ExerciseItem[]>([
    { exercise: 'Straight Leg Raise (SLR)', sets: 3, reps: 10, resistanceKg: 0 },
    { exercise: 'Quad Sets / Isometric', sets: 3, reps: 15, resistanceKg: 0 },
  ]);

  // Enter in Error Dialog State
  const [errorModalId, setErrorModalId] = useState<string | null>(null);
  const [errorReason, setErrorReason] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const [sessionsRes, episodesRes] = await Promise.all([
        listPhysiotherapySessions(clinicId, patientId, csrfToken),
        listRehabilitationEpisodes(clinicId, patientId, csrfToken),
      ]);
      setSessions(sessionsRes.items);
      setEpisodes(episodesRes.items);
      if (episodesRes.items.length > 0 && !episodeId) {
        setEpisodeId(episodesRes.items[0].id);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'تعذر تحميل جلسات العلاج الطبيعي.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [clinicId, patientId]);

  const handleAddExercise = () => {
    setExercises([...exercises, { exercise: '', sets: 3, reps: 10, resistanceKg: 0 }]);
  };

  const handleExerciseChange = (index: number, field: keyof ExerciseItem, value: any) => {
    const updated = [...exercises];
    updated[index] = { ...updated[index], [field]: value };
    setExercises(updated);
  };

  const handleRemoveExercise = (index: number) => {
    setExercises(exercises.filter((_, i) => i !== index));
  };

  const toggleModality = (modality: string) => {
    if (selectedModalities.includes(modality)) {
      setSelectedModalities(selectedModalities.filter((m) => m !== modality));
    } else {
      setSelectedModalities([...selectedModalities, modality]);
    }
  };

  // VAS Delta Analytics preview
  const vasDelta = preSessionVasPain - postSessionVasPain;
  let painTrendClass = 'bg-gray-100 text-gray-700';
  let painTrendLabel = 'لا تغيير في شدة الألم';
  if (vasDelta > 0) {
    painTrendClass = 'bg-green-100 text-green-800';
    painTrendLabel = `تحسن في الألم بمقدار ${vasDelta} درجات`;
  } else if (vasDelta < 0) {
    painTrendClass = 'bg-red-100 text-red-800';
    painTrendLabel = `تفاقم الألم بمقدار ${Math.abs(vasDelta)} درجات`;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const validExercises = exercises
        .filter((ex) => ex.exercise.trim().length > 0)
        .map((ex) => ({
          exercise: ex.exercise.trim(),
          sets: Number(ex.sets) || undefined,
          reps: Number(ex.reps) || undefined,
          resistanceKg: ex.resistanceKg != null ? Number(ex.resistanceKg) : undefined,
          durationMinutes: ex.durationMinutes != null ? Number(ex.durationMinutes) : undefined,
        }));

      await recordPhysiotherapySession(
        clinicId,
        encounterId,
        {
          patientId,
          episodeId: episodeId || undefined,
          sessionDurationMinutes: Number(sessionDurationMinutes) || 45,
          treatmentModalities: selectedModalities.length > 0 ? selectedModalities : ['تمارين علاجية'],
          exerciseDetails: validExercises,
          preSessionPainVas: Number(preSessionVasPain),
          postSessionPainVas: Number(postSessionVasPain),
          functionalProgressNotes: functionalProgressNotes.trim() || 'تقدم ملحوظ وفق الخطة التأهيلية.',
          patientReportedTolerance: patientToleranceNotes.trim() || undefined,
          adverseEvents: adverseEvents.trim() || undefined,
        },
        csrfToken,
      );

      setSuccessMsg('تم حفظ وتوثيق جلسة العلاج الطبيعي بنجاح.');
      setFunctionalProgressNotes('');
      setAdverseEvents('');
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل توثيق جلسة العلاج الطبيعي.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEnterInError = async () => {
    if (!errorModalId) return;
    try {
      await enterInErrorPhysiotherapySession(
        clinicId,
        errorModalId,
        errorReason.trim() || 'إلغاء لخطأ في الإدخال',
        1,
        csrfToken,
      );
      setErrorModalId(null);
      setErrorReason('');
      setSuccessMsg('تم تأشير الجلسة كمدخلة بالخطأ.');
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'تعذر إلغاء الجلسة.');
    }
  };

  return (
    <div className="physiotherapy-session-section space-y-6" dir="rtl">
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

      {/* Main Form Card */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
        <div className="border-b border-gray-100 pb-3">
          <h3 className="text-base font-bold text-gray-900">
            توثيق جلسة العلاج الطبيعي والتأهيل الحركي
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            تسجيل التقنيات العلاجية المنفذة، تمارين التقوية، وقياس التغير في شدة الألم (VAS Delta) بين بداية ونهاية الجلسة.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Episode selection & duration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="font-bold text-gray-700 block mb-1">الربط بخطة التأهيل (اختياري):</label>
              <select
                value={episodeId}
                onChange={(e) => setEpisodeId(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded bg-white text-xs font-semibold"
              >
                <option value="">بدون ربط مباشر بخطة تأهيل</option>
                {episodes.map((ep) => (
                  <option key={ep.id} value={ep.id}>
                    {ep.rehabilitationGoal} ({ep.status})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-bold text-gray-700 block mb-1">مدة الجلسة بالدقائق *</label>
              <input
                type="number"
                min="5"
                max="240"
                value={sessionDurationMinutes}
                onChange={(e) => setSessionDurationMinutes(Number(e.target.value))}
                className="w-full p-2 border border-gray-300 rounded bg-white text-xs"
                required
              />
            </div>
          </div>

          {/* Treatment Modalities Multi-Check */}
          <div>
            <label className="font-bold text-gray-700 block mb-2">
              الطرائق والتقنيات العلاجية المطبقة (Treatment Modalities) *:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
              {COMMON_MODALITIES.map((mod) => (
                <label key={mod} className="flex items-center gap-2 cursor-pointer text-[11px]">
                  <input
                    type="checkbox"
                    checked={selectedModalities.includes(mod)}
                    onChange={() => toggleModality(mod)}
                    className="rounded text-blue-600"
                  />
                  <span>{mod}</span>
                </label>
              ))}
            </div>
          </div>

          {/* VAS Pain Scale Delta Tracking */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-3">
            <div className="flex justify-between items-center">
              <span className="font-bold text-blue-950 text-xs">
                مقياس الألم البصري التناظري وتتبع الاستجابة (Visual Analog Scale - VAS Pain Delta):
              </span>
              <span className={`px-2.5 py-1 rounded text-xs font-bold ${painTrendClass}`}>
                {painTrendLabel}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                  <span>الألم قبل الجلسة (Pre-Session VAS):</span>
                  <span className="font-black text-red-600">{preSessionVasPain} / 10</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="10"
                  value={preSessionVasPain}
                  onChange={(e) => setPreSessionVasPain(Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                  <span>0 (لا ألم)</span>
                  <span>5 (متوسط)</span>
                  <span>10 (أشد ألم ممكن)</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                  <span>الألم بعد الجلسة (Post-Session VAS):</span>
                  <span className="font-black text-blue-600">{postSessionVasPain} / 10</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="10"
                  value={postSessionVasPain}
                  onChange={(e) => setPostSessionVasPain(Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                  <span>0 (لا ألم)</span>
                  <span>5 (متوسط)</span>
                  <span>10 (أشد ألم ممكن)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Exercise List */}
          <div className="border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="font-bold text-gray-800 text-xs">التمارين العلاجية المنفذة بالجلسة:</h4>
              <button
                type="button"
                onClick={handleAddExercise}
                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs rounded font-semibold"
              >
                + إضافة تمرين
              </button>
            </div>

            <div className="space-y-2">
              {exercises.map((ex, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-gray-50 p-2 rounded">
                  <div className="col-span-12 sm:col-span-5">
                    <input
                      type="text"
                      placeholder="اسم التمرين (Exercise)..."
                      value={ex.exercise}
                      onChange={(e) => handleExerciseChange(idx, 'exercise', e.target.value)}
                      className="w-full p-1.5 border border-gray-300 rounded text-xs bg-white"
                    />
                  </div>
                  <div className="col-span-3 sm:col-span-2">
                    <input
                      type="number"
                      placeholder="المجموعات (Sets)"
                      value={ex.sets ?? ''}
                      onChange={(e) => handleExerciseChange(idx, 'sets', e.target.value)}
                      className="w-full p-1.5 border border-gray-300 rounded text-xs bg-white"
                    />
                  </div>
                  <div className="col-span-3 sm:col-span-2">
                    <input
                      type="number"
                      placeholder="التكرار (Reps)"
                      value={ex.reps ?? ''}
                      onChange={(e) => handleExerciseChange(idx, 'reps', e.target.value)}
                      className="w-full p-1.5 border border-gray-300 rounded text-xs bg-white"
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <input
                      type="number"
                      placeholder="مقاومة (كغ)"
                      value={ex.resistanceKg ?? ''}
                      onChange={(e) => handleExerciseChange(idx, 'resistanceKg', e.target.value)}
                      className="w-full p-1.5 border border-gray-300 rounded text-xs bg-white"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1 text-center">
                    <button
                      type="button"
                      onClick={() => handleRemoveExercise(idx)}
                      className="text-red-500 hover:text-red-700 font-bold"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Progress Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="font-bold text-gray-700 block mb-1">
                ملاحظات التقدم الوظيفي (Progress Notes) *
              </label>
              <textarea
                rows={2}
                placeholder="مدى استجابة المريض للتمارين، الثبات المفصلي، والتحسن الوظيفي..."
                value={functionalProgressNotes}
                onChange={(e) => setFunctionalProgressNotes(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded bg-white text-xs"
                required
              />
            </div>

            <div>
              <label className="font-bold text-gray-700 block mb-1">
                تحمل المريض (Patient Tolerance):
              </label>
              <textarea
                rows={2}
                placeholder="مدى تحمل المريض للتمارين والإجهاد..."
                value={patientToleranceNotes}
                onChange={(e) => setPatientToleranceNotes(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded bg-white text-xs"
              />
            </div>

            <div>
              <label className="font-bold text-gray-700 block mb-1">
                أي أعراض جانبية (Adverse Events):
              </label>
              <textarea
                rows={2}
                placeholder="أي ألم مفاجئ، دوار، أو تورم بعد الجلسة..."
                value={adverseEvents}
                onChange={(e) => setAdverseEvents(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded bg-white text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow transition-colors disabled:opacity-50"
            >
              {submitting ? 'جارٍ الحفظ...' : 'حفظ وتوثيق جلسة العلاج الطبيعي'}
            </button>
          </div>
        </form>
      </div>

      {/* Historical Sessions Table */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
        <div className="flex justify-between items-center">
          <h4 className="font-bold text-gray-900 text-sm">سجل جلسات العلاج الطبيعي الموثقة</h4>
          <span className="text-xs text-gray-500">إجمالي الجلسات: {sessions.length}</span>
        </div>

        {loading ? (
          <div className="text-center py-6 text-gray-500 text-xs">جارٍ تحميل الجلسات...</div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 border border-dashed rounded-lg text-gray-500 text-xs">
            لا توجد جلسات مسجلة لهذا المريض بعد.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-xs text-right">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="px-3 py-2 font-bold">التاريخ</th>
                  <th className="px-3 py-2 font-bold">المدة</th>
                  <th className="px-3 py-2 font-bold">مقياس الألم (قبل ← بعد)</th>
                  <th className="px-3 py-2 font-bold">فرق الألم (VAS Delta)</th>
                  <th className="px-3 py-2 font-bold">ملاحظات التقدم</th>
                  <th className="px-3 py-2 font-bold">الحالة</th>
                  <th className="px-3 py-2 font-bold">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {sessions.map((s) => {
                  const delta = s.preSessionPainVas - s.postSessionPainVas;
                  return (
                    <tr key={s.id}>
                      <td className="px-3 py-2.5 text-gray-600">
                        {new Date(s.createdAt).toLocaleDateString('ar-SA')}
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-gray-900">
                        {s.sessionDurationMinutes} دقيقة
                      </td>
                      <td className="px-3 py-2.5 font-bold">
                        <span className="text-red-600">{s.preSessionPainVas}</span>
                        {' ← '}
                        <span className="text-blue-600">{s.postSessionPainVas}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            delta > 0
                              ? 'bg-green-100 text-green-800'
                              : delta < 0
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {delta > 0 ? `+${delta} تحسن` : delta < 0 ? `${delta} تفاقم` : 'لا تغيير'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-gray-700 max-w-xs truncate">
                        {s.functionalProgressNotes}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            s.status === 'FINALIZED'
                              ? 'bg-green-100 text-green-800'
                              : s.status === 'ENTERED_IN_ERROR'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {s.status !== 'ENTERED_IN_ERROR' && (
                          <button
                            onClick={() => setErrorModalId(s.id)}
                            className="px-2 py-1 text-[10px] text-red-600 hover:bg-red-50 font-semibold rounded border border-red-200"
                          >
                            إلغاء لخطأ
                          </button>
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

      {/* Enter in Error Modal */}
      {errorModalId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" dir="rtl">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
            <h4 className="font-bold text-gray-900 text-sm">إلغاء جلسة علاج طبيعي مسجلة بالخطأ</h4>
            <div>
              <label className="font-bold text-gray-700 block mb-1 text-xs">سبب الإلغاء (إلزامي):</label>
              <textarea
                rows={3}
                value={errorReason}
                onChange={(e) => setErrorReason(e.target.value)}
                placeholder="اكتب سبب إلغاء الجلسة..."
                className="w-full p-2 border border-gray-300 rounded bg-white text-xs"
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setErrorModalId(null);
                  setErrorReason('');
                }}
                className="px-4 py-2 border border-gray-300 rounded text-xs text-gray-700 hover:bg-gray-50"
              >
                تراجع
              </button>
              <button
                onClick={handleEnterInError}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-bold"
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

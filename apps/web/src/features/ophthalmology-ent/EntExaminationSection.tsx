import React, { useState, useEffect } from 'react';
import type {
  EntExaminationRecord,
  TonsilFriedmanGrade,
} from './types';
import {
  recordEntExam,
  listEntExams,
  enterInErrorEntExam,
  type RecordEntExamInput,
} from './ophthalmology-ent-api';

interface EntExaminationSectionProps {
  clinicId: string;
  patientId: string;
  encounterId: string;
  csrfToken?: string;
  hasPrivilege: boolean;
}

const TONSIL_GRADES: { label: string; value: TonsilFriedmanGrade }[] = [
  { label: 'الدرجة 0: مستأصلة جراحياً (Surgically Absent)', value: 'GRADE_0_SURGICALLY_ABSENT' },
  { label: 'الدرجة 1: داخل حفرة اللوزة دون تجاوز الأعمدة (Within Pillars <25%)', value: 'GRADE_1_WITHIN_PILLARS' },
  { label: 'الدرجة 2: ممتدة للأعمدة الحنكية (Extending to Pillars 25-50%)', value: 'GRADE_2_EXTENDING_TO_PILLARS' },
  { label: 'الدرجة 3: متجاوزة الأعمدة الحنكية (Beyond Pillars 50-75%)', value: 'GRADE_3_BEYOND_PILLARS' },
  { label: 'الدرجة 4: لوزتان متلامستان "Kissing Tonsils" (>75%)', value: 'GRADE_4_KISSING_TONSILS' },
];

export const EntExaminationSection: React.FC<EntExaminationSectionProps> = ({
  clinicId,
  patientId,
  encounterId,
  csrfToken,
  hasPrivilege,
}) => {
  const [records, setRecords] = useState<EntExaminationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Otoscopy Form State
  const [rEarCanal, setREarCanal] = useState<string>('Clear, no cerumen or edema');
  const [rTm, setRTm] = useState<string>('Intact, translucent, good cone of light');
  const [lEarCanal, setLEarCanal] = useState<string>('Clear, no cerumen or edema');
  const [lTm, setLTm] = useState<string>('Intact, translucent, good cone of light');

  // Rhinoscopy Form State
  const [septum, setSeptum] = useState<string>('Midline, no perforation or spur');
  const [turbinates, setTurbinates] = useState<string>('Normal size and color');
  const [polyps, setPolyps] = useState<boolean>(false);
  const [discharge, setDischarge] = useState<string>('None');

  // Oropharynx & Larynx Form State
  const [tonsilGrade, setTonsilGrade] = useState<TonsilFriedmanGrade>('GRADE_1_WITHIN_PILLARS');
  const [posteriorWall, setPosteriorWall] = useState<string>('Normal, no cobblestoning');
  const [uvulaSymmetry, setUvulaSymmetry] = useState<string>('Midline uvula, symmetric palate elevation');
  const [vocalCords, setVocalCords] = useState<string>('Mobile, normal phonation');
  const [notes, setNotes] = useState<string>('');

  // Error modal
  const [errorModalId, setErrorModalId] = useState<string | null>(null);
  const [errorReason, setErrorReason] = useState<string>('');

  const loadRecords = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await listEntExams(clinicId, patientId, csrfToken);
      setRecords(res.items);
    } catch (err: any) {
      setError(err?.message || 'فشل في تحميل سجلات فحص الأنف والأذن والحنجرة');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, [clinicId, patientId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasPrivilege) {
      setError('لا تملك الصلاحية السريرية المطلوبة (ENT_EXAM_DOCUMENT) لتوثيق فحص الأنف والأذن والحنجرة');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const input: RecordEntExamInput = {
        encounterId,
        rightEarCanal: rEarCanal || null,
        rightTympanicMembrane: rTm || null,
        leftEarCanal: lEarCanal || null,
        leftTympanicMembrane: lTm || null,
        nasalSeptumDeformity: septum || null,
        turbinateHypertrophy: turbinates || null,
        nasalPolypsPresent: polyps,
        nasalDischargeDescription: discharge || null,
        tonsilSizeGrade: tonsilGrade,
        posteriorPharyngealWall: posteriorWall || null,
        uvulaPalateSymmetry: uvulaSymmetry || null,
        vocalCordMobility: vocalCords || null,
        clinicalNotes: notes || null,
      };

      await recordEntExam(clinicId, encounterId, input, csrfToken);
      setSuccess('تم حفظ فحص الأنف والأذن والحنجرة بنجاح');
      setNotes('');
      await loadRecords();
    } catch (err: any) {
      setError(err?.message || 'فشل في حفظ فحص الأنف والأذن والحنجرة');
    } finally {
      setSaving(false);
    }
  };

  const handleEnterInError = async (id: string) => {
    if (!errorReason.trim()) {
      alert('يرجى تقديم سبب واضح للإلغاء');
      return;
    }
    try {
      await enterInErrorEntExam(clinicId, id, errorReason, csrfToken);
      setErrorModalId(null);
      setErrorReason('');
      await loadRecords();
    } catch (err: any) {
      alert(err?.message || 'فشل في إلغاء السجل');
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded-md">
          {success}
        </div>
      )}

      {/* ENT Exam Form */}
      <div className="bg-white p-5 border border-gray-200 rounded-lg shadow-sm">
        <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
          <span>👂👃🗣️</span>
          <span>فحص الأنف والأذن والحنجرة السريري (Clinical ENT Examination)</span>
        </h3>

        <form onSubmit={handleSave} className="space-y-5">
          {/* 1. Otoscopy (تنظير الأذن) */}
          <div className="border border-gray-200 rounded-lg p-4 space-y-3">
            <h4 className="text-xs font-bold text-gray-700 border-b pb-2 flex items-center gap-1">
              <span>👂</span>
              <span>تنظير الأذن الخارجي وغشاء الطبل (Otoscopy)</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Right Ear */}
              <div className="p-3 bg-red-50/30 rounded border border-red-100 space-y-2">
                <span className="font-bold text-red-700">الأذن اليمنى (Right Ear)</span>
                <div>
                  <label className="block text-gray-600 mb-1">القناة السمعية الخارجية</label>
                  <input
                    type="text"
                    value={rEarCanal}
                    onChange={(e) => setREarCanal(e.target.value)}
                    className="w-full p-1.5 border border-gray-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">غشاء الطبل والمخروط الضوئي</label>
                  <input
                    type="text"
                    value={rTm}
                    onChange={(e) => setRTm(e.target.value)}
                    className="w-full p-1.5 border border-gray-300 rounded"
                  />
                </div>
              </div>

              {/* Left Ear */}
              <div className="p-3 bg-blue-50/30 rounded border border-blue-100 space-y-2">
                <span className="font-bold text-blue-700">الأذن اليسرى (Left Ear)</span>
                <div>
                  <label className="block text-gray-600 mb-1">القناة السمعية الخارجية</label>
                  <input
                    type="text"
                    value={lEarCanal}
                    onChange={(e) => setLEarCanal(e.target.value)}
                    className="w-full p-1.5 border border-gray-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">غشاء الطبل والمخروط الضوئي</label>
                  <input
                    type="text"
                    value={lTm}
                    onChange={(e) => setLTm(e.target.value)}
                    className="w-full p-1.5 border border-gray-300 rounded"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 2. Anterior Rhinoscopy (تنظير الأنف الأمامي) */}
          <div className="border border-gray-200 rounded-lg p-4 space-y-3">
            <h4 className="text-xs font-bold text-gray-700 border-b pb-2 flex items-center gap-1">
              <span>👃</span>
              <span>تنظير الأنف والممرات الهوائية (Anterior Rhinoscopy)</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-gray-600 mb-1">الحاجز الأنفي (Nasal Septum)</label>
                <input
                  type="text"
                  value={septum}
                  onChange={(e) => setSeptum(e.target.value)}
                  className="w-full p-1.5 border border-gray-300 rounded"
                />
              </div>
              <div>
                <label className="block text-gray-600 mb-1">القرينات الأنفية (Turbinates)</label>
                <input
                  type="text"
                  value={turbinates}
                  onChange={(e) => setTurbinates(e.target.value)}
                  className="w-full p-1.5 border border-gray-300 rounded"
                />
              </div>
              <div>
                <label className="block text-gray-600 mb-1">الإفرازات الأنفية (Nasal Discharge)</label>
                <input
                  type="text"
                  value={discharge}
                  onChange={(e) => setDischarge(e.target.value)}
                  className="w-full p-1.5 border border-gray-300 rounded"
                />
              </div>
              <div className="flex items-center gap-3 pt-4">
                <input
                  type="checkbox"
                  id="polyps"
                  checked={polyps}
                  onChange={(e) => setPolyps(e.target.checked)}
                  className="h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                <label htmlFor="polyps" className="text-xs font-semibold text-gray-700">
                  وجود سلائل أنفية (Nasal Polyps Present)
                </label>
              </div>
            </div>
          </div>

          {/* 3. Oropharynx & Friedman Grading (فحص الفم والبلعوم) */}
          <div className="border border-gray-200 rounded-lg p-4 space-y-3">
            <h4 className="text-xs font-bold text-gray-700 border-b pb-2 flex items-center gap-1">
              <span>🗣️</span>
              <span>فحص الفم والبلعوم والحنجرة (Oropharynx & Laryngeal Assessment)</span>
            </h4>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-700 font-semibold mb-1">
                  درجة حجم اللوزتين حسب مقياس فريدمان (Friedman Tonsil Size Grade)
                </label>
                <select
                  value={tonsilGrade}
                  onChange={(e) => setTonsilGrade(e.target.value as TonsilFriedmanGrade)}
                  className="w-full p-2 border border-gray-300 rounded bg-white"
                >
                  {TONSIL_GRADES.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-gray-600 mb-1">الجدار الخلفي للبلعوم</label>
                  <input
                    type="text"
                    value={posteriorWall}
                    onChange={(e) => setPosteriorWall(e.target.value)}
                    className="w-full p-1.5 border border-gray-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">تناظر اللهاة وسقف الحلق</label>
                  <input
                    type="text"
                    value={uvulaSymmetry}
                    onChange={(e) => setUvulaSymmetry(e.target.value)}
                    className="w-full p-1.5 border border-gray-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">حركة الحبال الصوتية</label>
                  <input
                    type="text"
                    value={vocalCords}
                    onChange={(e) => setVocalCords(e.target.value)}
                    className="w-full p-1.5 border border-gray-300 rounded"
                  />
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">ملاحظات الطبيب وتوصيات العلاج</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="التشخيص النهائي، التوصيات بالعلاج الدوائي أو الإحالة لاختبارات السمع..."
              className="w-full text-sm border-gray-300 rounded-md p-2 border"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md text-sm transition-colors disabled:opacity-50"
            >
              {saving ? 'جارٍ الحفظ...' : 'حفظ فحص الأنف والأذن والحنجرة'}
            </button>
          </div>
        </form>
      </div>

      {/* Historical Records List */}
      <div className="bg-white p-5 border border-gray-200 rounded-lg shadow-sm">
        <h4 className="text-sm font-bold text-gray-700 mb-3">سجل فحوصات الأنف والأذن والحنجرة السابقة</h4>
        {loading ? (
          <div className="text-xs text-gray-500 py-4 text-center">جارٍ التحميل...</div>
        ) : records.length === 0 ? (
          <div className="text-xs text-gray-400 py-4 text-center">لا توجد فحوصات أنف وأذن وحنجرة مسجلة لهذا المريض</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-right">التاريخ</th>
                  <th className="px-3 py-2 text-center">درجة اللوزتين (Friedman)</th>
                  <th className="px-3 py-2 text-center">السلائل الأنفية</th>
                  <th className="px-3 py-2 text-center">غشاء الطبل</th>
                  <th className="px-3 py-2 text-center">الحالة</th>
                  <th className="px-3 py-2 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {records.map((rec) => (
                  <tr key={rec.id} className={rec.status === 'ENTERED_IN_ERROR' ? 'opacity-40 line-through' : ''}>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {new Date(rec.createdAt).toLocaleDateString('ar-SA')}
                    </td>
                    <td className="px-3 py-2 text-center font-medium">{rec.tonsilSizeGrade}</td>
                    <td className="px-3 py-2 text-center">
                      {rec.nasalPolypsPresent ? (
                        <span className="text-red-600 font-bold">موجودة</span>
                      ) : (
                        <span className="text-green-600">غير موجودة</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center text-gray-600">
                      R: {rec.rightTympanicMembrane ? 'سليم' : '—'} / L: {rec.leftTympanicMembrane ? 'سليم' : '—'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          rec.status === 'FINALIZED'
                            ? 'bg-green-100 text-green-800'
                            : rec.status === 'ENTERED_IN_ERROR'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {rec.status === 'FINALIZED' ? 'معتمد' : rec.status === 'ENTERED_IN_ERROR' ? 'ملغي كخطأ' : 'مسودة'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {rec.status !== 'ENTERED_IN_ERROR' && (
                        <button
                          type="button"
                          onClick={() => setErrorModalId(rec.id)}
                          className="text-red-600 hover:text-red-800 font-medium"
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-5 max-w-md w-full shadow-lg space-y-4">
            <h4 className="font-bold text-gray-800 text-sm">تأكيد إلغاء السجل كخطأ إدخال</h4>
            <p className="text-xs text-gray-600">
              سيتم وسم الفحص كملغي مع إثبات هوية الطبيب وتاريخ الإلغاء في سجلات التدقيق.
            </p>
            <textarea
              rows={3}
              value={errorReason}
              onChange={(e) => setErrorReason(e.target.value)}
              placeholder="اكتب سبب الإلغاء السريري هنا..."
              className="w-full text-xs border border-gray-300 rounded p-2"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setErrorModalId(null);
                  setErrorReason('');
                }}
                className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50"
              >
                تراجع
              </button>
              <button
                type="button"
                onClick={() => handleEnterInError(errorModalId)}
                className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 font-medium"
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

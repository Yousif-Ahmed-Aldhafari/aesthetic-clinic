import React, { useState, useEffect } from 'react';
import type {
  PhysiotherapyRehabilitationEpisode,
  RehabEpisodeStatus,
} from './types';
import {
  createRehabilitationEpisode,
  listRehabilitationEpisodes,
  updateEpisodeStatus,
} from './orthopedics-physiotherapy-api';

interface RehabilitationPlanSectionProps {
  clinicId: string;
  patientId: string;
  encounterId?: string;
  csrfToken?: string;
}

export const RehabilitationPlanSection: React.FC<RehabilitationPlanSectionProps> = ({
  clinicId,
  patientId,
  encounterId,
  csrfToken,
}) => {
  const [episodes, setEpisodes] = useState<PhysiotherapyRehabilitationEpisode[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form State
  const [rehabilitationGoal, setRehabilitationGoal] = useState('');
  const [functionalBaseline, setFunctionalBaseline] = useState(
    'محددية حركية مع ألم عند التحميل وعرج خفيف',
  );
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [targetEndDate, setTargetEndDate] = useState('');
  const [visitFrequencyPerWeek, setVisitFrequencyPerWeek] = useState<number>(3);
  const [interventionsText, setInterventionsText] = useState(
    'علاج يدوي، تمارين تقوية حركية، تدريب مشي وتوازن',
  );

  // Status Modal State
  const [statusModalEpisode, setStatusModalEpisode] = useState<PhysiotherapyRehabilitationEpisode | null>(null);
  const [newStatus, setNewStatus] = useState<RehabEpisodeStatus>('ACTIVE');
  const [dischargeSummary, setDischargeSummary] = useState('');

  const loadEpisodes = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await listRehabilitationEpisodes(clinicId, patientId, csrfToken);
      setEpisodes(res.items);
    } catch (err: any) {
      setErrorMsg(err.message || 'تعذر تحميل خطط التأهيل الحركي.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEpisodes();
  }, [clinicId, patientId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const plannedInterventions = interventionsText
        .split(/[،,]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      await createRehabilitationEpisode(
        clinicId,
        {
          patientId,
          encounterId: encounterId || undefined,
          rehabilitationGoal: rehabilitationGoal.trim(),
          functionalBaseline: functionalBaseline.trim() || 'محددية حركية مع ألم عند التحميل وعرج خفيف',
          startDate,
          targetEndDate: targetEndDate.trim() || undefined,
          visitFrequencyPerWeek: Number(visitFrequencyPerWeek) || undefined,
          plannedInterventions: plannedInterventions.length > 0 ? plannedInterventions : undefined,
        },
        csrfToken,
      );

      setSuccessMsg('تم إنشاء خطة التأهيل الحركي بنجاح.');
      setRehabilitationGoal('');
      setFunctionalBaseline('');
      setTargetEndDate('');
      await loadEpisodes();
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل إنشاء خطة التأهيل.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusUpdate = async () => {
    if (!statusModalEpisode) return;
    try {
      await updateEpisodeStatus(
        clinicId,
        statusModalEpisode.id,
        {
          status: newStatus,
          dischargeSummary: dischargeSummary.trim() || undefined,
          expectedVersion: statusModalEpisode.version,
        },
        csrfToken,
      );
      setStatusModalEpisode(null);
      setDischargeSummary('');
      setSuccessMsg('تم تحديث حالة خطة التأهيل بنجاح.');
      await loadEpisodes();
    } catch (err: any) {
      setErrorMsg(err.message || 'تعذر تحديث حالة الخطة.');
    }
  };

  return (
    <div className="rehab-plan-section space-y-6" dir="rtl">
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
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
        <div className="border-b border-gray-100 pb-3">
          <h3 className="text-base font-bold text-gray-900">
            إنشاء خطة تأهيل حركي (Physiotherapy Rehabilitation Episode)
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            توثيق مسار العلاج الطبيعي التأهيلي متعدد الجلسات وتحديد الأهداف الوظيفية والتدخلات المخططة.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="font-bold text-gray-700 block mb-1">الهدف التأهيلي الأساسي (Goal) *</label>
              <input
                type="text"
                placeholder="مثال: تأهيل ما بعد جراحة الرباط الصليبي (ACL Reconstruction Rehabilitation)"
                value={rehabilitationGoal}
                onChange={(e) => setRehabilitationGoal(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded bg-white text-xs"
                required
              />
            </div>

            <div>
              <label className="font-bold text-gray-700 block mb-1">الوضع الوظيفي الأولي (Baseline) *</label>
              <input
                type="text"
                placeholder="مثال: عرج مع صعوبة في صعود الدرج ومحددية في عطف الركبة 90°"
                value={functionalBaseline}
                onChange={(e) => setFunctionalBaseline(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded bg-white text-xs"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="font-bold text-gray-700 block mb-1">تاريخ البدء *</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded bg-white text-xs"
                required
              />
            </div>

            <div>
              <label className="font-bold text-gray-700 block mb-1">تاريخ الانتهاء المستهدف (اختياري)</label>
              <input
                type="date"
                value={targetEndDate}
                onChange={(e) => setTargetEndDate(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded bg-white text-xs"
              />
            </div>

            <div>
              <label className="font-bold text-gray-700 block mb-1">تكرار الجلسات أسبوعياً</label>
              <input
                type="number"
                min="1"
                max="14"
                value={visitFrequencyPerWeek}
                onChange={(e) => setVisitFrequencyPerWeek(Number(e.target.value))}
                className="w-full p-2 border border-gray-300 rounded bg-white text-xs"
              />
            </div>
          </div>

          <div>
            <label className="font-bold text-gray-700 block mb-1">
              التدخلات العلاجية المخططة (مفصولة بفواصل):
            </label>
            <input
              type="text"
              value={interventionsText}
              onChange={(e) => setInterventionsText(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded bg-white text-xs"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow transition-colors disabled:opacity-50"
            >
              {submitting ? 'جارٍ الاعتماد...' : 'اعتماد وإنشاء خطة التأهيل'}
            </button>
          </div>
        </form>
      </div>

      {/* Episodes List */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
        <div className="flex justify-between items-center">
          <h4 className="font-bold text-gray-900 text-sm">خطط التأهيل المسجلة للمريض</h4>
          <span className="text-xs text-gray-500">إجمالي الخطط: {episodes.length}</span>
        </div>

        {loading ? (
          <div className="text-center py-6 text-gray-500 text-xs">جارٍ تحميل الخطط...</div>
        ) : episodes.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 border border-dashed rounded-lg text-gray-500 text-xs">
            لا توجد خطط تأهيل مسجلة لهذا المريض بعد.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-xs text-right">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="px-3 py-2 font-bold">تاريخ البدء</th>
                  <th className="px-3 py-2 font-bold">الهدف التأهيلي</th>
                  <th className="px-3 py-2 font-bold">الوضع الوظيفي الأولي</th>
                  <th className="px-3 py-2 font-bold">التكرار</th>
                  <th className="px-3 py-2 font-bold">الحالة</th>
                  <th className="px-3 py-2 font-bold">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {episodes.map((ep) => (
                  <tr key={ep.id}>
                    <td className="px-3 py-2.5 text-gray-600">{ep.startDate}</td>
                    <td className="px-3 py-2.5 font-bold text-gray-900">{ep.rehabilitationGoal}</td>
                    <td className="px-3 py-2.5 text-gray-700">{ep.functionalBaseline}</td>
                    <td className="px-3 py-2.5 text-gray-600">
                      {ep.visitFrequencyPerWeek ? `${ep.visitFrequencyPerWeek} جلسات/أسبوع` : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          ep.status === 'ACTIVE'
                            ? 'bg-blue-100 text-blue-800'
                            : ep.status === 'COMPLETED'
                            ? 'bg-green-100 text-green-800'
                            : ep.status === 'DISCHARGED'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {ep.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => {
                          setStatusModalEpisode(ep);
                          setNewStatus(ep.status);
                        }}
                        className="px-2.5 py-1 text-[11px] bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded border"
                      >
                        تحديث الحالة
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Status Update Modal */}
      {statusModalEpisode && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" dir="rtl">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
            <h4 className="font-bold text-gray-900 text-sm">
              تحديث حالة خطة التأهيل: {statusModalEpisode.rehabilitationGoal}
            </h4>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-gray-700 block mb-1">الحالة الجديدة:</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as RehabEpisodeStatus)}
                  className="w-full p-2 border border-gray-300 rounded bg-white text-xs"
                >
                  <option value="ACTIVE">نشطة (ACTIVE)</option>
                  <option value="COMPLETED">مكتملة (COMPLETED)</option>
                  <option value="SUSPENDED">معلقة (SUSPENDED)</option>
                  <option value="DISCHARGED">تم التخريج (DISCHARGED)</option>
                  <option value="CANCELLED">ملغاة (CANCELLED)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">تقرير الخروج / ملاحظات التخريج:</label>
                <textarea
                  rows={3}
                  value={dischargeSummary}
                  onChange={(e) => setDischargeSummary(e.target.value)}
                  placeholder="ملخص التحسن الوظيفي وخطة الرعاية المنزلية..."
                  className="w-full p-2 border border-gray-300 rounded bg-white text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setStatusModalEpisode(null)}
                className="px-4 py-2 border border-gray-300 rounded text-xs text-gray-700 hover:bg-gray-50"
              >
                إلغاء
              </button>
              <button
                onClick={handleStatusUpdate}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold"
              >
                حفظ التغيير
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

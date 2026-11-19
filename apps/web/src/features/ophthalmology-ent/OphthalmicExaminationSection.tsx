import React, { useState, useEffect } from 'react';
import type {
  OphthalmicExaminationRecord,
  TonometryMethod,
  IopEvaluation,
} from './types';
import {
  recordOphthalmicExam,
  listOphthalmicExams,
  enterInErrorOphthalmicExam,
  evaluateIopInteractive,
  type RecordOphthalmicExamInput,
} from './ophthalmology-ent-api';

interface OphthalmicExaminationSectionProps {
  clinicId: string;
  patientId: string;
  encounterId: string;
  csrfToken?: string;
  hasPrivilege: boolean;
}

const TONOMETRY_METHODS: { label: string; value: TonometryMethod }[] = [
  { label: 'Goldmann Applanation (المعيار الذهبي للتسطيح)', value: 'GOLDMANN_APPLANATION' },
  { label: 'Non-Contact Air-Puff (النفخ الهوائي بدون لمس)', value: 'NON_CONTACT_AIR_PUFF' },
  { label: 'Tono-Pen (قلم قياس الضغط)', value: 'TONOPEN' },
  { label: 'Icare Rebound (مقياس الارتداد الذاتي)', value: 'ICARE_REBOUND' },
  { label: 'Perkins Portable (مقياس بيركنز المحمول)', value: 'PERKINS_PORTABLE' },
];

export const OphthalmicExaminationSection: React.FC<OphthalmicExaminationSectionProps> = ({
  clinicId,
  patientId,
  encounterId,
  csrfToken,
  hasPrivilege,
}) => {
  const [records, setRecords] = useState<OphthalmicExaminationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form State
  const [method, setMethod] = useState<TonometryMethod>('GOLDMANN_APPLANATION');
  const [odIop, setOdIop] = useState<string>('');
  const [osIop, setOsIop] = useState<string>('');
  const [iopEval, setIopEval] = useState<IopEvaluation | null>(null);

  // Slit Lamp Findings
  const [odCornea, setOdCornea] = useState<string>('Clear, intact epithelium');
  const [osCornea, setOsCornea] = useState<string>('Clear, intact epithelium');
  const [odAc, setOdAc] = useState<string>('Deep, quiet, no cells or flare');
  const [osAc, setOsAc] = useState<string>('Deep, quiet, no cells or flare');
  const [odLens, setOdLens] = useState<string>('Clear');
  const [osLens, setOsLens] = useState<string>('Clear');

  // Funduscopy & CDR
  const [odCdr, setOdCdr] = useState<string>('0.3');
  const [osCdr, setOsCdr] = useState<string>('0.3');
  const [odMacula, setOdMacula] = useState<string>('Normal foveal reflex');
  const [osMacula, setOsMacula] = useState<string>('Normal foveal reflex');
  const [odPeriphery, setOdPeriphery] = useState<string>('Flat, 360 intact');
  const [osPeriphery, setOsPeriphery] = useState<string>('Flat, 360 intact');
  const [notes, setNotes] = useState<string>('');

  // Error modal
  const [errorModalId, setErrorModalId] = useState<string | null>(null);
  const [errorReason, setErrorReason] = useState<string>('');

  const loadRecords = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await listOphthalmicExams(clinicId, patientId, csrfToken);
      setRecords(res.items);
    } catch (err: any) {
      setError(err?.message || 'فشل في تحميل سجلات الفحص العيني');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, [clinicId, patientId]);

  // Evaluate IOP when values change
  useEffect(() => {
    const od = odIop ? parseFloat(odIop) : null;
    const os = osIop ? parseFloat(osIop) : null;

    if (od !== null || os !== null) {
      const timer = setTimeout(async () => {
        try {
          const evalResult = await evaluateIopInteractive(clinicId, od, os, csrfToken);
          setIopEval(evalResult);
        } catch {
          // Fallback client-side calculation if offline
          const isElevatedOd = od !== null && od > 21;
          const isElevatedOs = os !== null && os > 21;
          const isHypotonyOd = od !== null && od < 6;
          const isHypotonyOs = os !== null && os < 6;
          const diff = od !== null && os !== null ? Math.abs(od - os) : null;
          const isAsymmetric = diff !== null && diff >= 4;
          const alertsAr: string[] = [];
          if (isElevatedOd) alertsAr.push('ارتفاع ضغط العين اليمنى (>21 ملم زئبق)');
          if (isElevatedOs) alertsAr.push('ارتفاع ضغط العين اليسرى (>21 ملم زئبق)');
          if (isHypotonyOd) alertsAr.push('انخفاض شديد في ضغط العين اليمنى (<6 ملم زئبق)');
          if (isHypotonyOs) alertsAr.push('انخفاض شديد في ضغط العين اليسرى (<6 ملم زئبق)');
          if (isAsymmetric) alertsAr.push(`عدم تناظر كبير بين العينين (فارق ${diff} ملم زئبق)`);

          setIopEval({
            odMmHg: od,
            osMmHg: os,
            isElevatedOd,
            isElevatedOs,
            isHypotonyOd,
            isHypotonyOs,
            isAsymmetric,
            differenceMmHg: diff,
            advisoryAlertsAr: alertsAr,
            advisoryAlertsEn: [],
            clinicalDisclaimerAr: 'تنبيه سريري: قياس ضغط العين استرشادي ويجب ربطه بسماكة القرنية وتقييم العصب البصري.',
            clinicalDisclaimerEn: 'Advisory tonometry notice.',
          });
        }
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setIopEval(null);
    }
  }, [odIop, osIop, clinicId]);

  // CDR suspicious check
  const odCdrNum = odCdr ? parseFloat(odCdr) : null;
  const osCdrNum = osCdr ? parseFloat(osCdr) : null;
  const isCdrSuspicious =
    (odCdrNum !== null && odCdrNum >= 0.6) ||
    (osCdrNum !== null && osCdrNum >= 0.6) ||
    (odCdrNum !== null && osCdrNum !== null && Math.abs(odCdrNum - osCdrNum) >= 0.2);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasPrivilege) {
      setError('لا تملك الصلاحية السريرية المطلوبة (OPHTHALMIC_EXAM_DOCUMENT) لتسجيل فحص العين');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const input: RecordOphthalmicExamInput = {
        encounterId,
        tonometryMethod: method,
        odIntraocularPressureMmHg: odIop ? parseFloat(odIop) : null,
        osIntraocularPressureMmHg: osIop ? parseFloat(osIop) : null,
        odCorneaFindings: odCornea || null,
        osCorneaFindings: osCornea || null,
        odAnteriorChamber: odAc || null,
        osAnteriorChamber: osAc || null,
        odLensCondition: odLens || null,
        osLensCondition: osLens || null,
        odCupToDiscRatio: odCdrNum,
        osCupToDiscRatio: osCdrNum,
        odMaculaFindings: odMacula || null,
        osMaculaFindings: osMacula || null,
        odRetinalPeriphery: odPeriphery || null,
        osRetinalPeriphery: osPeriphery || null,
        clinicalNotes: notes || null,
      };

      await recordOphthalmicExam(clinicId, encounterId, input, csrfToken);
      setSuccess('تم حفظ الفحص العيني الشامل بنجاح');
      setOdIop('');
      setOsIop('');
      setNotes('');
      await loadRecords();
    } catch (err: any) {
      setError(err?.message || 'فشل في حفظ الفحص العيني');
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
      await enterInErrorOphthalmicExam(clinicId, id, errorReason, csrfToken);
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

      {/* Examination Entry Form */}
      <div className="bg-white p-5 border border-gray-200 rounded-lg shadow-sm">
        <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
          <span>🔬</span>
          <span>الفحص السريري المجهري وقاع العين (Slit Lamp & Fundus Examination)</span>
        </h3>

        <form onSubmit={handleSave} className="space-y-5">
          {/* Tonometry / Intraocular Pressure Section */}
          <div className="p-4 bg-amber-50/50 border border-amber-200 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-amber-900 text-sm">
                قياس ضغط العين الداخلي (Tonometry - Intraocular Pressure)
              </span>
              <span className="text-xs text-amber-700 font-medium">النطاق السليم: 10 - 21 ملم زئبق</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-gray-700 mb-1 font-medium">طريقة القياس (Method)</label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as TonometryMethod)}
                  className="w-full p-2 border border-gray-300 rounded bg-white"
                >
                  {TONOMETRY_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-red-700 mb-1 font-bold">العين اليمنى OD (ملم زئبق)</label>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="80"
                  placeholder="مثلاً: 16"
                  value={odIop}
                  onChange={(e) => setOdIop(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded font-mono text-center text-sm"
                />
              </div>
              <div>
                <label className="block text-blue-700 mb-1 font-bold">العين اليسرى OS (ملم زئبق)</label>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="80"
                  placeholder="مثلاً: 15"
                  value={osIop}
                  onChange={(e) => setOsIop(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded font-mono text-center text-sm"
                />
              </div>
            </div>

            {/* Tonometry Live Advisory Alerts */}
            {iopEval && iopEval.advisoryAlertsAr.length > 0 && (
              <div className="p-3 bg-red-100 border-l-4 border-red-500 text-red-900 rounded text-xs space-y-1">
                <div className="font-bold flex items-center gap-1">
                  <span>⚠️</span>
                  <span>تنبيهات ضغط العين السريرية:</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5">
                  {iopEval.advisoryAlertsAr.map((msg, i) => (
                    <li key={i}>{msg}</li>
                  ))}
                </ul>
                <div className="text-[10px] text-red-700 pt-1 italic">
                  {iopEval.clinicalDisclaimerAr}
                </div>
              </div>
            )}
          </div>

          {/* Slit Lamp & Anterior Segment */}
          <div className="border border-gray-200 rounded-lg p-4 space-y-3">
            <h4 className="text-xs font-bold text-gray-700 border-b pb-2">فحص المصباح الشقي (Slit Lamp Biomicroscopy)</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* OD Anterior */}
              <div className="p-3 bg-red-50/30 rounded border border-red-100 space-y-2">
                <span className="font-bold text-red-700">العين اليمنى (OD)</span>
                <div>
                  <label className="block text-gray-600 mb-1">القرنية (Cornea)</label>
                  <input
                    type="text"
                    value={odCornea}
                    onChange={(e) => setOdCornea(e.target.value)}
                    className="w-full p-1.5 border border-gray-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">الحجرة الأمامية (Anterior Chamber)</label>
                  <input
                    type="text"
                    value={odAc}
                    onChange={(e) => setOdAc(e.target.value)}
                    className="w-full p-1.5 border border-gray-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">العدسة (Lens Condition)</label>
                  <input
                    type="text"
                    value={odLens}
                    onChange={(e) => setOdLens(e.target.value)}
                    className="w-full p-1.5 border border-gray-300 rounded"
                  />
                </div>
              </div>

              {/* OS Anterior */}
              <div className="p-3 bg-blue-50/30 rounded border border-blue-100 space-y-2">
                <span className="font-bold text-blue-700">العين اليسرى (OS)</span>
                <div>
                  <label className="block text-gray-600 mb-1">القرنية (Cornea)</label>
                  <input
                    type="text"
                    value={osCornea}
                    onChange={(e) => setOsCornea(e.target.value)}
                    className="w-full p-1.5 border border-gray-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">الحجرة الأمامية (Anterior Chamber)</label>
                  <input
                    type="text"
                    value={osAc}
                    onChange={(e) => setOsAc(e.target.value)}
                    className="w-full p-1.5 border border-gray-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">العدسة (Lens Condition)</label>
                  <input
                    type="text"
                    value={osLens}
                    onChange={(e) => setOsLens(e.target.value)}
                    className="w-full p-1.5 border border-gray-300 rounded"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Funduscopy & CDR Section */}
          <div className="border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <h4 className="text-xs font-bold text-gray-700">فحص قاع العين والعصب البصري (Funduscopy & Optic Disc)</h4>
              {isCdrSuspicious && (
                <span className="text-xs bg-red-100 text-red-800 font-bold px-2 py-0.5 rounded">
                  ⚠️ اشتباه جلوكوما / عدم تناظر قرص العصب البصري
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* OD Posterior */}
              <div className="p-3 bg-red-50/30 rounded border border-red-100 space-y-2">
                <span className="font-bold text-red-700">قاع العين اليمنى (OD)</span>
                <div>
                  <label className="block text-gray-600 mb-1">نسبة التقعر للقرص (Cup-to-Disc Ratio 0.0 - 1.0)</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={odCdr}
                    onChange={(e) => setOdCdr(e.target.value)}
                    className="w-full p-1.5 border border-gray-300 rounded font-mono text-center"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">البقعة الصفراء (Macula)</label>
                  <input
                    type="text"
                    value={odMacula}
                    onChange={(e) => setOdMacula(e.target.value)}
                    className="w-full p-1.5 border border-gray-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">محيط الشبكية (Retinal Periphery)</label>
                  <input
                    type="text"
                    value={odPeriphery}
                    onChange={(e) => setOdPeriphery(e.target.value)}
                    className="w-full p-1.5 border border-gray-300 rounded"
                  />
                </div>
              </div>

              {/* OS Posterior */}
              <div className="p-3 bg-blue-50/30 rounded border border-blue-100 space-y-2">
                <span className="font-bold text-blue-700">قاع العين اليسرى (OS)</span>
                <div>
                  <label className="block text-gray-600 mb-1">نسبة التقعر للقرص (Cup-to-Disc Ratio 0.0 - 1.0)</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={osCdr}
                    onChange={(e) => setOsCdr(e.target.value)}
                    className="w-full p-1.5 border border-gray-300 rounded font-mono text-center"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">البقعة الصفراء (Macula)</label>
                  <input
                    type="text"
                    value={osMacula}
                    onChange={(e) => setOsMacula(e.target.value)}
                    className="w-full p-1.5 border border-gray-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">محيط الشبكية (Retinal Periphery)</label>
                  <input
                    type="text"
                    value={osPeriphery}
                    onChange={(e) => setOsPeriphery(e.target.value)}
                    className="w-full p-1.5 border border-gray-300 rounded"
                  />
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">الملاحظات والتشخيص السريري</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="التشخيص الانطباعي والتوصيات بالعلاج أو صور مقطعية عينية (OCT)..."
              className="w-full text-sm border-gray-300 rounded-md p-2 border"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md text-sm transition-colors disabled:opacity-50"
            >
              {saving ? 'جارٍ الحفظ...' : 'حفظ الفحص العيني'}
            </button>
          </div>
        </form>
      </div>

      {/* Historical Records List */}
      <div className="bg-white p-5 border border-gray-200 rounded-lg shadow-sm">
        <h4 className="text-sm font-bold text-gray-700 mb-3">سجل الفحوصات العينية السابقة</h4>
        {loading ? (
          <div className="text-xs text-gray-500 py-4 text-center">جارٍ التحميل...</div>
        ) : records.length === 0 ? (
          <div className="text-xs text-gray-400 py-4 text-center">لا توجد فحوصات عينية مسجلة لهذا المريض</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-right">التاريخ والوقت</th>
                  <th className="px-3 py-2 text-center">طريقة قياس الضغط</th>
                  <th className="px-3 py-2 text-center text-red-700">IOP اليمنى</th>
                  <th className="px-3 py-2 text-center text-blue-700">IOP اليسرى</th>
                  <th className="px-3 py-2 text-center">CDR اليمنى / اليسرى</th>
                  <th className="px-3 py-2 text-center">الحالة</th>
                  <th className="px-3 py-2 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {records.map((rec) => (
                  <tr key={rec.id} className={rec.status === 'ENTERED_IN_ERROR' ? 'opacity-40 line-through' : ''}>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {new Date(rec.createdAt).toLocaleDateString('ar-SA')}{' '}
                      {new Date(rec.createdAt).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-3 py-2 text-center">{rec.tonometryMethod}</td>
                    <td className="px-3 py-2 text-center font-mono font-bold text-red-700">
                      {rec.odIntraocularPressureMmHg !== null ? `${rec.odIntraocularPressureMmHg} mmHg` : '—'}
                    </td>
                    <td className="px-3 py-2 text-center font-mono font-bold text-blue-700">
                      {rec.osIntraocularPressureMmHg !== null ? `${rec.osIntraocularPressureMmHg} mmHg` : '—'}
                    </td>
                    <td className="px-3 py-2 text-center font-mono">
                      {rec.odCupToDiscRatio ?? '—'} / {rec.osCupToDiscRatio ?? '—'}
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
            <h4 className="font-bold text-gray-800 text-sm">تأكيد إلغاء فحص العين كخطأ إدخال</h4>
            <p className="text-xs text-gray-600">
              سيتم وسم السجل كخطأ إدخال غير نشط وإدراج سبب الإلغاء في سجلات التدقيق الطبية المعتمدة.
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

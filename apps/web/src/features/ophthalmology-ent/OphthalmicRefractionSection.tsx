import React, { useState, useEffect, useMemo } from 'react';
import type { OphthalmicRefractionRecord, VisualAcuityScale } from './types';
import {
  recordRefraction,
  listRefractions,
  enterInErrorRefraction,
  type RecordRefractionInput,
} from './ophthalmology-ent-api';

interface OphthalmicRefractionSectionProps {
  clinicId: string;
  patientId: string;
  encounterId: string;
  csrfToken?: string;
  hasPrivilege: boolean;
}

const ACUITY_SCALES: { label: string; value: VisualAcuityScale }[] = [
  { label: 'Snellen 20/20 (أقدام)', value: 'SNELLEN_FEET_20_20' },
  { label: 'Snellen 6/6 (أمتار)', value: 'SNELLEN_METERS_6_6' },
  { label: 'LogMAR', value: 'LOGMAR' },
  { label: 'Decimal (عشري)', value: 'DECIMAL' },
];

export const OphthalmicRefractionSection: React.FC<OphthalmicRefractionSectionProps> = ({
  clinicId,
  patientId,
  encounterId,
  csrfToken,
  hasPrivilege,
}) => {
  const [records, setRecords] = useState<OphthalmicRefractionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form State
  const [scale, setScale] = useState<VisualAcuityScale>('SNELLEN_FEET_20_20');
  const [pd, setPd] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // OD (Right Eye)
  const [odSphere, setOdSphere] = useState<string>('');
  const [odCyl, setOdCyl] = useState<string>('');
  const [odAxis, setOdAxis] = useState<string>('');
  const [odAdd, setOdAdd] = useState<string>('');
  const [odUncorrectedVa, setOdUncorrectedVa] = useState<string>('20/20');
  const [odCorrectedVa, setOdCorrectedVa] = useState<string>('');
  const [odPinholeVa, setOdPinholeVa] = useState<string>('');

  // OS (Left Eye)
  const [osSphere, setOsSphere] = useState<string>('');
  const [osCyl, setOsCyl] = useState<string>('');
  const [osAxis, setOsAxis] = useState<string>('');
  const [osAdd, setOsAdd] = useState<string>('');
  const [osUncorrectedVa, setOsUncorrectedVa] = useState<string>('20/20');
  const [osCorrectedVa, setOsCorrectedVa] = useState<string>('');
  const [osPinholeVa, setOsPinholeVa] = useState<string>('');

  // Error reason modal
  const [errorModalId, setErrorModalId] = useState<string | null>(null);
  const [errorReason, setErrorReason] = useState<string>('');

  const loadRecords = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await listRefractions(clinicId, patientId, csrfToken);
      setRecords(res.items);
    } catch (err: any) {
      setError(err?.message || 'فشل في تحميل سجلات انكسار البصر');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, [clinicId, patientId]);

  // Client-side Spherical Equivalent calculation
  const odSe = useMemo(() => {
    const sph = parseFloat(odSphere);
    const cyl = parseFloat(odCyl);
    if (!isNaN(sph)) {
      const cylVal = !isNaN(cyl) ? cyl : 0;
      return (sph + cylVal / 2).toFixed(2);
    }
    return null;
  }, [odSphere, odCyl]);

  const osSe = useMemo(() => {
    const sph = parseFloat(osSphere);
    const cyl = parseFloat(osCyl);
    if (!isNaN(sph)) {
      const cylVal = !isNaN(cyl) ? cyl : 0;
      return (sph + cylVal / 2).toFixed(2);
    }
    return null;
  }, [osSphere, osCyl]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasPrivilege) {
      setError('لا تملك الصلاحية السريرية المطلوبة (REFRACTION_MEASURE) لتسجيل انكسار البصر');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const input: RecordRefractionInput = {
        encounterId,
        acuityScale: scale,
        pupillaryDistanceMm: pd ? parseFloat(pd) : null,
        odSphereDiopters: odSphere ? parseFloat(odSphere) : null,
        odCylinderDiopters: odCyl ? parseFloat(odCyl) : null,
        odAxisDegrees: odAxis ? parseInt(odAxis, 10) : null,
        odReadingAddDiopters: odAdd ? parseFloat(odAdd) : null,
        odUncorrectedVisualAcuity: odUncorrectedVa || null,
        odCorrectedVisualAcuity: odCorrectedVa || null,
        odPinholeVisualAcuity: odPinholeVa || null,
        osSphereDiopters: osSphere ? parseFloat(osSphere) : null,
        osCylinderDiopters: osCyl ? parseFloat(osCyl) : null,
        osAxisDegrees: osAxis ? parseInt(osAxis, 10) : null,
        osReadingAddDiopters: osAdd ? parseFloat(osAdd) : null,
        osUncorrectedVisualAcuity: osUncorrectedVa || null,
        osCorrectedVisualAcuity: osCorrectedVa || null,
        osPinholeVisualAcuity: osPinholeVa || null,
        notes: notes || null,
      };

      await recordRefraction(clinicId, encounterId, input, csrfToken);
      setSuccess('تم حفظ قياس انكسار البصر بنجاح');
      // Reset form
      setOdSphere('');
      setOdCyl('');
      setOdAxis('');
      setOdAdd('');
      setOsSphere('');
      setOsCyl('');
      setOsAxis('');
      setOsAdd('');
      setNotes('');
      await loadRecords();
    } catch (err: any) {
      setError(err?.message || 'فشل في حفظ قياس انكسار البصر');
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
      await enterInErrorRefraction(clinicId, id, errorReason, csrfToken);
      setErrorModalId(null);
      setErrorReason('');
      await loadRecords();
    } catch (err: any) {
      alert(err?.message || 'فشل في إلغاء السجل');
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Alert Notices */}
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

      {/* Refraction Entry Form */}
      <div className="bg-white p-5 border border-gray-200 rounded-lg shadow-sm">
        <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
          <span>👓</span>
          <span>قياس انكسار وحدة البصر (Refraction & Visual Acuity)</span>
        </h3>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                مقياس حدة الإبصار (Acuity Scale)
              </label>
              <select
                value={scale}
                onChange={(e) => setScale(e.target.value as VisualAcuityScale)}
                className="w-full text-sm border-gray-300 rounded-md p-2 border"
              >
                {ACUITY_SCALES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                المسافة بين البؤبؤين (PD) بالمليمتر
              </label>
              <input
                type="number"
                step="0.5"
                min="40"
                max="80"
                placeholder="مثلاً: 63"
                value={pd}
                onChange={(e) => setPd(e.target.value)}
                className="w-full text-sm border-gray-300 rounded-md p-2 border"
              />
            </div>
          </div>

          {/* OD vs OS Comparison Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            {/* Right Eye (OD) */}
            <div className="p-4 bg-red-50/50 border border-red-100 rounded-lg space-y-3">
              <div className="flex items-center justify-between border-b border-red-200 pb-2">
                <span className="font-bold text-red-800 text-sm">العين اليمنى (OD - Oculus Dexter)</span>
                {odSe !== null && (
                  <span className="text-xs bg-red-100 text-red-800 font-mono px-2 py-0.5 rounded">
                    SE: {odSe} D
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-gray-600 mb-1">الكروي Sphere (DS)</label>
                  <input
                    type="number"
                    step="0.25"
                    placeholder="-2.50"
                    value={odSphere}
                    onChange={(e) => setOdSphere(e.target.value)}
                    className="w-full p-1.5 border border-gray-300 rounded text-center font-mono"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">الاسطواني Cylinder (DC)</label>
                  <input
                    type="number"
                    step="0.25"
                    placeholder="-0.75"
                    value={odCyl}
                    onChange={(e) => setOdCyl(e.target.value)}
                    className="w-full p-1.5 border border-gray-300 rounded text-center font-mono"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">المحور Axis (° 1-180)</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    max="180"
                    placeholder="90"
                    value={odAxis}
                    onChange={(e) => setOdAxis(e.target.value)}
                    className="w-full p-1.5 border border-gray-300 rounded text-center font-mono"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">إضافة القراءة Add (DS)</label>
                  <input
                    type="number"
                    step="0.25"
                    placeholder="+2.00"
                    value={odAdd}
                    onChange={(e) => setOdAdd(e.target.value)}
                    className="w-full p-1.5 border border-gray-300 rounded text-center font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs pt-2">
                <div>
                  <label className="block text-gray-600 mb-1">بدون تصحيح UCVA</label>
                  <input
                    type="text"
                    placeholder="20/40"
                    value={odUncorrectedVa}
                    onChange={(e) => setOdUncorrectedVa(e.target.value)}
                    className="w-full p-1 border border-gray-300 rounded text-center"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">مع التصحيح BCVA</label>
                  <input
                    type="text"
                    placeholder="20/20"
                    value={odCorrectedVa}
                    onChange={(e) => setOdCorrectedVa(e.target.value)}
                    className="w-full p-1 border border-gray-300 rounded text-center"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">الثقب الصغير PH</label>
                  <input
                    type="text"
                    placeholder="20/20"
                    value={odPinholeVa}
                    onChange={(e) => setOdPinholeVa(e.target.value)}
                    className="w-full p-1 border border-gray-300 rounded text-center"
                  />
                </div>
              </div>
            </div>

            {/* Left Eye (OS) */}
            <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-lg space-y-3">
              <div className="flex items-center justify-between border-b border-blue-200 pb-2">
                <span className="font-bold text-blue-800 text-sm">العين اليسرى (OS - Oculus Sinister)</span>
                {osSe !== null && (
                  <span className="text-xs bg-blue-100 text-blue-800 font-mono px-2 py-0.5 rounded">
                    SE: {osSe} D
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-gray-600 mb-1">الكروي Sphere (DS)</label>
                  <input
                    type="number"
                    step="0.25"
                    placeholder="-2.00"
                    value={osSphere}
                    onChange={(e) => setOsSphere(e.target.value)}
                    className="w-full p-1.5 border border-gray-300 rounded text-center font-mono"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">الاسطواني Cylinder (DC)</label>
                  <input
                    type="number"
                    step="0.25"
                    placeholder="-0.50"
                    value={osCyl}
                    onChange={(e) => setOsCyl(e.target.value)}
                    className="w-full p-1.5 border border-gray-300 rounded text-center font-mono"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">المحور Axis (° 1-180)</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    max="180"
                    placeholder="85"
                    value={osAxis}
                    onChange={(e) => setOsAxis(e.target.value)}
                    className="w-full p-1.5 border border-gray-300 rounded text-center font-mono"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">إضافة القراءة Add (DS)</label>
                  <input
                    type="number"
                    step="0.25"
                    placeholder="+2.00"
                    value={osAdd}
                    onChange={(e) => setOsAdd(e.target.value)}
                    className="w-full p-1.5 border border-gray-300 rounded text-center font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs pt-2">
                <div>
                  <label className="block text-gray-600 mb-1">بدون تصحيح UCVA</label>
                  <input
                    type="text"
                    placeholder="20/50"
                    value={osUncorrectedVa}
                    onChange={(e) => setOsUncorrectedVa(e.target.value)}
                    className="w-full p-1 border border-gray-300 rounded text-center"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">مع التصحيح BCVA</label>
                  <input
                    type="text"
                    placeholder="20/20"
                    value={osCorrectedVa}
                    onChange={(e) => setOsCorrectedVa(e.target.value)}
                    className="w-full p-1 border border-gray-300 rounded text-center"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">الثقب الصغير PH</label>
                  <input
                    type="text"
                    placeholder="20/20"
                    value={osPinholeVa}
                    onChange={(e) => setOsPinholeVa(e.target.value)}
                    className="w-full p-1 border border-gray-300 rounded text-center"
                  />
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">ملاحظات إضافية</label>
            <textarea
              rows={2}
              placeholder="ملاحظات حول العدسات اللاصقة، التحمل، أو التوصيات الخاصة..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full text-sm border-gray-300 rounded-md p-2 border"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md text-sm transition-colors disabled:opacity-50"
            >
              {saving ? 'جارٍ الحفظ...' : 'حفظ قياس انكسار البصر'}
            </button>
          </div>
        </form>
      </div>

      {/* Historical Records List */}
      <div className="bg-white p-5 border border-gray-200 rounded-lg shadow-sm">
        <h4 className="text-sm font-bold text-gray-700 mb-3">سجل قياسات الانكسار السابقة</h4>
        {loading ? (
          <div className="text-xs text-gray-500 py-4 text-center">جارٍ التحميل...</div>
        ) : records.length === 0 ? (
          <div className="text-xs text-gray-400 py-4 text-center">لا توجد قياسات انكسار مسجلة لهذا المريض</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-right">التاريخ</th>
                  <th className="px-3 py-2 text-center text-red-700">العين اليمنى (OD)</th>
                  <th className="px-3 py-2 text-center text-blue-700">العين اليسرى (OS)</th>
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
                    <td className="px-3 py-2 text-center font-mono">
                      {rec.odSphereDiopters !== null ? `${rec.odSphereDiopters} DS` : '—'}{' '}
                      {rec.odCylinderDiopters !== null ? `/ ${rec.odCylinderDiopters} DC x ${rec.odAxisDegrees}°` : ''}
                      {rec.odSphericalEquivalent !== null && (
                        <div className="text-[10px] text-gray-500">SE: {rec.odSphericalEquivalent} D</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center font-mono">
                      {rec.osSphereDiopters !== null ? `${rec.osSphereDiopters} DS` : '—'}{' '}
                      {rec.osCylinderDiopters !== null ? `/ ${rec.osCylinderDiopters} DC x ${rec.osAxisDegrees}°` : ''}
                      {rec.osSphericalEquivalent !== null && (
                        <div className="text-[10px] text-gray-500">SE: {rec.osSphericalEquivalent} D</div>
                      )}
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

      {/* Enter in Error Dialog */}
      {errorModalId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-5 max-w-md w-full shadow-lg space-y-4">
            <h4 className="font-bold text-gray-800 text-sm">تأكيد إلغاء السجل كخطأ إدخال</h4>
            <p className="text-xs text-gray-600">
              بموجب المعايير السريرية، لا يمكن حذف السجل بل سيتم وسمه كخطأ إدخال مع حفظ سبب الإلغاء في سجل التدقيق.
            </p>
            <textarea
              rows={3}
              value={errorReason}
              onChange={(e) => setErrorReason(e.target.value)}
              placeholder="اكتب سبب الإلغاء السريري هنا (مثلاً: خطأ في قياس المحور أو المريض الخطأ)..."
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

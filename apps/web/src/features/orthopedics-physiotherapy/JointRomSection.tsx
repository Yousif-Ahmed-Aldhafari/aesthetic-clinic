import React, { useState, useEffect } from 'react';
import type {
  JointRangeOfMotionRecord,
  JointIdentifier,
  Laterality,
  JointMovementType,
} from './types';
import { recordJointRom, listJointRom } from './orthopedics-physiotherapy-api';
import { InteractiveRomVisualizer } from './InteractiveRomVisualizer';

// AAOS Norms lookup for standard joints
const AAOS_NORMS: Record<string, Record<string, number>> = {
  KNEE: { FLEXION: 140, EXTENSION: 0 },
  HIP: { FLEXION: 120, EXTENSION: 30, ABDUCTION: 45, ADDUCTION: 30, INTERNAL_ROTATION: 45, EXTERNAL_ROTATION: 45 },
  SHOULDER: { FLEXION: 180, EXTENSION: 60, ABDUCTION: 180, ADDUCTION: 50, INTERNAL_ROTATION: 70, EXTERNAL_ROTATION: 90 },
  ELBOW: { FLEXION: 150, EXTENSION: 0, PRONATION: 80, SUPINATION: 80 },
  WRIST_HAND: { FLEXION: 80, EXTENSION: 70 },
  ANKLE_FOOT: { DORSIFLEXION: 20, PLANTARFLEXION: 50, INVERSION: 35, EVERSION: 15 },
  CERVICAL_SPINE: { FLEXION: 50, EXTENSION: 60, LATERAL_FLEXION: 45, ROTATION: 80 },
  LUMBAR_SPINE: { FLEXION: 60, EXTENSION: 25, LATERAL_FLEXION: 25, ROTATION: 30 },
};

interface JointRomSectionProps {
  clinicId: string;
  patientId: string;
  encounterId: string;
  csrfToken?: string;
}

export const JointRomSection: React.FC<JointRomSectionProps> = ({
  clinicId,
  patientId,
  encounterId,
  csrfToken,
}) => {
  const [records, setRecords] = useState<JointRangeOfMotionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form State
  const [joint, setJoint] = useState<JointIdentifier>('KNEE');
  const [laterality, setLaterality] = useState<Laterality>('RIGHT');
  const [movement, setMovement] = useState<JointMovementType>('FLEXION');
  const [activeDegrees, setActiveDegrees] = useState<number>(90);
  const [startingDegrees, setStartingDegrees] = useState<number>(0);
  const [contralateralDegrees, setContralateralDegrees] = useState<number | undefined>(135);
  const [painScaleVas, setPainScaleVas] = useState<number>(0);
  const [measurementDevice, setMeasurementDevice] = useState('مقياس الزوايا اليدوي (Universal Goniometer)');
  const [clinicalNotes, setClinicalNotes] = useState('');

  const normalDegrees = AAOS_NORMS[joint]?.[movement] ?? 120;

  const loadRecords = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await listJointRom(clinicId, patientId, csrfToken);
      setRecords(res.items);
    } catch (err: any) {
      setErrorMsg(err.message || 'تعذر تحميل قياسات مدى الحركة.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, [clinicId, patientId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await recordJointRom(
        clinicId,
        encounterId,
        {
          anatomicalJoint: joint,
          laterality,
          movement,
          motionType: 'ACTIVE',
          startingDegrees: Number(startingDegrees) || 0,
          endingDegrees: Number(activeDegrees),
          contralateralDegrees: contralateralDegrees != null ? Number(contralateralDegrees) : undefined,
          painScaleVas: Number(painScaleVas) || 0,
          goniometerDevice: measurementDevice.trim() || undefined,
          notes: clinicalNotes.trim() || undefined,
        },
        csrfToken,
      );

      setSuccessMsg('تم حفظ وتوثيق قياس مدى حركة المفصل بنجاح.');
      setClinicalNotes('');
      await loadRecords();
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل حفظ قياس مدى حركة المفصل.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="joint-rom-section space-y-6" dir="rtl">
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

      {/* Main Grid: Form on Right, Visualizer on Left */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form Card (7 cols) */}
        <div className="lg:col-span-7 bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
          <div className="border-b border-gray-100 pb-3">
            <h3 className="text-base font-bold text-gray-900">
              قياس زوايا ومدى حركة المفصل (Joint Goniometry)
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              قياس سريري دقيق للمدى الإيجابي مع حساب تلقائي للعجز المئوي مقارنة بالمعايير الدولية (AAOS) والطرف السليم المقابل.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {/* Joint & Movement Selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="font-bold text-gray-700 block mb-1">المفصل (Joint) *</label>
                <select
                  value={joint}
                  onChange={(e) => {
                    const newJ = e.target.value as JointIdentifier;
                    setJoint(newJ);
                    // Reset to first valid movement
                    const movs = Object.keys(AAOS_NORMS[newJ] || {});
                    if (movs.length > 0 && !movs.includes(movement)) {
                      setMovement(movs[0] as JointMovementType);
                    }
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
                  <option value="CERVICAL_SPINE">العمود الفقري العنقي (Cervical)</option>
                  <option value="LUMBAR_SPINE">العمود الفقري القطني (Lumbar)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">الحركة المفصلية (Movement) *</label>
                <select
                  value={movement}
                  onChange={(e) => setMovement(e.target.value as JointMovementType)}
                  className="w-full p-2 border border-gray-300 rounded bg-white text-xs font-semibold"
                  required
                >
                  {Object.keys(AAOS_NORMS[joint] || { FLEXION: 120, EXTENSION: 0 }).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
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

            {/* Degrees inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div>
                <label className="font-bold text-blue-900 block mb-1">المدى المقاس النهائي (Ending °) *</label>
                <input
                  type="number"
                  min="0"
                  max="240"
                  step="1"
                  value={activeDegrees}
                  onChange={(e) => setActiveDegrees(Number(e.target.value))}
                  className="w-full p-2 border border-blue-300 rounded bg-white text-sm font-bold text-blue-950"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">زاوية البداية (Starting °)</label>
                <input
                  type="number"
                  min="0"
                  max="180"
                  step="1"
                  value={startingDegrees}
                  onChange={(e) => setStartingDegrees(Number(e.target.value))}
                  className="w-full p-2 border border-gray-300 rounded bg-white text-sm font-semibold"
                />
              </div>

              <div>
                <label className="font-bold text-purple-900 block mb-1">الطرف المقابل السليم (Contra °)</label>
                <input
                  type="number"
                  min="0"
                  max="240"
                  step="1"
                  placeholder="اختياري..."
                  value={contralateralDegrees ?? ''}
                  onChange={(e) => setContralateralDegrees(e.target.value !== '' ? Number(e.target.value) : undefined)}
                  className="w-full p-2 border border-purple-300 rounded bg-white text-sm font-semibold text-purple-950"
                />
              </div>
            </div>

            {/* End-feel and pain */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-gray-700 block mb-1">شدة الألم أثناء الحركة (VAS 0-10):</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={painScaleVas}
                  onChange={(e) => setPainScaleVas(Number(e.target.value))}
                  className="w-full p-2 border border-gray-300 rounded bg-white text-xs"
                />
              </div>

              <div>
                <label className="text-gray-700 block mb-1">أداة القياس السريرية (Device):</label>
                <input
                  type="text"
                  value={measurementDevice}
                  onChange={(e) => setMeasurementDevice(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded bg-white text-xs"
                />
              </div>
            </div>

            <div>
              <label className="text-gray-700 block mb-1">ملاحظات سريرية إضافية:</label>
              <textarea
                rows={2}
                placeholder="أي ملاحظات حول صعوبة الحركة أو المقاومة العضلية..."
                value={clinicalNotes}
                onChange={(e) => setClinicalNotes(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded bg-white text-xs"
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow transition-colors disabled:opacity-50"
              >
                {submitting ? 'جارٍ الحفظ...' : 'حفظ قياس مدى الحركة'}
              </button>
            </div>
          </form>
        </div>

        {/* Visualizer Card (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <InteractiveRomVisualizer
            joint={joint}
            movement={movement}
            normalDegrees={normalDegrees}
            activeDegrees={activeDegrees}
            contralateralDegrees={contralateralDegrees}
            onDegreesChange={(deg) => setActiveDegrees(deg)}
          />

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900 space-y-1">
            <span className="font-bold block">معايير الأكاديمية الأمريكية لجراحي العظام (AAOS):</span>
            <p className="text-[11px] text-blue-800 leading-relaxed">
              يُحسب العجز بمقارنة زاوية الحركة بالحد الأدنى المعياري للمفصل ({normalDegrees}°) أو بالطرف المقابل السليم في حال توفر قياسه، حيث يُعد العجز بنسبة أكثر من 40% عجزاً حركياً شديداً يستوجب تدخلاً تأهيلياً مكثفاً.
            </p>
          </div>
        </div>
      </div>

      {/* Historical Measurements Table */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
        <div className="flex justify-between items-center">
          <h4 className="font-bold text-gray-900 text-sm">سجل قياسات المدى الحركي للمريض</h4>
          <span className="text-xs text-gray-500">إجمالي القياسات: {records.length}</span>
        </div>

        {loading ? (
          <div className="text-center py-6 text-gray-500 text-xs">جارٍ تحميل القياسات...</div>
        ) : records.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 border border-dashed rounded-lg text-gray-500 text-xs">
            لا توجد قياسات مدى حركة مسجلة لهذا المريض بعد.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-xs text-right">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="px-3 py-2 font-bold">التاريخ</th>
                  <th className="px-3 py-2 font-bold">المفصل / الجانب</th>
                  <th className="px-3 py-2 font-bold">الحركة</th>
                  <th className="px-3 py-2 font-bold">المدى المقاس</th>
                  <th className="px-3 py-2 font-bold">الطرف المقابل</th>
                  <th className="px-3 py-2 font-bold">نسبة العجز والشدة</th>
                  <th className="px-3 py-2 font-bold">مقياس الألم</th>
                  <th className="px-3 py-2 font-bold">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {records.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2.5 text-gray-600">
                      {new Date(r.createdAt).toLocaleDateString('ar-SA')}
                    </td>
                    <td className="px-3 py-2.5 font-bold text-gray-900">
                      {r.anatomicalJoint} ({r.laterality})
                    </td>
                    <td className="px-3 py-2.5 text-gray-800">{r.movement}</td>
                    <td className="px-3 py-2.5 font-black text-blue-700">{r.endingDegrees}°</td>
                    <td className="px-3 py-2.5 text-gray-600">
                      {r.contralateralDegrees != null ? `C: ${r.contralateralDegrees}°` : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      {r.analytics ? (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            r.analytics.deficitSeverity === 'SEVERE'
                              ? 'bg-red-100 text-red-800'
                              : r.analytics.deficitSeverity === 'MODERATE'
                              ? 'bg-amber-100 text-amber-800'
                              : r.analytics.deficitSeverity === 'MILD'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {r.analytics.deficitSeverity} ({r.analytics.deficitFromNormalPercent}%)
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {r.painScaleVas != null ? (
                        <span className="font-bold text-red-600">{r.painScaleVas} / 10</span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-800">
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

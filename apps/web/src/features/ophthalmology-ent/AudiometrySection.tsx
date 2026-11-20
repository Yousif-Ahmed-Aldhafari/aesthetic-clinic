import React, { useState, useEffect } from 'react';
import type {
  AudiometryAssessmentRecord,
  TympanogramType,
  HearingLossAnalytics,
} from './types';
import {
  recordAudiometry,
  listAudiometry,
  enterInErrorAudiometry,
  calculatePtaInteractive,
  type RecordAudiometryInput,
} from './ophthalmology-ent-api';
import { InteractiveAudiogram } from './InteractiveAudiogram';

interface AudiometrySectionProps {
  clinicId: string;
  patientId: string;
  encounterId: string;
  csrfToken?: string;
  hasPrivilege: boolean;
}

const FREQUENCIES = [125, 250, 500, 1000, 2000, 4000, 8000];

const TYMPANOGRAM_TYPES: { label: string; value: TympanogramType }[] = [
  { label: 'النوع A: طبيعي ومرونة سليمة (Type A - Normal)', value: 'TYPE_A_NORMAL_COMPLIANCE' },
  { label: 'النوع As: تيبس في حركة العظيمات (Type As - Stiff)', value: 'TYPE_AS_STIFF_SYSTEM' },
  { label: 'النوع Ad: فرط مرونة أو انفصال العظيمات (Type Ad - Flaccid)', value: 'TYPE_AD_HIGH_COMPLIANCE_FLACCID' },
  { label: 'النوع B: ارتشاح سوائل خلف الطبلة (Type B - Flat/Effusion)', value: 'TYPE_B_FLAT_EFFUSION' },
  { label: 'النوع C: ضغط سلبي / خلل في نفير أوستاش (Type C - Negative)', value: 'TYPE_C_NEGATIVE_PRESSURE' },
];

export const AudiometrySection: React.FC<AudiometrySectionProps> = ({
  clinicId,
  patientId,
  encounterId,
  csrfToken,
  hasPrivilege,
}) => {
  const [records, setRecords] = useState<AudiometryAssessmentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Audiometry Threshold State (default 15 dB across frequencies = normal)
  const [rAir, setRAir] = useState<number[]>([15, 15, 15, 15, 15, 15, 15]);
  const [lAir, setLAir] = useState<number[]>([15, 15, 15, 15, 15, 15, 15]);
  const [rBone, setRBone] = useState<number[]>([10, 10, 10, 10, 10]);
  const [lBone, setLBone] = useState<number[]>([10, 10, 10, 10, 10]);

  // Tympanometry State
  const [rTymp, setRTymp] = useState<TympanogramType>('TYPE_A_NORMAL_COMPLIANCE');
  const [lTymp, setLTymp] = useState<TympanogramType>('TYPE_A_NORMAL_COMPLIANCE');

  // Speech Audiometry
  const [rSrt, setRSrt] = useState<string>('15');
  const [lSrt, setLSrt] = useState<string>('15');
  const [rDisc, setRDisc] = useState<string>('100');
  const [lDisc, setLDisc] = useState<string>('100');
  const [impression, setImpression] = useState<string>('');

  // Real-time Analytics
  const [rightAnalytics, setRightAnalytics] = useState<HearingLossAnalytics | null>(null);
  const [leftAnalytics, setLeftAnalytics] = useState<HearingLossAnalytics | null>(null);

  // Error modal
  const [errorModalId, setErrorModalId] = useState<string | null>(null);
  const [errorReason, setErrorReason] = useState<string>('');

  const loadRecords = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await listAudiometry(clinicId, patientId, csrfToken);
      setRecords(res.items);
    } catch (err: any) {
      setError(err?.message || 'فشل في تحميل سجلات تخطيط السمع');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, [clinicId, patientId]);

  // Real-time PTA analytics calculation
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const [rRes, lRes] = await Promise.all([
          calculatePtaInteractive(clinicId, rAir, rBone, csrfToken),
          calculatePtaInteractive(clinicId, lAir, lBone, csrfToken),
        ]);
        setRightAnalytics(rRes);
        setLeftAnalytics(lRes);
      } catch {
        // Fallback PTA calculation client-side
        const calcPta = (air: number[]) => {
          const pta4 = [air[2], air[3], air[4], air[5]];
          const avg = pta4.reduce((a, b) => a + b, 0) / pta4.length;
          return Math.round(avg * 10) / 10;
        };
        const rPta = calcPta(rAir);
        const lPta = calcPta(lAir);
        setRightAnalytics({
          ptaDb: rPta,
          grade: rPta <= 20 ? 'NORMAL' : rPta <= 35 ? 'MILD' : 'MODERATE',
          type: 'NORMAL',
          descriptionAr: rPta <= 20 ? 'سمع طبيعي' : 'ضعف سمع',
          descriptionEn: rPta <= 20 ? 'Normal Hearing' : 'Hearing Loss',
          typeDescriptionAr: 'طبيعي',
          typeDescriptionEn: 'Normal',
          airBoneGapMaxDb: 0,
        });
        setLeftAnalytics({
          ptaDb: lPta,
          grade: lPta <= 20 ? 'NORMAL' : lPta <= 35 ? 'MILD' : 'MODERATE',
          type: 'NORMAL',
          descriptionAr: lPta <= 20 ? 'سمع طبيعي' : 'ضعف سمع',
          descriptionEn: lPta <= 20 ? 'Normal Hearing' : 'Hearing Loss',
          typeDescriptionAr: 'طبيعي',
          typeDescriptionEn: 'Normal',
          airBoneGapMaxDb: 0,
        });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [rAir, lAir, rBone, lBone, clinicId]);

  const handleAirChange = (ear: 'right' | 'left', idx: number, val: number) => {
    if (ear === 'right') {
      const next = [...rAir];
      next[idx] = val;
      setRAir(next);
    } else {
      const next = [...lAir];
      next[idx] = val;
      setLAir(next);
    }
  };

  const handleBoneChange = (ear: 'right' | 'left', idx: number, val: number) => {
    if (ear === 'right') {
      const next = [...rBone];
      next[idx] = val;
      setRBone(next);
    } else {
      const next = [...lBone];
      next[idx] = val;
      setLBone(next);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasPrivilege) {
      setError('لا تملك الصلاحية السريرية المطلوبة (AUDIOMETRY_RECORD) لتوثيق قياس وتخطيط السمع');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const input: RecordAudiometryInput = {
        encounterId,
        rightAirThresholdsDb: rAir,
        leftAirThresholdsDb: lAir,
        rightBoneThresholdsDb: rBone,
        leftBoneThresholdsDb: lBone,
        rightTympanogramType: rTymp,
        leftTympanogramType: lTymp,
        speechReceptionThresholdDbR: rSrt ? parseFloat(rSrt) : null,
        speechReceptionThresholdDbL: lSrt ? parseFloat(lSrt) : null,
        speechDiscriminationScoreR: rDisc ? parseFloat(rDisc) : null,
        speechDiscriminationScoreL: lDisc ? parseFloat(lDisc) : null,
        clinicalImpression: impression || null,
      };

      await recordAudiometry(clinicId, encounterId, input, csrfToken);
      setSuccess('تم حفظ تقرير تخطيط السمع بنجاح');
      setImpression('');
      await loadRecords();
    } catch (err: any) {
      setError(err?.message || 'فشل في حفظ تقرير تخطيط السمع');
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
      await enterInErrorAudiometry(clinicId, id, errorReason, csrfToken);
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

      {/* Audiogram Entry & Chart */}
      <div className="bg-white p-5 border border-gray-200 rounded-lg shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b pb-3">
          <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
            <span>📊</span>
            <span>تخطيط وقياس السمع النغمي (Pure Tone Audiometry)</span>
          </h3>
          <span className="text-xs text-gray-500 font-medium">معتمد وفق معيار ISO 8253-1 و WHO 2021</span>
        </div>

        {/* Real-time WHO 2021 PTA Classification Badges */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Right Ear Summary */}
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
            <div>
              <span className="font-bold text-red-800 text-xs block">الأذن اليمنى (Right Ear - AD)</span>
              <span className="text-sm font-semibold text-gray-800">
                {rightAnalytics ? `${rightAnalytics.descriptionAr} (${rightAnalytics.typeDescriptionAr})` : '—'}
              </span>
            </div>
            {rightAnalytics && (
              <div className="text-right">
                <span className="text-xs font-mono font-bold bg-white px-2 py-1 rounded border border-red-200 text-red-700">
                  PTA-4: {rightAnalytics.ptaDb} dB HL
                </span>
              </div>
            )}
          </div>

          {/* Left Ear Summary */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
            <div>
              <span className="font-bold text-blue-800 text-xs block">الأذن اليسرى (Left Ear - AS)</span>
              <span className="text-sm font-semibold text-gray-800">
                {leftAnalytics ? `${leftAnalytics.descriptionAr} (${leftAnalytics.typeDescriptionAr})` : '—'}
              </span>
            </div>
            {leftAnalytics && (
              <div className="text-right">
                <span className="text-xs font-mono font-bold bg-white px-2 py-1 rounded border border-blue-200 text-blue-700">
                  PTA-4: {leftAnalytics.ptaDb} dB HL
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Visual Audiogram Chart */}
        <InteractiveAudiogram
          rightAirThresholds={rAir}
          leftAirThresholds={lAir}
          rightBoneThresholds={rBone}
          leftBoneThresholds={lBone}
        />

        {/* Threshold Inputs Matrix */}
        <div className="border border-gray-200 rounded-lg p-4 space-y-4">
          <h4 className="text-xs font-bold text-gray-700">إدخال عتبات السمع بالتوصيل الهوائي (Air Conduction dB HL)</h4>
          <div className="overflow-x-auto">
            <table className="min-w-full text-center text-xs divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-right">التردد (Hz)</th>
                  {FREQUENCIES.map((f) => (
                    <th key={f} className="px-2 py-2">
                      {f >= 1000 ? `${f / 1000}k` : f}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr>
                  <td className="px-3 py-2 text-right font-bold text-red-600">اليمنى (OD / Air)</td>
                  {FREQUENCIES.map((f, i) => (
                    <td key={`r-air-input-${f}`} className="px-1 py-1">
                      <input
                        type="number"
                        step="5"
                        min="-10"
                        max="120"
                        value={rAir[i] ?? ''}
                        onChange={(e) => handleAirChange('right', i, parseFloat(e.target.value) || 0)}
                        className="w-14 p-1 border border-gray-300 rounded text-center font-mono"
                      />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-3 py-2 text-right font-bold text-blue-600">اليسرى (OS / Air)</td>
                  {FREQUENCIES.map((f, i) => (
                    <td key={`l-air-input-${f}`} className="px-1 py-1">
                      <input
                        type="number"
                        step="5"
                        min="-10"
                        max="120"
                        value={lAir[i] ?? ''}
                        onChange={(e) => handleAirChange('left', i, parseFloat(e.target.value) || 0)}
                        className="w-14 p-1 border border-gray-300 rounded text-center font-mono"
                      />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-3 py-2 text-right font-medium text-red-500">اليمنى عظمي (OD / Bone)</td>
                  {FREQUENCIES.map((f, i) => (
                    <td key={`r-bone-input-${f}`} className="px-1 py-1">
                      {i >= 1 && i <= 5 ? (
                        <input
                          type="number"
                          step="5"
                          min="-10"
                          max="80"
                          value={rBone[i - 1] ?? ''}
                          onChange={(e) => handleBoneChange('right', i - 1, parseFloat(e.target.value) || 0)}
                          className="w-14 p-1 border border-gray-200 rounded text-center font-mono bg-red-50/20"
                        />
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-3 py-2 text-right font-medium text-blue-500">اليسرى عظمي (OS / Bone)</td>
                  {FREQUENCIES.map((f, i) => (
                    <td key={`l-bone-input-${f}`} className="px-1 py-1">
                      {i >= 1 && i <= 5 ? (
                        <input
                          type="number"
                          step="5"
                          min="-10"
                          max="80"
                          value={lBone[i - 1] ?? ''}
                          onChange={(e) => handleBoneChange('left', i - 1, parseFloat(e.target.value) || 0)}
                          className="w-14 p-1 border border-gray-200 rounded text-center font-mono bg-blue-50/20"
                        />
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Tympanometry & Speech Audiometry */}
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Right Ear Tympanogram & Speech */}
            <div className="p-3 bg-red-50/30 border border-red-100 rounded-lg space-y-3 text-xs">
              <span className="font-bold text-red-700">تخطيط ضغط الأذن الوسطى والكلام (الأذن اليمنى)</span>
              <div>
                <label className="block text-gray-600 mb-1">نوع منحنى ضغط الطبلة (Tympanometry)</label>
                <select
                  value={rTymp}
                  onChange={(e) => setRTymp(e.target.value as TympanogramType)}
                  className="w-full p-1.5 border border-gray-300 rounded bg-white"
                >
                  {TYMPANOGRAM_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-600 mb-1">عتبة تمييز الكلام SRT (dB)</label>
                  <input
                    type="number"
                    value={rSrt}
                    onChange={(e) => setRSrt(e.target.value)}
                    className="w-full p-1.5 border border-gray-300 rounded text-center"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">نسبة وضوح الكلام SDS (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={rDisc}
                    onChange={(e) => setRDisc(e.target.value)}
                    className="w-full p-1.5 border border-gray-300 rounded text-center"
                  />
                </div>
              </div>
            </div>

            {/* Left Ear Tympanogram & Speech */}
            <div className="p-3 bg-blue-50/30 border border-blue-100 rounded-lg space-y-3 text-xs">
              <span className="font-bold text-blue-700">تخطيط ضغط الأذن الوسطى والكلام (الأذن اليسرى)</span>
              <div>
                <label className="block text-gray-600 mb-1">نوع منحنى ضغط الطبلة (Tympanometry)</label>
                <select
                  value={lTymp}
                  onChange={(e) => setLTymp(e.target.value as TympanogramType)}
                  className="w-full p-1.5 border border-gray-300 rounded bg-white"
                >
                  {TYMPANOGRAM_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-600 mb-1">عتبة تمييز الكلام SRT (dB)</label>
                  <input
                    type="number"
                    value={lSrt}
                    onChange={(e) => setLSrt(e.target.value)}
                    className="w-full p-1.5 border border-gray-300 rounded text-center"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">نسبة وضوح الكلام SDS (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={lDisc}
                    onChange={(e) => setLDisc(e.target.value)}
                    className="w-full p-1.5 border border-gray-300 rounded text-center"
                  />
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">الانطباع السريري والتوصيات بالسماعات الطبية</label>
            <textarea
              rows={2}
              value={impression}
              onChange={(e) => setImpression(e.target.value)}
              placeholder="التشخيص الانطباعي لنوع ودرجة ضعف السمع، والتوصيات بالحاجة لمعينات سمعية أو متابعة..."
              className="w-full text-sm border-gray-300 rounded-md p-2 border"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md text-sm transition-colors disabled:opacity-50"
            >
              {saving ? 'جارٍ الحفظ...' : 'حفظ تقرير تخطيط السمع'}
            </button>
          </div>
        </form>
      </div>

      {/* Historical Records List */}
      <div className="bg-white p-5 border border-gray-200 rounded-lg shadow-sm">
        <h4 className="text-sm font-bold text-gray-700 mb-3">سجل تقارير تخطيط السمع السابقة</h4>
        {loading ? (
          <div className="text-xs text-gray-500 py-4 text-center">جارٍ التحميل...</div>
        ) : records.length === 0 ? (
          <div className="text-xs text-gray-400 py-4 text-center">لا توجد تقارير تخطيط سمع مسجلة لهذا المريض</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-right">التاريخ</th>
                  <th className="px-3 py-2 text-center text-red-700">PTA اليمنى</th>
                  <th className="px-3 py-2 text-center text-blue-700">PTA اليسرى</th>
                  <th className="px-3 py-2 text-center">ضغط الطبلة R / L</th>
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
                    <td className="px-3 py-2 text-center font-mono font-bold text-red-700">
                      {rec.analytics?.right ? `${rec.analytics.right.ptaDb} dB` : '—'}
                    </td>
                    <td className="px-3 py-2 text-center font-mono font-bold text-blue-700">
                      {rec.analytics?.left ? `${rec.analytics.left.ptaDb} dB` : '—'}
                    </td>
                    <td className="px-3 py-2 text-center text-gray-600">
                      {rec.rightTympanogramType.replace('TYPE_', '').split('_')[0]} /{' '}
                      {rec.leftTympanogramType.replace('TYPE_', '').split('_')[0]}
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
            <h4 className="font-bold text-gray-800 text-sm">تأكيد إلغاء تقرير السمع كخطأ إدخال</h4>
            <p className="text-xs text-gray-600">
              سيتم وسم التقرير كملغي مع إثبات هوية الفاحص وسبب الإلغاء في سجلات التدقيق الطبية.
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

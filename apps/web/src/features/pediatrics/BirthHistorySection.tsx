import React, { useState } from 'react';
import type { PediatricBirthHistoryItem, DeliveryMode, BirthType, BirthHistorySource } from './types.js';
import { recordBirthHistory, amendBirthHistory } from './pediatrics-api.js';

interface BirthHistorySectionProps {
  clinicId: string;
  patientId: string;
  history: PediatricBirthHistoryItem | null;
  onRefresh: () => Promise<void>;
  csrfToken?: string;
  onAuthError?: (e?: unknown) => void;
}

const DELIVERY_MODE_LABELS: Record<DeliveryMode, string> = {
  VAGINAL: 'ولادة طبيعية تلقائية',
  CESAREAN_PLANNED: 'ولادة قيصرية مجدولة',
  CESAREAN_EMERGENCY: 'ولادة قيصرية طارئة',
  ASSISTED_VACUUM: 'ولادة بمساعدة الشفاط',
  ASSISTED_FORCEPS: 'ولادة بمساعدة الملقط',
  OTHER: 'أخرى',
};

const BIRTH_TYPE_LABELS: Record<BirthType, string> = {
  SINGLETON: 'مفرد',
  TWIN: 'توأم ثنائي',
  TRIPLET: 'توأم ثلاثي',
  HIGHER_ORDER_MULTIPLE: 'توأم متعدد أكثر من ثلاثة',
};

const SOURCE_LABELS: Record<BirthHistorySource, string> = {
  PARENT_RECALL: 'إفادة الوالدين / الأسرة',
  BIRTH_CERTIFICATE: 'شهادة الميلاد الرسمية',
  HOSPITAL_DISCHARGE_SUMMARY: 'تقرير خروج المستشفى / إشعار الولادة',
  IMMUNIZATION_CARD: 'بطاقة التطعيم الوطنية',
  EXTERNAL_EHR: 'سجل إلكتروني خارجي',
};

export const BirthHistorySection: React.FC<BirthHistorySectionProps> = ({
  clinicId,
  patientId,
  history,
  onRefresh,
  csrfToken,
  onAuthError,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isAmending, setIsAmending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form states
  const [gestationalAgeWeeks, setGestationalAgeWeeks] = useState(history?.gestationalAgeWeeks ?? 39);
  const [gestationalAgeDays, setGestationalAgeDays] = useState(history?.gestationalAgeDays ?? 0);
  const [birthWeightGrams, setBirthWeightGrams] = useState<number | ''>(history?.birthWeightGrams ?? 3200);
  const [birthLengthCm, setBirthLengthCm] = useState<number | ''>(history?.birthLengthCm ?? 50.0);
  const [birthHeadCircumferenceCm, setBirthHeadCircumferenceCm] = useState<number | ''>(history?.birthHeadCircumferenceCm ?? 35.0);
  const [apgar1Min, setApgar1Min] = useState<number | ''>(history?.apgar1Min ?? 9);
  const [apgar5Min, setApgar5Min] = useState<number | ''>(history?.apgar5Min ?? 10);
  const [apgar10Min, setApgar10Min] = useState<number | ''>(history?.apgar10Min ?? '');
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>(history?.deliveryMode ?? 'VAGINAL');
  const [birthType, setBirthType] = useState<BirthType>(history?.birthType ?? 'SINGLETON');
  const [birthComplications, setBirthComplications] = useState(history?.birthComplications ?? '');
  const [maternalComplications, setMaternalComplications] = useState(history?.maternalComplications ?? '');
  const [nicAdmissionRequired, setNicAdmissionRequired] = useState(history?.nicAdmissionRequired ?? false);
  const [nicStayDays, setNicStayDays] = useState<number | ''>(history?.nicStayDays ?? '');
  const [bloodType, setBloodType] = useState(history?.bloodType ?? '');
  const [newbornScreeningNotes, setNewbornScreeningNotes] = useState(history?.newbornScreeningNotes ?? '');
  const [hearingScreeningPassed, setHearingScreeningPassed] = useState<boolean | undefined>(history?.hearingScreeningPassed ?? undefined);
  const [congenitalAnomalies, setCongenitalAnomalies] = useState(history?.congenitalAnomalies ?? '');
  const [consanguinity, setConsanguinity] = useState(history?.consanguinity ?? false);
  const [source, setSource] = useState<BirthHistorySource>(history?.source ?? 'HOSPITAL_DISCHARGE_SUMMARY');
  const [notes, setNotes] = useState(history?.notes ?? '');

  // Amendment specific state
  const [amendmentReason, setAmendmentReason] = useState('');

  const handleRecordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      await recordBirthHistory(
        clinicId,
        patientId,
        {
          gestationalAgeWeeks: Number(gestationalAgeWeeks),
          gestationalAgeDays: gestationalAgeDays ? Number(gestationalAgeDays) : 0,
          birthWeightGrams: birthWeightGrams !== '' ? Number(birthWeightGrams) : undefined,
          birthLengthCm: birthLengthCm !== '' ? Number(birthLengthCm) : undefined,
          birthHeadCircumferenceCm: birthHeadCircumferenceCm !== '' ? Number(birthHeadCircumferenceCm) : undefined,
          apgar1Min: apgar1Min !== '' ? Number(apgar1Min) : undefined,
          apgar5Min: apgar5Min !== '' ? Number(apgar5Min) : undefined,
          apgar10Min: apgar10Min !== '' ? Number(apgar10Min) : undefined,
          deliveryMode,
          birthType,
          birthComplications: birthComplications || undefined,
          maternalComplications: maternalComplications || undefined,
          nicAdmissionRequired,
          nicStayDays: nicStayDays !== '' ? Number(nicStayDays) : undefined,
          bloodType: bloodType || undefined,
          newbornScreeningNotes: newbornScreeningNotes || undefined,
          hearingScreeningPassed,
          congenitalAnomalies: congenitalAnomalies || undefined,
          consanguinity,
          source,
          notes: notes || undefined,
        },
        csrfToken,
        onAuthError,
      );
      setSuccess('تم تسجيل تاريخ الولادة والفترة المحيطة بالولادة بنجاح');
      setIsEditing(false);
      await onRefresh();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAmendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!history) return;
    if (!amendmentReason.trim()) {
      setError('سبب التعديل والتصحيح السريري إلزامي لحفظ النسخة المعدلة');
      return;
    }
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      await amendBirthHistory(
        clinicId,
        history.id,
        {
          expectedVersion: history.version,
          amendmentReason: amendmentReason.trim(),
          gestationalAgeWeeks: Number(gestationalAgeWeeks),
          gestationalAgeDays: gestationalAgeDays ? Number(gestationalAgeDays) : 0,
          birthWeightGrams: birthWeightGrams !== '' ? Number(birthWeightGrams) : undefined,
          birthLengthCm: birthLengthCm !== '' ? Number(birthLengthCm) : undefined,
          birthHeadCircumferenceCm: birthHeadCircumferenceCm !== '' ? Number(birthHeadCircumferenceCm) : undefined,
          apgar1Min: apgar1Min !== '' ? Number(apgar1Min) : undefined,
          apgar5Min: apgar5Min !== '' ? Number(apgar5Min) : undefined,
          apgar10Min: apgar10Min !== '' ? Number(apgar10Min) : undefined,
          deliveryMode,
          birthType,
          birthComplications: birthComplications || undefined,
          maternalComplications: maternalComplications || undefined,
          nicAdmissionRequired,
          nicStayDays: nicStayDays !== '' ? Number(nicStayDays) : undefined,
          bloodType: bloodType || undefined,
          newbornScreeningNotes: newbornScreeningNotes || undefined,
          hearingScreeningPassed,
          congenitalAnomalies: congenitalAnomalies || undefined,
          consanguinity,
          notes: notes || undefined,
        },
        csrfToken,
        onAuthError,
      );
      setSuccess(`تم توثيق التعديل السريري بنجاح (الإصدار الجديد: ${history.version + 1})`);
      setIsAmending(false);
      setAmendmentReason('');
      await onRefresh();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const isPreterm = (history?.gestationalAgeWeeks ?? 40) < 37;

  return (
    <div className="birth-history-section" data-testid="birth-history-section" dir="rtl">
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h3 style={{ margin: 0 }}>📋 التاريخ الولادي وفترة ما حول الولادة (Neonatal & Birth History)</h3>
          <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.875rem' }}>
            توثيق العمر الحملي، طريقة الولادة، علامات أبغار (APGAR)، وقائع الخداج ودخول العناية المركزة لحديثي الولادة.
          </p>
        </div>
        <div>
          {!history && !isEditing && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setIsEditing(true)}
              data-testid="record-birth-history-btn"
            >
              ➕ توثيق التاريخ الولادي
            </button>
          )}
          {history && !isAmending && (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => {
                setIsAmending(true);
                setGestationalAgeWeeks(history.gestationalAgeWeeks);
                setGestationalAgeDays(history.gestationalAgeDays ?? 0);
                setBirthWeightGrams(history.birthWeightGrams ?? '');
                setBirthLengthCm(history.birthLengthCm ?? '');
                setBirthHeadCircumferenceCm(history.birthHeadCircumferenceCm ?? '');
                setApgar1Min(history.apgar1Min ?? '');
                setApgar5Min(history.apgar5Min ?? '');
                setApgar10Min(history.apgar10Min ?? '');
                setDeliveryMode(history.deliveryMode ?? 'VAGINAL');
                setBirthType(history.birthType);
                setBirthComplications(history.birthComplications ?? '');
                setMaternalComplications(history.maternalComplications ?? '');
                setNicAdmissionRequired(history.nicAdmissionRequired);
                setNicStayDays(history.nicStayDays ?? '');
                setBloodType(history.bloodType ?? '');
                setNewbornScreeningNotes(history.newbornScreeningNotes ?? '');
                setHearingScreeningPassed(history.hearingScreeningPassed ?? undefined);
                setCongenitalAnomalies(history.congenitalAnomalies ?? '');
                setConsanguinity(history.consanguinity ?? false);
                setNotes(history.notes ?? '');
              }}
              data-testid="amend-birth-history-btn"
            >
              ✏️ تعديل معتمد (الإصدار {history.version})
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '4px' }}>
          ⚠️ {error}
        </div>
      )}

      {success && (
        <div className="alert alert-success" style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#dcfce7', color: '#166534', borderRadius: '4px' }}>
          ✅ {success}
        </div>
      )}

      {/* VIEW EXISTING RECORD */}
      {history && !isAmending && (
        <div className="birth-history-card" style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.25rem', backgroundColor: '#f8fafc' }}>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <span className={`badge ${isPreterm ? 'badge-warning' : 'badge-success'}`} style={{ padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.85rem', fontWeight: 600, backgroundColor: isPreterm ? '#fef3c7' : '#dcfce7', color: isPreterm ? '#92400e' : '#166534' }}>
              {isPreterm ? '⚠️ خديج / مبتسر (Preterm)' : '✅ مكتمل النمو (Full-term)'} — {history.gestationalAgeWeeks} أسبوع {history.gestationalAgeDays ? `و ${history.gestationalAgeDays} يوم` : ''}
            </span>
            <span className="badge" style={{ padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.85rem', backgroundColor: '#e0e7ff', color: '#3730a3' }}>
              طريقة الولادة: {history.deliveryMode ? DELIVERY_MODE_LABELS[history.deliveryMode] : 'غير محدد'}
            </span>
            <span className="badge" style={{ padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.85rem', backgroundColor: '#f1f5f9', color: '#334155' }}>
              نوع الحمل: {BIRTH_TYPE_LABELS[history.birthType]}
            </span>
            <span className="badge" style={{ padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.85rem', backgroundColor: '#f1f5f9', color: '#334155' }}>
              المصدر: {SOURCE_LABELS[history.source]}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{ background: '#ffffff', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>وزن الولادة</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#0f172a' }}>
                {history.birthWeightGrams ? `${(history.birthWeightGrams / 1000).toFixed(2)} كجم (${history.birthWeightGrams} جم)` : 'غير مسجل'}
              </div>
            </div>
            <div style={{ background: '#ffffff', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>طول الولادة</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#0f172a' }}>
                {history.birthLengthCm ? `${history.birthLengthCm} سم` : 'غير مسجل'}
              </div>
            </div>
            <div style={{ background: '#ffffff', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>محيط رأس الولادة</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#0f172a' }}>
                {history.birthHeadCircumferenceCm ? `${history.birthHeadCircumferenceCm} سم` : 'غير مسجل'}
              </div>
            </div>
            <div style={{ background: '#ffffff', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>علامات أبغار (APGAR)</div>
              <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#0f172a' }}>
                دقيقة 1: {history.apgar1Min ?? '—'} | دقيقة 5: {history.apgar5Min ?? '—'} | دقيقة 10: {history.apgar10Min ?? '—'}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', fontSize: '0.875rem' }}>
            <div>
              <strong>دخول العناية المركزة لحديثي الولادة (NICU):</strong>{' '}
              {history.nicAdmissionRequired ? `نعم (${history.nicStayDays ?? 0} يوم)` : 'لا'}
            </div>
            <div>
              <strong>فصيلة الدم:</strong> {history.bloodType || 'غير محددة'}
            </div>
            <div>
              <strong>فحص السمع لحديثي الولادة:</strong>{' '}
              {history.hearingScreeningPassed === true ? 'اجتاز بنجاح' : history.hearingScreeningPassed === false ? 'إعادة تقييم / لم يجتز' : 'لم يجر'}
            </div>
            <div>
              <strong>صلة قرابة بين الوالدين:</strong> {history.consanguinity ? 'نعم (أقارب)' : 'لا توجد قرابة'}
            </div>
            {history.birthComplications && (
              <div style={{ gridColumn: '1 / -1' }}>
                <strong>مضاعفات الولادة:</strong> {history.birthComplications}
              </div>
            )}
            {history.maternalComplications && (
              <div style={{ gridColumn: '1 / -1' }}>
                <strong>مضاعفات الأم أثناء الحمل:</strong> {history.maternalComplications}
              </div>
            )}
            {history.newbornScreeningNotes && (
              <div style={{ gridColumn: '1 / -1' }}>
                <strong>المسح الطبي لحديثي الولادة:</strong> {history.newbornScreeningNotes}
              </div>
            )}
            {history.congenitalAnomalies && (
              <div style={{ gridColumn: '1 / -1', color: '#b91c1c' }}>
                <strong>تشوهات خلقية مسجلة:</strong> {history.congenitalAnomalies}
              </div>
            )}
          </div>

          {history.amendmentHistory && history.amendmentHistory.length > 0 && (
            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #cbd5e1' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#475569', marginBottom: '0.5rem' }}>
                سجل التعديلات المعتمدة والتصحيحات السريرية:
              </div>
              <ul style={{ margin: 0, paddingRight: '1.25rem', fontSize: '0.8rem', color: '#64748b' }}>
                {history.amendmentHistory.map((item, idx) => (
                  <li key={idx} style={{ marginBottom: '0.25rem' }}>
                    بتاريخ {new Date(item.amendedAt).toLocaleString('ar-YE')}: {item.amendmentReason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* RECORD OR AMEND FORM */}
      {(isEditing || isAmending) && (
        <form
          onSubmit={isAmending ? handleAmendSubmit : handleRecordSubmit}
          style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '1.25rem', backgroundColor: '#f8fafc' }}
          data-testid="birth-history-form"
        >
          <h4 style={{ margin: '0 0 1rem' }}>
            {isAmending ? `تعديل السجل الولادي (الإصدار الحالي: ${history?.version})` : 'تسجيل التاريخ الولادي للطفل'}
          </h4>

          {isAmending && (
            <div style={{ marginBottom: '1rem', background: '#fffbeb', padding: '0.75rem', borderRadius: '6px', border: '1px solid #fde68a' }}>
              <label style={{ display: 'block', fontWeight: 600, color: '#92400e', marginBottom: '0.25rem' }}>
                سبب التعديل والتصحيح السريري (إلزامي للتوثيق والمساءلة الطبية):
              </label>
              <input
                type="text"
                required
                className="form-control"
                value={amendmentReason}
                onChange={(e) => setAmendmentReason(e.target.value)}
                placeholder="مثال: تصحيح وزن الولادة الدقيق استناداً إلى تقرير الخروج الرسمي"
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                data-testid="amendment-reason-input"
              />
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                العمر الحملي (أسابيع)*
              </label>
              <input
                type="number"
                min="20"
                max="45"
                required
                value={gestationalAgeWeeks}
                onChange={(e) => setGestationalAgeWeeks(Number(e.target.value))}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                data-testid="gestational-age-weeks"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                أيام إضافية (0–6)
              </label>
              <input
                type="number"
                min="0"
                max="6"
                value={gestationalAgeDays}
                onChange={(e) => setGestationalAgeDays(Number(e.target.value))}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                وزن الولادة (جرام)
              </label>
              <input
                type="number"
                min="300"
                max="8000"
                placeholder="مثال: 3200"
                value={birthWeightGrams}
                onChange={(e) => setBirthWeightGrams(e.target.value ? Number(e.target.value) : '')}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                data-testid="birth-weight-grams"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                طول الولادة (سم)
              </label>
              <input
                type="number"
                step="0.1"
                min="20"
                max="70"
                placeholder="مثال: 50.0"
                value={birthLengthCm}
                onChange={(e) => setBirthLengthCm(e.target.value ? Number(e.target.value) : '')}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                محيط الرأس (سم)
              </label>
              <input
                type="number"
                step="0.1"
                min="15"
                max="50"
                placeholder="مثال: 35.0"
                value={birthHeadCircumferenceCm}
                onChange={(e) => setBirthHeadCircumferenceCm(e.target.value ? Number(e.target.value) : '')}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                طريقة الولادة
              </label>
              <select
                value={deliveryMode}
                onChange={(e) => setDeliveryMode(e.target.value as DeliveryMode)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
              >
                {Object.entries(DELIVERY_MODE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                نوع الولادة
              </label>
              <select
                value={birthType}
                onChange={(e) => setBirthType(e.target.value as BirthType)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
              >
                {Object.entries(BIRTH_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                أبغار (APGAR) دقيقة 1 / 5
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="number"
                  min="0"
                  max="10"
                  placeholder="1 د"
                  value={apgar1Min}
                  onChange={(e) => setApgar1Min(e.target.value ? Number(e.target.value) : '')}
                  style={{ width: '50%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  data-testid="apgar-1-min"
                />
                <input
                  type="number"
                  min="0"
                  max="10"
                  placeholder="5 د"
                  value={apgar5Min}
                  onChange={(e) => setApgar5Min(e.target.value ? Number(e.target.value) : '')}
                  style={{ width: '50%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  data-testid="apgar-5-min"
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                مصدر المعلومات
              </label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as BirthHistorySource)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
              >
                {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={nicAdmissionRequired}
                onChange={(e) => setNicAdmissionRequired(e.target.checked)}
              />
              تطلب دخول العناية المركزة لحديثي الولادة (NICU)
            </label>

            {nicAdmissionRequired && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.875rem' }}>مدة الإقامة:</span>
                <input
                  type="number"
                  min="1"
                  max="365"
                  placeholder="أيام"
                  value={nicStayDays}
                  onChange={(e) => setNicStayDays(e.target.value ? Number(e.target.value) : '')}
                  style={{ width: '80px', padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
                <span style={{ fontSize: '0.875rem' }}>يوم</span>
              </div>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={consanguinity}
                onChange={(e) => setConsanguinity(e.target.checked)}
              />
              وجود صلة قرابة بين الوالدين
            </label>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setIsEditing(false);
                setIsAmending(false);
                setError(null);
              }}
              disabled={submitting}
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
              data-testid="submit-birth-history-btn"
            >
              {submitting ? 'جارٍ الحفظ...' : isAmending ? 'اعتماد التعديل' : 'حفظ التاريخ الولادي'}
            </button>
          </div>
        </form>
      )}

      {!history && !isEditing && (
        <div style={{ textAlign: 'center', padding: '2rem', border: '2px dashed #cbd5e1', borderRadius: '8px', color: '#64748b' }}>
          لم يتم توثيق تاريخ الولادة بعد لهذا المريض. انقر فوق &quot;توثيق التاريخ الولادي&quot; للبدء.
        </div>
      )}
    </div>
  );
};

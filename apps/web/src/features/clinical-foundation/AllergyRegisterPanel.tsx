import React, { useState, useEffect, useCallback } from 'react';
import {
  listAllergies,
  recordAllergy,
  verifyAllergy,
  type PatientAllergyItem,
  type AllergyStatusType,
  type AllergenCategory,
  type AllergySeverity,
  type AllergyClinicalStatus,
  type AllergyVerificationStatus,
} from './clinical-foundation-api';

interface AllergyRegisterPanelProps {
  clinicId: string;
  patientId: string;
  encounterId?: string;
  csrfToken?: string;
  onRefreshSummary?: () => void;
}

const categoryLabels: Record<AllergenCategory, string> = {
  MEDICATION: 'أدوية وعقاقير طبية (Medication)',
  FOOD: 'أغذية وأطعمة (Food)',
  ENVIRONMENTAL: 'عوامل بيئية وحبوب لقاح (Environmental)',
  LATEX: 'مادة اللاتكس والمطاط الطبي (Latex)',
  BIOLOGICAL: 'عوامل بيولوجية وأمصال (Biological)',
  OTHER: 'أخرى (Other)',
};

const severityLabels: Record<AllergySeverity, { label: string; badgeClass: string }> = {
  MILD: { label: 'طفيفة (Mild)', badgeClass: 'cf-badge-info' },
  MODERATE: { label: 'متوسطة (Moderate)', badgeClass: 'cf-badge-warning' },
  SEVERE: { label: 'شديدة (Severe)', badgeClass: 'cf-badge-danger' },
  LIFE_THREATENING: { label: 'مهددة للحياة (Life-Threatening)', badgeClass: 'cf-badge-critical' },
  UNKNOWN: { label: 'غير محددة (Unknown)', badgeClass: 'cf-badge-info' },
};

export const AllergyRegisterPanel: React.FC<AllergyRegisterPanelProps> = ({
  clinicId,
  patientId,
  encounterId,
  csrfToken,
  onRefreshSummary,
}) => {
  const [allergies, setAllergies] = useState<PatientAllergyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form State
  const [allergyStatusType, setAllergyStatusType] = useState<AllergyStatusType>('ALLERGY_PRESENT');
  const [category, setCategory] = useState<AllergenCategory>('MEDICATION');
  const [substance, setSubstance] = useState('');
  const [reaction, setReaction] = useState('');
  const [severity, setSeverity] = useState<AllergySeverity>('UNKNOWN');
  const [clinicalStatus, setClinicalStatus] = useState<AllergyClinicalStatus>('ACTIVE');
  const [verificationStatus] = useState<AllergyVerificationStatus>('PATIENT_REPORTED');
  const [notes, setNotes] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await listAllergies(clinicId, patientId, undefined, csrfToken);
      setAllergies(items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل سجل الحساسيات');
    } finally {
      setLoading(false);
    }
  }, [clinicId, patientId, csrfToken]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const isNka = allergyStatusType === 'NO_KNOWN_ALLERGIES';
    const effectiveSubstance = isNka ? 'لا توجد حساسيات معروفة (No Known Allergies)' : substance.trim();

    if (!isNka && !effectiveSubstance) {
      setError('يرجى تحديد المادة المسببة للحساسية');
      return;
    }

    try {
      await recordAllergy(
        clinicId,
        patientId,
        {
          encounterId,
          allergyStatusType,
          category: isNka ? 'OTHER' : category,
          substance: effectiveSubstance,
          reaction: reaction.trim() || undefined,
          severity: isNka ? 'UNKNOWN' : severity,
          clinicalStatus,
          verificationStatus,
          notes: notes.trim() || undefined,
        },
        csrfToken,
      );

      setSuccessMessage('تم توثيق سجل الحساسية بنجاح');
      setSubstance('');
      setReaction('');
      setNotes('');
      await loadData();
      if (onRefreshSummary) onRefreshSummary();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'فشل تسجيل الحساسية');
    }
  };

  const handleVerify = async (id: string) => {
    setError(null);
    try {
      await verifyAllergy(clinicId, id, csrfToken);
      setSuccessMessage('تم التحقق والتأكيد السريري للحساسية بواسطة الطبيب');
      await loadData();
      if (onRefreshSummary) onRefreshSummary();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'فشل تأكيد الحساسية');
    }
  };

  const hasCriticalAllergies = allergies.some(
    a => a.clinicalStatus === 'ACTIVE' && (a.severity === 'LIFE_THREATENING' || a.severity === 'SEVERE'),
  );

  return (
    <div className="clinical-foundation-container">
      {error && <div className="cf-alert cf-alert-danger">{error}</div>}
      {successMessage && <div className="cf-alert cf-alert-success">{successMessage}</div>}

      {hasCriticalAllergies && (
        <div className="cf-alert cf-alert-danger" style={{ fontWeight: 700 }}>
          ⚠️ تنبيه أمان دوائي وسريري عالي الأهمية: المريض لديه حساسية شديدة أو مهددة للحياة مسجلة ونشطة!
        </div>
      )}

      {/* Record Allergy Form */}
      <div className="cf-card">
        <div className="cf-header">
          <h3>سجل الحساسيات والتفاعلات الدوائية العكسية (Allergy Register)</h3>
          <span className="cf-meta">حماية سلامة المرضى قبل صرف أو وصف أي علاج</span>
        </div>

        <form onSubmit={handleRecord}>
          <div className="cf-grid">
            <div className="cf-field">
              <label>نوع حالة الحساسية *</label>
              <select
                className="cf-select"
                value={allergyStatusType}
                onChange={e => setAllergyStatusType(e.target.value as AllergyStatusType)}
              >
                <option value="ALLERGY_PRESENT">توجد حساسية مؤكدة أو مشتبه بها</option>
                <option value="NO_KNOWN_ALLERGIES">لا توجد حساسيات معروفة (No Known Allergies - NKA)</option>
                <option value="STATUS_UNCONFIRMED_UNKNOWN">غير محدد / لم يتم التأكيد بعد</option>
              </select>
            </div>

            {allergyStatusType === 'ALLERGY_PRESENT' && (
              <>
                <div className="cf-field">
                  <label>فئة المادة المسببة للحساسية *</label>
                  <select
                    className="cf-select"
                    value={category}
                    onChange={e => setCategory(e.target.value as AllergenCategory)}
                  >
                    {Object.entries(categoryLabels).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="cf-field">
                  <label>المادة المسببة للحساسية (Substance / Drug) *</label>
                  <input
                    type="text"
                    className="cf-input"
                    placeholder="مثال: البنسلين (Penicillin)، الأسبرين، المكسرات..."
                    value={substance}
                    onChange={e => setSubstance(e.target.value)}
                    required
                  />
                </div>

                <div className="cf-field">
                  <label>درجة الشدة والخطورة *</label>
                  <select
                    className="cf-select"
                    value={severity}
                    onChange={e => setSeverity(e.target.value as AllergySeverity)}
                  >
                    {Object.entries(severityLabels).map(([key, info]) => (
                      <option key={key} value={key}>
                        {info.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="cf-field">
                  <label>رد الفعل التحسسي (Reaction Symptoms)</label>
                  <input
                    type="text"
                    className="cf-input"
                    placeholder="صدمة تأقية (Anaphylaxis)، طفح جلدي، وذمة وعائية..."
                    value={reaction}
                    onChange={e => setReaction(e.target.value)}
                  />
                </div>

                <div className="cf-field">
                  <label>الحالة السريرية</label>
                  <select
                    className="cf-select"
                    value={clinicalStatus}
                    onChange={e => setClinicalStatus(e.target.value as AllergyClinicalStatus)}
                  >
                    <option value="ACTIVE">نشطة (Active)</option>
                    <option value="INACTIVE">غير نشطة (Inactive)</option>
                    <option value="RESOLVED">تم التخلص منها (Resolved)</option>
                  </select>
                </div>
              </>
            )}
          </div>

          <div className="cf-field" style={{ marginTop: '0.75rem' }}>
            <label>ملاحظات إضافية</label>
            <textarea
              className="cf-textarea"
              rows={2}
              placeholder="تاريخ التشخيص، اختبارات التحسس السابقة..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          <div className="cf-actions">
            <button type="submit" className="cf-btn-primary" disabled={loading}>
              {allergyStatusType === 'NO_KNOWN_ALLERGIES'
                ? 'توثيق عدم وجود أي حساسيات معروفة (NKA)'
                : 'تسجيل الحساسية في السجل'}
            </button>
          </div>
        </form>
      </div>

      {/* Allergies Table */}
      <div className="cf-card">
        <div className="cf-header">
          <h3>سجل حساسيات المريض المسجلة</h3>
          <span className="cf-meta">{allergies.length} سجل</span>
        </div>

        {allergies.length === 0 ? (
          <p style={{ color: '#64748b' }}>لم يتم تسجيل أي حساسيات لهذا المريض بعد.</p>
        ) : (
          <div className="cf-table-container">
            <table className="cf-table">
              <thead>
                <tr>
                  <th>المادة المسببة</th>
                  <th>الفئة</th>
                  <th>درجة الخطورة</th>
                  <th>رد الفعل / الأعراض</th>
                  <th>الحالة</th>
                  <th>حالة التحقق</th>
                  <th>الموثق</th>
                  <th>إجراءات التحقق</th>
                </tr>
              </thead>
              <tbody>
                {allergies.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 700 }}>{a.substance}</td>
                    <td>{categoryLabels[a.category]}</td>
                    <td>
                      <span className={`cf-badge ${severityLabels[a.severity]?.badgeClass}`}>
                        {severityLabels[a.severity]?.label}
                      </span>
                    </td>
                    <td>{a.reaction || '---'}</td>
                    <td>
                      <span
                        className={`cf-badge ${
                          a.clinicalStatus === 'ACTIVE'
                            ? 'cf-badge-danger'
                            : 'cf-badge-info'
                        }`}
                      >
                        {a.clinicalStatus === 'ACTIVE' ? 'نشطة' : 'غير نشطة'}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`cf-badge ${
                          a.verificationStatus === 'CLINICIAN_CONFIRMED'
                            ? 'cf-badge-success'
                            : 'cf-badge-warning'
                        }`}
                      >
                        {a.verificationStatus === 'CLINICIAN_CONFIRMED'
                          ? 'مؤكدة طبياً'
                          : a.verificationStatus === 'PATIENT_REPORTED'
                          ? 'إبلاغ من المريض'
                          : a.verificationStatus}
                      </span>
                    </td>
                    <td>{a.recordedByName || 'طبيب'}</td>
                    <td>
                      {a.verificationStatus !== 'CLINICIAN_CONFIRMED' && (
                        <button
                          type="button"
                          className="cf-btn-primary"
                          style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', backgroundColor: '#059669' }}
                          onClick={() => handleVerify(a.id)}
                        >
                          تأكيد وتحقق سريري
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
    </div>
  );
};

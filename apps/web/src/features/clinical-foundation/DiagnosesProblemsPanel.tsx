import React, { useState, useEffect, useCallback } from 'react';
import {
  listDiagnoses,
  recordDiagnosis,
  amendDiagnosis,
  confirmDiagnosis,
  type EncounterDiagnosisItem,
  type DiagnosisRole,
  type DiagnosisClinicalStatus,
  type DiagnosisVerificationStatus,
  type ProblemListStatus,
} from './clinical-foundation-api';

interface DiagnosesProblemsPanelProps {
  clinicId: string;
  patientId: string;
  encounterId: string;
  csrfToken?: string;
  onRefreshSummary?: () => void;
}

const roleLabels: Record<DiagnosisRole, string> = {
  PRIMARY: 'تشخيص رئيسي (Primary)',
  SECONDARY: 'تشخيص ثانوي (Secondary)',
  DIFFERENTIAL: 'تشخيص تفريقي (Differential)',
  ADMISSION: 'تشخيص عند الدخول (Admission)',
  DISCHARGE: 'تشخيص عند الخروج (Discharge)',
};

const clinicalStatusLabels: Record<DiagnosisClinicalStatus, string> = {
  PROVISIONAL: 'مبدئي (Provisional)',
  CONFIRMED: 'مؤكد (Confirmed)',
  RESOLVED: 'محلول / منتهي (Resolved)',
  REFUTED: 'مستبعد (Refuted)',
  ENTERED_IN_ERROR: 'أدخل بالخطأ',
};

const problemStatusLabels: Record<ProblemListStatus, string> = {
  ACTIVE: 'نشط (Active)',
  INACTIVE: 'غير نشط (Inactive)',
  RESOLVED: 'تم الشفاء (Resolved)',
  REMITTED: 'في مرحلة هدوء (Remitted)',
};

export const DiagnosesProblemsPanel: React.FC<DiagnosesProblemsPanelProps> = ({
  clinicId,
  patientId,
  encounterId,
  csrfToken,
  onRefreshSummary,
}) => {
  const [diagnoses, setDiagnoses] = useState<EncounterDiagnosisItem[]>([]);
  const [showProblemsOnly, setShowProblemsOnly] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form State
  const [code, setCode] = useState('');
  const [codingSystem, setCodingSystem] = useState('ICD-10');
  const [displayAr, setDisplayAr] = useState('');
  const [displayEn, setDisplayEn] = useState('');
  const [diagnosisRole, setDiagnosisRole] = useState<DiagnosisRole>('PRIMARY');
  const [clinicalStatus, setClinicalStatus] = useState<DiagnosisClinicalStatus>('PROVISIONAL');
  const [verificationStatus] = useState<DiagnosisVerificationStatus>('SUSPECTED');
  const [isProblem, setIsProblem] = useState(false);
  const [problemStatus, setProblemStatus] = useState<ProblemListStatus>('ACTIVE');
  const [clinicalNarrative, setClinicalNarrative] = useState('');
  const [onsetDate, setOnsetDate] = useState('');

  // Amend Modal State
  const [amendingItem, setAmendingItem] = useState<EncounterDiagnosisItem | null>(null);
  const [amendmentReason, setAmendmentReason] = useState('');
  const [amendClinicalStatus, setAmendClinicalStatus] = useState<DiagnosisClinicalStatus>('CONFIRMED');
  const [amendProblemStatus, setAmendProblemStatus] = useState<ProblemListStatus>('ACTIVE');
  const [amendResolutionDate, setAmendResolutionDate] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await listDiagnoses(
        clinicId,
        patientId,
        showProblemsOnly ? { isProblem: true } : { encounterId },
        csrfToken,
      );
      setDiagnoses(items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل التشخيصات');
    } finally {
      setLoading(false);
    }
  }, [clinicId, patientId, encounterId, showProblemsOnly, csrfToken]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!code.trim() || !displayAr.trim()) {
      setError('يرجى إدخال رمز التشخيص والاسم باللغة العربية');
      return;
    }

    try {
      await recordDiagnosis(
        clinicId,
        patientId,
        {
          encounterId,
          code: code.trim(),
          codingSystem: codingSystem.trim(),
          displayAr: displayAr.trim(),
          displayEn: displayEn.trim() || undefined,
          diagnosisRole,
          clinicalStatus,
          verificationStatus,
          isProblem,
          problemStatus: isProblem ? problemStatus : undefined,
          clinicalNarrative: clinicalNarrative.trim() || undefined,
          onsetDate: onsetDate ? new Date(onsetDate).toISOString() : undefined,
        },
        csrfToken,
      );

      setSuccessMessage('تم توثيق التشخيص السريري بنجاح');
      setCode('');
      setDisplayAr('');
      setDisplayEn('');
      setClinicalNarrative('');
      setIsProblem(false);
      await loadData();
      if (onRefreshSummary) onRefreshSummary();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'فشل تسجيل التشخيص');
    }
  };

  const handleConfirm = async (id: string) => {
    setError(null);
    try {
      await confirmDiagnosis(clinicId, id, csrfToken);
      setSuccessMessage('تم تأكيد التشخيص سريرياً');
      await loadData();
      if (onRefreshSummary) onRefreshSummary();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'فشل تأكيد التشخيص');
    }
  };

  const handleAmend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amendingItem) return;
    if (!amendmentReason.trim()) {
      setError('يرجى إدخال سبب التعديل للتدقيق السريري');
      return;
    }

    try {
      await amendDiagnosis(
        clinicId,
        amendingItem.id,
        {
          amendmentReason: amendmentReason.trim(),
          clinicalStatus: amendClinicalStatus,
          problemStatus: amendingItem.isProblem ? amendProblemStatus : undefined,
          resolutionDate: amendResolutionDate ? new Date(amendResolutionDate).toISOString() : undefined,
          expectedVersion: amendingItem.version,
        },
        csrfToken,
      );

      setSuccessMessage('تم تعديل التشخيص وحفظ الأثر التوثيقي');
      setAmendingItem(null);
      setAmendmentReason('');
      await loadData();
      if (onRefreshSummary) onRefreshSummary();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'فشل تعديل التشخيص');
    }
  };

  return (
    <div className="clinical-foundation-container">
      {error && <div className="cf-alert cf-alert-danger">{error}</div>}
      {successMessage && <div className="cf-alert cf-alert-success">{successMessage}</div>}

      {/* Record Diagnosis Form */}
      <div className="cf-card">
        <div className="cf-header">
          <h3>توثيق التشخيص السريري وإدارة قائمة المشكلات الطبية</h3>
          <span className="cf-meta">متوافق مع التصنيف الدولي للأمراض (ICD-10)</span>
        </div>

        <form onSubmit={handleRecord}>
          <div className="cf-grid">
            <div className="cf-field">
              <label>نظام الترميز *</label>
              <select
                className="cf-select"
                value={codingSystem}
                onChange={e => setCodingSystem(e.target.value)}
              >
                <option value="ICD-10">ICD-10 (التصنيف الدولي للأمراض)</option>
                <option value="SNOMED-CT">SNOMED CT</option>
                <option value="LOCAL">دليل العيادة المحلي</option>
              </select>
            </div>

            <div className="cf-field">
              <label>رمز التشخيص (Code) *</label>
              <input
                type="text"
                className="cf-input"
                placeholder="مثال: L70.0، I10، E11.9"
                value={code}
                onChange={e => setCode(e.target.value)}
                required
              />
            </div>

            <div className="cf-field">
              <label>المسمى باللغة العربية *</label>
              <input
                type="text"
                className="cf-input"
                placeholder="حب الشباب الشائع، ارتفاع ضغط الدم..."
                value={displayAr}
                onChange={e => setDisplayAr(e.target.value)}
                required
              />
            </div>

            <div className="cf-field">
              <label>المسمى باللغة الإنجليزية</label>
              <input
                type="text"
                className="cf-input"
                placeholder="Acne vulgaris, Essential hypertension..."
                value={displayEn}
                onChange={e => setDisplayEn(e.target.value)}
              />
            </div>

            <div className="cf-field">
              <label>دور التشخيص في الاستشارة *</label>
              <select
                className="cf-select"
                value={diagnosisRole}
                onChange={e => setDiagnosisRole(e.target.value as DiagnosisRole)}
              >
                {Object.entries(roleLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="cf-field">
              <label>الحالة السريرية *</label>
              <select
                className="cf-select"
                value={clinicalStatus}
                onChange={e => setClinicalStatus(e.target.value as DiagnosisClinicalStatus)}
              >
                {Object.entries(clinicalStatusLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="cf-field">
              <label>تاريخ البدء / الظهور</label>
              <input
                type="date"
                className="cf-input"
                value={onsetDate}
                onChange={e => setOnsetDate(e.target.value)}
              />
            </div>
          </div>

          {/* Problem List Toggle */}
          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem',
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isProblem}
                onChange={e => setIsProblem(e.target.checked)}
              />
              <span style={{ fontWeight: 600 }}>إدراج في قائمة المشكلات الطبية المزمنة/المستمرة (Problem List)</span>
            </label>

            {isProblem && (
              <div className="cf-grid" style={{ marginTop: '0.75rem' }}>
                <div className="cf-field">
                  <label>حالة المشكلة الطبية *</label>
                  <select
                    className="cf-select"
                    value={problemStatus}
                    onChange={e => setProblemStatus(e.target.value as ProblemListStatus)}
                  >
                    {Object.entries(problemStatusLabels).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="cf-field" style={{ marginTop: '0.75rem' }}>
            <label>السرد والتقييم السريري المصاحب</label>
            <textarea
              className="cf-textarea"
              rows={2}
              placeholder="وصف إضافي، درجة الشدة، أو تفاصيل الملاحظة..."
              value={clinicalNarrative}
              onChange={e => setClinicalNarrative(e.target.value)}
            />
          </div>

          <div className="cf-actions">
            <button type="submit" className="cf-btn-primary" disabled={loading}>
              توثيق التشخيص
            </button>
          </div>
        </form>
      </div>

      {/* Diagnoses List */}
      <div className="cf-card">
        <div className="cf-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <h3>{showProblemsOnly ? 'قائمة المشكلات الطبية المستمرة (Problem List)' : 'تشخيصات الاستشارة الحالية'}</h3>
            <button
              type="button"
              className="cf-btn-secondary"
              style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
              onClick={() => setShowProblemsOnly(!showProblemsOnly)}
            >
              {showProblemsOnly ? 'عرض تشخيصات الاستشارة فقط' : 'عرض قائمة المشكلات الطبية الطويلة المدى'}
            </button>
          </div>
          <span className="cf-meta">{diagnoses.length} تشخيص</span>
        </div>

        {diagnoses.length === 0 ? (
          <p style={{ color: '#64748b' }}>لا توجد تشخيصات مسجلة في هذا النطاق.</p>
        ) : (
          <div className="cf-table-container">
            <table className="cf-table">
              <thead>
                <tr>
                  <th>الرمز</th>
                  <th>المسمى العربي</th>
                  <th>الدور</th>
                  <th>الحالة السريرية</th>
                  <th>مشكلة مزمنة؟</th>
                  <th>الموثق</th>
                  <th>تأكيد سريري</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {diagnoses.map(d => (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{d.code}</td>
                    <td>
                      <div>{d.displayAr}</div>
                      {d.displayEn && <small style={{ color: '#64748b' }}>{d.displayEn}</small>}
                    </td>
                    <td>
                      <span className={`cf-badge ${d.diagnosisRole === 'PRIMARY' ? 'cf-badge-critical' : 'cf-badge-info'}`}>
                        {roleLabels[d.diagnosisRole]}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`cf-badge ${
                          d.clinicalStatus === 'CONFIRMED'
                            ? 'cf-badge-success'
                            : d.clinicalStatus === 'RESOLVED'
                            ? 'cf-badge-info'
                            : 'cf-badge-warning'
                        }`}
                      >
                        {clinicalStatusLabels[d.clinicalStatus]}
                      </span>
                    </td>
                    <td>
                      {d.isProblem ? (
                        <span className="cf-badge cf-badge-warning">
                          مشكلة: {d.problemStatus ? problemStatusLabels[d.problemStatus] : 'نشط'}
                        </span>
                      ) : (
                        '---'
                      )}
                    </td>
                    <td>{d.authorName || 'طبيب'}</td>
                    <td>
                      {d.confirmedByName ? (
                        <span className="cf-badge cf-badge-success">مؤكد بواسطة: {d.confirmedByName}</span>
                      ) : (
                        <button
                          type="button"
                          className="cf-btn-primary"
                          style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', backgroundColor: '#059669' }}
                          onClick={() => handleConfirm(d.id)}
                        >
                          تأكيد سريرياً
                        </button>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="cf-btn-secondary"
                        style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                        onClick={() => {
                          setAmendingItem(d);
                          setAmendClinicalStatus(d.clinicalStatus);
                          if (d.problemStatus) setAmendProblemStatus(d.problemStatus);
                          setAmendmentReason('');
                        }}
                      >
                        تعديل
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Amendment Modal */}
      {amendingItem && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div className="cf-card" style={{ maxWidth: '500px', width: '90%' }}>
            <div className="cf-header">
              <h4>تعديل وتحديث التشخيص السريري</h4>
              <button
                type="button"
                className="cf-btn-secondary"
                style={{ padding: '0.2rem 0.6rem' }}
                onClick={() => setAmendingItem(null)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleAmend}>
              <div className="cf-field">
                <label>التشخيص</label>
                <div style={{ fontWeight: 700 }}>
                  {amendingItem.code} - {amendingItem.displayAr}
                </div>
              </div>

              <div className="cf-field" style={{ marginTop: '0.5rem' }}>
                <label>الحالة السريرية المحدثة</label>
                <select
                  className="cf-select"
                  value={amendClinicalStatus}
                  onChange={e => setAmendClinicalStatus(e.target.value as DiagnosisClinicalStatus)}
                >
                  {Object.entries(clinicalStatusLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {amendingItem.isProblem && (
                <div className="cf-field" style={{ marginTop: '0.5rem' }}>
                  <label>حالة المشكلة الطبية المحدثة</label>
                  <select
                    className="cf-select"
                    value={amendProblemStatus}
                    onChange={e => setAmendProblemStatus(e.target.value as ProblemListStatus)}
                  >
                    {Object.entries(problemStatusLabels).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="cf-field" style={{ marginTop: '0.5rem' }}>
                <label>تاريخ الشفاء / الانتهاء (إن وجد)</label>
                <input
                  type="date"
                  className="cf-input"
                  value={amendResolutionDate}
                  onChange={e => setAmendResolutionDate(e.target.value)}
                />
              </div>

              <div className="cf-field" style={{ marginTop: '0.5rem' }}>
                <label>سبب التعديل الموثق *</label>
                <textarea
                  className="cf-textarea"
                  rows={2}
                  placeholder="بيان سبب التحديث السريري..."
                  value={amendmentReason}
                  onChange={e => setAmendmentReason(e.target.value)}
                  required
                />
              </div>

              <div className="cf-actions" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button
                  type="button"
                  className="cf-btn-secondary"
                  onClick={() => setAmendingItem(null)}
                >
                  إلغاء
                </button>
                <button type="submit" className="cf-btn-primary">
                  حفظ التعديل الموثق
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

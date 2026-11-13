import React, { useState, useEffect, useCallback } from 'react';
import {
  getPatientClinicalSummary,
  type PatientClinicalSummary,
} from './clinical-foundation-api';

interface ClinicalSummaryViewProps {
  clinicId: string;
  patientId: string;
  csrfToken?: string;
  onNavigateTab?: (tab: string) => void;
}

export const ClinicalSummaryView: React.FC<ClinicalSummaryViewProps> = ({
  clinicId,
  patientId,
  csrfToken,
  onNavigateTab,
}) => {
  const [summary, setSummary] = useState<PatientClinicalSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPatientClinicalSummary(clinicId, patientId, csrfToken);
      setSummary(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل الملخص السريري الشامل للمريض');
    } finally {
      setLoading(false);
    }
  }, [clinicId, patientId, csrfToken]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  if (loading) {
    return (
      <div className="cf-card" style={{ textAlign: 'center', padding: '2rem' }}>
        <p style={{ color: '#64748b' }}>جارٍ تحميل الملخص السريري الشامل للمريض...</p>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="cf-alert cf-alert-danger">
        {error || 'لا تتوفر بيانات ملخص سريري لهذا المريض'}
      </div>
    );
  }

  const hasCriticalAllergies = summary.allergies.some(
    a => a.clinicalStatus === 'ACTIVE' && (a.severity === 'LIFE_THREATENING' || a.severity === 'SEVERE'),
  );

  return (
    <div className="clinical-foundation-container">
      {/* Patient Header Card */}
      <div className="cf-card" style={{ backgroundColor: '#f8fafc', borderLeft: '4px solid #0284c7' }}>
        <div className="cf-header" style={{ marginBottom: '0.5rem', borderBottom: 'none' }}>
          <div>
            <h3 style={{ color: '#0f172a', fontSize: '1.25rem' }}>{summary.patient.name}</h3>
            <span className="cf-meta">
              الجنس: {summary.patient.gender === 'FEMALE' ? 'أنثى' : summary.patient.gender === 'MALE' ? 'ذكر' : 'غير محدد'} ·{' '}
              {summary.patient.birthDate
                ? `تاريخ الميلاد: ${new Date(summary.patient.birthDate).toLocaleDateString('ar-SA')}`
                : 'تاريخ الميلاد غير مسجل'}
            </span>
          </div>
        </div>
      </div>

      {/* Critical Allergy Alert Banner */}
      {hasCriticalAllergies && (
        <div className="cf-alert cf-alert-danger" style={{ fontWeight: 700, fontSize: '0.95rem' }}>
          ⚠️ تنبيه أمان دوائي وسريري: المريض يعاني من حساسيات نشطة شديدة أو مهددة للحياة! يرجى توخي الحذر عند وصف أو صرف أي علاج.
        </div>
      )}

      {/* Multi-Section Dashboard Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
        {/* Active Allergies Box */}
        <div className="cf-card">
          <div className="cf-header">
            <h4>الحساسيات والتفاعلات العكسية ({summary.allergies.length})</h4>
            {onNavigateTab && (
              <button
                type="button"
                className="cf-btn-secondary"
                style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                onClick={() => onNavigateTab('allergies')}
              >
                إدارة
              </button>
            )}
          </div>
          {summary.allergies.length === 0 ? (
            <p style={{ color: '#64748b', fontSize: '0.85rem' }}>لا توجد حساسيات مسجلة لهذا المريض.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {summary.allergies.map(a => (
                <div
                  key={a.id}
                  style={{
                    padding: '0.5rem',
                    borderRadius: '6px',
                    backgroundColor: a.severity === 'LIFE_THREATENING' || a.severity === 'SEVERE' ? '#fef2f2' : '#f8fafc',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <b style={{ color: '#0f172a' }}>{a.substance}</b>
                    {a.reaction && <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{a.reaction}</div>}
                  </div>
                  <span
                    className={`cf-badge ${
                      a.severity === 'LIFE_THREATENING'
                        ? 'cf-badge-critical'
                        : a.severity === 'SEVERE'
                        ? 'cf-badge-danger'
                        : 'cf-badge-warning'
                    }`}
                  >
                    {a.severity}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active Problem List Box */}
        <div className="cf-card">
          <div className="cf-header">
            <h4>قائمة المشكلات الطبية المستمرة ({summary.activeProblems.length})</h4>
            {onNavigateTab && (
              <button
                type="button"
                className="cf-btn-secondary"
                style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                onClick={() => onNavigateTab('diagnoses')}
              >
                إدارة
              </button>
            )}
          </div>
          {summary.activeProblems.length === 0 ? (
            <p style={{ color: '#64748b', fontSize: '0.85rem' }}>لا توجد مشكلات طبية مزمنة نشطة.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {summary.activeProblems.map(p => (
                <div
                  key={p.id}
                  style={{
                    padding: '0.5rem',
                    borderRadius: '6px',
                    backgroundColor: '#f8fafc',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <b style={{ color: '#0f172a' }}>{p.displayAr}</b>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0284c7' }}>{p.code}</span>
                  </div>
                  {p.displayEn && <small style={{ color: '#64748b' }}>{p.displayEn}</small>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active Current Medications Box */}
        <div className="cf-card">
          <div className="cf-header">
            <h4>الأدوية الحالية للمريض ({summary.activeMedications.length})</h4>
            {onNavigateTab && (
              <button
                type="button"
                className="cf-btn-secondary"
                style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                onClick={() => onNavigateTab('medications')}
              >
                مطابقة
              </button>
            )}
          </div>
          {summary.activeMedications.length === 0 ? (
            <p style={{ color: '#64748b', fontSize: '0.85rem' }}>لا توجد أدوية حالية مسجلة.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {summary.activeMedications.map(m => (
                <div
                  key={m.id}
                  style={{
                    padding: '0.5rem',
                    borderRadius: '6px',
                    backgroundColor: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <b style={{ color: '#0f172a' }}>{m.medicationName}</b>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      {m.dosage} · {m.frequency}
                    </div>
                  </div>
                  <span className={`cf-badge ${m.isReconciled ? 'cf-badge-success' : 'cf-badge-warning'}`}>
                    {m.isReconciled ? 'تمت المطابقة' : 'غير مطابق'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Vital Signs Box */}
        <div className="cf-card">
          <div className="cf-header">
            <h4>أحدث المؤشرات الحيوية المسجلة</h4>
            {onNavigateTab && (
              <button
                type="button"
                className="cf-btn-secondary"
                style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                onClick={() => onNavigateTab('vitals')}
              >
                تسجيل
              </button>
            )}
          </div>
          {summary.recentObservations.length === 0 ? (
            <p style={{ color: '#64748b', fontSize: '0.85rem' }}>لا توجد قياسات حيوية مسجلة.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
              {summary.recentObservations.slice(0, 6).map(o => (
                <div
                  key={o.id}
                  style={{
                    padding: '0.5rem',
                    borderRadius: '6px',
                    backgroundColor: '#f8fafc',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{o.observationType}</div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0284c7' }}>
                    {o.numericValue !== null ? `${o.numericValue} ${o.unit}` : o.textValue}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Prescriptions Summary */}
      <div className="cf-card">
        <div className="cf-header">
          <h4>أحدث الوصفات الطبية المحررة ({summary.recentPrescriptions.length})</h4>
          {onNavigateTab && (
            <button
              type="button"
              className="cf-btn-secondary"
              style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
              onClick={() => onNavigateTab('prescriptions')}
            >
              عرض الكل
            </button>
          )}
        </div>
        {summary.recentPrescriptions.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: '0.85rem' }}>لا توجد وصفات طبية محررة لهذا المريض.</p>
        ) : (
          <div className="cf-table-container">
            <table className="cf-table">
              <thead>
                <tr>
                  <th>رقم الوصفة</th>
                  <th>تاريخ التحرير</th>
                  <th>الحالة</th>
                  <th>عدد الأدوية</th>
                  <th>البصمة المشفرة</th>
                </tr>
              </thead>
              <tbody>
                {summary.recentPrescriptions.map(rx => (
                  <tr key={rx.id}>
                    <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{rx.prescriptionNumber}</td>
                    <td>{new Date(rx.createdAt).toLocaleDateString('ar-SA')}</td>
                    <td>
                      <span className={`cf-badge ${rx.status === 'SIGNED' ? 'cf-badge-success' : 'cf-badge-warning'}`}>
                        {rx.status === 'SIGNED' ? 'موقعة سريرياً' : rx.status}
                      </span>
                    </td>
                    <td>{rx.items?.length ?? 0} دواء</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                      {rx.signatureDigest ? `${rx.signatureDigest.substring(0, 16)}...` : '---'}
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

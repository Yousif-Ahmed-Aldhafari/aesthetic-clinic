import React, { useState } from 'react';
import type { PatientCaregiverItem, CaregiverRelationshipType } from './types.js';
import { createCaregiver, updateCaregiver, revokeCaregiver } from './pediatrics-api.js';

interface CaregiverAuthorizationSectionProps {
  clinicId: string;
  patientId: string;
  caregivers: PatientCaregiverItem[];
  onRefresh: () => Promise<void>;
  csrfToken?: string;
  onAuthError?: (e?: unknown) => void;
}

const RELATIONSHIP_LABELS: Record<CaregiverRelationshipType, string> = {
  MOTHER: 'الأم (Mother)',
  FATHER: 'الأب (Father)',
  LEGAL_GUARDIAN: 'ولي الأمر الشرعي / الوصي القانوني (Legal Guardian)',
  GRANDPARENT: 'الجد / الجدة (Grandparent)',
  SIBLING_ADULT: 'الأخ / الأخت البالغ (Adult Sibling)',
  FOSTER_PARENT: 'الأب أو الأم البديلة (Foster Parent)',
  CASE_WORKER: 'أخصائي الحالة / رعاية (Case Worker)',
  OTHER: 'مفوّض آخر (Other)',
};

export const CaregiverAuthorizationSection: React.FC<CaregiverAuthorizationSectionProps> = ({
  clinicId,
  patientId,
  caregivers,
  onRefresh,
  csrfToken,
  onAuthError,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingCaregiver, setEditingCaregiver] = useState<PatientCaregiverItem | null>(null);
  const [revokingCaregiver, setRevokingCaregiver] = useState<PatientCaregiverItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form states
  const [caregiverName, setCaregiverName] = useState('');
  const [caregiverNationalId, setCaregiverNationalId] = useState('');
  const [caregiverPhone, setCaregiverPhone] = useState('');
  const [caregiverEmail, setCaregiverEmail] = useState('');
  const [relationshipType, setRelationshipType] = useState<CaregiverRelationshipType>('MOTHER');
  const [hasLegalCustody, setHasLegalCustody] = useState(true);
  const [hasMedicalConsentAuthority, setHasMedicalConsentAuthority] = useState(true);
  const [isEmergencyContact, setIsEmergencyContact] = useState(true);
  const [emergencyPriority, setEmergencyPriority] = useState<number>(1);
  const [portalProxyAccess, setPortalProxyAccess] = useState(true);
  const [notes, setNotes] = useState('');

  // Revocation state
  const [revocationReason, setRevocationReason] = useState('');

  const resetForm = () => {
    setCaregiverName('');
    setCaregiverNationalId('');
    setCaregiverPhone('');
    setCaregiverEmail('');
    setRelationshipType('MOTHER');
    setHasLegalCustody(true);
    setHasMedicalConsentAuthority(true);
    setIsEmergencyContact(true);
    setEmergencyPriority(1);
    setPortalProxyAccess(true);
    setNotes('');
    setIsAdding(false);
    setEditingCaregiver(null);
    setRevokingCaregiver(null);
    setRevocationReason('');
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      await createCaregiver(
        clinicId,
        patientId,
        {
          caregiverName: caregiverName.trim(),
          caregiverNationalId: caregiverNationalId.trim() || undefined,
          caregiverPhone: caregiverPhone.trim(),
          caregiverEmail: caregiverEmail.trim() || undefined,
          relationshipType,
          hasLegalCustody,
          hasMedicalConsentAuthority,
          isEmergencyContact,
          emergencyPriority: isEmergencyContact ? Number(emergencyPriority) : undefined,
          portalProxyAccess,
          notes: notes.trim() || undefined,
        },
        csrfToken,
        onAuthError,
      );
      setSuccess('تم تسجيل وتفويض ولي الأمر / المفوض بنجاح');
      resetForm();
      await onRefresh();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCaregiver) return;
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      await updateCaregiver(
        clinicId,
        editingCaregiver.id,
        {
          expectedVersion: editingCaregiver.version,
          caregiverName: caregiverName.trim(),
          caregiverNationalId: caregiverNationalId.trim() || undefined,
          caregiverPhone: caregiverPhone.trim(),
          caregiverEmail: caregiverEmail.trim() || undefined,
          relationshipType,
          hasLegalCustody,
          hasMedicalConsentAuthority,
          isEmergencyContact,
          emergencyPriority: isEmergencyContact ? Number(emergencyPriority) : undefined,
          portalProxyAccess,
          notes: notes.trim() || undefined,
        },
        csrfToken,
        onAuthError,
      );
      setSuccess('تم تحديث بيانات وتفويضات ولي الأمر بنجاح');
      resetForm();
      await onRefresh();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevokeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revokingCaregiver) return;
    if (!revocationReason.trim()) {
      setError('سبب إلغاء التفويض وسحب الصلاحيات القانونية إلزامي');
      return;
    }
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      await revokeCaregiver(
        clinicId,
        revokingCaregiver.id,
        {
          expectedVersion: revokingCaregiver.version,
          revocationReason: revocationReason.trim(),
        },
        csrfToken,
        onAuthError,
      );
      setSuccess(`تم إلغاء التفويض وسحب الصلاحيات الطبية للمفوض (${revokingCaregiver.caregiverName}) فورياً`);
      resetForm();
      await onRefresh();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (cg: PatientCaregiverItem) => {
    setEditingCaregiver(cg);
    setIsAdding(false);
    setRevokingCaregiver(null);
    setCaregiverName(cg.caregiverName);
    setCaregiverNationalId(cg.caregiverNationalId ?? '');
    setCaregiverPhone(cg.caregiverPhone);
    setCaregiverEmail(cg.caregiverEmail ?? '');
    setRelationshipType(cg.relationshipType);
    setHasLegalCustody(cg.hasLegalCustody);
    setHasMedicalConsentAuthority(cg.hasMedicalConsentAuthority);
    setIsEmergencyContact(cg.isEmergencyContact);
    setEmergencyPriority(cg.emergencyPriority ?? 1);
    setPortalProxyAccess(cg.portalProxyAccess);
    setNotes(cg.notes ?? '');
  };

  return (
    <div className="caregiver-authorization-section" data-testid="caregiver-authorization-section" dir="rtl">
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h3 style={{ margin: 0 }}>🛡️ أولياء الأمور والمفوضون قانونياً (Caregivers & Legal Guardians)</h3>
          <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.875rem' }}>
            فصل الحضانة القانونية عن الإذن الطبي في التداخلات السريرية، أولوية الطوارئ، والوصول المفوض للبوابة.
          </p>
        </div>
        {!isAdding && !editingCaregiver && !revokingCaregiver && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              resetForm();
              setIsAdding(true);
            }}
            data-testid="add-caregiver-btn"
          >
            ➕ إضافة ولي أمر / مفوّض
          </button>
        )}
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

      {/* REVOCATION MODAL / DRAWER */}
      {revokingCaregiver && (
        <form
          onSubmit={handleRevokeSubmit}
          style={{ border: '2px solid #ef4444', borderRadius: '8px', padding: '1.25rem', backgroundColor: '#fef2f2', marginBottom: '1.5rem' }}
          data-testid="revoke-caregiver-form"
        >
          <h4 style={{ margin: '0 0 0.5rem', color: '#991b1b' }}>
            🚫 سحب الصلاحيات وإلغاء تفويض: {revokingCaregiver.caregiverName}
          </h4>
          <p style={{ fontSize: '0.875rem', color: '#b91c1c', marginBottom: '1rem' }}>
            تحذير: سيتم إسقاط صلاحية الموافقة على الإجراءات الطبية وحظر الوصول المفوض إلى بوابة المريض فوراً.
          </p>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontWeight: 600, color: '#991b1b', marginBottom: '0.25rem' }}>
              سبب إلغاء التفويض (إلزامي للتوثيق والمساءلة القانونية)*:
            </label>
            <input
              type="text"
              required
              className="form-control"
              value={revocationReason}
              onChange={(e) => setRevocationReason(e.target.value)}
              placeholder="مثال: حكم قضائي بانتقال الحضانة / طلب كتابي من الحاضن القانوني"
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #fca5a5' }}
              data-testid="revocation-reason-input"
            />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={resetForm} disabled={submitting}>
              إلغاء
            </button>
            <button type="submit" className="btn btn-danger" disabled={submitting} data-testid="confirm-revoke-btn" style={{ backgroundColor: '#dc2626', color: '#ffffff' }}>
              {submitting ? 'جارٍ الإلغاء...' : 'تأكيد سحب التفويض فورياً'}
            </button>
          </div>
        </form>
      )}

      {/* CREATE OR EDIT FORM */}
      {(isAdding || editingCaregiver) && (
        <form
          onSubmit={editingCaregiver ? handleUpdateSubmit : handleCreateSubmit}
          style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '1.25rem', backgroundColor: '#f8fafc', marginBottom: '1.5rem' }}
          data-testid="caregiver-form"
        >
          <h4 style={{ margin: '0 0 1rem' }}>
            {editingCaregiver ? `تعديل بيانات المفوض: ${editingCaregiver.caregiverName}` : 'إضافة ولي أمر / مفوّض جديد للطفل'}
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                اسم المفوض / ولي الأمر رباعياً*
              </label>
              <input
                type="text"
                required
                value={caregiverName}
                onChange={(e) => setCaregiverName(e.target.value)}
                placeholder="الاسم الكامل"
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                data-testid="caregiver-name"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                صلة القرابة / الصفة القانونية*
              </label>
              <select
                value={relationshipType}
                onChange={(e) => setRelationshipType(e.target.value as CaregiverRelationshipType)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                data-testid="caregiver-relationship"
              >
                {Object.entries(RELATIONSHIP_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                رقم الهاتف المباشر*
              </label>
              <input
                type="tel"
                required
                value={caregiverPhone}
                onChange={(e) => setCaregiverPhone(e.target.value)}
                placeholder="مثال: 771234567"
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                data-testid="caregiver-phone"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                الرقم القومي / الهوية الوطنية
              </label>
              <input
                type="text"
                value={caregiverNationalId}
                onChange={(e) => setCaregiverNationalId(e.target.value)}
                placeholder="رقم الهوية / جواز السفر"
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                data-testid="caregiver-national-id"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                البريد الإلكتروني (لبوابة ولي الأمر)
              </label>
              <input
                type="email"
                value={caregiverEmail}
                onChange={(e) => setCaregiverEmail(e.target.value)}
                placeholder="caregiver@example.com"
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                data-testid="caregiver-email"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', background: '#ffffff', padding: '1rem', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={hasLegalCustody}
                onChange={(e) => setHasLegalCustody(e.target.checked)}
                data-testid="caregiver-legal-custody"
              />
              <strong>حضانة قانونية شرعية (Legal Custody)</strong>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={hasMedicalConsentAuthority}
                onChange={(e) => setHasMedicalConsentAuthority(e.target.checked)}
                data-testid="caregiver-medical-consent"
              />
              <strong>صلاحية توقيع الإذن الطبي (Medical Consent)</strong>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={portalProxyAccess}
                onChange={(e) => setPortalProxyAccess(e.target.checked)}
                data-testid="caregiver-portal-proxy"
              />
              <strong>وصول مفوض لبوابة المريض (Portal Proxy)</strong>
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isEmergencyContact}
                  onChange={(e) => setIsEmergencyContact(e.target.checked)}
                  data-testid="caregiver-emergency-contact"
                />
                جهة اتصال طوارئ
              </label>
              {isEmergencyContact && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginRight: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>أولوية:</span>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={emergencyPriority}
                    onChange={(e) => setEmergencyPriority(Number(e.target.value))}
                    style={{ width: '50px', padding: '0.2rem 0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  />
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={resetForm} disabled={submitting}>
              إلغاء
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting} data-testid="submit-caregiver-btn">
              {submitting ? 'جارٍ الحفظ...' : editingCaregiver ? 'حفظ التعديلات' : 'تسجيل المفوض'}
            </button>
          </div>
        </form>
      )}

      {/* CAREGIVERS LIST */}
      <div className="caregivers-list" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
        {(caregivers || []).map((cg) => {
          const isRevoked = cg.isRevoked;
          return (
            <div
              key={cg.id}
              className={`caregiver-card ${isRevoked ? 'revoked' : ''}`}
              style={{
                border: isRevoked ? '1px solid #fca5a5' : '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '1rem',
                backgroundColor: isRevoked ? '#fff5f5' : '#ffffff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                opacity: isRevoked ? 0.75 : 1,
              }}
              data-testid={`caregiver-card-${cg.id}`}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1.05rem', color: isRevoked ? '#991b1b' : '#0f172a' }}>
                    {cg.caregiverName}
                  </h4>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                    {RELATIONSHIP_LABELS[cg.relationshipType]}
                  </div>
                </div>
                {isRevoked ? (
                  <span className="badge badge-danger" style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                    🚫 ملغى التفويض
                  </span>
                ) : (
                  <span className="badge badge-success" style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                    ✅ مفوض نشط
                  </span>
                )}
              </div>

              <div style={{ fontSize: '0.85rem', color: '#334155', marginBottom: '0.75rem' }}>
                <div>📞 هاتف: <strong dir="ltr">{cg.caregiverPhone}</strong></div>
                {cg.caregiverNationalId && <div>🆔 هوية: {cg.caregiverNationalId}</div>}
                {cg.caregiverEmail && <div>✉️ بريد: {cg.caregiverEmail}</div>}
              </div>

              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                {cg.hasLegalCustody && (
                  <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.4rem', borderRadius: '4px', backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                    ⚖️ حضانة قانونية
                  </span>
                )}
                {cg.hasMedicalConsentAuthority && (
                  <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.4rem', borderRadius: '4px', backgroundColor: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>
                    📝 موافقة طبية
                  </span>
                )}
                {cg.portalProxyAccess && (
                  <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.4rem', borderRadius: '4px', backgroundColor: '#faf5ff', color: '#7e22ce', border: '1px solid #e9d5ff' }}>
                    🌐 بوابة إلكترونية
                  </span>
                )}
                {cg.isEmergencyContact && (
                  <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.4rem', borderRadius: '4px', backgroundColor: '#fff7ed', color: '#c2410c', border: '1px solid #ffedd5' }}>
                    🚨 طوارئ (أولوية {cg.emergencyPriority ?? 1})
                  </span>
                )}
              </div>

              {isRevoked && (
                <div style={{ fontSize: '0.75rem', color: '#991b1b', background: '#fee2e2', padding: '0.5rem', borderRadius: '4px', marginBottom: '0.75rem' }}>
                  <strong>سبب سحب الصلاحيات:</strong> {cg.revocationReason}
                  <div style={{ color: '#7f1d1d', marginTop: '0.2rem' }}>
                    بتاريخ: {cg.revokedAt ? new Date(cg.revokedAt).toLocaleString('ar-YE') : '—'}
                  </div>
                </div>
              )}

              {!isRevoked && (
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', borderTop: '1px solid #f1f5f9', paddingTop: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-outline btn-xs"
                    onClick={() => openEdit(cg)}
                    style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                    data-testid={`edit-caregiver-${cg.id}`}
                  >
                    ✏️ تعديل
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-danger btn-xs"
                    onClick={() => {
                      setRevokingCaregiver(cg);
                      setRevocationReason('');
                      setIsAdding(false);
                      setEditingCaregiver(null);
                    }}
                    style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', color: '#dc2626', borderColor: '#fca5a5' }}
                    data-testid={`revoke-caregiver-${cg.id}`}
                  >
                    🚫 إلغاء التفويض
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {caregivers.length === 0 && !isAdding && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem', border: '2px dashed #cbd5e1', borderRadius: '8px', color: '#64748b' }}>
            لم يتم تسجيل أي ولي أمر أو مفوض قانوني لهذا الطفل بعد. انقر فوق &quot;إضافة ولي أمر / مفوض&quot;.
          </div>
        )}
      </div>
    </div>
  );
};

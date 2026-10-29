import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../auth/api';
import { RequestScope } from '../patients/request-scope';
import {
  consentApi,
  type ConsentPurpose,
  type ConsentStatus,
  type ConsentTemplate,
  type PatientConsent,
  type SignerCapacity,
  type SignatureType,
} from './consent-api';
import './consent.css';

const purposeNames: Record<ConsentPurpose, string> = {
  PROCEDURE: 'إجراء تجميلي/طبي',
  CLINICAL_PHOTOGRAPHY: 'تصوير سريري طبي',
  MARKETING_PHOTOGRAPHY: 'تصوير وإعلام تسويقي',
};

const statusNames: Record<ConsentStatus, string> = {
  DRAFT: 'مسودة بانتظار التوقيع',
  PENDING_VERIFICATION: 'موقعة بانتظار اعتماد الطبيب',
  ACTIVE: 'سارية ومعتمدة',
  WITHDRAWN: 'مسحوبة',
  EXPIRED: 'منتهية الصلاحية',
  REFUSED: 'مرفوضة من المريض',
};

const signerCapacityNames: Record<SignerCapacity, string> = {
  PATIENT: 'المريض نفسه',
  GUARDIAN: 'ولي الأمر',
  LEGAL_REPRESENTATIVE: 'الممثل القانوني',
};

const dateFmt = (v: string | null | undefined) =>
  v ? new Intl.DateTimeFormat('ar-YE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(v)) : '—';

export function ConsentPanel({
  clinicId,
  patientId,
  patientName,
  patientNumber,
  csrfToken,
  clinicPermissions,
  onAuthError,
}: {
  clinicId: string;
  patientId: string;
  patientName?: string;
  patientNumber?: string;
  csrfToken: string;
  clinicPermissions: string[];
  onAuthError: (e: unknown) => void;
}) {
  const client = useMemo(() => consentApi(clinicId), [clinicId]);
  const scope = useMemo(() => new RequestScope(), [clinicId, patientId]);

  const canPrepare = clinicPermissions.includes('clinical.consents.prepare');
  const canSign = clinicPermissions.includes('clinical.consents.sign');
  const canVerify = clinicPermissions.includes('clinical.consents.verify');
  const canWithdraw = clinicPermissions.includes('clinical.consents.withdraw');
  const canManageTemplates = clinicPermissions.includes('clinical.consent-templates.manage');

  const [consents, setConsents] = useState<PatientConsent[]>([]);
  const [templates, setTemplates] = useState<ConsentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Active Modals: null | 'prepare' | 'sign' | 'verify' | 'withdraw' | 'refuse' | 'print' | 'templates'
  const [modalType, setModalType] = useState<string | null>(null);
  const [activeConsent, setActiveConsent] = useState<PatientConsent | null>(null);

  // Form States for Prepare
  const [prepTemplateVersionId, setPrepTemplateVersionId] = useState('');
  const [prepPurpose, setPrepPurpose] = useState<ConsentPurpose>('PROCEDURE');
  const [prepNotes, setPrepNotes] = useState('');

  // Form States for Signing
  const [signerCapacity, setSignerCapacity] = useState<SignerCapacity>('PATIENT');
  const [signerName, setSignerName] = useState(patientName ?? '');
  const [relationshipDesc, setRelationshipDesc] = useState('');
  const [signerIdentitySnapshot, setSignerIdentitySnapshot] = useState('');
  const [signatureType, setSignatureType] = useState<SignatureType>('DRAWN_BASE64');
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const [consentAcknowledged, setConsentAcknowledged] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawing = useRef(false);
  const hasDrawn = useRef(false);

  // Form States for Verify
  const [validUntil, setValidUntil] = useState('');

  // Form States for Withdraw / Refuse
  const [reasonInput, setReasonInput] = useState('');

  // Form States for Template Management
  const [tmplTitle, setTmplTitle] = useState('');
  const [tmplPurpose, setTmplPurpose] = useState<ConsentPurpose>('PROCEDURE');
  const [tmplBody, setTmplBody] = useState('');
  const [tmplRisks, setTmplRisks] = useState('');
  const [tmplAlternatives, setTmplAlternatives] = useState('');

  const loadData = () => {
    const t = scope.start();
    setLoading(true);
    setError('');
    Promise.all([
      client.listConsents(t.signal, `patientId=${encodeURIComponent(patientId)}`),
      client.listTemplates(t.signal),
    ])
      .then(([cRes, tRes]) => {
        if (t.current()) {
          setConsents(cRes.items);
          setTemplates(tRes.items);
        }
      })
      .catch((e) => {
        if (t.current()) {
          if (e instanceof ApiError && e.status === 401) onAuthError(e);
          setError('تعذّر تحميل بيانات الموافقات المستنيرة.');
        }
      })
      .finally(() => {
        if (t.current()) setLoading(false);
      });
  };

  useEffect(() => {
    loadData();
    return () => scope.cancel();
  }, [client, scope, patientId]);

  const fail = (e: unknown) => {
    if (e instanceof ApiError && e.status === 401) onAuthError(e);
    if (e instanceof ApiError && e.status === 409) {
      setError('تغيّرت حالة وثيقة الموافقة من مستخدم آخر. تم تحديث البيانات، يرجى إعادة المحاولة.');
      loadData();
      return;
    }
    setError(e instanceof ApiError ? `خطأ: ${e.message}` : 'تعذّر إتمام الإجراء السريري.');
  };

  // Canvas drawing handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
    isDrawing.current = true;
    hasDrawn.current = true;
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e293b';
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    isDrawing.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawn.current = false;
  };

  // Prepare Submission
  const handlePrepare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prepTemplateVersionId) return;
    const t = scope.start();
    setBusy(true);
    setError('');
    try {
      const selectedTmpl = templates.find((tmpl) =>
        tmpl.versions.some((v) => v.id === prepTemplateVersionId)
      );
      await client.prepareConsent(
        {
          patientId,
          templateVersionId: prepTemplateVersionId,
          purpose: prepPurpose,
          procedureCatalogId: selectedTmpl?.procedureCatalogId ?? undefined,
          notes: prepNotes.trim() || undefined,
        },
        csrfToken,
        t.signal
      );
      if (t.current()) {
        setNotice('تم إعداد مسودة الموافقة المستنيرة بنجاح.');
        setModalType(null);
        setPrepNotes('');
        loadData();
      }
    } catch (err) {
      if (t.current()) fail(err);
    } finally {
      if (t.current()) setBusy(false);
    }
  };

  // Signing Submission
  const handleSign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConsent) return;
    if (!consentAcknowledged) {
      setError('يرجى تأكيد الإقرار وقراءة شروط الموافقة.');
      return;
    }
    let sigData = '';
    if (signatureType === 'DRAWN_BASE64') {
      if (!hasDrawn.current || !canvasRef.current) {
        setError('يرجى رسم التوقيع في المساحة المخصصة.');
        return;
      }
      sigData = canvasRef.current.toDataURL('image/png');
    } else {
      if (!typedConfirmation.trim() || typedConfirmation.trim() !== signerName.trim()) {
        setError('يرجى كتابة الاسم المطابق في حقل التأكيد الخطي.');
        return;
      }
      sigData = `CONFIRMED:${typedConfirmation.trim()}`;
    }

    const t = scope.start();
    setBusy(true);
    setError('');
    try {
      await client.signConsent(
        activeConsent.id,
        {
          expectedVersion: activeConsent.version,
          signerCapacity,
          signerName: signerName.trim(),
          signerIdentitySnapshot: signerIdentitySnapshot.trim() || undefined,
          relationshipDescription: signerCapacity !== 'PATIENT' ? relationshipDesc.trim() || undefined : undefined,
          signatureType,
          signatureData: sigData,
        },
        csrfToken,
        t.signal
      );
      if (t.current()) {
        setNotice('تم توثيق توقيع المريض بنجاح، بانتظار اعتماد الطبيب.');
        setModalType(null);
        setActiveConsent(null);
        loadData();
      }
    } catch (err) {
      if (t.current()) fail(err);
    } finally {
      if (t.current()) setBusy(false);
    }
  };

  // Doctor Verification Submission
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConsent) return;
    const t = scope.start();
    setBusy(true);
    setError('');
    try {
      await client.verifyConsent(
        activeConsent.id,
        activeConsent.version,
        validUntil || undefined,
        csrfToken,
        t.signal
      );
      if (t.current()) {
        setNotice('تم اعتماد وتحقق الطبيب من الموافقة المستنيرة بنجاح وأصبحت سارية.');
        setModalType(null);
        setActiveConsent(null);
        loadData();
      }
    } catch (err) {
      if (t.current()) fail(err);
    } finally {
      if (t.current()) setBusy(false);
    }
  };

  // Withdrawal Submission
  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConsent || reasonInput.trim().length < 5) {
      setError('يرجى ذكر سبب سريري مفصل لسحب الموافقة (٥ أحرف على الأقل).');
      return;
    }
    const t = scope.start();
    setBusy(true);
    setError('');
    try {
      await client.withdrawConsent(
        activeConsent.id,
        activeConsent.version,
        reasonInput.trim(),
        csrfToken,
        t.signal
      );
      if (t.current()) {
        setNotice('تم سحب الموافقة المستنيرة وتعطيل أهلية تنفيذ الإجراء فوراً.');
        setModalType(null);
        setActiveConsent(null);
        setReasonInput('');
        loadData();
      }
    } catch (err) {
      if (t.current()) fail(err);
    } finally {
      if (t.current()) setBusy(false);
    }
  };

  // Refusal Submission
  const handleRefuse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConsent || reasonInput.trim().length < 3) {
      setError('يرجى ذكر سبب رفض المريض للموافقة.');
      return;
    }
    const t = scope.start();
    setBusy(true);
    setError('');
    try {
      await client.refuseConsent(
        activeConsent.id,
        activeConsent.version,
        reasonInput.trim(),
        csrfToken,
        t.signal
      );
      if (t.current()) {
        setNotice('تم توثيق رفض المريض للموافقة المستنيرة.');
        setModalType(null);
        setActiveConsent(null);
        setReasonInput('');
        loadData();
      }
    } catch (err) {
      if (t.current()) fail(err);
    } finally {
      if (t.current()) setBusy(false);
    }
  };

  // Template Creation Submission
  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tmplTitle.trim() || !tmplBody.trim() || !tmplRisks.trim() || !tmplAlternatives.trim()) {
      setError('يرجى ملء جميع الحقول الإلزامية لنموذج الموافقة.');
      return;
    }
    const t = scope.start();
    setBusy(true);
    setError('');
    try {
      const created = await client.createTemplate(
        {
          purpose: tmplPurpose,
          title: tmplTitle.trim(),
          initialVersion: {
            titleAr: tmplTitle.trim(),
            bodyAr: tmplBody.trim(),
            risksTextAr: tmplRisks.trim(),
            alternativesTextAr: tmplAlternatives.trim(),
          },
        },
        csrfToken,
        t.signal
      );
      // Immediately publish version 1
      const v1 = created.versions[0];
      if (v1) {
        await client.publishVersion(created.id, v1.id, 1, csrfToken, t.signal);
      }
      if (t.current()) {
        setNotice('تم إنشاء ونشر قالب الموافقة المستنيرة بنجاح.');
        setTmplTitle('');
        setTmplBody('');
        setTmplRisks('');
        setTmplAlternatives('');
        loadData();
      }
    } catch (err) {
      if (t.current()) fail(err);
    } finally {
      if (t.current()) setBusy(false);
    }
  };

  // Available published template versions
  const publishedVersions = useMemo(() => {
    const list: { tmpl: ConsentTemplate; version: ConsentTemplate['versions'][0] }[] = [];
    templates.forEach((tmpl) => {
      tmpl.versions.forEach((v) => {
        if (v.status === 'PUBLISHED') {
          list.push({ tmpl, version: v });
        }
      });
    });
    return list;
  }, [templates]);

  if (loading) {
    return <section className="consent-panel" aria-busy="true">جارٍ تحميل وثائق الموافقة المستنيرة…</section>;
  }

  return (
    <section className="consent-panel">
      <header className="consent-header">
        <div>
          <h3 className="consent-title">الموافقات المستنيرة وتوثيق التوقيعات</h3>
          <small style={{ color: '#64748b' }}>
            وثائق قانونية وسريرية مشفرة وملزمة · توثيق رقمي بالأدلة وتفريق صارم بين الأغراض
          </small>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {canPrepare && (
            <button
              className="consent-btn consent-btn-primary"
              onClick={() => {
                setPrepTemplateVersionId(publishedVersions[0]?.version.id ?? '');
                setPrepPurpose(publishedVersions[0]?.tmpl.purpose ?? 'PROCEDURE');
                setModalType('prepare');
              }}
            >
              ＋ إعداد موافقة للمريض
            </button>
          )}
          {canManageTemplates && (
            <button
              className="consent-btn consent-btn-outline"
              onClick={() => setModalType('templates')}
            >
              إدارة نماذج الموافقة
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="patient-error" role="alert">
          {error}
          <button className="table-btn" onClick={loadData}>إعادة المحاولة</button>
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button onClick={() => setNotice('')} aria-label="إغلاق التنبيه">×</button>
        </div>
      )}

      {/* Consents List */}
      <div className="consent-cards-list">
        {consents.map((c) => {
          const isProcedure = c.purpose === 'PROCEDURE';
          const isPhoto = c.purpose === 'CLINICAL_PHOTOGRAPHY';
          const badgePurposeClass = isProcedure
            ? 'badge-purpose-procedure'
            : isPhoto
            ? 'badge-purpose-photography'
            : 'badge-purpose-marketing';

          let badgeStatusClass = 'badge-status-draft';
          if (c.status === 'PENDING_VERIFICATION') badgeStatusClass = 'badge-status-pending';
          else if (c.status === 'ACTIVE') badgeStatusClass = 'badge-status-active';
          else if (c.status === 'WITHDRAWN') badgeStatusClass = 'badge-status-withdrawn';
          else if (c.status === 'REFUSED') badgeStatusClass = 'badge-status-refused';

          return (
            <article key={c.id} className="consent-card">
              <div className="consent-card-header">
                <div>
                  <span className="consent-template-name">{c.templateVersion.titleAr}</span>
                  {c.procedureCatalog && (
                    <span style={{ marginRight: '0.75rem', fontSize: '0.9rem', color: '#475569' }}>
                      ({c.procedureCatalog.nameAr})
                    </span>
                  )}
                </div>
                <div className="consent-badges">
                  <span className={`consent-badge ${badgePurposeClass}`}>
                    {purposeNames[c.purpose]}
                  </span>
                  <span className={`consent-badge ${badgeStatusClass}`}>
                    {statusNames[c.status]}
                  </span>
                </div>
              </div>

              <div className="consent-card-body">
                <p style={{ margin: '0.25rem 0', whiteSpace: 'pre-wrap' }}>{c.templateVersion.bodyAr}</p>
                <div className="consent-risks-box">
                  <b>المخاطر والمضاعفات المشروحة: </b>
                  <span>{c.templateVersion.risksTextAr}</span>
                  <br />
                  <b>البدائل المتاحة: </b>
                  <span>{c.templateVersion.alternativesTextAr}</span>
                </div>
              </div>

              {/* Evidence details */}
              {c.signatureEvidence && (
                <div className="consent-evidence-box">
                  <div>
                    <b>الموقع: </b>
                    <span>{c.signatureEvidence.signerName}</span> ({signerCapacityNames[c.signatureEvidence.signerCapacity]})
                    {c.signatureEvidence.relationshipDescription && (
                      <span> · صلة القرابة: {c.signatureEvidence.relationshipDescription}</span>
                    )}
                    <span> · بتاريخ: {dateFmt(c.signatureEvidence.signedAt)}</span>
                  </div>
                  <div>
                    <b>بصمة الدليل الرقمية (SHA-256): </b>
                    <span className="consent-hash">{c.signatureEvidence.evidenceHashSha256}</span>
                  </div>
                  {c.signatureEvidence.signatureType === 'DRAWN_BASE64' && c.signatureEvidence.signatureData && (
                    <div style={{ marginTop: '0.4rem' }}>
                      <img
                        src={c.signatureEvidence.signatureData}
                        alt="توقيع المريض"
                        style={{ maxHeight: '50px', border: '1px solid #cbd5e1', background: '#ffffff', borderRadius: '4px' }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Doctor verification details */}
              {c.verifiedAt && c.verifiedBy && (
                <div style={{ fontSize: '0.85rem', color: '#166534', background: '#f0fdf4', padding: '0.5rem', borderRadius: '4px' }}>
                  ✓ تم التحقق والاعتماد بواسطة الطبيب: <b>{c.verifiedBy.user.name}</b> في {dateFmt(c.verifiedAt)}
                  {c.expiresAt && <span> · صالحة حتى: {dateFmt(c.expiresAt)}</span>}
                </div>
              )}

              {/* Withdrawal details */}
              {c.status === 'WITHDRAWN' && c.withdrawal && (
                <div style={{ fontSize: '0.85rem', color: '#991b1b', background: '#fef2f2', padding: '0.5rem', borderRadius: '4px' }}>
                  ✕ تم سحب الموافقة بتاريخ {dateFmt(c.withdrawal.withdrawnAt)}.
                  <br />
                  <b>سبب السحب السريري: </b>{c.withdrawal.reason}
                </div>
              )}

              {/* Refusal details */}
              {c.status === 'REFUSED' && c.refusalReason && (
                <div style={{ fontSize: '0.85rem', color: '#4b5563', background: '#f3f4f6', padding: '0.5rem', borderRadius: '4px' }}>
                  ⊘ رفض المريض التوقيع: {c.refusalReason}
                </div>
              )}

              {/* Action Buttons */}
              <div className="consent-actions">
                {c.status === 'DRAFT' && canSign && (
                  <>
                    <button
                      className="consent-btn consent-btn-primary"
                      onClick={() => {
                        setActiveConsent(c);
                        setSignerName(patientName ?? '');
                        setSignerCapacity('PATIENT');
                        setRelationshipDesc('');
                        setSignerIdentitySnapshot('');
                        setSignatureType('DRAWN_BASE64');
                        setTypedConfirmation('');
                        setConsentAcknowledged(false);
                        setModalType('sign');
                      }}
                    >
                      توقيع المريض الآن
                    </button>
                    <button
                      className="consent-btn consent-btn-outline"
                      onClick={() => {
                        setActiveConsent(c);
                        setReasonInput('');
                        setModalType('refuse');
                      }}
                    >
                      توثيق رفض المريض
                    </button>
                  </>
                )}

                {c.status === 'PENDING_VERIFICATION' && canVerify && (
                  <button
                    className="consent-btn consent-btn-primary"
                    onClick={() => {
                      setActiveConsent(c);
                      setValidUntil('');
                      setModalType('verify');
                    }}
                  >
                    اعتماد وتحقق الطبيب
                  </button>
                )}

                {c.status === 'ACTIVE' && canWithdraw && (
                  <button
                    className="consent-btn consent-btn-danger"
                    onClick={() => {
                      setActiveConsent(c);
                      setReasonInput('');
                      setModalType('withdraw');
                    }}
                  >
                    سحب الموافقة
                  </button>
                )}

                {/* Print button for all signed/active/withdrawn */}
                {(c.status === 'ACTIVE' || c.status === 'PENDING_VERIFICATION' || c.status === 'WITHDRAWN') && (
                  <button
                    className="consent-btn consent-btn-outline"
                    onClick={() => {
                      setActiveConsent(c);
                      setModalType('print');
                    }}
                  >
                    عرض / طباعة الوثيقة الرسمية
                  </button>
                )}
              </div>
            </article>
          );
        })}

        {!consents.length && (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
            لا توجد موافقات مستنيرة مسجلة لهذا المريض حتى الآن.
          </div>
        )}
      </div>

      {/* Prepare Modal */}
      {modalType === 'prepare' && (
        <div className="consent-modal-overlay">
          <div className="consent-modal">
            <h3 style={{ marginTop: 0 }}>إعداد مسودة موافقة مستنيرة جديدة</h3>
            <form onSubmit={handlePrepare} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <label>
                نموذج الموافقة المعتمد *
                <select
                  required
                  value={prepTemplateVersionId}
                  onChange={(e) => {
                    setPrepTemplateVersionId(e.target.value);
                    const sel = publishedVersions.find((pv) => pv.version.id === e.target.value);
                    if (sel) setPrepPurpose(sel.tmpl.purpose);
                  }}
                >
                  {publishedVersions.map(({ tmpl, version }) => (
                    <option key={version.id} value={version.id}>
                      {version.titleAr} (النسخة {version.versionNumber} · {purposeNames[tmpl.purpose]})
                    </option>
                  ))}
                </select>
              </label>

              <label>
                الغرض القانوني من الموافقة *
                <select
                  required
                  value={prepPurpose}
                  onChange={(e) => setPrepPurpose(e.target.value as ConsentPurpose)}
                >
                  <option value="PROCEDURE">إجراء تجميلي/طبي (PROCEDURE)</option>
                  <option value="CLINICAL_PHOTOGRAPHY">تصوير سريري للملف الطبي فقط (CLINICAL_PHOTOGRAPHY)</option>
                  <option value="MARKETING_PHOTOGRAPHY">تصوير ونشر تسويقي خارجي (MARKETING_PHOTOGRAPHY)</option>
                </select>
              </label>

              <label>
                ملاحظات سريرية إضافية (اختياري)
                <textarea
                  maxLength={1000}
                  value={prepNotes}
                  onChange={(e) => setPrepNotes(e.target.value)}
                  placeholder="أي تفاصيل خاصة بالحالة أو توضيحات إضافية للمريض..."
                  rows={3}
                />
              </label>

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button
                  type="button"
                  className="consent-btn consent-btn-outline"
                  onClick={() => setModalType(null)}
                  disabled={busy}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="consent-btn consent-btn-primary"
                  disabled={busy || !prepTemplateVersionId}
                >
                  {busy ? 'جارٍ الإعداد...' : 'إنشاء مسودة الموافقة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Signing Modal */}
      {modalType === 'sign' && activeConsent && (
        <div className="consent-modal-overlay">
          <div className="consent-modal">
            <h3 style={{ marginTop: 0 }}>توثيق توقيع المريض على الموافقة المستنيرة</h3>
            <p style={{ color: '#475569', fontSize: '0.9rem' }}>
              نموذج: <b>{activeConsent.templateVersion.titleAr}</b> ({purposeNames[activeConsent.purpose]})
            </p>

            <form onSubmit={handleSign} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <label>
                  صفة الموقّع *
                  <select
                    value={signerCapacity}
                    onChange={(e) => setSignerCapacity(e.target.value as SignerCapacity)}
                  >
                    <option value="PATIENT">المريض نفسه</option>
                    <option value="GUARDIAN">ولي الأمر (قاصر)</option>
                    <option value="LEGAL_REPRESENTATIVE">الممثل القانوني / الوكيل</option>
                  </select>
                </label>

                <label>
                  اسم الموقّع بالكامل *
                  <input
                    required
                    maxLength={150}
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                  />
                </label>
              </div>

              {signerCapacity !== 'PATIENT' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <label>
                    صلة القرابة أو صفة التمثيل *
                    <input
                      required
                      maxLength={150}
                      value={relationshipDesc}
                      onChange={(e) => setRelationshipDesc(e.target.value)}
                      placeholder="مثال: الأب، الأم، وكيل شرعي بموجب صك..."
                    />
                  </label>
                  <label>
                    رقم وثيقة الهوية أو الصك
                    <input
                      maxLength={100}
                      value={signerIdentitySnapshot}
                      onChange={(e) => setSignerIdentitySnapshot(e.target.value)}
                      placeholder="رقم الهوية الوطنية أو صك الوكالة"
                    />
                  </label>
                </div>
              )}

              <label>
                طريقة التوثيق *
                <select
                  value={signatureType}
                  onChange={(e) => setSignatureType(e.target.value as SignatureType)}
                >
                  <option value="DRAWN_BASE64">رسم التوقيع الحي على الشاشة (DRAWN)</option>
                  <option value="TYPED_CONFIRMATION">إقرار نصي وتأكيد بالاسم (TYPED)</option>
                </select>
              </label>

              {signatureType === 'DRAWN_BASE64' ? (
                <div>
                  <label style={{ display: 'block', marginBottom: '0.25rem' }}>
                    ارسم التوقيع في المساحة أدناه بالماوس أو اللمس:
                  </label>
                  <div className="signature-canvas-container">
                    <canvas
                      ref={canvasRef}
                      width={560}
                      height={180}
                      className="signature-canvas"
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                      onTouchStart={startDrawing}
                      onTouchMove={draw}
                      onTouchEnd={stopDrawing}
                    />
                  </div>
                  <button
                    type="button"
                    className="consent-btn consent-btn-outline"
                    onClick={clearCanvas}
                    style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}
                  >
                    مسح وإعادة الرسم
                  </button>
                </div>
              ) : (
                <label>
                  اكتب الاسم الكامل لتأكيد الإقرار والموافقة:
                  <input
                    required
                    value={typedConfirmation}
                    onChange={(e) => setTypedConfirmation(e.target.value)}
                    placeholder={signerName}
                  />
                </label>
              )}

              <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '4px', fontSize: '0.85rem' }}>
                <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={consentAcknowledged}
                    onChange={(e) => setConsentAcknowledged(e.target.checked)}
                    style={{ marginTop: '0.2rem' }}
                  />
                  <span>
                    أقر بأنني قرأت وتفهمت شروط الموافقة المستنيرة، والمخاطر والمضاعفات والبدائل المشروحة أعلاه، وأوافق عليها بكامل الأهلية المعتبرة شرعاً ونظاماً.
                  </span>
                </label>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button
                  type="button"
                  className="consent-btn consent-btn-outline"
                  onClick={() => setModalType(null)}
                  disabled={busy}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="consent-btn consent-btn-primary"
                  disabled={busy || !consentAcknowledged}
                >
                  {busy ? 'جارٍ حفظ التوقيع...' : 'توثيق التوقيع'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Verify Modal */}
      {modalType === 'verify' && activeConsent && (
        <div className="consent-modal-overlay">
          <div className="consent-modal">
            <h3 style={{ marginTop: 0 }}>اعتماد الطبيب والتحقق من الموافقة المستنيرة</h3>
            <p style={{ lineHeight: 1.6, color: '#334155' }}>
              بصفتك الطبيب المكلّف، هل تؤكد أنك قمت بشرح الإجراء والمخاطر والبدائل للمريض شخصياً، وتحققت من صحة توقيعه وأهليته للموافقة؟
            </p>
            <form onSubmit={handleVerify} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <label>
                تاريخ انتهاء صلاحية الموافقة (اختياري - افتراضياً سنة كاملة):
                <input
                  type="date"
                  value={validUntil}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setValidUntil(e.target.value)}
                />
              </label>

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button
                  type="button"
                  className="consent-btn consent-btn-outline"
                  onClick={() => setModalType(null)}
                  disabled={busy}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="consent-btn consent-btn-primary"
                  disabled={busy}
                >
                  {busy ? 'جارٍ الاعتماد...' : 'اعتماد وجعل الموافقة سارية'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {modalType === 'withdraw' && activeConsent && (
        <div className="consent-modal-overlay">
          <div className="consent-modal">
            <h3 style={{ marginTop: 0, color: '#dc2626' }}>سحب الموافقة المستنيرة</h3>
            <p style={{ background: '#fef2f2', padding: '0.75rem', borderRadius: '4px', color: '#991b1b', fontSize: '0.9rem' }}>
              تنبيه هام: سحب الموافقة سيعطل فوراً إمكانية تنفيذ الإجراءات المرتبطة بهذه الموافقة في النظام السريري، ولا يمكن التراجع عن السحب.
            </p>
            <form onSubmit={handleWithdraw} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <label>
                السبب السريري / القانوني لسحب الموافقة * (٥ أحرف على الأقل):
                <textarea
                  required
                  minLength={5}
                  maxLength={1000}
                  rows={3}
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  placeholder="مثال: بناءً على طلب المريضة قبل بدء الجلسة، أو ظهور مانع سريري طارئ..."
                />
              </label>

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button
                  type="button"
                  className="consent-btn consent-btn-outline"
                  onClick={() => setModalType(null)}
                  disabled={busy}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="consent-btn consent-btn-danger"
                  disabled={busy || reasonInput.trim().length < 5}
                >
                  {busy ? 'جارٍ السحب...' : 'تأكيد سحب الموافقة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Refuse Modal */}
      {modalType === 'refuse' && activeConsent && (
        <div className="consent-modal-overlay">
          <div className="consent-modal">
            <h3 style={{ marginTop: 0 }}>توثيق رفض المريض للموافقة</h3>
            <form onSubmit={handleRefuse} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <label>
                سبب رفض المريض * (٣ أحرف على الأقل):
                <textarea
                  required
                  minLength={3}
                  maxLength={1000}
                  rows={3}
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  placeholder="سبب الرفض..."
                />
              </label>

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button
                  type="button"
                  className="consent-btn consent-btn-outline"
                  onClick={() => setModalType(null)}
                  disabled={busy}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="consent-btn consent-btn-outline"
                  disabled={busy || reasonInput.trim().length < 3}
                >
                  {busy ? 'جارٍ الحفظ...' : 'توثيق الرفض'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Templates Management Modal */}
      {modalType === 'templates' && (
        <div className="consent-modal-overlay">
          <div className="consent-modal" style={{ maxWidth: '750px' }}>
            <h3 style={{ marginTop: 0 }}>إدارة نماذج وقوالب الموافقة المستنيرة</h3>

            <div style={{ marginBottom: '1.5rem', maxHeight: '200px', overflowY: 'auto' }}>
              <b>القوالب المتاحة حالياً:</b>
              <ul style={{ paddingRight: '1.25rem', marginTop: '0.5rem' }}>
                {templates.map((tmpl) => (
                  <li key={tmpl.id} style={{ marginBottom: '0.4rem' }}>
                    <b>{tmpl.title}</b> ({purposeNames[tmpl.purpose]}) · {tmpl.versions.length} نسخ
                    {' — '}
                    {tmpl.versions.map((v) => (
                      <span key={v.id} style={{ fontSize: '0.8rem', marginRight: '0.3rem' }}>
                        ن{v.versionNumber} ({v.status})
                      </span>
                    ))}
                  </li>
                ))}
                {!templates.length && <li>لا توجد نماذج مضافة بعد.</li>}
              </ul>
            </div>

            <h4>إنشاء قالب موافقة جديد</h4>
            <form onSubmit={handleCreateTemplate} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <label>
                  عنوان النموذج *
                  <input
                    required
                    maxLength={200}
                    value={tmplTitle}
                    onChange={(e) => setTmplTitle(e.target.value)}
                    placeholder="مثال: إقرار وموافقة حقن الفيلر التجميلي"
                  />
                </label>

                <label>
                  الغرض القانوني *
                  <select
                    value={tmplPurpose}
                    onChange={(e) => setTmplPurpose(e.target.value as ConsentPurpose)}
                  >
                    <option value="PROCEDURE">إجراء تجميلي/طبي (PROCEDURE)</option>
                    <option value="CLINICAL_PHOTOGRAPHY">تصوير سريري طبي (CLINICAL_PHOTOGRAPHY)</option>
                    <option value="MARKETING_PHOTOGRAPHY">تصوير تسويقي وإعلامي (MARKETING_PHOTOGRAPHY)</option>
                  </select>
                </label>
              </div>

              <label>
                نص الموافقة والبنود القانونية والطبية *
                <textarea
                  required
                  rows={4}
                  value={tmplBody}
                  onChange={(e) => setTmplBody(e.target.value)}
                  placeholder="النص الكامل للشروط والتعليمات..."
                />
              </label>

              <label>
                المخاطر والمضاعفات المحتملة المشروحة *
                <textarea
                  required
                  rows={2}
                  value={tmplRisks}
                  onChange={(e) => setTmplRisks(e.target.value)}
                  placeholder="الكدمات، التورم، الحساسية، العدوى، إلخ..."
                />
              </label>

              <label>
                البدائل الطبية المتاحة *
                <textarea
                  required
                  rows={2}
                  value={tmplAlternatives}
                  onChange={(e) => setTmplAlternatives(e.target.value)}
                  placeholder="العلاج الدوائي، أو عدم إجراء أي تدخل تجميلي..."
                />
              </label>

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button
                  type="button"
                  className="consent-btn consent-btn-outline"
                  onClick={() => setModalType(null)}
                  disabled={busy}
                >
                  إغلاق
                </button>
                <button
                  type="submit"
                  className="consent-btn consent-btn-primary"
                  disabled={busy || !tmplTitle.trim() || !tmplBody.trim()}
                >
                  {busy ? 'جارٍ الحفظ...' : 'إنشاء ونشر النموذج'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable View Modal */}
      {modalType === 'print' && activeConsent && (
        <div className="consent-modal-overlay">
          <div className="consent-modal" style={{ maxWidth: '800px' }}>
            <div className="printable-consent-view">
              <div style={{ textAlign: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                <h2 style={{ margin: 0 }}>وثيقة إقرار وموافقة مستنيرة</h2>
                <h4 style={{ margin: '0.5rem 0', color: '#475569' }}>{activeConsent.templateVersion.titleAr}</h4>
                <div style={{ display: 'flex', justifyContent: 'space-around', fontSize: '0.85rem', color: '#64748b' }}>
                  <span>الغرض: {purposeNames[activeConsent.purpose]}</span>
                  <span>رقم الملف: {patientNumber ?? '—'}</span>
                  <span>المريض: {patientName ?? '—'}</span>
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem', lineHeight: 1.8 }}>
                <p style={{ whiteSpace: 'pre-wrap' }}>{activeConsent.templateVersion.bodyAr}</p>
                <div style={{ background: '#f8fafc', padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '4px', marginTop: '1rem' }}>
                  <b>المخاطر والمضاعفات المشروحة: </b>
                  <p style={{ margin: '0.5rem 0' }}>{activeConsent.templateVersion.risksTextAr}</p>
                  <b>البدائل المتاحة: </b>
                  <p style={{ margin: '0.5rem 0' }}>{activeConsent.templateVersion.alternativesTextAr}</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', borderTop: '1px solid #cbd5e1', paddingTop: '1rem' }}>
                <div>
                  <h4 style={{ margin: '0 0 0.5rem 0' }}>توثيق توقيع المريض / الممثل</h4>
                  {activeConsent.signatureEvidence ? (
                    <div>
                      <p style={{ margin: '0.2rem 0' }}>
                        <b>الاسم:</b> {activeConsent.signatureEvidence.signerName} ({signerCapacityNames[activeConsent.signatureEvidence.signerCapacity]})
                      </p>
                      <p style={{ margin: '0.2rem 0' }}>
                        <b>تاريخ التوقيع:</b> {dateFmt(activeConsent.signatureEvidence.signedAt)}
                      </p>
                      <p style={{ margin: '0.2rem 0', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                        <b>البصمة الرقمية:</b> {activeConsent.signatureEvidence.evidenceHashSha256}
                      </p>
                      {activeConsent.signatureEvidence.signatureType === 'DRAWN_BASE64' && activeConsent.signatureEvidence.signatureData && (
                        <img
                          src={activeConsent.signatureEvidence.signatureData}
                          alt="توقيع المريض"
                          style={{ maxHeight: '70px', marginTop: '0.5rem' }}
                        />
                      )}
                    </div>
                  ) : (
                    <p style={{ color: '#64748b' }}>غير موقّع بعد</p>
                  )}
                </div>

                <div>
                  <h4 style={{ margin: '0 0 0.5rem 0' }}>تحقق واعتماد الطبيب</h4>
                  {activeConsent.verifiedAt && activeConsent.verifiedBy ? (
                    <div>
                      <p style={{ margin: '0.2rem 0' }}>
                        <b>الطبيب المعالج:</b> {activeConsent.verifiedBy.user.name}
                      </p>
                      <p style={{ margin: '0.2rem 0' }}>
                        <b>تاريخ التحقق:</b> {dateFmt(activeConsent.verifiedAt)}
                      </p>
                      <p style={{ margin: '0.2rem 0' }}>
                        <b>الحالة:</b> {statusNames[activeConsent.status]}
                      </p>
                      {activeConsent.expiresAt && (
                        <p style={{ margin: '0.2rem 0' }}>
                          <b>صالح حتى:</b> {dateFmt(activeConsent.expiresAt)}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p style={{ color: '#64748b' }}>بانتظار اعتماد الطبيب</p>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button
                type="button"
                className="consent-btn consent-btn-outline"
                onClick={() => setModalType(null)}
              >
                إغلاق
              </button>
              <button
                type="button"
                className="consent-btn consent-btn-primary"
                onClick={() => window.print()}
              >
                طباعة الوثيقة
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

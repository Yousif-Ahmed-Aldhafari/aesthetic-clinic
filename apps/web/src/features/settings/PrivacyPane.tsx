import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { api, ApiError, type ClinicContext } from '../auth/api';
import { RequestScope } from '../../lib/request-scope';
import { Modal } from '../../components/ui';
import {
  type PrivacyRequest,
  type PatientExport,
  type RetentionPolicy,
  type RetentionDryRunReport,
  requestTypeLabels,
  requestStatusLabels,
  exportStatusLabels,
} from './privacy-api';

type Props = {
  clinic: ClinicContext;
  csrfToken: string;
  revision: number;
  onAuthError: (error: unknown) => void;
};

export function PrivacyPane({ clinic, csrfToken, revision, onAuthError }: Props) {
  const [subTab, setSubTab] = useState<'requests' | 'exports' | 'retention'>('requests');
  const [requests, setRequests] = useState<PrivacyRequest[]>([]);
  const [exportsList, setExportsList] = useState<PatientExport[]>([]);
  const [policy, setPolicy] = useState<RetentionPolicy | null>(null);
  const [dryRunReport, setDryRunReport] = useState<RetentionDryRunReport | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Modals
  const [createReqOpen, setCreateReqOpen] = useState(false);
  const [decideReq, setDecideReq] = useState<PrivacyRequest | null>(null);
  const [createExportOpen, setCreateExportOpen] = useState(false);
  const [exportResult, setExportResult] = useState<{ downloadUrl: string; downloadToken: string; expiresAt: string } | null>(null);
  const [dryRunOpen, setDryRunOpen] = useState(false);
  const [revokeExportId, setRevokeExportId] = useState<string | null>(null);

  const canExport = clinic.permissions.includes('privacy.export');
  const canManage = clinic.permissions.includes('privacy.requests.manage');

  const gate = useMemo(() => new RequestScope(), [clinic.clinicId]);
  useEffect(() => () => gate.cancel(), [gate]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    const token = gate.start();
    try {
      const [reqData, expData, polData] = await Promise.all([
        api<{ items: PrivacyRequest[] }>(`clinics/${clinic.clinicId}/privacy/requests`, 'GET', undefined, undefined, token.signal).catch(() => ({ items: [] })),
        canExport ? api<PatientExport[]>(`clinics/${clinic.clinicId}/privacy/exports`, 'GET', undefined, undefined, token.signal).catch(() => []) : Promise.resolve([]),
        api<RetentionPolicy>(`clinics/${clinic.clinicId}/privacy/retention-policy`, 'GET', undefined, undefined, token.signal).catch(() => null),
      ]);

      if (token.current()) {
        setRequests(reqData.items);
        setExportsList(expData);
        setPolicy(polData);
      }
    } catch (err) {
      if (token.current()) {
        setError(err instanceof ApiError ? err.message : 'تعذّر تحميل بيانات الخصوصية والحوكمة');
        if (err instanceof ApiError && err.status === 401) onAuthError(err);
      }
    } finally {
      if (token.current()) setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [clinic.clinicId, revision, subTab]);

  // Create Privacy Request
  const handleCreateRequest = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setMessage('');
    const fd = new FormData(e.currentTarget);
    const body = {
      patientName: String(fd.get('patientName') || '').trim(),
      patientContact: String(fd.get('patientContact') || '').trim() || undefined,
      patientId: String(fd.get('patientId') || '').trim() || undefined,
      requestType: String(fd.get('requestType')),
      subject: String(fd.get('subject') || '').trim(),
      notes: String(fd.get('notes') || '').trim() || undefined,
    };

    try {
      await api(`clinics/${clinic.clinicId}/privacy/requests`, 'POST', body, csrfToken);
      setMessage('تم تسجيل طلب الخصوصية بنجاح.');
      setCreateReqOpen(false);
      void loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر تسجيل طلب الخصوصية');
      if (err instanceof ApiError && (err.status === 401 || err.code === 'MFA_STEP_UP_REQUIRED')) onAuthError(err);
    }
  };

  // Decide / Update Privacy Request
  const handleDecideRequest = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!decideReq) return;
    setError('');
    setMessage('');
    const fd = new FormData(e.currentTarget);
    const isHold = fd.get('legalHold') === 'on';
    const body = {
      status: String(fd.get('status')),
      decisionReason: String(fd.get('decisionReason') || '').trim() || undefined,
      legalHold: isHold,
      legalHoldReason: isHold ? String(fd.get('legalHoldReason') || '').trim() : undefined,
      expectedVersion: decideReq.version,
    };

    try {
      await api(`clinics/${clinic.clinicId}/privacy/requests/${decideReq.id}/decision`, 'PATCH', body, csrfToken);
      setMessage('تم حفظ قرار المراجعة بنجاح.');
      setDecideReq(null);
      void loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر حفظ قرار المراجعة');
      if (err instanceof ApiError && (err.status === 401 || err.code === 'MFA_STEP_UP_REQUIRED')) onAuthError(err);
    }
  };

  // Create Patient Export (triggers MFA step-up if required)
  const handleCreateExport = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setMessage('');
    const fd = new FormData(e.currentTarget);
    const body = {
      patientId: String(fd.get('patientId') || '').trim(),
      privacyRequestId: String(fd.get('privacyRequestId') || '').trim() || undefined,
      purpose: String(fd.get('purpose') || '').trim(),
    };

    try {
      const res = await api<{
        exportId: string;
        downloadToken: string;
        downloadUrl: string;
        expiresAt: string;
        maxDownloads: number;
        fileSizeBytes: number;
      }>(`clinics/${clinic.clinicId}/privacy/exports`, 'POST', body, csrfToken);

      setExportResult(res);
      setCreateExportOpen(false);
      setMessage('تم إنشاء حزمة تصدير البيانات بنجاح.');
      void loadData();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'MFA_STEP_UP_REQUIRED') {
        onAuthError(err);
      } else {
        setError(err instanceof ApiError ? err.message : 'تعذّر إنشاء تصدير البيانات');
      }
    }
  };

  // Revoke Export
  const handleRevokeExport = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!revokeExportId) return;
    setError('');
    const fd = new FormData(e.currentTarget);
    const reason = String(fd.get('reason') || '').trim();

    try {
      await api(`clinics/${clinic.clinicId}/privacy/exports/${revokeExportId}/revoke`, 'PATCH', { reason }, csrfToken);
      setMessage('تم إلغاء صلاحية ملف التصدير بنجاح.');
      setRevokeExportId(null);
      void loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر إلغاء التصدير');
      if (err instanceof ApiError && err.status === 401) onAuthError(err);
    }
  };

  // Update Retention Policy
  const handleUpdatePolicy = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setMessage('');
    const fd = new FormData(e.currentTarget);
    const num = (k: string) => {
      const v = fd.get(k);
      return v && String(v).trim() ? Number(v) : undefined;
    };

    const body = {
      patientRecordDays: num('patientRecordDays'),
      appointmentDays: num('appointmentDays'),
      visitDays: num('visitDays'),
      auditEventDays: num('auditEventDays'),
      backupRetentionDays: num('backupRetentionDays'),
      exportRetentionDays: num('exportRetentionDays') ?? 7,
      privacyRequestDays: num('privacyRequestDays'),
    };

    try {
      const updated = await api<RetentionPolicy>(`clinics/${clinic.clinicId}/privacy/retention-policy`, 'PATCH', body, csrfToken);
      setPolicy(updated);
      setMessage('تم تحديث إعدادات سياسة الاستبقاء (الوضع التجريبي نشط).');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر تحديث سياسة الاستبقاء');
      if (err instanceof ApiError && (err.status === 401 || err.code === 'MFA_STEP_UP_REQUIRED')) onAuthError(err);
    }
  };

  // Run Retention Dry-Run
  const handleRunDryRun = async () => {
    setError('');
    setMessage('');
    try {
      const report = await api<RetentionDryRunReport>(`clinics/${clinic.clinicId}/privacy/retention-dry-run`, 'POST', {}, csrfToken);
      setDryRunReport(report);
      setDryRunOpen(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر تشغيل محاكاة تقرير الاستبقاء');
      if (err instanceof ApiError && (err.status === 401 || err.code === 'MFA_STEP_UP_REQUIRED')) onAuthError(err);
    }
  };

  return (
    <div className="privacy-governance-pane" dir="rtl">
      {/* Sub-tab navigation */}
      <nav className="settings-subtabs" aria-label="أقسام الخصوصية والحوكمة">
        <button
          type="button"
          className={subTab === 'requests' ? 'selected' : ''}
          onClick={() => { setSubTab('requests'); setError(''); setMessage(''); }}
        >
          سجل طلبات الخصوصية ({requests.length})
        </button>
        {canExport && (
          <button
            type="button"
            className={subTab === 'exports' ? 'selected' : ''}
            onClick={() => { setSubTab('exports'); setError(''); setMessage(''); }}
          >
            تصدير البيانات والأمان ({exportsList.length})
          </button>
        )}
        <button
          type="button"
          className={subTab === 'retention' ? 'selected' : ''}
          onClick={() => { setSubTab('retention'); setError(''); setMessage(''); }}
        >
          سياسة الاستبقاء والمحاكاة (Dry-Run)
        </button>
      </nav>

      {error && <p className="patient-error" role="alert">{error}</p>}
      {message && <p className="settings-success" role="status">{message}</p>}

      {/* SUBTAB 1: PRIVACY REQUESTS */}
      {subTab === 'requests' && (
        <div className="privacy-requests-section">
          <div className="section-header-actions">
            <div>
              <h4>سجل طلبات خصوصية المرضى والحوكمة</h4>
              <p className="settings-note">
                متابعة طلبات الوصول، التصحيح، تقييد المعالجة، ونقل البيانات بما يتوافق مع سياسات الخصوصية وحماية البيانات.
              </p>
            </div>
            {canManage && (
              <button
                type="button"
                className="primary-btn"
                onClick={() => setCreateReqOpen(true)}
              >
                + تسجيل طلب جديد
              </button>
            )}
          </div>

          {loading ? (
            <p role="status">جارٍ تحميل سجل الطلبات…</p>
          ) : requests.length === 0 ? (
            <p className="empty-state-text">لا توجد طلبات خصوصية مسجلة في هذه العيادة حاليًا.</p>
          ) : (
            <div className="table-responsive">
              <table className="settings-table" aria-label="جدول طلبات الخصوصية">
                <thead>
                  <tr>
                    <th>نوع الطلب</th>
                    <th>اسم المريض / جهة الاتصال</th>
                    <th>الموضوع</th>
                    <th>الحالة</th>
                    <th>تجميد قانوني</th>
                    <th>تاريخ الطلب</th>
                    <th>الإجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <b>{requestTypeLabels[r.requestType] || r.requestType}</b>
                      </td>
                      <td>
                        {r.patientName}
                        {r.patientContact && <small className="block-meta">{r.patientContact}</small>}
                      </td>
                      <td>{r.subject}</td>
                      <td>
                        <span className={`status-badge status-${r.status.toLowerCase()}`}>
                          {requestStatusLabels[r.status] || r.status}
                        </span>
                      </td>
                      <td>
                        {r.legalHold ? (
                          <span className="badge badge-warning" title={r.legalHoldReason || 'تجميد قانوني نشط'}>
                            🔒 مجمّد
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{new Date(r.requestedAt).toLocaleDateString('ar-SA')}</td>
                      <td>
                        {canManage ? (
                          <button
                            type="button"
                            className="auth-text-button"
                            onClick={() => setDecideReq(r)}
                          >
                            مراجعة واتخاذ قرار
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 2: DATA EXPORTS */}
      {subTab === 'exports' && canExport && (
        <div className="privacy-exports-section">
          <div className="section-header-actions">
            <div>
              <h4>حزم تصدير بيانات المرضى المشفرة</h4>
              <p className="settings-note">
                تصدير السجل الإداري والمالي للمريض بروابط مشفرة ذات مدة صلاحية محددة مع حماية كاملة ضد حقن الصيغ الرياضية (CSV/Spreadsheet Injection).
                يتطلب التصدير تأكيد الهوية بالتحقق بخطوتين (MFA Step-Up).
              </p>
            </div>
            <button
              type="button"
              className="primary-btn"
              onClick={() => setCreateExportOpen(true)}
            >
              + إنشاء حزمة تصدير مريض
            </button>
          </div>

          {exportResult && (
            <div className="export-success-box" role="region" aria-label="رابط التصدير الجديد">
              <h5>✅ تم إنشاء ملف التصدير بنجاح</h5>
              <p>رابط التحميل المباشر الآمن (صالح لمدة 24 ساعة، بحد أقصى 3 مرات):</p>
              <div className="export-link-bar">
                <input
                  type="text"
                  dir="ltr"
                  readOnly
                  value={`${window.location.origin}${exportResult.downloadUrl}`}
                />
                <a
                  href={exportResult.downloadUrl}
                  className="primary-btn"
                  download
                  target="_blank"
                  rel="noreferrer"
                >
                  تحميل الآن
                </a>
              </div>
            </div>
          )}

          {exportsList.length === 0 ? (
            <p className="empty-state-text">لا توجد ملفات تصدير نشطة أو سابقة لهذه العيادة.</p>
          ) : (
            <div className="table-responsive">
              <table className="settings-table" aria-label="جدول ملفات التصدير">
                <thead>
                  <tr>
                    <th>الغرض الموثّق</th>
                    <th>الحالة</th>
                    <th>التحميلات</th>
                    <th>انتهاء الصلاحية</th>
                    <th>تاريخ الإنشاء</th>
                    <th>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {exportsList.map((exp) => (
                    <tr key={exp.id}>
                      <td>{exp.purpose}</td>
                      <td>
                        <span className={`status-badge status-${exp.status.toLowerCase()}`}>
                          {exportStatusLabels[exp.status] || exp.status}
                        </span>
                      </td>
                      <td>
                        {exp.downloadCount} من {exp.maxDownloads}
                      </td>
                      <td>
                        {exp.expiresAt
                          ? new Date(exp.expiresAt).toLocaleString('ar-SA')
                          : '—'}
                      </td>
                      <td>{new Date(exp.createdAt).toLocaleDateString('ar-SA')}</td>
                      <td>
                        {exp.status === 'READY' && (
                          <button
                            type="button"
                            className="auth-text-button danger"
                            onClick={() => setRevokeExportId(exp.id)}
                          >
                            إلغاء الصلاحية فورًا
                          </button>
                        )}
                        {exp.status === 'REVOKED' && (
                          <small className="muted-text">{exp.revokeReason || 'تم الإلغاء'}</small>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 3: RETENTION POLICY & DRY-RUN */}
      {subTab === 'retention' && (
        <div className="privacy-retention-section">
          <div className="policy-banner-info">
            <h5>🔒 إطار سياسة الاستبقاء والحوكمة (وضع المحاكاة نشط)</h5>
            <p>
              وفقًا لمتطلبات حوكمة البيانات في المنصة، تظل عمليات الحذف التلقائي <b>معطّلة تمامًا (Dry-Run Only)</b> حتى إتمام المراجعة القانونية للولاية القضائية المعنية.
              سجلات التدقيق وسلاسل الفواتير المالية تحتفظ دائمًا بتسلسلها التاريخي غير القابل للتعديل.
            </p>
            <div className="banner-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => void handleRunDryRun()}
              >
                📊 تشغيل محاكاة تقرير الاستبقاء (Dry-Run)
              </button>
            </div>
          </div>

          <form onSubmit={(e) => void handleUpdatePolicy(e)} className="settings-form">
            <fieldset disabled={!canManage}>
              <legend>تكوين فترات الاستبقاء المسموحة للعيادة (بالأيام)</legend>
              <div className="settings-grid">
                <label className="settings-field" htmlFor="ret-patient">
                  سجلات المرضى غير النشطة (أيام)
                  <input
                    id="ret-patient"
                    name="patientRecordDays"
                    type="number"
                    min="1"
                    max="3650"
                    defaultValue={policy?.patientRecordDays ?? ''}
                    placeholder="افتراضي: غير محدد"
                  />
                  <small>المدة بعد تحويل المريض إلى غير نشط.</small>
                </label>

                <label className="settings-field" htmlFor="ret-appointments">
                  المواعيد المنتهية أو الملغاة (أيام)
                  <input
                    id="ret-appointments"
                    name="appointmentDays"
                    type="number"
                    min="1"
                    max="3650"
                    defaultValue={policy?.appointmentDays ?? ''}
                    placeholder="افتراضي: غير محدد"
                  />
                  <small>مواعيد مكتملة، ملغاة، أو تغيّب.</small>
                </label>

                <label className="settings-field" htmlFor="ret-visits">
                  سجلات الزيارات والإشغال (أيام)
                  <input
                    id="ret-visits"
                    name="visitDays"
                    type="number"
                    min="1"
                    max="3650"
                    defaultValue={policy?.visitDays ?? ''}
                    placeholder="افتراضي: غير محدد"
                  />
                  <small>تاريخ زيارات الانتظار المكتملة.</small>
                </label>

                <label className="settings-field" htmlFor="ret-audit">
                  سجلات تدقيق العمليات (أيام)
                  <input
                    id="ret-audit"
                    name="auditEventDays"
                    type="number"
                    min="90"
                    max="3650"
                    defaultValue={policy?.auditEventDays ?? 90}
                    required
                  />
                  <small>الحد الأدنى الإلزامي للمنصة: 90 يومًا.</small>
                </label>

                <label className="settings-field" htmlFor="ret-backups">
                  النسخ الاحتياطية المشفرة (أيام)
                  <input
                    id="ret-backups"
                    name="backupRetentionDays"
                    type="number"
                    min="7"
                    max="3650"
                    defaultValue={policy?.backupRetentionDays ?? 30}
                    required
                  />
                  <small>الحد الأدنى الإلزامي: 7 أيام.</small>
                </label>

                <label className="settings-field" htmlFor="ret-exports">
                  صلاحية ملفات التصدير (أيام)
                  <input
                    id="ret-exports"
                    name="exportRetentionDays"
                    type="number"
                    min="1"
                    max="30"
                    defaultValue={policy?.exportRetentionDays ?? 7}
                    required
                  />
                  <small>صلاحية ملفات JSON للتصدير.</small>
                </label>
              </div>

              {canManage && (
                <button type="submit" className="primary-btn">
                  حفظ إعدادات السياسة (وضع المحاكاة)
                </button>
              )}
            </fieldset>
          </form>
        </div>
      )}

      {/* MODAL 1: CREATE PRIVACY REQUEST */}
      {createReqOpen && (
        <Modal title="تسجيل طلب خصوصية جديد" onClose={() => setCreateReqOpen(false)}>
          <form onSubmit={(e) => void handleCreateRequest(e)} className="settings-form">
            <label className="settings-field" htmlFor="pr-name">
              اسم المريض الكامل *
              <input id="pr-name" name="patientName" required maxLength={200} />
            </label>

            <label className="settings-field" htmlFor="pr-contact">
              بيانات التواصل (بريد إلكتروني أو هاتف)
              <input id="pr-contact" name="patientContact" maxLength={254} dir="ltr" />
            </label>

            <label className="settings-field" htmlFor="pr-type">
              نوع الطلب *
              <select id="pr-type" name="requestType" required>
                <option value="ACCESS">طلب وصول لسجل المريض (Access)</option>
                <option value="CORRECTION">تصحيح بيانات إدارية (Correction)</option>
                <option value="RESTRICTION">تقييد معالجة البيانات (Restriction)</option>
                <option value="EXPORT">تصدير بيانات قابلة للنقل (Export)</option>
                <option value="ERASURE">تقييم طلب المحو / الإتلاف (Erasure)</option>
              </select>
            </label>

            <label className="settings-field" htmlFor="pr-subject">
              موضوع الطلب *
              <input id="pr-subject" name="subject" required maxLength={500} placeholder="ملخص موجز لطلب المريض" />
            </label>

            <label className="settings-field" htmlFor="pr-notes">
              ملاحظات داخلية للعيادة
              <textarea id="pr-notes" name="notes" rows={3} placeholder="ملاحظات سرية لفريق الإدارة فقط" />
            </label>

            <div className="modal-actions">
              <button type="submit" className="primary-btn">
                تسجيل الطلب
              </button>
              <button type="button" className="auth-text-button" onClick={() => setCreateReqOpen(false)}>
                إلغاء
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL 2: DECIDE PRIVACY REQUEST */}
      {decideReq && (
        <Modal title={`مراجعة الطلب: ${decideReq.subject}`} onClose={() => setDecideReq(null)}>
          <form onSubmit={(e) => void handleDecideRequest(e)} className="settings-form">
            <p>
              <b>المريض:</b> {decideReq.patientName} | <b>النوع:</b> {requestTypeLabels[decideReq.requestType]}
            </p>

            <label className="settings-field" htmlFor="dec-status">
              تحديث حالة الطلب *
              <select id="dec-status" name="status" defaultValue={decideReq.status} required>
                <option value="OPEN">طلب جديد</option>
                <option value="IN_REVIEW">قيد المراجعة</option>
                <option value="APPROVED">مقبول</option>
                <option value="DENIED">مرفوض (مع ذكر السبب)</option>
                <option value="COMPLETED">مكتمل ومُسلَّم</option>
                <option value="WITHDRAWN">مسحوب من قبل المريض</option>
                <option value="HELD">تجميد قانوني (Legal Hold)</option>
              </select>
            </label>

            <label className="settings-field" htmlFor="dec-reason">
              سبب القرار والتوثيق * (إلزامي في حال القبول، الرفض، أو التجميد)
              <textarea
                id="dec-reason"
                name="decisionReason"
                rows={3}
                defaultValue={decideReq.decisionReason || ''}
                placeholder="اذكر الأساس النظامي أو الإداري للقرار وفق سياسة الخصوصية"
              />
            </label>

            <label className="settings-check">
              <input
                name="legalHold"
                type="checkbox"
                defaultChecked={decideReq.legalHold}
              />
              تفعيل التجميد القانوني (Legal Hold يمنع أي حذف أو معالجة تلقائية للسجل)
            </label>

            <label className="settings-field" htmlFor="dec-hold-reason">
              سبب التجميد القانوني (إذا تم التفعيل)
              <input
                id="dec-hold-reason"
                name="legalHoldReason"
                defaultValue={decideReq.legalHoldReason || ''}
                maxLength={500}
                placeholder="رقم القضية، توجيه جهة رسمية، أو نزاع قانوني قائم"
              />
            </label>

            <div className="modal-actions">
              <button type="submit" className="primary-btn">
                تأكيد وحفظ القرار
              </button>
              <button type="button" className="auth-text-button" onClick={() => setDecideReq(null)}>
                إلغاء
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL 3: CREATE PATIENT EXPORT */}
      {createExportOpen && (
        <Modal title="إنشاء حزمة تصدير بيانات مريض (MFA Step-Up مطلوب)" onClose={() => setCreateExportOpen(false)}>
          <form onSubmit={(e) => void handleCreateExport(e)} className="settings-form">
            <p className="settings-note">
              تصدير البيانات الشخصية عملية عالية الحساسية. سيتم طلب تأكيد الهوية بخطوتين (MFA) قبل إتمام التصدير.
            </p>

            <label className="settings-field" htmlFor="exp-patient-id">
              معرّف المريض (Patient UUID) *
              <input id="exp-patient-id" name="patientId" required dir="ltr" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
            </label>

            <label className="settings-field" htmlFor="exp-req-id">
              معرّف طلب الخصوصية المرتبط (اختياري)
              <input id="exp-req-id" name="privacyRequestId" dir="ltr" placeholder="اختياري لربط التصدير بسجل الطلب" />
            </label>

            <label className="settings-field" htmlFor="exp-purpose">
              الغرض الموثّق للتصدير *
              <input id="exp-purpose" name="purpose" required maxLength={200} placeholder="مثال: تسليم نسخة بيانات بناءً على طلب المريض رقم #12" />
            </label>

            <div className="modal-actions">
              <button type="submit" className="primary-btn">
                إنشاء وتأكيد التصدير
              </button>
              <button type="button" className="auth-text-button" onClick={() => setCreateExportOpen(false)}>
                إلغاء
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL 4: REVOKE EXPORT */}
      {revokeExportId && (
        <Modal title="إلغاء صلاحية ملف التصدير فورًا" onClose={() => setRevokeExportId(null)}>
          <form onSubmit={(e) => void handleRevokeExport(e)} className="settings-form">
            <p className="patient-error">
              سيؤدي هذا الإجراء إلى حذف الملف نهائيًا من الخادم وتعطيل أي رابط تحميل تم إصداره مسبقًا.
            </p>

            <label className="settings-field" htmlFor="rev-reason">
              سبب الإلغاء *
              <input id="rev-reason" name="reason" required maxLength={200} placeholder="مثال: تسليم الملف بنجاح، أو انتفاء الحاجة" />
            </label>

            <div className="modal-actions">
              <button type="submit" className="primary-btn danger">
                تأكيد الإلغاء الفوري
              </button>
              <button type="button" className="auth-text-button" onClick={() => setRevokeExportId(null)}>
                رجوع
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL 5: DRY RUN REPORT */}
      {dryRunOpen && dryRunReport && (
        <Modal title="تقرير محاكاة سياسة الاستبقاء (Dry-Run Simulation)" onClose={() => setDryRunOpen(false)}>
          <div className="dry-run-report-content" dir="rtl">
            <p className="report-status-badge">وضع المحاكاة نشط — لم يتم تعديل أو حذف أي سجل</p>
            <p className="muted-text">
              تاريخ إصدار المحاكاة: {new Date(dryRunReport.generatedAt).toLocaleString('ar-SA')}
            </p>

            <div className="dry-run-grid">
              <div className="dry-run-stat">
                <span className="stat-label">سجلات المرضى المؤهلة للمحو</span>
                <b className="stat-value">{dryRunReport.eligible.patients}</b>
              </div>
              <div className="dry-run-stat">
                <span className="stat-label">المواعيد المنتهية المؤهلة للأرشفة</span>
                <b className="stat-value">{dryRunReport.eligible.appointments}</b>
              </div>
              <div className="dry-run-stat">
                <span className="stat-label">أحداث التدقيق المتجاوزة للمهلة</span>
                <b className="stat-value">{dryRunReport.eligible.auditEvents}</b>
              </div>
              <div className="dry-run-stat">
                <span className="stat-label">ملفات التصدير المنتهية المؤهلة للإتلاف</span>
                <b className="stat-value">{dryRunReport.eligible.exports}</b>
              </div>
              <div className="dry-run-stat">
                <span className="stat-label">طلبات الخصوصية المكتملة المؤهلة للأرشفة</span>
                <b className="stat-value">{dryRunReport.eligible.privacyRequests}</b>
              </div>
            </div>

            <p className="settings-note">
              ملاحظة نظامية: {dryRunReport.note}
            </p>

            <div className="modal-actions">
              <button type="button" className="primary-btn" onClick={() => setDryRunOpen(false)}>
                إغلاق التقرير
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Legal & Consent Notice */}
      <footer className="privacy-footer-notice">
        <h6>إشعار الخصوصية وعزل البيانات</h6>
        <p>
          تطبق منصة لمسة سياسة عزل صارمة للمستأجرين عبر FORCE ROW LEVEL SECURITY مع تشفير البيانات الحساسة وسلاسل تدقيق مالية غير قابلة للتلاعب.
          لا يتم حذف أي سجل محاسبي أو مالي حفاظًا على سلامة التقارير الضريبية والامتثال النظامي.
        </p>
      </footer>
    </div>
  );
}

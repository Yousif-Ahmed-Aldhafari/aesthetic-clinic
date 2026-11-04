import { useState, useEffect, useMemo, useRef } from 'react';
import type { ClinicContext } from '../auth/api';
import { ApiError } from '../auth/api';
import { Modal } from '../../components/ui';
import { RequestScope } from '../../lib/request-scope';
import {
  billingApi,
  type BillingPage,
  type TreatmentPackage,
  type PatientPackageRecord,
} from './billing-api';
import { formatMoney } from './billing-money';

interface Props {
  clinic: ClinicContext;
  csrfToken: string;
  onAuthError: (error: unknown) => void;
}

const packageStatuses: Record<string, string> = {
  PENDING_PAYMENT: 'قيد السداد',
  ACTIVE: 'نشطة ومتاحة',
  EXHAUSTED: 'مستنفدة بالكامل',
  EXPIRED: 'منتهية الصلاحية',
  CANCELLED: 'ملغاة',
};

const message = (e: unknown) =>
  e instanceof ApiError ? e.message : 'تعذّر إكمال العملية. يُرجى مراجعة الاتصال وإعادة المحاولة.';

export function PackagesWorkspace({ clinic, csrfToken, onAuthError }: Props) {
  const client = useMemo(() => billingApi(clinic.clinicId), [clinic.clinicId]);
  const gates = useMemo(() => ({ list: new RequestScope(), write: new RequestScope() }), [clinic.clinicId]);
  const can = (p: string) => clinic.permissions.includes(p);

  const [subTab, setSubTab] = useState<'CATALOG' | 'PATIENTS'>('CATALOG');
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [reload, setReload] = useState(0);

  // Catalog state
  const [packages, setPackages] = useState<BillingPage<TreatmentPackage> | null>(null);

  // Patient Packages state
  const [patientPkgs, setPatientPkgs] = useState<BillingPage<PatientPackageRecord> | null>(null);
  const [selectedPatientPkg, setSelectedPatientPkg] = useState<PatientPackageRecord | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState<'new_pkg' | 'new_version' | 'redeem' | 'reverse' | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const mutating = useRef(false);

  // Redeem form state
  const [targetEntitlementId, setTargetEntitlementId] = useState('');
  const [redeemNotes, setRedeemNotes] = useState('');
  const [targetRedemptionId, setTargetRedemptionId] = useState('');
  const [reverseReason, setReverseReason] = useState('');

  // New package form state
  const [pkgCode, setPkgCode] = useState('');
  const [pkgNameAr, setPkgNameAr] = useState('');
  const [pkgNameEn, setPkgNameEn] = useState('');
  const [pkgPrice, setPkgPrice] = useState('');
  const [pkgValidity, setPkgValidity] = useState('365');
  const [pkgItems, setPkgItems] = useState<{ serviceName: string; sessionQuantity: number }[]>([
    { serviceName: '', sessionQuantity: 1 },
  ]);

  useEffect(() => () => { Object.values(gates).forEach(g => g.cancel()); }, [gates]);

  function auth(e: unknown) {
    if (e instanceof ApiError && (e.status === 401 || e.code === 'MFA_STEP_UP_REQUIRED' || e.code === 'MFA_SETUP_REQUIRED')) {
      onAuthError(e);
    }
  }

  // Load Catalog or Patient Packages
  useEffect(() => {
    const scope = gates.list.start();
    setLoading(true);
    setError('');

    const timer = setTimeout(() => {
      const query = new URLSearchParams({ q, status: statusFilter, pageSize: '25' });
      if (subTab === 'CATALOG') {
        client.packages(query, scope.signal)
          .then(r => { if (scope.current()) { setPackages(r); setLoading(false); } })
          .catch(e => { if (scope.current()) { setError(message(e)); setLoading(false); auth(e); } });
      } else {
        client.patientPackages(query, scope.signal)
          .then(r => { if (scope.current()) { setPatientPkgs(r); setLoading(false); } })
          .catch(e => { if (scope.current()) { setError(message(e)); setLoading(false); auth(e); } });
      }
    }, 200);

    return () => { clearTimeout(timer); gates.list.cancel(); };
  }, [client, gates, subTab, q, statusFilter, reload]);

  async function handleCreatePackage(e: React.FormEvent) {
    e.preventDefault();
    if (mutating.current) return;
    mutating.current = true;
    setBusy(true);
    setFormError('');

    try {
      await client.write('packages', 'POST', {
        code: pkgCode.trim(),
        nameAr: pkgNameAr.trim(),
        nameEn: pkgNameEn.trim() || undefined,
        price: pkgPrice.trim(),
        validityDays: parseInt(pkgValidity, 10) || 365,
        items: pkgItems.filter(i => i.serviceName.trim().length > 0),
        requestKey: crypto.randomUUID(),
      }, csrfToken, gates.write.start().signal);

      setNotice('تم إنشاء باقة العلاج بنجاح.');
      setModal(null);
      setReload(n => n + 1);
    } catch (err) {
      setFormError(message(err));
      auth(err);
    } finally {
      setBusy(false);
      mutating.current = false;
    }
  }

  async function handlePublishVersion(pkgId: string, versionId: string) {
    if (!window.confirm('نشر إصدار الباقة يثبت بنودها وأسعارها بصورة غير قابلة للتعديل. متابعة؟')) return;
    setBusy(true);
    try {
      await client.write(`packages/${pkgId}/versions/${versionId}/publish`, 'POST', {}, csrfToken, gates.write.start().signal);
      setNotice('تم نشر إصدار الباقة بنجاح وإتاحته للشراء.');
      setReload(n => n + 1);
    } catch (err) {
      setError(message(err));
      auth(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleRedeemSession(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPatientPkg || !targetEntitlementId) return;
    setBusy(true);
    setFormError('');

    try {
      await client.write(`patient-packages/${selectedPatientPkg.id}/redeem`, 'POST', {
        entitlementId: targetEntitlementId,
        patientId: selectedPatientPkg.patientId,
        sessionsRedeemed: 1,
        notes: redeemNotes.trim() || undefined,
        requestKey: crypto.randomUUID(),
      }, csrfToken, gates.write.start().signal);

      setNotice('تم تسجيل تنفيذ الجلسة وخصمها من رصيد باقة المريض.');
      setModal(null);
      setSelectedPatientPkg(null);
      setRedeemNotes('');
      setReload(n => n + 1);
    } catch (err) {
      setFormError(message(err));
      auth(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleReverseRedemption(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPatientPkg || !targetRedemptionId) return;
    setBusy(true);
    setFormError('');

    try {
      await client.write(`patient-packages/${selectedPatientPkg.id}/redemptions/${targetRedemptionId}/reverse`, 'POST', {
        reason: reverseReason.trim(),
        requestKey: crypto.randomUUID(),
      }, csrfToken, gates.write.start().signal);

      setNotice('تم عكس استهلاك الجلسة واستعادة رصيد الباقة بنجاح.');
      setModal(null);
      setSelectedPatientPkg(null);
      setReverseReason('');
      setReload(n => n + 1);
    } catch (err) {
      setFormError(message(err));
      auth(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="packages-workspace">
      <div className="inventory-tabs" style={{ marginBottom: '16px' }}>
        <button
          className={`inventory-tab-btn ${subTab === 'CATALOG' ? 'active' : ''}`}
          onClick={() => { setSubTab('CATALOG'); setStatusFilter('ALL'); setQ(''); }}
        >
          دليل باقات العلاج
        </button>
        <button
          className={`inventory-tab-btn ${subTab === 'PATIENTS' ? 'active' : ''}`}
          onClick={() => { setSubTab('PATIENTS'); setStatusFilter('ALL'); setQ(''); }}
        >
          أرصدة واستنفاد باقات المرضى
        </button>
      </div>

      <div className="billing-toolbar">
        {subTab === 'CATALOG' && can('packages.catalog.manage') && (
          <button
            className="primary-btn"
            disabled={busy}
            onClick={() => {
              setFormError('');
              setPkgCode('');
              setPkgNameAr('');
              setPkgNameEn('');
              setPkgPrice('');
              setPkgValidity('365');
              setPkgItems([{ serviceName: '', sessionQuantity: 1 }]);
              setModal('new_pkg');
            }}
          >
            ＋ باقة علاج جديدة
          </button>
        )}
        <button className="table-btn" onClick={() => setReload(n => n + 1)} disabled={busy || loading}>
          تحديث السجلات
        </button>
      </div>

      {notice && (
        <div className="notice" role="status">
          {notice}
          <button onClick={() => setNotice('')} aria-label="إغلاق التنبيه">×</button>
        </div>
      )}
      {error && <div className="patient-error" role="alert">{error}</div>}

      {subTab === 'CATALOG' ? (
        <div className="panel full-panel">
          <div className="toolbar">
            <label>
              بحث باسم الباقة أو كودها
              <input
                className="search"
                value={q}
                maxLength={60}
                placeholder="ابحث..."
                onChange={e => setQ(e.target.value)}
              />
            </label>
          </div>

          {loading ? (
            <p className="billing-empty">جارٍ تحميل دليل الباقات…</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>كود الباقة</th>
                    <th>اسم الباقة</th>
                    <th>السعر</th>
                    <th>الصلاحية</th>
                    <th>الإصدار</th>
                    <th>حالة النشر</th>
                    <th>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {packages?.items.map(pkg => {
                    const v = pkg.currentVersion ?? pkg.versions[0];
                    return (
                      <tr key={pkg.id}>
                        <td><strong>{pkg.code}</strong></td>
                        <td>{v?.nameAr ?? '—'}</td>
                        <td>{v ? formatMoney(v.priceMinor, v.currency, v.currencyScale) : '—'}</td>
                        <td>{v ? `${v.validityDays} يوم` : '—'}</td>
                        <td>إصدار {v?.versionNumber ?? 1}</td>
                        <td>
                          <span className={`status ${v?.isPublished ? 'bill-paid' : 'bill-draft'}`}>
                            {v?.isPublished ? 'منشورة للشراء' : 'مسودة'}
                          </span>
                        </td>
                        <td>
                          {!v?.isPublished && can('packages.catalog.manage') && (
                            <button
                              className="table-btn"
                              disabled={busy}
                              onClick={() => handlePublishVersion(pkg.id, v.id)}
                            >
                              نشر الإصدار
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {packages?.items.length === 0 && (
                <p className="billing-empty">لا توجد باقات علاج مسجلة في الدليل.</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="panel full-panel">
          <div className="toolbar">
            <label>
              بحث في باقات المرضى
              <input
                className="search"
                value={q}
                maxLength={60}
                placeholder="ابحث بالاسم أو الباقة..."
                onChange={e => setQ(e.target.value)}
              />
            </label>
            <label>
              حالة الباقة
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="ALL">جميع الحالات</option>
                {Object.entries(packageStatuses).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
          </div>

          {loading ? (
            <p className="billing-empty">جارٍ تحميل باقات المرضى…</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>الباقة</th>
                    <th>تاريخ الشراء</th>
                    <th>إجمالي الجلسات</th>
                    <th>المنفذ</th>
                    <th>المتبقي</th>
                    <th>الحالة</th>
                    <th>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {patientPkgs?.items.map(pp => (
                    <tr key={pp.id}>
                      <td>
                        <strong>{pp.packageVersion?.nameAr ?? 'باقة علاج'}</strong>
                        <small style={{ display: 'block', color: '#65708a' }}>
                          كود: {pp.package?.code}
                        </small>
                      </td>
                      <td>{new Date(pp.purchasedAt).toLocaleDateString('ar-SA')}</td>
                      <td>{pp.totalSessions} جلسات</td>
                      <td style={{ color: '#197b53' }}>{pp.redeemedSessions}</td>
                      <td>
                        <strong style={{ color: pp.remainingSessions > 0 ? '#197b53' : '#a03446' }}>
                          {pp.remainingSessions}
                        </strong>
                      </td>
                      <td>
                        <span className={`status bill-${pp.status.toLowerCase()}`}>
                          {packageStatuses[pp.status] ?? pp.status}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {pp.status === 'ACTIVE' && pp.remainingSessions > 0 && can('packages.redemptions.record') && (
                            <button
                              className="primary-btn"
                              style={{ padding: '4px 10px', fontSize: '12px' }}
                              onClick={() => {
                                setSelectedPatientPkg(pp);
                                setTargetEntitlementId(pp.entitlements[0]?.id ?? '');
                                setFormError('');
                                setModal('redeem');
                              }}
                            >
                              تنفيذ جلسة
                            </button>
                          )}
                          {pp.redemptions.some(r => r.status === 'RECORDED') && can('packages.redemptions.reverse') && (
                            <button
                              className="table-btn"
                              style={{ padding: '4px 10px', fontSize: '12px' }}
                              onClick={() => {
                                setSelectedPatientPkg(pp);
                                const lastRecorded = pp.redemptions.find(r => r.status === 'RECORDED');
                                setTargetRedemptionId(lastRecorded?.id ?? '');
                                setFormError('');
                                setModal('reverse');
                              }}
                            >
                              إلغاء جلسة
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {patientPkgs?.items.length === 0 && (
                <p className="billing-empty">لا توجد باقات مشترات مسجلة للمرضى.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal: Create Package */}
      {modal === 'new_pkg' && (
        <Modal title="إنشاء باقة علاج جديدة" onClose={() => setModal(null)}>
          <form className="billing-form" onSubmit={handleCreatePackage}>
            {formError && <div className="patient-error" role="alert">{formError}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <label>
                كود الباقة (فريد بالإنجليزية) *
                <input
                  required
                  value={pkgCode}
                  placeholder="مثال: PKG-GLOW-01"
                  pattern="^[A-Za-z0-9_-]+$"
                  onChange={e => setPkgCode(e.target.value)}
                />
              </label>
              <label>
                السعر الإجمالي (ر.س) *
                <input
                  required
                  type="text"
                  value={pkgPrice}
                  placeholder="500.00"
                  pattern="^\d{1,12}(?:\.\d{1,3})?$"
                  onChange={e => setPkgPrice(e.target.value)}
                />
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
              <label>
                اسم الباقة بالعربية *
                <input
                  required
                  value={pkgNameAr}
                  placeholder="باقة نضارة البشرة المتكاملة"
                  onChange={e => setPkgNameAr(e.target.value)}
                />
              </label>
              <label>
                فترة الصلاحية (بالأيام) *
                <input
                  required
                  type="number"
                  min="1"
                  max="3650"
                  value={pkgValidity}
                  onChange={e => setPkgValidity(e.target.value)}
                />
              </label>
            </div>

            <fieldset className="billing-line-editor">
              <legend>خدمات وجلسات الباقة</legend>
              {pkgItems.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    required
                    style={{ flex: 3 }}
                    placeholder="اسم الخدمة / الجلسة"
                    value={item.serviceName}
                    onChange={e => {
                      const updated = [...pkgItems];
                      updated[idx].serviceName = e.target.value;
                      setPkgItems(updated);
                    }}
                  />
                  <input
                    required
                    type="number"
                    min="1"
                    max="100"
                    style={{ flex: 1 }}
                    placeholder="عدد الجلسات"
                    value={item.sessionQuantity}
                    onChange={e => {
                      const updated = [...pkgItems];
                      updated[idx].sessionQuantity = parseInt(e.target.value, 10) || 1;
                      setPkgItems(updated);
                    }}
                  />
                  {pkgItems.length > 1 && (
                    <button
                      type="button"
                      className="table-btn"
                      onClick={() => setPkgItems(pkgItems.filter((_, i) => i !== idx))}
                    >
                      حذف
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                className="table-btn"
                onClick={() => setPkgItems([...pkgItems, { serviceName: '', sessionQuantity: 1 }])}
              >
                ＋ إضافة خدمة إلى الباقة
              </button>
            </fieldset>

            <div className="billing-actions" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="table-btn" onClick={() => setModal(null)} disabled={busy}>
                إلغاء
              </button>
              <button type="submit" className="primary-btn" disabled={busy}>
                {busy ? 'جارٍ الحفظ…' : 'حفظ الباقة كمسودة'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Redeem Session */}
      {modal === 'redeem' && selectedPatientPkg && (
        <Modal title="تسجيل استهلاك جلسة علاج" onClose={() => setModal(null)}>
          <form className="billing-form" onSubmit={handleRedeemSession}>
            {formError && <div className="patient-error" role="alert">{formError}</div>}
            <p>
              الباقة: <strong>{selectedPatientPkg.packageVersion?.nameAr}</strong>
            </p>
            <p>
              الجلسات المتبقية: <strong>{selectedPatientPkg.remainingSessions}</strong>
            </p>
            <label>
              الخدمة / الجلسة المستهلكة *
              <select
                required
                value={targetEntitlementId}
                onChange={e => setTargetEntitlementId(e.target.value)}
              >
                {selectedPatientPkg.entitlements.map(ent => (
                  <option key={ent.id} value={ent.id}>
                    {ent.serviceName} (المتبقي: {ent.remainingSessions} من {ent.totalSessions})
                  </option>
                ))}
              </select>
            </label>
            <label>
              ملاحظات الجلسة الطبية
              <textarea
                value={redeemNotes}
                placeholder="أدخل ملاحظات التنفيذ السريري..."
                maxLength={500}
                rows={3}
                onChange={e => setRedeemNotes(e.target.value)}
              />
            </label>
            <div className="billing-actions" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="table-btn" onClick={() => setModal(null)} disabled={busy}>
                إلغاء
              </button>
              <button type="submit" className="primary-btn" disabled={busy}>
                {busy ? 'جارٍ التسجيل…' : 'تأكيد خصم الجلسة'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Reverse Redemption */}
      {modal === 'reverse' && selectedPatientPkg && (
        <Modal title="إلغاء استهلاك جلسة واستعادة الرصيد" onClose={() => setModal(null)}>
          <form className="billing-form" onSubmit={handleReverseRedemption}>
            {formError && <div className="patient-error" role="alert">{formError}</div>}
            <label>
              سبب إلغاء استهلاك الجلسة *
              <textarea
                required
                value={reverseReason}
                placeholder="أدخل مبرر الإلغاء بدقة للتدقيق المالي والسريري..."
                minLength={3}
                maxLength={500}
                rows={3}
                onChange={e => setReverseReason(e.target.value)}
              />
            </label>
            <div className="billing-actions" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="table-btn" onClick={() => setModal(null)} disabled={busy}>
                رجوع
              </button>
              <button type="submit" className="primary-btn" disabled={busy}>
                {busy ? 'جارٍ العكس…' : 'تأكيد استعادة رصيد الجلسة'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

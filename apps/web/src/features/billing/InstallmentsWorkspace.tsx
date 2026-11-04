import { useState, useEffect, useMemo, useRef } from 'react';
import type { ClinicContext } from '../auth/api';
import { ApiError } from '../auth/api';
import { Modal } from '../../components/ui';
import { RequestScope } from '../../lib/request-scope';
import {
  billingApi,
  type BillingPage,
  type InstallmentPlanRecord,
} from './billing-api';
import { formatMoney } from './billing-money';

interface Props {
  clinic: ClinicContext;
  csrfToken: string;
  onAuthError: (error: unknown) => void;
}

const planStatuses: Record<string, string> = {
  ACTIVE: 'سارية',
  COMPLETED: 'مسددة بالكامل',
  DEFAULTED: 'متعثرة',
  CANCELLED: 'ملغاة',
};

const scheduleStatuses: Record<string, string> = {
  PENDING: 'معلق',
  PARTIALLY_PAID: 'مسدد جزئياً',
  PAID: 'مسدد بالكامل',
  OVERDUE: 'متأخر عن الاستحقاق',
  WAIVED: 'معفى عنه',
};

const message = (e: unknown) =>
  e instanceof ApiError ? e.message : 'تعذّر إكمال العملية. يُرجى مراجعة الاتصال وإعادة المحاولة.';

export function InstallmentsWorkspace({ clinic, csrfToken, onAuthError }: Props) {
  const client = useMemo(() => billingApi(clinic.clinicId), [clinic.clinicId]);
  const gates = useMemo(() => ({ list: new RequestScope(), write: new RequestScope() }), [clinic.clinicId]);
  const can = (p: string) => clinic.permissions.includes(p);

  const [statusFilter, setStatusFilter] = useState('ALL');
  const [reload, setReload] = useState(0);
  const [plans, setPlans] = useState<BillingPage<InstallmentPlanRecord> | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<InstallmentPlanRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState<'detail' | 'new_plan' | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const mutating = useRef(false);

  // New plan form state
  const [patientId, setPatientId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [numInstallments, setNumInstallments] = useState(3);
  const [schedules, setSchedules] = useState<{ dueDate: string; expectedAmount: string }[]>([
    { dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0], expectedAmount: '' },
    { dueDate: new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0], expectedAmount: '' },
    { dueDate: new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0], expectedAmount: '' },
  ]);

  useEffect(() => () => { Object.values(gates).forEach(g => g.cancel()); }, [gates]);

  function auth(e: unknown) {
    if (e instanceof ApiError && (e.status === 401 || e.code === 'MFA_STEP_UP_REQUIRED' || e.code === 'MFA_SETUP_REQUIRED')) {
      onAuthError(e);
    }
  }

  useEffect(() => {
    const scope = gates.list.start();
    setLoading(true);
    setError('');

    const timer = setTimeout(() => {
      const query = new URLSearchParams({ status: statusFilter, pageSize: '25' });
      client.installmentPlans(query, scope.signal)
        .then(r => { if (scope.current()) { setPlans(r); setLoading(false); } })
        .catch(e => { if (scope.current()) { setError(message(e)); setLoading(false); auth(e); } });
    }, 200);

    return () => { clearTimeout(timer); gates.list.cancel(); };
  }, [client, gates, statusFilter, reload]);

  function handleInstallmentCountChange(count: number) {
    const validCount = Math.max(2, Math.min(36, count));
    setNumInstallments(validCount);
    const newSchedules = Array.from({ length: validCount }, (_, i) => ({
      dueDate: new Date(Date.now() + (i + 1) * 30 * 86400000).toISOString().split('T')[0],
      expectedAmount: totalAmount ? (parseFloat(totalAmount) / validCount).toFixed(2) : '',
    }));
    setSchedules(newSchedules);
  }

  async function handleCreatePlan(e: React.FormEvent) {
    e.preventDefault();
    if (mutating.current) return;
    mutating.current = true;
    setBusy(true);
    setFormError('');

    try {
      await client.write('installment-plans', 'POST', {
        patientId: patientId.trim(),
        invoiceId: invoiceId.trim(),
        numberOfInstallments: numInstallments,
        totalAmount: totalAmount.trim(),
        schedules: schedules.map((s, idx) => ({
          installmentNumber: idx + 1,
          dueDate: s.dueDate,
          expectedAmount: s.expectedAmount,
        })),
        requestKey: crypto.randomUUID(),
      }, csrfToken, gates.write.start().signal);

      setNotice('تم إنشاء خطة التقسيط وجدول الدفعات بنجاح.');
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

  return (
    <div className="installments-workspace">
      <div className="billing-toolbar">
        {can('installments.manage') && (
          <button
            className="primary-btn"
            disabled={busy}
            onClick={() => {
              setFormError('');
              setPatientId('');
              setInvoiceId('');
              setTotalAmount('');
              handleInstallmentCountChange(3);
              setModal('new_plan');
            }}
          >
            ＋ خطة تقسيط جديدة
          </button>
        )}
        <button className="table-btn" onClick={() => setReload(n => n + 1)} disabled={busy || loading}>
          تحديث الخطط
        </button>
      </div>

      {notice && (
        <div className="notice" role="status">
          {notice}
          <button onClick={() => setNotice('')} aria-label="إغلاق التنبيه">×</button>
        </div>
      )}
      {error && <div className="patient-error" role="alert">{error}</div>}

      <div className="panel full-panel">
        <div className="toolbar">
          <label>
            حالة خطة التقسيط
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="ALL">جميع الحالات</option>
              {Object.entries(planStatuses).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
        </div>

        {loading ? (
          <p className="billing-empty">جارٍ تحميل خطط التقسيط…</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>رقم الخطة</th>
                  <th>تاريخ الإنشاء</th>
                  <th>عدد الأقساط</th>
                  <th>المبلغ الإجمالي</th>
                  <th>المبلغ المتبقي</th>
                  <th>الحالة</th>
                  <th>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {plans?.items.map(plan => (
                  <tr key={plan.id}>
                    <td><strong>{plan.id.slice(0, 8)}…</strong></td>
                    <td>{new Date(plan.createdAt).toLocaleDateString('ar-SA')}</td>
                    <td>{plan.numberOfInstallments} دفعات</td>
                    <td>{formatMoney(plan.totalAmountMinor, plan.currency, plan.currencyScale)}</td>
                    <td>
                      <strong style={{ color: BigInt(plan.remainingAmountMinor) > 0n ? '#946200' : '#197b53' }}>
                        {formatMoney(plan.remainingAmountMinor, plan.currency, plan.currencyScale)}
                      </strong>
                    </td>
                    <td>
                      <span className={`status bill-${plan.status.toLowerCase()}`}>
                        {planStatuses[plan.status] ?? plan.status}
                      </span>
                    </td>
                    <td>
                      <button
                        className="table-btn"
                        onClick={() => {
                          setSelectedPlan(plan);
                          setModal('detail');
                        }}
                      >
                        عرض الجدولة
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {plans?.items.length === 0 && (
              <p className="billing-empty">لا توجد خطط تقسيط مسجلة.</p>
            )}
          </div>
        )}
      </div>

      {/* Modal: Plan Schedule Detail */}
      {modal === 'detail' && selectedPlan && (
        <Modal title={`جدول أقساط الخطة (${selectedPlan.id.slice(0, 8)})`} onClose={() => setModal(null)}>
          <div className="billing-detail">
            <div className="billing-detail-heading">
              <h3>إجمالي الخطة: {formatMoney(selectedPlan.totalAmountMinor, selectedPlan.currency, selectedPlan.currencyScale)}</h3>
              <span className={`status bill-${selectedPlan.status.toLowerCase()}`}>
                {planStatuses[selectedPlan.status]}
              </span>
            </div>
            <p>
              المتبقي للتحصيل:{' '}
              <strong>{formatMoney(selectedPlan.remainingAmountMinor, selectedPlan.currency, selectedPlan.currencyScale)}</strong>
            </p>

            <div className="table-wrap" style={{ marginTop: '16px' }}>
              <table>
                <thead>
                  <tr>
                    <th>القسط</th>
                    <th>تاريخ الاستحقاق</th>
                    <th>المبلغ المستحق</th>
                    <th>المسدد</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPlan.schedules.map(s => (
                    <tr key={s.id}>
                      <td><strong>الدفعة #{s.installmentNumber}</strong></td>
                      <td>{s.dueDate}</td>
                      <td>{formatMoney(s.expectedAmountMinor, selectedPlan.currency, selectedPlan.currencyScale)}</td>
                      <td style={{ color: '#197b53' }}>
                        {formatMoney(s.allocatedAmountMinor, selectedPlan.currency, selectedPlan.currencyScale)}
                      </td>
                      <td>
                        <span className={`status bill-${s.status === 'PAID' ? 'paid' : s.status === 'OVERDUE' ? 'void' : 'issued'}`}>
                          {scheduleStatuses[s.status] ?? s.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="billing-actions" style={{ justifyContent: 'flex-end', marginTop: '16px' }}>
              <button className="primary-btn" onClick={() => setModal(null)}>
                إغلاق
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Create Plan */}
      {modal === 'new_plan' && (
        <Modal title="إنشاء خطة تقسيط جديدة" onClose={() => setModal(null)}>
          <form className="billing-form" onSubmit={handleCreatePlan}>
            {formError && <div className="patient-error" role="alert">{formError}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <label>
                معرف المريض (UUID) *
                <input
                  required
                  value={patientId}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  onChange={e => setPatientId(e.target.value)}
                />
              </label>
              <label>
                معرف الفاتورة الصادرة (UUID) *
                <input
                  required
                  value={invoiceId}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  onChange={e => setInvoiceId(e.target.value)}
                />
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <label>
                المبلغ الإجمالي للتقسيط (ر.س) *
                <input
                  required
                  type="text"
                  value={totalAmount}
                  placeholder="1200.00"
                  pattern="^\d{1,12}(?:\.\d{1,3})?$"
                  onChange={e => {
                    setTotalAmount(e.target.value);
                    if (e.target.value && numInstallments > 0) {
                      const share = (parseFloat(e.target.value) / numInstallments).toFixed(2);
                      setSchedules(prev => prev.map(s => ({ ...s, expectedAmount: share })));
                    }
                  }}
                />
              </label>
              <label>
                عدد الأقساط (2 إلى 36) *
                <input
                  required
                  type="number"
                  min="2"
                  max="36"
                  value={numInstallments}
                  onChange={e => handleInstallmentCountChange(parseInt(e.target.value, 10) || 2)}
                />
              </label>
            </div>

            <fieldset className="billing-line-editor">
              <legend>جدول استحقاق الدفعات الشهرية</legend>
              {schedules.map((s, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ minWidth: '80px', alignSelf: 'center' }}>الدفعة #{idx + 1}</span>
                  <input
                    required
                    type="date"
                    style={{ flex: 1 }}
                    value={s.dueDate}
                    onChange={e => {
                      const updated = [...schedules];
                      updated[idx].dueDate = e.target.value;
                      setSchedules(updated);
                    }}
                  />
                  <input
                    required
                    style={{ flex: 1 }}
                    placeholder="المبلغ المتوقع"
                    value={s.expectedAmount}
                    pattern="^\d{1,12}(?:\.\d{1,3})?$"
                    onChange={e => {
                      const updated = [...schedules];
                      updated[idx].expectedAmount = e.target.value;
                      setSchedules(updated);
                    }}
                  />
                </div>
              ))}
            </fieldset>

            <div className="billing-actions" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="table-btn" onClick={() => setModal(null)} disabled={busy}>
                إلغاء
              </button>
              <button type="submit" className="primary-btn" disabled={busy}>
                {busy ? 'جارٍ الإنشاء…' : 'اعتماد خطة التقسيط'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

import { useState, useEffect, useMemo, useRef } from 'react';
import type { ClinicContext } from '../auth/api';
import { ApiError } from '../auth/api';
import { Modal } from '../../components/ui';
import { RequestScope } from '../../lib/request-scope';
import {
  billingApi,
  type BillingPage,
  type RefundRequestRecord,
} from './billing-api';
import { formatMoney, reasonNames } from './billing-money';

interface Props {
  clinic: ClinicContext;
  csrfToken: string;
  onAuthError: (error: unknown) => void;
}

const refundStatuses: Record<string, string> = {
  REQUESTED: 'قيد المراجعة',
  APPROVED: 'معتمد للصرف',
  REJECTED: 'مرفوض',
  SETTLED: 'تمت التسوية والاسترداد',
  CANCELLED: 'ملغي',
};

const message = (e: unknown) =>
  e instanceof ApiError ? e.message : 'تعذّر إكمال العملية. يُرجى مراجعة الاتصال وإعادة المحاولة.';

export function RefundsWorkspace({ clinic, csrfToken, onAuthError }: Props) {
  const client = useMemo(() => billingApi(clinic.clinicId), [clinic.clinicId]);
  const gates = useMemo(() => ({ list: new RequestScope(), write: new RequestScope() }), [clinic.clinicId]);
  const can = (p: string) => clinic.permissions.includes(p);

  const [statusFilter, setStatusFilter] = useState('ALL');
  const [reload, setReload] = useState(0);
  const [refunds, setRefunds] = useState<BillingPage<RefundRequestRecord> | null>(null);
  const [selectedRefund, setSelectedRefund] = useState<RefundRequestRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState<'new_request' | 'decide' | 'settle' | null>(null);
  const [decision, setDecision] = useState<'approve' | 'reject'>('approve');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const mutating = useRef(false);

  // New refund form state
  const [invoiceId, setInvoiceId] = useState('');
  const [patientId, setPatientId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState<'PATIENT_REFUND' | 'ADMIN_ERROR' | 'DUPLICATE' | 'OTHER'>('PATIENT_REFUND');
  const [reasonDetails, setReasonDetails] = useState('');

  // Decision state
  const [decisionNotes, setDecisionNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  // Settlement state
  const [settlementRef, setSettlementRef] = useState('');

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
      client.refundRequests(query, scope.signal)
        .then(r => { if (scope.current()) { setRefunds(r); setLoading(false); } })
        .catch(e => { if (scope.current()) { setError(message(e)); setLoading(false); auth(e); } });
    }, 200);

    return () => { clearTimeout(timer); gates.list.cancel(); };
  }, [client, gates, statusFilter, reload]);

  async function handleCreateRefund(e: React.FormEvent) {
    e.preventDefault();
    if (mutating.current) return;
    mutating.current = true;
    setBusy(true);
    setFormError('');

    try {
      await client.write('refund-requests', 'POST', {
        invoiceId: invoiceId.trim(),
        patientId: patientId.trim(),
        amount: amount.trim(),
        reason,
        reasonDetails: reasonDetails.trim(),
        requestKey: crypto.randomUUID(),
      }, csrfToken, gates.write.start().signal);

      setNotice('تم تقديم طلب الاسترداد بنجاح للمراجعة والاعتماد.');
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

  async function handleDecideRefund(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRefund) return;
    setBusy(true);
    setFormError('');

    try {
      const endpoint = `refund-requests/${selectedRefund.id}/${decision}`;
      const payload = decision === 'approve'
        ? { notes: decisionNotes.trim() || undefined, expectedVersion: selectedRefund.version }
        : { rejectionReason: rejectionReason.trim(), notes: decisionNotes.trim() || undefined, expectedVersion: selectedRefund.version };

      await client.write(endpoint, 'POST', payload, csrfToken, gates.write.start().signal);

      setNotice(`تم ${decision === 'approve' ? 'اعتماد' : 'رفض'} طلب الاسترداد بنجاح.`);
      setModal(null);
      setSelectedRefund(null);
      setReload(n => n + 1);
    } catch (err) {
      setFormError(message(err));
      auth(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleSettleRefund(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRefund) return;
    setBusy(true);
    setFormError('');

    try {
      await client.write(`refund-requests/${selectedRefund.id}/settle`, 'POST', {
        settlementReference: settlementRef.trim() || undefined,
        requestKey: crypto.randomUUID(),
        expectedVersion: selectedRefund.version,
      }, csrfToken, gates.write.start().signal);

      setNotice('تمت تسوية طلب الاسترداد وتنفيذ القيد المالي العكسي بنجاح.');
      setModal(null);
      setSelectedRefund(null);
      setReload(n => n + 1);
    } catch (err) {
      setFormError(message(err));
      auth(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="refunds-workspace">
      <div className="billing-toolbar">
        {can('refunds.request') && (
          <button
            className="primary-btn"
            disabled={busy}
            onClick={() => {
              setFormError('');
              setInvoiceId('');
              setPatientId('');
              setAmount('');
              setReason('PATIENT_REFUND');
              setReasonDetails('');
              setModal('new_request');
            }}
          >
            ＋ طلب استرداد مالي
          </button>
        )}
        <button className="table-btn" onClick={() => setReload(n => n + 1)} disabled={busy || loading}>
          تحديث الطلبات
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
            حالة طلب الاسترداد
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="ALL">جميع الحالات</option>
              {Object.entries(refundStatuses).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
        </div>

        {loading ? (
          <p className="billing-empty">جارٍ تحميل طلبات الاسترداد…</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>رقم الطلب</th>
                  <th>تاريخ الطلب</th>
                  <th>المبلغ</th>
                  <th>السبب</th>
                  <th>التفاصيل</th>
                  <th>الحالة</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {refunds?.items.map(req => (
                  <tr key={req.id}>
                    <td><strong>{req.id.slice(0, 8)}…</strong></td>
                    <td>{new Date(req.requestedAt).toLocaleDateString('ar-SA')}</td>
                    <td>{formatMoney(req.amountMinor, req.currency, req.currencyScale)}</td>
                    <td>{reasonNames[req.reason] ?? req.reason}</td>
                    <td>{req.reasonDetails}</td>
                    <td>
                      <span className={`status bill-${req.status === 'SETTLED' ? 'paid' : req.status === 'APPROVED' ? 'issued' : req.status === 'REJECTED' ? 'void' : 'draft'}`}>
                        {refundStatuses[req.status] ?? req.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {req.status === 'REQUESTED' && can('refunds.approve') && (
                          <button
                            className="primary-btn"
                            style={{ padding: '4px 10px', fontSize: '12px' }}
                            onClick={() => {
                              setSelectedRefund(req);
                              setDecision('approve');
                              setDecisionNotes('');
                              setRejectionReason('');
                              setFormError('');
                              setModal('decide');
                            }}
                          >
                            قرار الاعتماد
                          </button>
                        )}
                        {req.status === 'APPROVED' && can('refunds.settle') && (
                          <button
                            className="primary-btn"
                            style={{ padding: '4px 10px', fontSize: '12px', background: '#197b53' }}
                            onClick={() => {
                              setSelectedRefund(req);
                              setSettlementRef('');
                              setFormError('');
                              setModal('settle');
                            }}
                          >
                            تنفيذ التسوية
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {refunds?.items.length === 0 && (
              <p className="billing-empty">لا توجد طلبات استرداد مسجلة.</p>
            )}
          </div>
        )}
      </div>

      {/* Modal: New Refund Request */}
      {modal === 'new_request' && (
        <Modal title="تقديم طلب استرداد مالي" onClose={() => setModal(null)}>
          <form className="billing-form" onSubmit={handleCreateRefund}>
            {formError && <div className="patient-error" role="alert">{formError}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <label>
                معرف الفاتورة المسددة (UUID) *
                <input
                  required
                  value={invoiceId}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  onChange={e => setInvoiceId(e.target.value)}
                />
              </label>
              <label>
                معرف المريض (UUID) *
                <input
                  required
                  value={patientId}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  onChange={e => setPatientId(e.target.value)}
                />
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <label>
                مبلغ الاسترداد المطلوب (ر.س) *
                <input
                  required
                  type="text"
                  value={amount}
                  placeholder="250.00"
                  pattern="^\d{1,12}(?:\.\d{1,3})?$"
                  onChange={e => setAmount(e.target.value)}
                />
              </label>
              <label>
                سبب الاسترداد *
                <select
                  value={reason}
                  onChange={e => setReason(e.target.value as any)}
                >
                  <option value="PATIENT_REFUND">طلب المريض / إلغاء الخدمة</option>
                  <option value="ADMIN_ERROR">خطأ إداري أو في الفوترة</option>
                  <option value="DUPLICATE">تكرار السداد</option>
                  <option value="OTHER">أسباب أخرى مدققة</option>
                </select>
              </label>
            </div>
            <label>
              تفاصيل ومبررات الطلب التدقيقية *
              <textarea
                required
                value={reasonDetails}
                placeholder="أدخل الشرح التفصيلي لطلب الاسترداد..."
                minLength={3}
                maxLength={500}
                rows={3}
                onChange={e => setReasonDetails(e.target.value)}
              />
            </label>
            <div className="billing-actions" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="table-btn" onClick={() => setModal(null)} disabled={busy}>
                إلغاء
              </button>
              <button type="submit" className="primary-btn" disabled={busy}>
                {busy ? 'جارٍ الإرسال…' : 'إرسال الطلب للاعتماد'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Decide Refund (Approve / Reject) */}
      {modal === 'decide' && selectedRefund && (
        <Modal title="اتخاذ قرار بشأن طلب الاسترداد" onClose={() => setModal(null)}>
          <form className="billing-form" onSubmit={handleDecideRefund}>
            {formError && <div className="patient-error" role="alert">{formError}</div>}
            <p>
              المبلغ المطلوب: <strong>{formatMoney(selectedRefund.amountMinor, selectedRefund.currency, selectedRefund.currencyScale)}</strong>
            </p>
            <p>
              السبب: <strong>{reasonNames[selectedRefund.reason] ?? selectedRefund.reason}</strong> · {selectedRefund.reasonDetails}
            </p>

            <label>
              القرار المالي *
              <select value={decision} onChange={e => setDecision(e.target.value as any)}>
                <option value="approve">اعتماد الطلب للصرف المالي</option>
                <option value="reject">رفض الطلب</option>
              </select>
            </label>

            {decision === 'reject' && (
              <label>
                سبب الرفض *
                <textarea
                  required
                  value={rejectionReason}
                  placeholder="أدخل مبرر الرفض المالي..."
                  minLength={3}
                  maxLength={500}
                  rows={2}
                  onChange={e => setRejectionReason(e.target.value)}
                />
              </label>
            )}

            <label>
              ملاحظات المراجعة والاعتماد
              <textarea
                value={decisionNotes}
                placeholder="ملاحظات تدقيقية اختيارية..."
                maxLength={500}
                rows={2}
                onChange={e => setDecisionNotes(e.target.value)}
              />
            </label>

            <div className="billing-actions" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="table-btn" onClick={() => setModal(null)} disabled={busy}>
                إلغاء
              </button>
              <button
                type="submit"
                className="primary-btn"
                style={{ background: decision === 'reject' ? '#a03446' : undefined }}
                disabled={busy}
              >
                {busy ? 'جارٍ الحفظ…' : decision === 'approve' ? 'تأكيد اعتماد الاسترداد' : 'تأكيد الرفض'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Settle Refund */}
      {modal === 'settle' && selectedRefund && (
        <Modal title="تسوية طلب الاسترداد المعتمد" onClose={() => setModal(null)}>
          <form className="billing-form" onSubmit={handleSettleRefund}>
            {formError && <div className="patient-error" role="alert">{formError}</div>}
            <div className="billing-preview">
              <p>
                المبلغ المراد صرفه وإغلاقه ماليًا: <strong>{formatMoney(selectedRefund.amountMinor, selectedRefund.currency, selectedRefund.currencyScale)}</strong>
              </p>
              <small>سيتم إنشاء قيد استرداد مالي عكسي (PaymentReversal) وتحديث الفاتورة وسجل الدفعات آلياً.</small>
            </div>

            <label>
              الرقم المرجعي للتسوية البنكية / النقدية
              <input
                value={settlementRef}
                placeholder="مثال: REF-BANK-TX-98721"
                maxLength={100}
                onChange={e => setSettlementRef(e.target.value)}
              />
            </label>

            <div className="billing-actions" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="table-btn" onClick={() => setModal(null)} disabled={busy}>
                إلغاء
              </button>
              <button type="submit" className="primary-btn" style={{ background: '#197b53' }} disabled={busy}>
                {busy ? 'جارٍ التسوية…' : 'تأكيد صرف الاسترداد وقيد التسوية'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}


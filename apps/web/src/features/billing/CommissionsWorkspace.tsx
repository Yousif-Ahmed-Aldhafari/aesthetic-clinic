import { useState, useEffect, useMemo, useRef } from 'react';
import type { ClinicContext } from '../auth/api';
import { ApiError } from '../auth/api';
import { Modal } from '../../components/ui';
import { RequestScope } from '../../lib/request-scope';
import {
  billingApi,
  type CommissionPlanRecord,
  type CommissionAccrualRecord,
  type CommissionSettlementRecord,
  type DoctorStatementRecord,
} from './billing-api';
import { formatMoney } from './billing-money';

interface Props {
  clinic: ClinicContext;
  csrfToken: string;
  onAuthError: (error: unknown) => void;
}

const planStatuses: Record<string, string> = {
  ACTIVE: 'نشطة',
  ARCHIVED: 'مؤرشفة',
};

const accrualStatuses: Record<string, string> = {
  PENDING: 'معلقة',
  ADJUSTED: 'معدلة',
  SETTLED: 'مسواة',
  REVERSED: 'معكوسة',
};

const settlementStatuses: Record<string, string> = {
  DRAFT: 'مسودة تسوية',
  CONFIRMED: 'معتمدة داخليًا',
  CANCELLED: 'ملغاة',
};

const adjustmentReasons: Record<string, string> = {
  REFUND_REVERSAL: 'عكس استرداد مالي',
  DISCOUNT_CORRECTION: 'تصحيح خصم تجاري',
  DISPUTE_RESOLUTION: 'تسوية نزاع مالي',
  ADMINISTRATIVE_CORRECTION: 'تصحيح إداري مدقق',
};

const message = (e: unknown) =>
  e instanceof ApiError ? e.message : 'تعذّر إكمال العملية. يُرجى مراجعة الاتصال وإعادة المحاولة.';

export function CommissionsWorkspace({ clinic, csrfToken, onAuthError }: Props) {
  const client = useMemo(() => billingApi(clinic.clinicId), [clinic.clinicId]);
  const gates = useMemo(() => ({ list: new RequestScope(), write: new RequestScope() }), [clinic.clinicId]);
  const can = (p: string) => clinic.permissions.includes(p);

  const canPlansRead = can('commissions.plans.read');
  const canPlansManage = can('commissions.plans.manage');
  const canAccrualsRead = can('commissions.accruals.read');
  const canAccrualsReadOwn = can('commissions.accruals.read-own');
  const canAdjustRequest = can('commissions.adjustments.request');
  const canAdjustDecide = can('commissions.adjustments.decide');
  const canSettlementsRead = can('commissions.settlements.read');
  const canSettlementsManage = can('commissions.settlements.manage');

  const isDoctorOnly = canAccrualsReadOwn && !canAccrualsRead;

  const [activeSubTab, setActiveSubTab] = useState<'STATEMENT' | 'PLANS' | 'ACCRUALS' | 'SETTLEMENTS'>(
    isDoctorOnly ? 'STATEMENT' : 'PLANS'
  );

  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const mutating = useRef(false);

  // Doctor statement state
  const [statement, setStatement] = useState<DoctorStatementRecord | null>(null);

  // Plans state
  const [plans, setPlans] = useState<CommissionPlanRecord[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<CommissionPlanRecord | null>(null);

  // Accruals state
  const [accruals, setAccruals] = useState<CommissionAccrualRecord[]>([]);
  const [selectedAccrual, setSelectedAccrual] = useState<CommissionAccrualRecord | null>(null);

  // Settlements state
  const [settlements, setSettlements] = useState<CommissionSettlementRecord[]>([]);
  const [selectedSettlement, setSelectedSettlement] = useState<CommissionSettlementRecord | null>(null);

  // Modals
  const [modal, setModal] = useState<
    'new_plan' | 'new_rule' | 'new_assignment' | 'request_adj' | 'new_settlement' | 'confirm_settlement' | null
  >(null);

  // Form states
  const [planName, setPlanName] = useState('');
  const [planDesc, setPlanDesc] = useState('');

  // Rule form
  const [ruleCalcType, setRuleCalcType] = useState<'PERCENTAGE' | 'FLAT_AMOUNT'>('PERCENTAGE');
  const [ruleRateBps, setRuleRateBps] = useState('1500'); // 15%
  const [ruleFlatAmount, setRuleFlatAmount] = useState('');
  const [ruleEarningEvent, setRuleEarningEvent] = useState<'PROCEDURE_COMPLETED' | 'INVOICE_PAID'>('PROCEDURE_COMPLETED');
  const [ruleDesc, setRuleDesc] = useState('');

  // Assignment form
  const [assignPractitionerId, setAssignPractitionerId] = useState('');
  const [assignEffectiveFrom, setAssignEffectiveFrom] = useState(new Date().toISOString().split('T')[0]);
  const [assignNotes, setAssignNotes] = useState('');

  // Adjustment form
  const [adjAmount, setAdjAmount] = useState('');
  const [adjReason, setAdjReason] = useState<keyof typeof adjustmentReasons>('DISCOUNT_CORRECTION');
  const [adjReasonDetails, setAdjReasonDetails] = useState('');

  // Settlement form
  const [settlePractitionerId, setSettlePractitionerId] = useState('');
  const [settlePeriodStart, setSettlePeriodStart] = useState(
    new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
  );
  const [settlePeriodEnd, setSettlePeriodEnd] = useState(new Date().toISOString().split('T')[0]);
  const [settleSelectedAccruals, setSettleSelectedAccruals] = useState<string[]>([]);
  const [settleNotes, setSettleNotes] = useState('');

  // Settlement confirm form
  const [payoutReference, setPayoutReference] = useState('');

  useEffect(() => {
    return () => {
      Object.values(gates).forEach((g) => g.cancel());
    };
  }, [gates]);

  function auth(e: unknown) {
    if (e instanceof ApiError && (e.status === 401 || e.code === 'MFA_STEP_UP_REQUIRED' || e.code === 'MFA_SETUP_REQUIRED')) {
      onAuthError(e);
    }
  }

  // Load statement if doctor
  useEffect(() => {
    if (activeSubTab !== 'STATEMENT' || !canAccrualsReadOwn) return;
    const scope = gates.list.start();
    setLoading(true);
    setError('');
    client
      .myStatement(scope.signal)
      .then((stmt) => {
        if (scope.current()) {
          setStatement(stmt);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (scope.current()) {
          setError(message(e));
          setLoading(false);
          auth(e);
        }
      });
    return () => gates.list.cancel();
  }, [client, gates, reload, activeSubTab, canAccrualsReadOwn]);

  // Load plans
  useEffect(() => {
    if (activeSubTab !== 'PLANS' || !canPlansRead) return;
    const scope = gates.list.start();
    setLoading(true);
    setError('');
    client
      .commissionPlans(undefined, scope.signal)
      .then((res) => {
        if (scope.current()) {
          setPlans(res);
          if (res.length > 0 && !selectedPlan) {
            setSelectedPlan(res[0]);
          }
          setLoading(false);
        }
      })
      .catch((e) => {
        if (scope.current()) {
          setError(message(e));
          setLoading(false);
          auth(e);
        }
      });
    return () => gates.list.cancel();
  }, [client, gates, reload, activeSubTab, canPlansRead]);

  // Load accruals
  useEffect(() => {
    if (activeSubTab !== 'ACCRUALS' || !canAccrualsRead) return;
    const scope = gates.list.start();
    setLoading(true);
    setError('');
    client
      .commissionAccruals(undefined, scope.signal)
      .then((res) => {
        if (scope.current()) {
          setAccruals(res);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (scope.current()) {
          setError(message(e));
          setLoading(false);
          auth(e);
        }
      });
    return () => gates.list.cancel();
  }, [client, gates, reload, activeSubTab, canAccrualsRead]);

  // Load settlements
  useEffect(() => {
    if (activeSubTab !== 'SETTLEMENTS' || !canSettlementsRead) return;
    const scope = gates.list.start();
    setLoading(true);
    setError('');
    client
      .commissionSettlements(undefined, scope.signal)
      .then((res) => {
        if (scope.current()) {
          setSettlements(res);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (scope.current()) {
          setError(message(e));
          setLoading(false);
          auth(e);
        }
      });
    return () => gates.list.cancel();
  }, [client, gates, reload, activeSubTab, canSettlementsRead]);

  function refresh() {
    setReload((n) => n + 1);
  }

  // Create Plan
  async function handleCreatePlan() {
    if (!planName.trim()) {
      setFormError('اسم خطة العمولات مطلوب');
      return;
    }
    if (mutating.current) return;
    mutating.current = true;
    setBusy(true);
    setFormError('');
    const scope = gates.write.start();
    try {
      await client.write(
        'commission-plans',
        'POST',
        {
          name: planName.trim(),
          description: planDesc.trim() || undefined,
        },
        csrfToken,
        scope.signal
      );
      if (scope.current()) {
        setNotice('تم إنشاء خطة العمولات بنجاح.');
        setModal(null);
        setPlanName('');
        setPlanDesc('');
        refresh();
      }
    } catch (e) {
      if (scope.current()) {
        setFormError(message(e));
        auth(e);
      }
    } finally {
      if (scope.current()) {
        setBusy(false);
        mutating.current = false;
      }
    }
  }

  // Add Rule
  async function handleAddRule() {
    if (!selectedPlan) return;
    if (ruleCalcType === 'PERCENTAGE' && (!ruleRateBps || parseInt(ruleRateBps, 10) < 0)) {
      setFormError('يرجى تحديد نسبة مئوية صالحة بنقاط الأساس');
      return;
    }
    if (ruleCalcType === 'FLAT_AMOUNT' && (!ruleFlatAmount || parseFloat(ruleFlatAmount) <= 0)) {
      setFormError('يرجى تحديد مبلغ ثابت صالح');
      return;
    }
    if (mutating.current) return;
    mutating.current = true;
    setBusy(true);
    setFormError('');
    const scope = gates.write.start();
    try {
      await client.write(
        `commission-plans/${selectedPlan.id}/rules`,
        'POST',
        {
          calculationType: ruleCalcType,
          rateBasisPoints: ruleCalcType === 'PERCENTAGE' ? parseInt(ruleRateBps, 10) : undefined,
          flatAmount: ruleCalcType === 'FLAT_AMOUNT' ? ruleFlatAmount : undefined,
          earningEvent: ruleEarningEvent,
          description: ruleDesc.trim() || undefined,
        },
        csrfToken,
        scope.signal
      );
      if (scope.current()) {
        setNotice('تمت إضافة قاعدة احتساب العمولة إلى الخطة.');
        setModal(null);
        refresh();
      }
    } catch (e) {
      if (scope.current()) {
        setFormError(message(e));
        auth(e);
      }
    } finally {
      if (scope.current()) {
        setBusy(false);
        mutating.current = false;
      }
    }
  }

  // Add Assignment
  async function handleAddAssignment() {
    if (!selectedPlan) return;
    if (!assignPractitionerId.trim()) {
      setFormError('معرف الممارس الطبي مطلوب');
      return;
    }
    if (mutating.current) return;
    mutating.current = true;
    setBusy(true);
    setFormError('');
    const scope = gates.write.start();
    try {
      await client.write(
        `commission-plans/${selectedPlan.id}/assignments`,
        'POST',
        {
          practitionerMembershipId: assignPractitionerId.trim(),
          effectiveFrom: new Date(assignEffectiveFrom).toISOString(),
          notes: assignNotes.trim() || undefined,
        },
        csrfToken,
        scope.signal
      );
      if (scope.current()) {
        setNotice('تم تعيين الممارس في خطة العمولات.');
        setModal(null);
        refresh();
      }
    } catch (e) {
      if (scope.current()) {
        setFormError(message(e));
        auth(e);
      }
    } finally {
      if (scope.current()) {
        setBusy(false);
        mutating.current = false;
      }
    }
  }

  // Request Adjustment
  async function handleRequestAdjustment() {
    if (!selectedAccrual) return;
    if (!adjAmount.trim()) {
      setFormError('مبلغ التعديل مطلوب (موجب للزيادة، سالب للخصم)');
      return;
    }
    if (!adjReasonDetails.trim()) {
      setFormError('سبب وتفاصيل التعديل مطلوبة للتدقيق');
      return;
    }
    if (mutating.current) return;
    mutating.current = true;
    setBusy(true);
    setFormError('');
    const scope = gates.write.start();
    try {
      await client.write(
        `commission-accruals/${selectedAccrual.id}/adjustments`,
        'POST',
        {
          adjustmentAmount: adjAmount.trim(),
          reason: adjReason,
          reasonDetails: adjReasonDetails.trim(),
          requestKey: crypto.randomUUID(),
        },
        csrfToken,
        scope.signal
      );
      if (scope.current()) {
        setNotice('تم تقديم طلب تعديل الاستحقاق للمراجعة والاعتماد.');
        setModal(null);
        setAdjAmount('');
        setAdjReasonDetails('');
        refresh();
      }
    } catch (e) {
      if (scope.current()) {
        setFormError(message(e));
        auth(e);
      }
    } finally {
      if (scope.current()) {
        setBusy(false);
        mutating.current = false;
      }
    }
  }

  // Decide Adjustment
  async function handleDecideAdjustment(adjId: string, decision: 'APPROVE' | 'REJECT') {
    if (mutating.current) return;
    mutating.current = true;
    setBusy(true);
    setError('');
    const scope = gates.write.start();
    try {
      await client.write(
        `commission-adjustments/${adjId}/decide`,
        'POST',
        { decision },
        csrfToken,
        scope.signal
      );
      if (scope.current()) {
        setNotice(decision === 'APPROVE' ? 'تم اعتماد التعديل المالي وتحديث الاستحقاق.' : 'تم رفض طلب التعديل.');
        refresh();
      }
    } catch (e) {
      if (scope.current()) {
        setError(message(e));
        auth(e);
      }
    } finally {
      if (scope.current()) {
        setBusy(false);
        mutating.current = false;
      }
    }
  }

  // Create Settlement
  async function handleCreateSettlement() {
    if (!settlePractitionerId.trim()) {
      setFormError('يرجى تحديد الممارس الطبي لإصدار التسوية');
      return;
    }
    if (settleSelectedAccruals.length === 0) {
      setFormError('يرجى اختيار استحقاق واحد على الأقل للتسوية');
      return;
    }
    if (mutating.current) return;
    mutating.current = true;
    setBusy(true);
    setFormError('');
    const scope = gates.write.start();
    try {
      await client.write(
        'commission-settlements',
        'POST',
        {
          practitionerMembershipId: settlePractitionerId.trim(),
          periodStart: new Date(settlePeriodStart).toISOString(),
          periodEnd: new Date(settlePeriodEnd).toISOString(),
          accrualIds: settleSelectedAccruals,
          notes: settleNotes.trim() || undefined,
          requestKey: crypto.randomUUID(),
        },
        csrfToken,
        scope.signal
      );
      if (scope.current()) {
        setNotice('تم إنشاء مسودة دفعة التسوية بنجاح.');
        setModal(null);
        setSettleSelectedAccruals([]);
        setSettleNotes('');
        refresh();
      }
    } catch (e) {
      if (scope.current()) {
        setFormError(message(e));
        auth(e);
      }
    } finally {
      if (scope.current()) {
        setBusy(false);
        mutating.current = false;
      }
    }
  }

  // Confirm Settlement
  async function handleConfirmSettlement() {
    if (!selectedSettlement) return;
    if (!payoutReference.trim()) {
      setFormError('المرجع المصرفي أو رقم إيصال التحويل مطلوب لتأكيد الصرف');
      return;
    }
    if (mutating.current) return;
    mutating.current = true;
    setBusy(true);
    setFormError('');
    const scope = gates.write.start();
    try {
      await client.write(
        `commission-settlements/${selectedSettlement.id}/confirm`,
        'POST',
        {
          payoutReference: payoutReference.trim(),
          expectedVersion: selectedSettlement.version,
        },
        csrfToken,
        scope.signal
      );
      if (scope.current()) {
        setNotice('تم تأكيد صرف تسوية العمولات وتحديث حالة الاستحقاقات إلى مسواة.');
        setModal(null);
        setPayoutReference('');
        refresh();
      }
    } catch (e) {
      if (scope.current()) {
        setFormError(message(e));
        auth(e);
      }
    } finally {
      if (scope.current()) {
        setBusy(false);
        mutating.current = false;
      }
    }
  }

  return (
    <section className="billing-workspace" aria-busy={loading}>
      <div className="patient-intro">
        <div>
          <b>نظام عمولات الأطباء والتسويات المالية</b>
          <p>احتساب دقيق لعمولات الإجراءات والمبيعات مع قواعد تسوية مفصولة ومراجعة محاسبية مدققة.</p>
        </div>
      </div>

      {notice && (
        <div className="notice" role="status">
          {notice}
          <button onClick={() => setNotice('')} aria-label="إغلاق التنبيه">
            ×
          </button>
        </div>
      )}
      {error && (
        <div className="patient-error" role="alert">
          {error}
          <button className="table-btn" onClick={refresh}>
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* Sub tabs */}
      <div className="inventory-tabs" style={{ marginBottom: '16px' }}>
        {canAccrualsReadOwn && (
          <button
            className={`inventory-tab-btn ${activeSubTab === 'STATEMENT' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('STATEMENT')}
          >
            كشف حسابي كطبيب
          </button>
        )}
        {canPlansRead && (
          <button
            className={`inventory-tab-btn ${activeSubTab === 'PLANS' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('PLANS')}
          >
            خطط العمولات والقواعد
          </button>
        )}
        {canAccrualsRead && (
          <button
            className={`inventory-tab-btn ${activeSubTab === 'ACCRUALS' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('ACCRUALS')}
          >
            استحقاقات العمولات
          </button>
        )}
        {canSettlementsRead && (
          <button
            className={`inventory-tab-btn ${activeSubTab === 'SETTLEMENTS' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('SETTLEMENTS')}
          >
            دفعات التسوية والصرف
          </button>
        )}
      </div>

      {/* 1. DOCTOR STATEMENT VIEW */}
      {activeSubTab === 'STATEMENT' && statement && (
        <div className="panel full-panel">
          <div className="billing-overview">
            <div className="finance-row">
              <div>
                <small>إجمالي العمولات المستحقة</small>
                <strong>{formatMoney(statement.grossAccruedMinor, statement.currency, statement.currencyScale)}</strong>
              </div>
              <div>
                <small>إجمالي التعديلات والخصومات</small>
                <strong>{formatMoney(statement.adjustmentsMinor, statement.currency, statement.currencyScale)}</strong>
              </div>
              <div>
                <small>العمولات المصروفة (المسواة)</small>
                <strong>{formatMoney(statement.settledMinor, statement.currency, statement.currencyScale)}</strong>
              </div>
              <div>
                <small>الرصيد المعلق للصرف</small>
                <strong style={{ color: '#087F8C' }}>
                  {formatMoney(statement.pendingMinor, statement.currency, statement.currencyScale)}
                </strong>
              </div>
            </div>
          </div>

          <h4 style={{ marginTop: '20px', marginBottom: '10px' }}>سجل استحقاقات العمولات الخاصة بي</h4>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>رقم الفاتورة</th>
                  <th>المريض</th>
                  <th>مبلغ الأساس</th>
                  <th>مبلغ العمولة</th>
                  <th>الحدث</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {statement.accruals.map((a) => (
                  <tr key={a.id}>
                    <td><small>{new Date(a.createdAt).toLocaleDateString('ar-SA')}</small></td>
                    <td><bdi>{a.invoiceNumber ?? '—'}</bdi></td>
                    <td>{a.patientName ?? '—'}</td>
                    <td>{formatMoney(a.baseAmountMinor, a.currency, a.currencyScale)}</td>
                    <td><b>{formatMoney(a.commissionAmountMinor, a.currency, a.currencyScale)}</b></td>
                    <td><small>{a.earningEvent === 'PROCEDURE_COMPLETED' ? 'إجراء تجميلي مكتمل' : 'فاتورة محصلة'}</small></td>
                    <td>
                      <span className={`status bill-${a.status.toLowerCase()}`}>
                        {accrualStatuses[a.status] ?? a.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {statement.accruals.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '24px' }}>
                      لا توجد استحقاقات مسجلة لحسابك حالياً.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. PLANS & RULES VIEW */}
      {activeSubTab === 'PLANS' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
          {/* Plans Sidebar */}
          <div className="panel">
            <div className="billing-toolbar" style={{ justifyContent: 'space-between', marginBottom: '12px' }}>
              <h4>خطط العمولات</h4>
              {canPlansManage && (
                <button className="primary-btn" onClick={() => { setFormError(''); setModal('new_plan'); }}>
                  ＋ خطة جديدة
                </button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {plans.map((p) => (
                <div
                  key={p.id}
                  onClick={() => setSelectedPlan(p)}
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    border: selectedPlan?.id === p.id ? '2px solid #7854D9' : '1px solid #E2E8F0',
                    background: selectedPlan?.id === p.id ? '#F7FAFC' : '#FFFFFF',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <b>{p.name}</b>
                    <span className={`status bill-${p.status.toLowerCase()}`}>{planStatuses[p.status] ?? p.status}</span>
                  </div>
                  {p.description && <p style={{ fontSize: '13px', color: '#718096', margin: '4px 0 0' }}>{p.description}</p>}
                  <small style={{ color: '#A0AEC0' }}>
                    {p.rules.length} قواعد · {p.assignments.length} أطباء معينين
                  </small>
                </div>
              ))}
              {plans.length === 0 && <p className="billing-empty">لا توجد خطط عمولات منشأة بعد.</p>}
            </div>
          </div>

          {/* Selected Plan Details */}
          {selectedPlan && (
            <div className="panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ margin: 0 }}>{selectedPlan.name}</h3>
                  <small style={{ color: '#718096' }}>العملة: {selectedPlan.currency}</small>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {canPlansManage && (
                    <>
                      <button className="table-btn" onClick={() => { setFormError(''); setModal('new_rule'); }}>
                        ＋ إضافة قاعدة احتساب
                      </button>
                      <button className="table-btn" onClick={() => { setFormError(''); setModal('new_assignment'); }}>
                        ＋ تعيين ممارس
                      </button>
                    </>
                  )}
                </div>
              </div>

              <h4>قواعد احتساب العمولات</h4>
              <div className="table-wrap" style={{ marginBottom: '24px' }}>
                <table>
                  <thead>
                    <tr>
                      <th>نوع الاحتساب</th>
                      <th>النسبة / المبلغ</th>
                      <th>حدث الاستحقاق</th>
                      <th>الإجراء المرتبط</th>
                      <th>الوصف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPlan.rules.map((r) => (
                      <tr key={r.id}>
                        <td>{r.calculationType === 'PERCENTAGE' ? 'نسبة مئوية' : 'مبلغ مقطوع'}</td>
                        <td>
                          <b>
                            {r.calculationType === 'PERCENTAGE'
                              ? `${((r.rateBasisPoints ?? 0) / 100).toFixed(2)}%`
                              : formatMoney(r.flatAmountMinor ?? '0', selectedPlan.currency, selectedPlan.currencyScale)}
                          </b>
                        </td>
                        <td>{r.earningEvent === 'PROCEDURE_COMPLETED' ? 'اكتمال الإجراء التجميلي' : 'تحصيل الفاتورة'}</td>
                        <td>{r.procedureNameAr ?? 'جميع الإجراءات'}</td>
                        <td><small>{r.description ?? '—'}</small></td>
                      </tr>
                    ))}
                    {selectedPlan.rules.length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '16px' }}>
                          لم يتم تحديد قواعد احتساب بعد في هذه الخطة.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <h4>الأطباء والممارسون المعينون في هذه الخطة</h4>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>اسم الممارس</th>
                      <th>ساري من تاريخ</th>
                      <th>ساري حتى</th>
                      <th>ملاحظات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPlan.assignments.map((as) => (
                      <tr key={as.id}>
                        <td><b>{as.practitionerName ?? as.practitionerMembershipId}</b></td>
                        <td>{new Date(as.effectiveFrom).toLocaleDateString('ar-SA')}</td>
                        <td>{as.effectiveTo ? new Date(as.effectiveTo).toLocaleDateString('ar-SA') : 'مستمر'}</td>
                        <td><small>{as.notes ?? '—'}</small></td>
                      </tr>
                    ))}
                    {selectedPlan.assignments.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', padding: '16px' }}>
                          لم يتم تعيين ممارسين بعد لهذه الخطة.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. ACCRUALS VIEW */}
      {activeSubTab === 'ACCRUALS' && (
        <div className="panel full-panel">
          <div className="billing-toolbar" style={{ justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <h4>سجل استحقاقات العمولات</h4>
              <button className="table-btn" onClick={refresh}>تحديث</button>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>الممارس الطبي</th>
                  <th>المريض</th>
                  <th>رقم الفاتورة</th>
                  <th>مبلغ الأساس</th>
                  <th>مبلغ العمولة</th>
                  <th>الحالة</th>
                  <th>التاريخ</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {accruals.map((a) => (
                  <tr key={a.id}>
                    <td><b>{a.practitionerName ?? a.practitionerMembershipId}</b></td>
                    <td>{a.patientName ?? '—'} <small><bdi>{a.patientNumber}</bdi></small></td>
                    <td><bdi>{a.invoiceNumber ?? '—'}</bdi></td>
                    <td>{formatMoney(a.baseAmountMinor, a.currency, a.currencyScale)}</td>
                    <td>
                      <b style={{ color: '#087F8C' }}>
                        {formatMoney(a.commissionAmountMinor, a.currency, a.currencyScale)}
                      </b>
                    </td>
                    <td>
                      <span className={`status bill-${a.status.toLowerCase()}`}>
                        {accrualStatuses[a.status] ?? a.status}
                      </span>
                    </td>
                    <td><small>{new Date(a.createdAt).toLocaleDateString('ar-SA')}</small></td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {canAdjustRequest && a.status !== 'SETTLED' && a.status !== 'REVERSED' && (
                          <button
                            className="table-btn"
                            onClick={() => {
                              setSelectedAccrual(a);
                              setFormError('');
                              setModal('request_adj');
                            }}
                          >
                            طلب تعديل
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {accruals.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '24px' }}>
                      لا توجد استحقاقات مسجلة حالياً.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pending Adjustments Review section */}
          {canAdjustDecide && accruals.some((a) => a.adjustments && a.adjustments.some((adj) => adj.status === 'PENDING')) && (
            <div style={{ marginTop: '28px', borderTop: '2px solid #EDF2F7', paddingTop: '16px' }}>
              <h4 style={{ color: '#D69E2E' }}>طلبات التعديل المعلقة بانتظار الاعتماد (فصل الصلاحيات)</h4>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>الاستحقاق</th>
                      <th>مبلغ التعديل</th>
                      <th>السبب</th>
                      <th>التفاصيل</th>
                      <th>طالب التعديل</th>
                      <th>قرار الاعتماد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accruals.flatMap((a) =>
                      (a.adjustments ?? [])
                        .filter((adj) => adj.status === 'PENDING')
                        .map((adj) => (
                          <tr key={adj.id}>
                            <td>{a.practitionerName} · {formatMoney(a.commissionAmountMinor, a.currency, a.currencyScale)}</td>
                            <td>
                              <b>{formatMoney(adj.adjustmentAmountMinor, a.currency, a.currencyScale)}</b>
                            </td>
                            <td>{adjustmentReasons[adj.reason] ?? adj.reason}</td>
                            <td><small>{adj.reasonDetails}</small></td>
                            <td>{adj.requesterName ?? adj.requestedByMembershipId}</td>
                            <td>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                  className="primary-btn"
                                  style={{ padding: '4px 10px', fontSize: '12px' }}
                                  disabled={busy}
                                  onClick={() => handleDecideAdjustment(adj.id, 'APPROVE')}
                                >
                                  اعتماد
                                </button>
                                <button
                                  className="table-btn"
                                  style={{ padding: '4px 10px', fontSize: '12px', color: '#E53E3E' }}
                                  disabled={busy}
                                  onClick={() => handleDecideAdjustment(adj.id, 'REJECT')}
                                >
                                  رفض
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. SETTLEMENTS VIEW */}
      {activeSubTab === 'SETTLEMENTS' && (
        <div className="panel full-panel">
          <div className="billing-toolbar" style={{ justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <h4>دفعات تسوية العمولات</h4>
              <button className="table-btn" onClick={refresh}>تحديث</button>
            </div>
            {canSettlementsManage && (
              <button
                className="primary-btn"
                onClick={() => {
                  setFormError('');
                  setSettleSelectedAccruals([]);
                  setModal('new_settlement');
                }}
              >
                ＋ إنشاء دفعة تسوية جديدة
              </button>
            )}
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>رقم التسوية</th>
                  <th>الممارس الطبي</th>
                  <th>الفترة</th>
                  <th>الإجمالي</th>
                  <th>التعديلات</th>
                  <th>الصافي المستحق</th>
                  <th>الحالة</th>
                  <th>المرجع المصرفي</th>
                  <th>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {settlements.map((s) => (
                  <tr key={s.id}>
                    <td><b><bdi>{s.settlementNumber}</bdi></b></td>
                    <td>{s.practitionerName ?? s.practitionerMembershipId}</td>
                    <td>
                      <small>
                        {new Date(s.periodStart).toLocaleDateString('ar-SA')} - {new Date(s.periodEnd).toLocaleDateString('ar-SA')}
                      </small>
                    </td>
                    <td>{formatMoney(s.grossAmountMinor, s.currency, s.currencyScale)}</td>
                    <td>{formatMoney(s.adjustmentsAmountMinor, s.currency, s.currencyScale)}</td>
                    <td>
                      <b style={{ color: '#087F8C' }}>
                        {formatMoney(s.netSettledMinor, s.currency, s.currencyScale)}
                      </b>
                    </td>
                    <td>
                      <span className={`status bill-${s.status.toLowerCase()}`}>
                        {s.status === 'CONFIRMED'
                          ? (s.payoutReference ? `مصروفة بنكيًا (${s.payoutReference})` : 'معتمدة داخليًا (قيد الحساب)')
                          : (settlementStatuses[s.status] ?? s.status)}
                      </span>
                    </td>
                    <td><bdi>{s.payoutReference ?? '—'}</bdi></td>
                    <td>
                      {s.status === 'DRAFT' && canSettlementsManage && (
                        <button
                          className="primary-btn"
                          style={{ padding: '4px 10px', fontSize: '12px' }}
                          onClick={() => {
                            setSelectedSettlement(s);
                            setFormError('');
                            setPayoutReference('');
                            setModal('confirm_settlement');
                          }}
                        >
                          تأكيد الصرف
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {settlements.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '24px' }}>
                      لا توجد دفعات تسوية مسجلة حتى الآن.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: New Plan */}
      {modal === 'new_plan' && (
        <Modal title="إنشاء خطة عمولات جديدة" onClose={() => setModal(null)}>
          <div className="dialog-body">
            {formError && <div className="patient-error" role="alert">{formError}</div>}
            <label className="form-label">
              اسم الخطة *
              <input
                className="search"
                style={{ width: '100%', marginTop: '4px' }}
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                placeholder="مثال: خطة أطباء الجلدية والحقن التجميلي 2026"
              />
            </label>
            <label className="form-label" style={{ marginTop: '12px' }}>
              الوصف والشروط
              <textarea
                className="search"
                style={{ width: '100%', marginTop: '4px', height: '70px' }}
                value={planDesc}
                onChange={(e) => setPlanDesc(e.target.value)}
                placeholder="ملاحظات وشروط استحقاق العمولات..."
              />
            </label>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '18px' }}>
              <button className="table-btn" disabled={busy} onClick={() => setModal(null)}>
                إلغاء
              </button>
              <button className="primary-btn" disabled={busy} onClick={handleCreatePlan}>
                حفظ الخطة
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: New Rule */}
      {modal === 'new_rule' && selectedPlan && (
        <Modal title={`إضافة قاعدة احتساب إلى: ${selectedPlan.name}`} onClose={() => setModal(null)}>
          <div className="dialog-body">
            {formError && <div className="patient-error" role="alert">{formError}</div>}
            <label className="form-label">
              طريقة الاحتساب *
              <select
                style={{ width: '100%', marginTop: '4px' }}
                value={ruleCalcType}
                onChange={(e) => setRuleCalcType(e.target.value as any)}
              >
                <option value="PERCENTAGE">نسبة مئوية من الإيراد</option>
                <option value="FLAT_AMOUNT">مبلغ مقطوع لكل إجراء</option>
              </select>
            </label>

            {ruleCalcType === 'PERCENTAGE' ? (
              <label className="form-label" style={{ marginTop: '12px' }}>
                النسبة المئوية (نقاط الأساس، 1500 = 15%) *
                <input
                  type="number"
                  className="search"
                  style={{ width: '100%', marginTop: '4px' }}
                  value={ruleRateBps}
                  onChange={(e) => setRuleRateBps(e.target.value)}
                />
              </label>
            ) : (
              <label className="form-label" style={{ marginTop: '12px' }}>
                المبلغ المقطوع ({selectedPlan.currency}) *
                <input
                  type="text"
                  className="search"
                  style={{ width: '100%', marginTop: '4px' }}
                  value={ruleFlatAmount}
                  onChange={(e) => setRuleFlatAmount(e.target.value)}
                  placeholder="مثال: 150.00"
                />
              </label>
            )}

            <label className="form-label" style={{ marginTop: '12px' }}>
              حدث الاستحقاق *
              <select
                style={{ width: '100%', marginTop: '4px' }}
                value={ruleEarningEvent}
                onChange={(e) => setRuleEarningEvent(e.target.value as any)}
              >
                <option value="PROCEDURE_COMPLETED">اكتمال الإجراء التجميلي سريرياً</option>
                <option value="INVOICE_PAID">تحصيل قيمة الفاتورة بالكامل</option>
              </select>
            </label>

            <label className="form-label" style={{ marginTop: '12px' }}>
              وصف القاعدة
              <input
                className="search"
                style={{ width: '100%', marginTop: '4px' }}
                value={ruleDesc}
                onChange={(e) => setRuleDesc(e.target.value)}
                placeholder="مثال: عمولة 15% على جلسات البوتوكس والفيلر"
              />
            </label>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '18px' }}>
              <button className="table-btn" disabled={busy} onClick={() => setModal(null)}>
                إلغاء
              </button>
              <button className="primary-btn" disabled={busy} onClick={handleAddRule}>
                إضافة القاعدة
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: New Assignment */}
      {modal === 'new_assignment' && selectedPlan && (
        <Modal title={`تعيين ممارس في: ${selectedPlan.name}`} onClose={() => setModal(null)}>
          <div className="dialog-body">
            {formError && <div className="patient-error" role="alert">{formError}</div>}
            <label className="form-label">
              معرف عضوية الممارس (UUID) *
              <input
                className="search"
                style={{ width: '100%', marginTop: '4px' }}
                value={assignPractitionerId}
                onChange={(e) => setAssignPractitionerId(e.target.value)}
                placeholder="UUID الخاص بعضوية الطبيب في العيادة"
              />
            </label>
            <label className="form-label" style={{ marginTop: '12px' }}>
              تاريخ بدء السريان *
              <input
                type="date"
                className="search"
                style={{ width: '100%', marginTop: '4px' }}
                value={assignEffectiveFrom}
                onChange={(e) => setAssignEffectiveFrom(e.target.value)}
              />
            </label>
            <label className="form-label" style={{ marginTop: '12px' }}>
              ملاحظات التعيين
              <input
                className="search"
                style={{ width: '100%', marginTop: '4px' }}
                value={assignNotes}
                onChange={(e) => setAssignNotes(e.target.value)}
              />
            </label>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '18px' }}>
              <button className="table-btn" disabled={busy} onClick={() => setModal(null)}>
                إلغاء
              </button>
              <button className="primary-btn" disabled={busy} onClick={handleAddAssignment}>
                تعيين الممارس
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: Request Adjustment */}
      {modal === 'request_adj' && selectedAccrual && (
        <Modal
          title={`طلب تعديل استحقاق عمولة: ${selectedAccrual.practitionerName}`}
          onClose={() => setModal(null)}
        >
          <div className="dialog-body">
            {formError && <div className="patient-error" role="alert">{formError}</div>}
            <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#4A5568' }}>
              الاستحقاق الحالي: <b>{formatMoney(selectedAccrual.commissionAmountMinor, selectedAccrual.currency, selectedAccrual.currencyScale)}</b>
            </p>
            <label className="form-label">
              مبلغ التعديل (أدخل قيمة موجبة للإضافة أو سالبة مثل -20.00 للخصم) *
              <input
                className="search"
                style={{ width: '100%', marginTop: '4px' }}
                value={adjAmount}
                onChange={(e) => setAdjAmount(e.target.value)}
                placeholder="مثال: -25.00"
              />
            </label>
            <label className="form-label" style={{ marginTop: '12px' }}>
              سبب التعديل *
              <select
                style={{ width: '100%', marginTop: '4px' }}
                value={adjReason}
                onChange={(e) => setAdjReason(e.target.value as any)}
              >
                {Object.entries(adjustmentReasons).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
            <label className="form-label" style={{ marginTop: '12px' }}>
              شرح وتفاصيل التعديل المدقق *
              <textarea
                className="search"
                style={{ width: '100%', marginTop: '4px', height: '65px' }}
                value={adjReasonDetails}
                onChange={(e) => setAdjReasonDetails(e.target.value)}
                placeholder="بيان أسباب التعديل للتدقيق المحاسبي وفصل الصلاحيات..."
              />
            </label>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '18px' }}>
              <button className="table-btn" disabled={busy} onClick={() => setModal(null)}>
                إلغاء
              </button>
              <button className="primary-btn" disabled={busy} onClick={handleRequestAdjustment}>
                إرسال الطلب للاعتماد
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: New Settlement */}
      {modal === 'new_settlement' && (
        <Modal title="إنشاء دفعة تسوية عمولات جديدة" onClose={() => setModal(null)}>
          <div className="dialog-body">
            {formError && <div className="patient-error" role="alert">{formError}</div>}
            <label className="form-label">
              معرف الممارس الطبي (UUID) *
              <input
                className="search"
                style={{ width: '100%', marginTop: '4px' }}
                value={settlePractitionerId}
                onChange={(e) => setSettlePractitionerId(e.target.value)}
                placeholder="UUID عضوية الطبيب"
              />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '12px' }}>
              <label className="form-label">
                بداية الفترة *
                <input
                  type="date"
                  className="search"
                  style={{ width: '100%', marginTop: '4px' }}
                  value={settlePeriodStart}
                  onChange={(e) => setSettlePeriodStart(e.target.value)}
                />
              </label>
              <label className="form-label">
                نهاية الفترة *
                <input
                  type="date"
                  className="search"
                  style={{ width: '100%', marginTop: '4px' }}
                  value={settlePeriodEnd}
                  onChange={(e) => setSettlePeriodEnd(e.target.value)}
                />
              </label>
            </div>

            <label className="form-label" style={{ marginTop: '14px' }}>
              اختيار الاستحقاقات المعلقة للتسوية ({settleSelectedAccruals.length} محددة) *
            </label>
            <div
              style={{
                maxHeight: '160px',
                overflowY: 'auto',
                border: '1px solid #CBD5E0',
                borderRadius: '6px',
                padding: '8px',
                marginTop: '4px',
              }}
            >
              {accruals
                .filter((a) => a.status === 'PENDING' || a.status === 'ADJUSTED')
                .map((a) => (
                  <div key={a.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                    <input
                      type="checkbox"
                      id={`chk-${a.id}`}
                      checked={settleSelectedAccruals.includes(a.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSettleSelectedAccruals((old) => [...old, a.id]);
                        } else {
                          setSettleSelectedAccruals((old) => old.filter((id) => id !== a.id));
                        }
                      }}
                    />
                    <label htmlFor={`chk-${a.id}`} style={{ fontSize: '13px', cursor: 'pointer' }}>
                      {a.practitionerName} · فاتورة {a.invoiceNumber ?? '—'} · عمولة:{' '}
                      <b>{formatMoney(a.commissionAmountMinor, a.currency, a.currencyScale)}</b>
                    </label>
                  </div>
                ))}
              {accruals.filter((a) => a.status === 'PENDING' || a.status === 'ADJUSTED').length === 0 && (
                <p style={{ margin: 0, fontSize: '12px', color: '#718096' }}>لا توجد استحقاقات معلقة قابلة للتسوية.</p>
              )}
            </div>

            <label className="form-label" style={{ marginTop: '12px' }}>
              ملاحظات التسوية
              <input
                className="search"
                style={{ width: '100%', marginTop: '4px' }}
                value={settleNotes}
                onChange={(e) => setSettleNotes(e.target.value)}
                placeholder="مثال: تسوية عمولات نهاية الشهر"
              />
            </label>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '18px' }}>
              <button className="table-btn" disabled={busy} onClick={() => setModal(null)}>
                إلغاء
              </button>
              <button className="primary-btn" disabled={busy} onClick={handleCreateSettlement}>
                إنشاء الدفعة
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: Confirm Settlement */}
      {modal === 'confirm_settlement' && selectedSettlement && (
        <Modal
          title={`تأكيد صرف التسوية: ${selectedSettlement.settlementNumber}`}
          onClose={() => setModal(null)}
        >
          <div className="dialog-body">
            {formError && <div className="patient-error" role="alert">{formError}</div>}
            <p style={{ margin: '0 0 12px', fontSize: '14px' }}>
              الممارس الطبي: <b>{selectedSettlement.practitionerName}</b>
              <br />
              الصافي المعتمد للصرف:{' '}
              <strong style={{ color: '#087F8C' }}>
                {formatMoney(selectedSettlement.netSettledMinor, selectedSettlement.currency, selectedSettlement.currencyScale)}
              </strong>
            </p>
            <label className="form-label">
              المرجع المصرفي أو رقم إيصال التحويل *
              <input
                className="search"
                style={{ width: '100%', marginTop: '4px' }}
                value={payoutReference}
                onChange={(e) => setPayoutReference(e.target.value)}
                placeholder="مثال: BANK-TRANSFER-TRX-123456"
              />
            </label>
            <p className="form-hint" style={{ marginTop: '8px' }}>
              تأكيد الصرف عملية مالية نهائية تُغيّر حالة الاستحقاقات المرتبطة إلى مسواة وتثبت رقم المرجع المصرفي في السجل المدقق.
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '18px' }}>
              <button className="table-btn" disabled={busy} onClick={() => setModal(null)}>
                إلغاء
              </button>
              <button className="primary-btn" disabled={busy} onClick={handleConfirmSettlement}>
                تأكيد الصرف والتحويل
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}

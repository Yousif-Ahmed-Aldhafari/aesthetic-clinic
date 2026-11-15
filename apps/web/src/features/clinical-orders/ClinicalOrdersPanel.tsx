import React, { useState, useEffect, useCallback } from 'react';
import {
  listClinicalOrders,
  createClinicalOrder,
  cancelClinicalOrder,
  listOrderResults,
  recordOrderResult,
  verifyOrderResult,
  acknowledgeCriticalResult,
  releaseResultToPatient,
  type ClinicalOrder,
  type ClinicalOrderResult,
  type ClinicalOrderType,
  type OrderPriority,
  type DiagnosticResultStatus,
} from './clinical-orders-api';

interface ClinicalOrdersPanelProps {
  clinicId: string;
  patientId?: string;
  encounterId?: string;
  csrfToken?: string;
}

const orderTypeLabels: Record<ClinicalOrderType, string> = {
  LABORATORY: 'مختبر (Lab)',
  IMAGING: 'تصوير (Imaging)',
  REFERRAL: 'إحالة (Referral)',
  PROCEDURE: 'إجراء (Procedure)',
  OTHER: 'أخرى (Other)',
};

const orderStatusLabels: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'مسودة', color: '#8e9fb3' },
  REQUESTED: { label: 'مطلوب', color: '#3b82f6' },
  ACCEPTED: { label: 'مقبول', color: '#a78bfa' },
  IN_PROGRESS: { label: 'قيد التنفيذ', color: '#f59e0b' },
  COMPLETED: { label: 'مكتمل', color: '#10b981' },
  REVIEWED: { label: 'مُراجع', color: '#059669' },
  CANCELLED: { label: 'ملغي', color: '#ef4444' },
};

const priorityLabels: Record<OrderPriority, { label: string; color: string }> = {
  ROUTINE: { label: 'روتيني', color: '#6b7280' },
  URGENT: { label: 'عاجل', color: '#f59e0b' },
  STAT: { label: 'طارئ', color: '#ef4444' },
};

const resultStatusLabels: Record<DiagnosticResultStatus, { label: string; color: string }> = {
  PRELIMINARY: { label: 'أولي', color: '#f59e0b' },
  FINAL: { label: 'نهائي', color: '#10b981' },
  CORRECTED: { label: 'مُصحَّح', color: '#3b82f6' },
  CANCELLED: { label: 'ملغي', color: '#ef4444' },
};

export const ClinicalOrdersPanel: React.FC<ClinicalOrdersPanelProps> = ({
  clinicId,
  patientId,
  encounterId,
  csrfToken,
}) => {
  const [orders, setOrders] = useState<ClinicalOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Create order form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newOrderType, setNewOrderType] = useState<ClinicalOrderType>('LABORATORY');
  const [newOrderIndication, setNewOrderIndication] = useState('');
  const [newOrderPriority, setNewOrderPriority] = useState<OrderPriority>('ROUTINE');
  const [newOrderNotes, setNewOrderNotes] = useState('');
  const [creating, setCreating] = useState(false);

  // Expanded order state for results
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [orderResults, setOrderResults] = useState<Record<string, ClinicalOrderResult[]>>({});
  const [loadingResults, setLoadingResults] = useState<Record<string, boolean>>({});

  // Record result form state
  const [showResultForm, setShowResultForm] = useState<string | null>(null);
  const [resultFindings, setResultFindings] = useState('');
  const [resultImpression, setResultImpression] = useState('');
  const [resultIsCritical, setResultIsCritical] = useState(false);
  const [resultCriticalNotes, setResultCriticalNotes] = useState('');
  const [resultSource, setResultSource] = useState('');
  const [recordingResult, setRecordingResult] = useState(false);

  // Acknowledge form state
  const [acknowledgeResultId, setAcknowledgeResultId] = useState<string | null>(null);
  const [acknowledgeAction, setAcknowledgeAction] = useState('');

  // Filter state
  const [filterType, setFilterType] = useState<ClinicalOrderType | ''>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listClinicalOrders(
        clinicId,
        {
          patientId: patientId,
          encounterId: encounterId,
          orderType: filterType || undefined,
          status: (filterStatus as any) || undefined,
          pageSize: 50,
        },
        csrfToken,
      );
      setOrders(result.items);
    } catch (err: unknown) {
      setError((err as Error).message ?? 'خطأ في تحميل الأوامر الطبية');
    } finally {
      setLoading(false);
    }
  }, [clinicId, patientId, encounterId, filterType, filterStatus, csrfToken]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId) { setError('معرّف المريض مطلوب لإنشاء أمر طبي'); return; }
    setCreating(true);
    setError(null);
    try {
      await createClinicalOrder(clinicId, {
        patientId,
        encounterId,
        orderType: newOrderType,
        clinicalIndication: newOrderIndication || undefined,
        priority: newOrderPriority,
        notes: newOrderNotes || undefined,
      }, csrfToken);
      setSuccessMessage('تم إنشاء الأمر الطبي بنجاح');
      setShowCreateForm(false);
      setNewOrderIndication('');
      setNewOrderNotes('');
      await loadOrders();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'خطأ في إنشاء الأمر');
    } finally {
      setCreating(false);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    const reason = window.prompt('سبب الإلغاء (Cancellation reason):');
    if (!reason || !reason.trim()) return;
    try {
      await cancelClinicalOrder(clinicId, orderId, { cancellationReason: reason.trim() }, csrfToken);
      setSuccessMessage('تم إلغاء الأمر');
      await loadOrders();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'خطأ في الإلغاء');
    }
  };

  const handleExpandOrder = async (orderId: string) => {
    if (expandedOrderId === orderId) { setExpandedOrderId(null); return; }
    setExpandedOrderId(orderId);
    if (!orderResults[orderId]) {
      setLoadingResults(prev => ({ ...prev, [orderId]: true }));
      try {
        const results = await listOrderResults(clinicId, orderId);
        setOrderResults(prev => ({ ...prev, [orderId]: results }));
      } catch (err: unknown) {
        setError((err as Error).message ?? 'خطأ في تحميل النتائج');
      } finally {
        setLoadingResults(prev => ({ ...prev, [orderId]: false }));
      }
    }
  };

  const handleRecordResult = async (orderId: string) => {
    setRecordingResult(true);
    setError(null);
    try {
      const order = orders.find(o => o.id === orderId);
      await recordOrderResult(clinicId, orderId, {
        resultType: order?.orderType ?? 'LABORATORY',
        status: 'FINAL',
        sourceOrganization: resultSource || undefined,
        narrativeFindings: resultFindings || undefined,
        impression: resultImpression || undefined,
        isCritical: resultIsCritical,
        criticalNotes: resultIsCritical ? resultCriticalNotes : undefined,
        isReleasedToPatient: false,
      }, csrfToken);
      setSuccessMessage('تم تسجيل النتيجة بنجاح');
      setShowResultForm(null);
      setResultFindings(''); setResultImpression(''); setResultIsCritical(false); setResultCriticalNotes(''); setResultSource('');
      setOrderResults(prev => { const copy = { ...prev }; delete copy[orderId]; return copy; });
      if (expandedOrderId === orderId) await handleExpandOrder(orderId);
      await loadOrders();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'خطأ في تسجيل النتيجة');
    } finally {
      setRecordingResult(false);
    }
  };

  const handleVerifyResult = async (resultId: string, orderId: string) => {
    try {
      await verifyOrderResult(clinicId, resultId, undefined, csrfToken);
      setSuccessMessage('تم التحقق من النتيجة');
      setOrderResults(prev => { const copy = { ...prev }; delete copy[orderId]; return copy; });
      await handleExpandOrder(orderId);
      await loadOrders();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'خطأ في التحقق');
    }
  };

  const handleAcknowledgeCritical = async (resultId: string, orderId: string) => {
    if (!acknowledgeAction.trim()) { setError('يجب إدخال الإجراء المتخذ'); return; }
    try {
      await acknowledgeCriticalResult(clinicId, resultId, { actionTaken: acknowledgeAction.trim() }, csrfToken);
      setSuccessMessage('تم الإقرار بالنتيجة الحرجة');
      setAcknowledgeResultId(null);
      setAcknowledgeAction('');
      setOrderResults(prev => { const copy = { ...prev }; delete copy[orderId]; return copy; });
      await handleExpandOrder(orderId);
    } catch (err: unknown) {
      setError((err as Error).message ?? 'خطأ في الإقرار');
    }
  };

  const handleRelease = async (resultId: string, orderId: string, release: boolean) => {
    try {
      await releaseResultToPatient(clinicId, resultId, { isReleasedToPatient: release }, csrfToken);
      setSuccessMessage(release ? 'تم نشر النتيجة للمريض' : 'تم سحب النتيجة');
      setOrderResults(prev => { const copy = { ...prev }; delete copy[orderId]; return copy; });
      await handleExpandOrder(orderId);
    } catch (err: unknown) {
      setError((err as Error).message ?? 'خطأ في النشر');
    }
  };

  return (
    <div className="clinical-orders-panel" dir="rtl" style={{ fontFamily: 'Tajawal, sans-serif', padding: '1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, color: '#1e293b' }}>
          🔬 الأوامر الطبية (Clinical Orders)
        </h2>
        <button onClick={() => setShowCreateForm(!showCreateForm)} style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '0.5rem 1.2rem', cursor: 'pointer', fontFamily: 'Tajawal, sans-serif', fontWeight: 600 }}>
          + أمر جديد
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem', color: '#dc2626' }}>
          ⚠️ {error}
          <button onClick={() => setError(null)} style={{ marginRight: 'auto', marginLeft: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}>✕</button>
        </div>
      )}
      {successMessage && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem', color: '#16a34a' }}>
          ✅ {successMessage}
          <button onClick={() => setSuccessMessage(null)} style={{ marginRight: 'auto', marginLeft: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a' }}>✕</button>
        </div>
      )}

      {/* Create Order Form */}
      {showCreateForm && (
        <form onSubmit={handleCreateOrder} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.25rem', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700, color: '#475569' }}>إنشاء أمر طبي جديد</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: 4 }}>نوع الأمر *</label>
              <select value={newOrderType} onChange={e => setNewOrderType(e.target.value as ClinicalOrderType)} style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid #cbd5e1', fontFamily: 'Tajawal, sans-serif' }} required>
                {Object.entries(orderTypeLabels).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: 4 }}>الأولوية</label>
              <select value={newOrderPriority} onChange={e => setNewOrderPriority(e.target.value as OrderPriority)} style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid #cbd5e1', fontFamily: 'Tajawal, sans-serif' }}>
                <option value="ROUTINE">روتيني</option>
                <option value="URGENT">عاجل</option>
                <option value="STAT">طارئ</option>
              </select>
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: 4 }}>المؤشر السريري (Clinical Indication)</label>
              <input value={newOrderIndication} onChange={e => setNewOrderIndication(e.target.value)} placeholder="السبب الطبي لهذا الأمر..." style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid #cbd5e1', boxSizing: 'border-box', fontFamily: 'Tajawal, sans-serif' }} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: 4 }}>ملاحظات</label>
              <textarea value={newOrderNotes} onChange={e => setNewOrderNotes(e.target.value)} rows={2} style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid #cbd5e1', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'Tajawal, sans-serif' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button type="submit" disabled={creating} style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, padding: '0.5rem 1rem', cursor: 'pointer', fontFamily: 'Tajawal, sans-serif', fontWeight: 600, opacity: creating ? 0.6 : 1 }}>
              {creating ? 'جاري الإنشاء...' : 'إنشاء الأمر'}
            </button>
            <button type="button" onClick={() => setShowCreateForm(false)} style={{ background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: 6, padding: '0.5rem 1rem', cursor: 'pointer', fontFamily: 'Tajawal, sans-serif' }}>
              إلغاء
            </button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <select value={filterType} onChange={e => setFilterType(e.target.value as ClinicalOrderType | '')} style={{ padding: '0.4rem 0.75rem', borderRadius: 6, border: '1px solid #cbd5e1', fontFamily: 'Tajawal, sans-serif', fontSize: '0.85rem' }}>
          <option value="">كل الأنواع</option>
          {Object.entries(orderTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '0.4rem 0.75rem', borderRadius: 6, border: '1px solid #cbd5e1', fontFamily: 'Tajawal, sans-serif', fontSize: '0.85rem' }}>
          <option value="">كل الحالات</option>
          {Object.entries(orderStatusLabels).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button onClick={loadOrders} style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, padding: '0.4rem 0.75rem', cursor: 'pointer', fontFamily: 'Tajawal, sans-serif', fontSize: '0.85rem' }}>
          🔄 تحديث
        </button>
      </div>

      {/* Orders List */}
      {loading ? (
        <p style={{ color: '#94a3b8', textAlign: 'center' }}>جاري التحميل...</p>
      ) : orders.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem', background: '#f8fafc', borderRadius: 12, border: '1px dashed #cbd5e1' }}>
          <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</p>
          <p>لا توجد أوامر طبية حتى الآن</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {orders.map(order => {
            const statusInfo = orderStatusLabels[order.status] ?? { label: order.status, color: '#94a3b8' };
            const priorityInfo = priorityLabels[order.priority];
            const isExpanded = expandedOrderId === order.id;

            return (
              <div key={order.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                {/* Order Header */}
                <div
                  role="button"
                  tabIndex={0}
                  data-order-number={order.orderNumber}
                  aria-expanded={isExpanded}
                  aria-label={`فتح الأمر ${order.orderNumber}`}
                  onClick={() => handleExpandOrder(order.id)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      void handleExpandOrder(order.id);
                    }
                  }}
                  style={{ padding: '0.9rem 1rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontWeight: 700, color: '#6366f1', fontSize: '0.85rem', fontFamily: 'monospace' }}>{order.orderNumber}</span>
                    <span style={{ background: '#ede9fe', color: '#6d28d9', borderRadius: 6, padding: '2px 8px', fontSize: '0.8rem', fontWeight: 600 }}>
                      {orderTypeLabels[order.orderType]}
                    </span>
                    {order.priority !== 'ROUTINE' && (
                      <span style={{ background: priorityInfo.color + '20', color: priorityInfo.color, borderRadius: 6, padding: '2px 8px', fontSize: '0.8rem', fontWeight: 700 }}>
                        {priorityInfo.label}
                      </span>
                    )}
                    {order.clinicalIndication && (
                      <span style={{ color: '#64748b', fontSize: '0.85rem', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        — {order.clinicalIndication}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ background: statusInfo.color + '15', color: statusInfo.color, borderRadius: 6, padding: '3px 10px', fontSize: '0.8rem', fontWeight: 700 }}>
                      {statusInfo.label}
                    </span>
                    {order.status !== 'CANCELLED' && order.status !== 'COMPLETED' && order.status !== 'REVIEWED' && (
                      <button onClick={(e) => { e.stopPropagation(); handleCancelOrder(order.id); }} style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, padding: '3px 8px', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'Tajawal, sans-serif' }}>
                        إلغاء
                      </button>
                    )}
                    <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Expanded: Results */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid #f1f5f9', padding: '1rem' }}>
                    {/* Record Result Button */}
                    {order.status !== 'CANCELLED' && (
                      <button onClick={() => setShowResultForm(showResultForm === order.id ? null : order.id)} style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #86efac', borderRadius: 6, padding: '0.4rem 0.9rem', fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'Tajawal, sans-serif', marginBottom: '0.75rem' }}>
                        {showResultForm === order.id ? '✕ إغلاق' : '+ تسجيل نتيجة'}
                      </button>
                    )}

                    {/* Record Result Form */}
                    {showResultForm === order.id && (
                      <div style={{ background: '#f8fafc', borderRadius: 8, padding: '1rem', marginBottom: '0.75rem', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: 3 }}>المصدر (Source)</label>
                            <input value={resultSource} onChange={e => setResultSource(e.target.value)} placeholder="المختبر / المركز الطبي..." style={{ width: '100%', padding: '0.4rem', borderRadius: 5, border: '1px solid #cbd5e1', boxSizing: 'border-box', fontFamily: 'Tajawal, sans-serif' }} />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input type="checkbox" id={`critical-${order.id}`} checked={resultIsCritical} onChange={e => setResultIsCritical(e.target.checked)} />
                            <label htmlFor={`critical-${order.id}`} style={{ fontSize: '0.85rem', color: '#dc2626', fontWeight: 600 }}>⚠️ نتيجة حرجة (Critical)</label>
                          </div>
                        </div>
                        <div style={{ marginBottom: '0.5rem' }}>
                          <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: 3 }}>النتائج (Findings)</label>
                          <textarea value={resultFindings} onChange={e => setResultFindings(e.target.value)} rows={3} style={{ width: '100%', padding: '0.4rem', borderRadius: 5, border: '1px solid #cbd5e1', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'Tajawal, sans-serif' }} />
                        </div>
                        <div style={{ marginBottom: '0.5rem' }}>
                          <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: 3 }}>الانطباع السريري (Impression)</label>
                          <textarea value={resultImpression} onChange={e => setResultImpression(e.target.value)} rows={2} style={{ width: '100%', padding: '0.4rem', borderRadius: 5, border: '1px solid #cbd5e1', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'Tajawal, sans-serif' }} />
                        </div>
                        {resultIsCritical && (
                          <div style={{ marginBottom: '0.5rem' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: '#dc2626', marginBottom: 3 }}>ملاحظات الحالة الحرجة *</label>
                            <input value={resultCriticalNotes} onChange={e => setResultCriticalNotes(e.target.value)} required={resultIsCritical} style={{ width: '100%', padding: '0.4rem', borderRadius: 5, border: '1px solid #fca5a5', boxSizing: 'border-box', fontFamily: 'Tajawal, sans-serif' }} />
                          </div>
                        )}
                        <button onClick={() => handleRecordResult(order.id)} disabled={recordingResult || (resultIsCritical && !resultCriticalNotes.trim())} style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, padding: '0.4rem 1rem', cursor: 'pointer', fontFamily: 'Tajawal, sans-serif', fontWeight: 600, opacity: recordingResult ? 0.6 : 1 }}>
                          {recordingResult ? 'جاري الحفظ...' : 'حفظ النتيجة'}
                        </button>
                      </div>
                    )}

                    {/* Results List */}
                    <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: '#475569' }}>النتائج السابقة:</h4>
                    {loadingResults[order.id] ? (
                      <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>جاري تحميل النتائج...</p>
                    ) : (orderResults[order.id] ?? []).length === 0 ? (
                      <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>لا توجد نتائج مسجّلة بعد</p>
                    ) : (
                      (orderResults[order.id] ?? []).map(result => {
                        const rStatus = resultStatusLabels[result.status] ?? { label: result.status, color: '#94a3b8' };
                        return (
                          <div key={result.id} style={{ background: result.isCritical ? '#fef2f2' : '#f8fafc', border: `1px solid ${result.isCritical ? '#fca5a5' : '#e2e8f0'}`, borderRadius: 8, padding: '0.75rem', marginBottom: '0.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                {result.isCritical && <span style={{ color: '#dc2626', fontWeight: 700, fontSize: '0.85rem' }}>⚠️ حرجة</span>}
                                <span style={{ background: rStatus.color + '15', color: rStatus.color, borderRadius: 5, padding: '2px 8px', fontSize: '0.75rem', fontWeight: 700 }}>{rStatus.label}</span>
                                {result.verifiedAt && <span style={{ color: '#10b981', fontSize: '0.75rem' }}>✓ موثَّق</span>}
                                {result.isReleasedToPatient && <span style={{ color: '#6366f1', fontSize: '0.75rem' }}>📤 متاح للمريض</span>}
                              </div>
                              <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{new Date(result.issuedAt).toLocaleString('ar-SA')}</span>
                            </div>
                            {result.sourceOrganization && <p style={{ margin: '0 0 0.3rem', fontSize: '0.8rem', color: '#6b7280' }}>المصدر: {result.sourceOrganization}</p>}
                            {result.narrativeFindings && <p style={{ margin: '0 0 0.3rem', fontSize: '0.85rem', color: '#334155' }}>النتائج: {result.narrativeFindings}</p>}
                            {result.impression && <p style={{ margin: '0 0 0.3rem', fontSize: '0.85rem', color: '#334155' }}>الانطباع: {result.impression}</p>}
                            {result.criticalNotes && <p style={{ margin: '0 0 0.3rem', fontSize: '0.85rem', color: '#dc2626', background: '#fef2f2', borderRadius: 4, padding: '0.3rem 0.5rem' }}>⚠️ {result.criticalNotes}</p>}
                            {result.correctionReason && <p style={{ margin: '0 0 0.3rem', fontSize: '0.75rem', color: '#6b7280', fontStyle: 'italic' }}>سبب التصحيح: {result.correctionReason}</p>}

                            {/* Result Action Buttons */}
                            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                              {!result.verifiedAt && (
                                <button onClick={() => handleVerifyResult(result.id, order.id)} style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 5, padding: '3px 8px', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'Tajawal, sans-serif' }}>
                                  ✓ تحقق
                                </button>
                              )}
                              {result.isCritical && !result.criticalAcknowledgedAt && (
                                acknowledgeResultId === result.id ? (
                                  <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                                    <input value={acknowledgeAction} onChange={e => setAcknowledgeAction(e.target.value)} placeholder="الإجراء المتخذ..." style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid #fca5a5', fontSize: '0.75rem', fontFamily: 'Tajawal, sans-serif' }} />
                                    <button onClick={() => handleAcknowledgeCritical(result.id, order.id)} style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 6px', fontSize: '0.75rem', cursor: 'pointer' }}>إقرار</button>
                                    <button onClick={() => { setAcknowledgeResultId(null); setAcknowledgeAction(''); }} style={{ background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: 4, padding: '3px 6px', fontSize: '0.75rem', cursor: 'pointer' }}>✕</button>
                                  </div>
                                ) : (
                                  <button onClick={() => setAcknowledgeResultId(result.id)} style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 5, padding: '3px 8px', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'Tajawal, sans-serif' }}>
                                    ⚠️ إقرار بالحالة الحرجة
                                  </button>
                                )
                              )}
                              {!result.isReleasedToPatient ? (
                                <button onClick={() => handleRelease(result.id, order.id, true)} style={{ background: '#ede9fe', color: '#6d28d9', border: 'none', borderRadius: 5, padding: '3px 8px', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'Tajawal, sans-serif' }}>
                                  📤 نشر للمريض
                                </button>
                              ) : (
                                <button onClick={() => handleRelease(result.id, order.id, false)} style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 5, padding: '3px 8px', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'Tajawal, sans-serif' }}>
                                  🔒 سحب النشر
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ClinicalOrdersPanel;

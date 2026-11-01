import { useEffect, useState, useCallback } from 'react';
import {
  type InventoryPurchaseOrderRecord,
  type InventorySupplierRecord,
  type InventoryLocationRecord,
  type InventoryProductRecord,
  PURCHASE_ORDER_STATUS_LABELS,
  inventoryApi,
} from './inventory-api';
import { GoodsReceiptModal } from './GoodsReceiptModal';

interface Props {
  clinicId: string;
  csrfToken: string;
  suppliers: InventorySupplierRecord[];
  locations: InventoryLocationRecord[];
  products: InventoryProductRecord[];
  canCreate: boolean;
  canApprove: boolean;
  canReceive: boolean;
  onAuthError: (error: unknown) => void;
  onSuccess: (message: string) => void;
}

interface NewPOLine {
  productId: string;
  orderedQuantity: string;
  unitCost: string;
  taxRate: string;
}

export function PurchaseOrderManagementPanel({
  clinicId,
  csrfToken,
  suppliers,
  locations,
  products,
  canCreate,
  canApprove,
  canReceive,
  onAuthError,
  onSuccess,
}: Props) {
  const [orders, setOrders] = useState<InventoryPurchaseOrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<InventoryPurchaseOrderRecord | null>(null);
  const [receivingOrder, setReceivingOrder] = useState<InventoryPurchaseOrderRecord | null>(null);

  // Rejection / Cancellation prompt
  const [actionReasonModal, setActionReasonModal] = useState<{
    type: 'REJECT' | 'CANCEL';
    order: InventoryPurchaseOrderRecord;
  } | null>(null);
  const [actionReason, setActionReason] = useState('');

  // Create form state
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [currency, setCurrency] = useState('SAR');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<NewPOLine[]>([
    { productId: products[0]?.id || '', orderedQuantity: '1.0000', unitCost: '0.0000', taxRate: '0.1500' },
  ]);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const api = inventoryApi(clinicId);
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      params.set('limit', '50');

      const res = await api.listPurchaseOrders(params);
      setOrders(res.items || []);
    } catch (err) {
      onAuthError(err);
    } finally {
      setLoading(false);
    }
  }, [clinicId, statusFilter, onAuthError]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  function addLine() {
    setLines((prev) => [
      ...prev,
      { productId: products[0]?.id || '', orderedQuantity: '1.0000', unitCost: '0.0000', taxRate: '0.1500' },
    ]);
  }

  function removeLine(idx: number) {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateLine(idx: number, patch: Partial<NewPOLine>) {
    setLines((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }

  // Exact preview calculation
  let computedSubtotal = 0;
  let computedTax = 0;
  for (const line of lines) {
    const qty = parseFloat(line.orderedQuantity) || 0;
    const cost = parseFloat(line.unitCost) || 0;
    const tax = parseFloat(line.taxRate) || 0;
    const lineSubtotal = qty * cost;
    const lineTax = lineSubtotal * tax;
    computedSubtotal += lineSubtotal;
    computedTax += lineTax;
  }
  const computedTotal = computedSubtotal + computedTax;

  async function handleCreatePO(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSupplierId || !selectedLocationId) {
      setFormError('يرجى اختيار المورد وموقع التسليم');
      return;
    }
    if (lines.some((l) => !l.productId || parseFloat(l.orderedQuantity) <= 0)) {
      setFormError('يرجى التحقق من الأصناف والكميات المطلوبة');
      return;
    }

    setSubmitting(true);
    setFormError('');

    try {
      const api = inventoryApi(clinicId);
      await api.createPurchaseOrder(
        {
          supplierId: selectedSupplierId,
          destinationLocationId: selectedLocationId,
          currency,
          expectedDeliveryDate: expectedDeliveryDate || undefined,
          notes: notes.trim() || undefined,
          lines: lines.map((l) => ({
            productId: l.productId,
            orderedQuantity: l.orderedQuantity,
            unitCost: l.unitCost,
            taxRate: l.taxRate,
          })),
        },
        csrfToken,
      );

      setCreateModalOpen(false);
      onSuccess('تم إنشاء أمر الشراء كمسودة بنجاح');
      loadOrders();
    } catch (err: any) {
      setFormError(err?.message || 'تعذر إنشاء أمر الشراء');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitForApproval(po: InventoryPurchaseOrderRecord) {
    try {
      const api = inventoryApi(clinicId);
      await api.submitPurchaseOrder(po.id, po.version, csrfToken);
      onSuccess(`تم تقديم أمر الشراء ${po.orderNumber} للاعتماد`);
      setSelectedOrder(null);
      loadOrders();
    } catch (err: any) {
      alert(err?.message || 'تعذر تقديم أمر الشراء');
    }
  }

  async function handleApprove(po: InventoryPurchaseOrderRecord) {
    try {
      const api = inventoryApi(clinicId);
      await api.approvePurchaseOrder(po.id, po.version, undefined, csrfToken);
      onSuccess(`تم اعتماد أمر الشراء ${po.orderNumber} بنجاح`);
      setSelectedOrder(null);
      loadOrders();
    } catch (err: any) {
      alert(err?.message || 'تعذر اعتماد أمر الشراء');
    }
  }

  async function handleExecuteReasonAction() {
    if (!actionReasonModal) return;
    const { type, order } = actionReasonModal;
    if (!actionReason.trim()) {
      alert('يرجى كتابة السبب');
      return;
    }

    try {
      const api = inventoryApi(clinicId);
      if (type === 'REJECT') {
        await api.rejectPurchaseOrder(order.id, order.version, actionReason.trim(), csrfToken);
        onSuccess(`تم رفض أمر الشراء ${order.orderNumber}`);
      } else {
        await api.cancelPurchaseOrder(order.id, order.version, actionReason.trim(), csrfToken);
        onSuccess(`تم إلغاء أمر الشراء ${order.orderNumber}`);
      }
      setActionReasonModal(null);
      setActionReason('');
      setSelectedOrder(null);
      loadOrders();
    } catch (err: any) {
      alert(err?.message || 'تعذر تنفيذ الإجراء');
    }
  }

  const filteredOrders = orders.filter((o) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      o.orderNumber.toLowerCase().includes(q) ||
      (o.supplier?.nameAr && o.supplier.nameAr.toLowerCase().includes(q))
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Filters and New PO button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flex: 1 }}>
          <input
            type="search"
            placeholder="بحث برقم أمر الشراء أو اسم المورد..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ minWidth: '240px', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
          >
            <option value="">جميع الحالات</option>
            <option value="DRAFT">مسودة</option>
            <option value="SUBMITTED">بانتظار الاعتماد</option>
            <option value="APPROVED">معتمد</option>
            <option value="PARTIALLY_RECEIVED">مستلم جزئياً</option>
            <option value="RECEIVED">مستلم بالكامل</option>
            <option value="CANCELLED">ملغى</option>
            <option value="REJECTED">مرفوض</option>
          </select>
        </div>

        {canCreate && (
          <button
            type="button"
            className="inventory-btn inventory-btn-primary"
            onClick={() => {
              setSelectedSupplierId(suppliers[0]?.id || '');
              setSelectedLocationId(locations[0]?.id || '');
              setExpectedDeliveryDate('');
              setNotes('');
              setLines([
                { productId: products[0]?.id || '', orderedQuantity: '1.0000', unitCost: '0.0000', taxRate: '0.1500' },
              ]);
              setFormError('');
              setCreateModalOpen(true);
            }}
          >
            + إنشاء أمر شراء جديد
          </button>
        )}
      </div>

      {/* Orders List Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>جارٍ تحميل أوامر الشراء...</div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.9rem' }}>
            <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <tr>
                <th style={{ padding: '0.75rem 1rem' }}>رقم أمر الشراء</th>
                <th style={{ padding: '0.75rem 1rem' }}>المورد</th>
                <th style={{ padding: '0.75rem 1rem' }}>موقع التسليم</th>
                <th style={{ padding: '0.75rem 1rem' }}>الحالة</th>
                <th style={{ padding: '0.75rem 1rem' }}>تاريخ الطلب</th>
                <th style={{ padding: '0.75rem 1rem' }}>التسليم المتوقع</th>
                <th style={{ padding: '0.75rem 1rem' }}>الإجمالي</th>
                <th style={{ padding: '0.75rem 1rem' }}>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: '#6b7280' }}>
                    لا توجد أوامر شراء مطابقة.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((po) => {
                const statusColor =
                  po.status === 'APPROVED' || po.status === 'RECEIVED'
                    ? '#166534'
                    : po.status === 'SUBMITTED' || po.status === 'PARTIALLY_RECEIVED'
                    ? '#92400e'
                    : po.status === 'REJECTED' || po.status === 'CANCELLED'
                    ? '#991b1b'
                    : '#4b5563';
                const statusBg =
                  po.status === 'APPROVED' || po.status === 'RECEIVED'
                    ? '#dcfce7'
                    : po.status === 'SUBMITTED' || po.status === 'PARTIALLY_RECEIVED'
                    ? '#fef3c7'
                    : po.status === 'REJECTED' || po.status === 'CANCELLED'
                    ? '#fee2e2'
                    : '#f3f4f6';

                return (
                  <tr key={po.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600, fontFamily: 'monospace' }}>
                      {po.orderNumber}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 600 }}>{po.supplier?.nameAr || '—'}</div>
                      <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{po.supplier?.code}</div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>{po.destinationLocation?.nameAr || '—'}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span
                        style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          background: statusBg,
                          color: statusColor,
                        }}
                      >
                        {PURCHASE_ORDER_STATUS_LABELS[po.status]}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>{po.orderDate ? po.orderDate.slice(0, 10) : '—'}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>{po.expectedDeliveryDate || '—'}</td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                      {parseFloat(po.totalAmount).toFixed(2)} {po.currency}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <button
                        type="button"
                        onClick={() => setSelectedOrder(po)}
                        style={{
                          background: 'none',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          padding: '0.25rem 0.5rem',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                        }}
                      >
                        عرض التفاصيل
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
            </tbody>
          </table>
        </div>
      )}

      {/* PO Details Modal */}
      {selectedOrder && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '8px',
              padding: '1.5rem',
              width: '740px',
              maxWidth: '94vw',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, color: '#111827' }}>أمر الشراء: {selectedOrder.orderNumber}</h3>
                <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  المورد: {selectedOrder.supplier?.nameAr} ({selectedOrder.supplier?.code}) | الموقع:{' '}
                  {selectedOrder.destinationLocation?.nameAr}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#6b7280' }}
              >
                &times;
              </button>
            </div>

            {/* Lines Table */}
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '6px', overflow: 'hidden', marginBottom: '1rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.85rem' }}>
                <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <tr>
                    <th style={{ padding: '0.5rem 0.75rem' }}>#</th>
                    <th style={{ padding: '0.5rem 0.75rem' }}>الصنف</th>
                    <th style={{ padding: '0.5rem 0.75rem' }}>الكمية المطلوبة</th>
                    <th style={{ padding: '0.5rem 0.75rem' }}>المستلمة</th>
                    <th style={{ padding: '0.5rem 0.75rem' }}>سعر الوحدة</th>
                    <th style={{ padding: '0.5rem 0.75rem' }}>الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedOrder.lines || []).map((l) => (
                    <tr key={l.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '0.5rem 0.75rem' }}>{l.lineNumber}</td>
                      <td style={{ padding: '0.5rem 0.75rem' }}>
                        <div style={{ fontWeight: 600 }}>{l.product?.nameAr}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{l.product?.sku}</div>
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem' }}>{parseFloat(l.orderedQuantity).toFixed(2)}</td>
                      <td style={{ padding: '0.5rem 0.75rem', color: parseFloat(l.receivedQuantity) > 0 ? '#166534' : '#6b7280' }}>
                        {parseFloat(l.receivedQuantity).toFixed(2)}
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem' }}>{parseFloat(l.unitCost).toFixed(2)}</td>
                      <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>
                        {parseFloat(l.totalCost).toFixed(2)} {selectedOrder.currency}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary figures */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.25rem' }}>
              <div style={{ width: '240px', background: '#f9fafb', padding: '0.75rem', borderRadius: '6px', fontSize: '0.9rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <span>المجموع الفرعي:</span>
                  <strong>{parseFloat(selectedOrder.subtotal).toFixed(2)} {selectedOrder.currency}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <span>ضريبة القيمة المضافة:</span>
                  <strong>{parseFloat(selectedOrder.taxAmount).toFixed(2)} {selectedOrder.currency}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #d1d5db', paddingTop: '0.25rem', color: '#1e40af' }}>
                  <span>المبلغ الإجمالي:</span>
                  <strong>{parseFloat(selectedOrder.totalAmount).toFixed(2)} {selectedOrder.currency}</strong>
                </div>
              </div>
            </div>

            {/* Workflow Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
              {selectedOrder.status === 'DRAFT' && canCreate && (
                <button
                  type="button"
                  onClick={() => handleSubmitForApproval(selectedOrder)}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  تقديم للاعتماد
                </button>
              )}

              {selectedOrder.status === 'SUBMITTED' && canApprove && (
                <>
                  <button
                    type="button"
                    onClick={() => handleApprove(selectedOrder)}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#16a34a',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    اعتماد أمر الشراء
                  </button>
                  <button
                    type="button"
                    onClick={() => setActionReasonModal({ type: 'REJECT', order: selectedOrder })}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#dc2626',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    رفض أمر الشراء
                  </button>
                </>
              )}

              {(selectedOrder.status === 'APPROVED' || selectedOrder.status === 'PARTIALLY_RECEIVED') && (
                <>
                  {canReceive && (
                    <button
                      type="button"
                      onClick={() => {
                        setReceivingOrder(selectedOrder);
                        setSelectedOrder(null);
                      }}
                      style={{
                        padding: '0.5rem 1rem',
                        background: '#0d9488',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      استلام بضاعة (سند استلام)
                    </button>
                  )}
                  {canApprove && (
                    <button
                      type="button"
                      onClick={() => setActionReasonModal({ type: 'CANCEL', order: selectedOrder })}
                      style={{
                        padding: '0.5rem 1rem',
                        background: '#dc2626',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      إلغاء أمر الشراء
                    </button>
                  )}
                </>
              )}

              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                style={{ padding: '0.5rem 1rem', border: '1px solid #d1d5db', background: '#f9fafb', borderRadius: '4px', cursor: 'pointer' }}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Reason Modal (Reject / Cancel) */}
      {actionReasonModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
        >
          <div style={{ background: '#ffffff', borderRadius: '8px', padding: '1.5rem', width: '420px', maxWidth: '90vw' }}>
            <h3 style={{ margin: '0 0 1rem', color: '#111827' }}>
              {actionReasonModal.type === 'REJECT' ? 'سبب رفض أمر الشراء' : 'سبب إلغاء أمر الشراء'}
            </h3>
            <textarea
              rows={3}
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              placeholder="اكتب السبب الإداري أو المالي..."
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px', marginBottom: '1rem' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => {
                  setActionReasonModal(null);
                  setActionReason('');
                }}
                style={{ padding: '0.5rem 1rem', border: '1px solid #d1d5db', background: '#f9fafb', borderRadius: '4px', cursor: 'pointer' }}
              >
                تراجع
              </button>
              <button
                type="button"
                onClick={handleExecuteReasonAction}
                style={{
                  padding: '0.5rem 1rem',
                  border: 'none',
                  background: '#dc2626',
                  color: '#ffffff',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                تأكيد
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Goods Receipt Modal */}
      {receivingOrder && (
        <GoodsReceiptModal
          clinicId={clinicId}
          csrfToken={csrfToken}
          po={receivingOrder}
          locations={locations}
          onClose={() => setReceivingOrder(null)}
          onSuccess={(msg) => {
            onSuccess(msg);
            loadOrders();
          }}
        />
      )}

      {/* Create PO Modal */}
      {createModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '8px',
              padding: '1.5rem',
              width: '820px',
              maxWidth: '94vw',
              maxHeight: '92vh',
              overflowY: 'auto',
              boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            }}
          >
            <h3 style={{ margin: '0 0 1rem', color: '#111827' }}>إنشاء أمر شراء توريدات جديد</h3>

            {formError && (
              <div style={{ background: '#fee2e2', color: '#991b1b', padding: '0.6rem', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleCreatePO}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    المورد *
                  </label>
                  <select
                    required
                    value={selectedSupplierId}
                    onChange={(e) => setSelectedSupplierId(e.target.value)}
                    style={{ width: '100%', padding: '0.45rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                  >
                    <option value="">اختر المورد...</option>
                    {suppliers
                      .filter((s) => s.status === 'ACTIVE')
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nameAr} ({s.code})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    موقع التسليم في العيادة *
                  </label>
                  <select
                    required
                    value={selectedLocationId}
                    onChange={(e) => setSelectedLocationId(e.target.value)}
                    style={{ width: '100%', padding: '0.45rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                  >
                    <option value="">اختر الموقع...</option>
                    {locations
                      .filter((l) => l.isActive)
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.nameAr} ({l.code})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    العملة *
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    style={{ width: '100%', padding: '0.45rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                  >
                    <option value="SAR">ريال سعودي (SAR)</option>
                    <option value="YER">ريال يمني (YER)</option>
                    <option value="USD">دولار أمريكي (USD)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    تاريخ التسليم المتوقع
                  </label>
                  <input
                    type="date"
                    value={expectedDeliveryDate}
                    onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                    style={{ width: '100%', padding: '0.45rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                  />
                </div>
              </div>

              {/* Lines editor */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h4 style={{ margin: 0, fontSize: '0.95rem' }}>بنود أمر الشراء:</h4>
                <button
                  type="button"
                  onClick={addLine}
                  style={{
                    background: '#f3f4f6',
                    border: '1px solid #d1d5db',
                    padding: '0.25rem 0.6rem',
                    borderRadius: '4px',
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                  }}
                >
                  + إضافة بند
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                {lines.map((line, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1fr 1fr 1fr auto',
                      gap: '0.5rem',
                      alignItems: 'center',
                      background: '#f9fafb',
                      padding: '0.5rem',
                      borderRadius: '6px',
                    }}
                  >
                    <div>
                      <select
                        value={line.productId}
                        onChange={(e) => updateLine(idx, { productId: e.target.value })}
                        style={{ width: '100%', padding: '0.4rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.85rem' }}
                      >
                        {products
                          .filter((p) => p.isActive)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nameAr} ({p.sku})
                            </option>
                          ))}
                      </select>
                    </div>

                    <div>
                      <input
                        type="number"
                        step="0.0001"
                        min="0.0001"
                        placeholder="الكمية"
                        value={line.orderedQuantity}
                        onChange={(e) => updateLine(idx, { orderedQuantity: e.target.value })}
                        style={{ width: '100%', padding: '0.4rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.85rem' }}
                      />
                    </div>

                    <div>
                      <input
                        type="number"
                        step="0.0001"
                        min="0"
                        placeholder="سعر الوحدة"
                        value={line.unitCost}
                        onChange={(e) => updateLine(idx, { unitCost: e.target.value })}
                        style={{ width: '100%', padding: '0.4rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.85rem' }}
                      />
                    </div>

                    <div>
                      <select
                        value={line.taxRate}
                        onChange={(e) => updateLine(idx, { taxRate: e.target.value })}
                        style={{ width: '100%', padding: '0.4rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.85rem' }}
                      >
                        <option value="0.1500">15% ضريبة</option>
                        <option value="0.0000">معفى (0%)</option>
                        <option value="0.0500">5% ضريبة</option>
                      </select>
                    </div>

                    <div>
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        disabled={lines.length <= 1}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: lines.length <= 1 ? '#d1d5db' : '#dc2626',
                          fontSize: '1.2rem',
                          cursor: lines.length <= 1 ? 'not-allowed' : 'pointer',
                        }}
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Running total preview */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.9rem', color: '#166534' }}>
                  المجموع الفرعي: <strong>{computedSubtotal.toFixed(2)}</strong> | الضريبة: <strong>{computedTax.toFixed(2)}</strong>
                </span>
                <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#15803d' }}>
                  الإجمالي النهائي: {computedTotal.toFixed(2)} {currency}
                </span>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  ملاحظات أمر الشراء
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="شروط التسليم والدفع..."
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  style={{ padding: '0.5rem 1rem', border: '1px solid #d1d5db', background: '#f9fafb', borderRadius: '4px', cursor: 'pointer' }}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: '0.5rem 1.25rem',
                    border: 'none',
                    background: '#2563eb',
                    color: '#ffffff',
                    borderRadius: '4px',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {submitting ? 'جارٍ الحفظ...' : 'حفظ كمسودة أمر شراء'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

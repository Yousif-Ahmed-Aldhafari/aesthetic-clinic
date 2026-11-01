import { useState } from 'react';
import {
  type InventoryPurchaseOrderRecord,
  type InventoryLocationRecord,
  type GoodsReceiptDisposition,
  inventoryApi,
} from './inventory-api';

interface Props {
  clinicId: string;
  csrfToken: string;
  po: InventoryPurchaseOrderRecord;
  locations: InventoryLocationRecord[];
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

interface ReceiptLineInput {
  purchaseOrderLineId: string;
  receivedQuantity: string;
  rejectedQuantity: string;
  rejectionReason: string;
  disposition: GoodsReceiptDisposition;
  batchNumber: string;
  expirationDate: string;
}

export function GoodsReceiptModal({
  clinicId,
  csrfToken,
  po,
  locations,
  onClose,
  onSuccess,
}: Props) {
  const [destinationLocationId, setDestinationLocationId] = useState(
    po.destinationLocationId || (locations[0]?.id ?? ''),
  );
  const [deliveryNoteNumber, setDeliveryNoteNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Initialize receipt lines based on PO lines
  const [lineInputs, setLineInputs] = useState<ReceiptLineInput[]>(() => {
    return (po.lines || []).map((l) => {
      const ordered = parseFloat(l.orderedQuantity) || 0;
      const already = parseFloat(l.receivedQuantity) || 0;
      const remaining = Math.max(0, ordered - already);
      return {
        purchaseOrderLineId: l.id,
        receivedQuantity: remaining > 0 ? remaining.toFixed(4) : '0.0000',
        rejectedQuantity: '0.0000',
        rejectionReason: '',
        disposition: 'ACCEPTED' as GoodsReceiptDisposition,
        batchNumber: '',
        expirationDate: '',
      };
    });
  });

  function updateLine(index: number, patch: Partial<ReceiptLineInput>) {
    setLineInputs((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');

    // Filter lines where receivedQuantity > 0 or rejectedQuantity > 0
    const activeLines = lineInputs.filter((l) => {
      const recv = parseFloat(l.receivedQuantity) || 0;
      const rej = parseFloat(l.rejectedQuantity) || 0;
      return recv > 0 || rej > 0;
    });

    if (activeLines.length === 0) {
      setErrorMsg('يجب إدخال كمية مستلمة أو مرفوضة لبند واحد على الأقل');
      return;
    }

    // Validate batch tracking
    for (const l of activeLines) {
      const poLine = po.lines?.find((pl) => pl.id === l.purchaseOrderLineId);
      if (poLine?.product?.requiresBatchTracking) {
        if (!l.batchNumber.trim()) {
          setErrorMsg(`رقم التشغيلة مطلوب للمنتج تتبع التشغيلات: ${poLine.product.nameAr}`);
          return;
        }
        if (!l.expirationDate.trim()) {
          setErrorMsg(`تاريخ الصلاحية مطلوب للمنتج تتبع التشغيلات: ${poLine.product.nameAr}`);
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const api = inventoryApi(clinicId);
      await api.receiveGoods(
        {
          purchaseOrderId: po.id,
          destinationLocationId,
          deliveryNoteNumber: deliveryNoteNumber.trim() || undefined,
          notes: notes.trim() || undefined,
          lines: activeLines.map((l) => ({
            purchaseOrderLineId: l.purchaseOrderLineId,
            receivedQuantity: l.receivedQuantity,
            rejectedQuantity: parseFloat(l.rejectedQuantity) > 0 ? l.rejectedQuantity : undefined,
            rejectionReason: l.rejectionReason.trim() || undefined,
            disposition: l.disposition,
            batchNumber: l.batchNumber.trim() || undefined,
            expirationDate: l.expirationDate.trim() || undefined,
          })),
        },
        csrfToken,
      );

      onSuccess(`تم استلام البضاعة بنجاح لأمر الشراء ${po.orderNumber}`);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'تعذر تسجيل استلام البضاعة');
    } finally {
      setSubmitting(false);
    }
  }

  return (
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
          width: '780px',
          maxWidth: '94vw',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, color: '#111827' }}>
            استلام بضاعة لأمر الشراء: {po.orderNumber}
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#6b7280' }}
          >
            &times;
          </button>
        </div>

        {errorMsg && (
          <div style={{ background: '#fee2e2', color: '#991b1b', padding: '0.6rem', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.85rem' }}>
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Header metadata */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem', background: '#f9fafb', padding: '0.75rem', borderRadius: '6px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                موقع الاستلام في العيادة *
              </label>
              <select
                value={destinationLocationId}
                onChange={(e) => setDestinationLocationId(e.target.value)}
                style={{ width: '100%', padding: '0.45rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
              >
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.nameAr} ({loc.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                رقم سند التسليم من المورد (إشعار الشحن)
              </label>
              <input
                type="text"
                value={deliveryNoteNumber}
                onChange={(e) => setDeliveryNoteNumber(e.target.value)}
                placeholder="مثلاً: DN-892147"
                style={{ width: '100%', padding: '0.45rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
              />
            </div>
          </div>

          {/* Line items receiving table */}
          <h4 style={{ margin: '0.75rem 0 0.5rem', fontSize: '0.95rem', color: '#374151' }}>
            بنود التوريد المستلمة:
          </h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
            {(po.lines || []).map((line, idx) => {
              const input = lineInputs[idx];
              if (!input) return null;
              const ordered = parseFloat(line.orderedQuantity) || 0;
              const already = parseFloat(line.receivedQuantity) || 0;
              const remaining = Math.max(0, ordered - already);
              const isBatchTracked = line.product?.requiresBatchTracking;

              return (
                <div
                  key={line.id}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    padding: '0.75rem',
                    background: '#ffffff',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <div>
                      <strong style={{ color: '#111827' }}>{line.product?.nameAr}</strong>
                      <span style={{ fontSize: '0.8rem', color: '#6b7280', marginRight: '0.5rem' }}>
                        (رمز: {line.product?.sku})
                      </span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#4b5563' }}>
                      مطلوب: <strong>{ordered}</strong> | مستلم سابقاً: <strong>{already}</strong> | متبقي: <strong style={{ color: '#2563eb' }}>{remaining}</strong>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: isBatchTracked ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr', gap: '0.5rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#4b5563' }}>
                        الكمية المقبولة المستلمة
                      </label>
                      <input
                        type="number"
                        step="0.0001"
                        min="0"
                        value={input.receivedQuantity}
                        onChange={(e) => updateLine(idx, { receivedQuantity: e.target.value })}
                        style={{ width: '100%', padding: '0.35rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#4b5563' }}>
                        حالة الاستلام
                      </label>
                      <select
                        value={input.disposition}
                        onChange={(e) => updateLine(idx, { disposition: e.target.value as GoodsReceiptDisposition })}
                        style={{ width: '100%', padding: '0.35rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                      >
                        <option value="ACCEPTED">مقبول (إضافة للمخزون)</option>
                        <option value="QUARANTINED">حجر صحي / فحص</option>
                        <option value="REJECTED">مرفوض</option>
                      </select>
                    </div>

                    {isBatchTracked && (
                      <>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#dc2626' }}>
                            رقم التشغيلة (Batch) *
                          </label>
                          <input
                            type="text"
                            required
                            value={input.batchNumber}
                            onChange={(e) => updateLine(idx, { batchNumber: e.target.value.toUpperCase() })}
                            placeholder="LOT-123456"
                            style={{ width: '100%', padding: '0.35rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#dc2626' }}>
                            تاريخ الصلاحية (Expiry) *
                          </label>
                          <input
                            type="date"
                            required
                            value={input.expirationDate}
                            onChange={(e) => updateLine(idx, { expirationDate: e.target.value })}
                            style={{ width: '100%', padding: '0.35rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              ملاحظات الاستلام
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="حالة الشحنة والتغليف وسلامة درجة الحرارة..."
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={onClose}
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
                background: '#16a34a',
                color: '#ffffff',
                borderRadius: '4px',
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'جارٍ قيد الاستلام...' : 'تأكيد استلام البضاعة'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

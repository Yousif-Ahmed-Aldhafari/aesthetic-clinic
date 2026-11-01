import { useState } from 'react';
import {
  type InventoryProductRecord,
  type InventoryLocationRecord,
  type InventoryBalanceRecord,
  type InventoryReasonCode,
  inventoryApi,
} from './inventory-api';

interface Props {
  clinicId: string;
  csrfToken: string;
  products: InventoryProductRecord[];
  locations: InventoryLocationRecord[];
  balances: InventoryBalanceRecord[];
  onClose: () => void;
  onSuccess: (message: string) => void;
}

type OperationTab = 'RECEIPT' | 'ISSUE' | 'TRANSFER' | 'ADJUST' | 'OPENING';

export function StockOperationsModal({
  clinicId,
  csrfToken,
  products,
  locations,
  balances,
  onClose,
  onSuccess,
}: Props) {
  const [tab, setTab] = useState<OperationTab>('RECEIPT');
  const [productId, setProductId] = useState(products[0]?.id || '');
  const [locationId, setLocationId] = useState(locations[0]?.id || '');
  const [targetLocationId, setTargetLocationId] = useState(locations[1]?.id || '');
  const [quantity, setQuantity] = useState('');
  const [reasonCode, setReasonCode] = useState<InventoryReasonCode>('PURCHASE_RECEIPT');
  const [reasonExplanation, setReasonExplanation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const selectedProduct = products.find((p) => p.id === productId);
  const currentBalanceRecord = balances.find(
    (b) => b.productId === productId && b.locationId === locationId,
  );
  const currentOnHand = currentBalanceRecord ? currentBalanceRecord.onHandQuantity : '0';

  const isBatchRestricted =
    tab === 'ISSUE' && selectedProduct?.requiresBatchTracking && reasonCode === 'CLINICAL_USE';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!productId || !locationId) {
      setError('يرجى تحديد الصنف والموقع.');
      return;
    }

    if (isBatchRestricted) {
      setError(
        'تنبيه تنظيمي: يتطلب هذا المنتج تتبع الدفعة وتاريخ الصلاحية للاستهلاك السريري (المرحلة 4 الخطوة 4.2). لا يمكن صرفه للاستخدام السريري المباشر بدون دفعة.',
      );
      return;
    }

    const api = inventoryApi(clinicId);
    setBusy(true);

    try {
      if (tab === 'OPENING') {
        await api.postOpeningBalance({ productId, locationId, quantity }, csrfToken);
        onSuccess('تم تسجيل الرصيد الافتتاحي بنجاح.');
      } else if (tab === 'RECEIPT') {
        await api.receiveStock(
          {
            productId,
            locationId,
            quantity,
            reasonCode: reasonCode === 'RETURN' ? 'RETURN' : 'PURCHASE_RECEIPT',
            reasonExplanation: reasonExplanation.trim() || undefined,
          },
          csrfToken,
        );
        onSuccess('تم توريد الكمية إلى المخزون بنجاح.');
      } else if (tab === 'ISSUE') {
        await api.issueStock(
          {
            productId,
            locationId,
            quantity,
            reasonCode,
            reasonExplanation: reasonExplanation.trim() || undefined,
          },
          csrfToken,
        );
        onSuccess('تم صرف الكمية من المخزون بنجاح.');
      } else if (tab === 'TRANSFER') {
        if (locationId === targetLocationId) {
          setError('لا يمكن التحويل إلى نفس الموقع المصدر.');
          setBusy(false);
          return;
        }
        await api.transferStock(
          {
            productId,
            sourceLocationId: locationId,
            targetLocationId,
            quantity,
            reasonExplanation: reasonExplanation.trim() || undefined,
          },
          csrfToken,
        );
        onSuccess('تم التحويل بين المواقع بنجاح.');
      } else if (tab === 'ADJUST') {
        if (!reasonExplanation.trim() || reasonExplanation.trim().length < 3) {
          setError('يرجى كتابة سبب التسوية (3 أحرف على الأقل).');
          setBusy(false);
          return;
        }
        await api.adjustStock(
          {
            productId,
            locationId,
            targetQuantity: quantity,
            reasonCode: ['EXPIRED', 'DAMAGED'].includes(reasonCode)
              ? reasonCode
              : 'DISCREPANCY_CORRECTION',
            reasonExplanation: reasonExplanation.trim(),
          },
          csrfToken,
        );
        onSuccess('تمت تسوية وتحديث الرصيد الفعلي بنجاح.');
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || 'تعذر إتمام العملية المخزنية.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-header">
          <h3>عمليات المخزون وحركة الأصناف</h3>
          <button className="modal-close-btn" onClick={onClose} disabled={busy}>
            &times;
          </button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', padding: '0.5rem 1.5rem', gap: '0.5rem' }}>
          <button
            type="button"
            className={`inventory-btn ${tab === 'RECEIPT' ? 'inventory-btn-primary' : 'inventory-btn-secondary'}`}
            onClick={() => { setTab('RECEIPT'); setReasonCode('PURCHASE_RECEIPT'); setError(''); }}
          >
            توريد وارد
          </button>
          <button
            type="button"
            className={`inventory-btn ${tab === 'ISSUE' ? 'inventory-btn-primary' : 'inventory-btn-secondary'}`}
            onClick={() => { setTab('ISSUE'); setReasonCode('CLINICAL_USE'); setError(''); }}
          >
            صرف مخزون
          </button>
          <button
            type="button"
            className={`inventory-btn ${tab === 'TRANSFER' ? 'inventory-btn-primary' : 'inventory-btn-secondary'}`}
            onClick={() => { setTab('TRANSFER'); setReasonCode('INTERNAL_TRANSFER'); setError(''); }}
          >
            نقل بين المواقع
          </button>
          <button
            type="button"
            className={`inventory-btn ${tab === 'ADJUST' ? 'inventory-btn-primary' : 'inventory-btn-secondary'}`}
            onClick={() => { setTab('ADJUST'); setReasonCode('DISCREPANCY_CORRECTION'); setError(''); }}
          >
            تسوية وجرد
          </button>
          <button
            type="button"
            className={`inventory-btn ${tab === 'OPENING' ? 'inventory-btn-primary' : 'inventory-btn-secondary'}`}
            onClick={() => { setTab('OPENING'); setReasonCode('INITIAL_COUNT'); setError(''); }}
          >
            رصيد افتتاحي
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="form-error-banner">{error}</div>}

            <div className="form-group">
              <label>الصنف الطبي / المنتج *</label>
              <select value={productId} onChange={(e) => setProductId(e.target.value)} required>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nameAr} ({p.sku}) — {p.requiresBatchTracking ? '[يتطلب تتبع دفعة]' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>{tab === 'TRANSFER' ? 'الموقع المصدر *' : 'موقع التخزين *'}</label>
              <select value={locationId} onChange={(e) => setLocationId(e.target.value)} required>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nameAr} ({l.code})
                  </option>
                ))}
              </select>
              <span className="form-help">
                الرصيد المتوفر حاليًا في هذا الموقع: <strong>{currentOnHand}</strong>{' '}
                {selectedProduct?.unit || ''}
              </span>
            </div>

            {tab === 'TRANSFER' && (
              <div className="form-group">
                <label>الموقع الوجهة المحول إليه *</label>
                <select
                  value={targetLocationId}
                  onChange={(e) => setTargetLocationId(e.target.value)}
                  required
                >
                  {locations
                    .filter((l) => l.id !== locationId)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nameAr} ({l.code})
                      </option>
                    ))}
                </select>
              </div>
            )}

            <div className="form-group">
              <label>
                {tab === 'ADJUST'
                  ? 'الرصيد الفعلي بعد الجرد *'
                  : tab === 'OPENING'
                  ? 'الرصيد الافتتاحي الأولي *'
                  : 'الكمية المراد معالجتها *'}
              </label>
              <input
                type="text"
                placeholder="مثال: 10 أو 2.5000"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
              <span className="form-help">تقبل الكميات حتى 4 خانات عشرية بدقة عالية.</span>
            </div>

            {tab === 'RECEIPT' && (
              <div className="form-group">
                <label>سبب التوريد</label>
                <select
                  value={reasonCode}
                  onChange={(e) => setReasonCode(e.target.value as InventoryReasonCode)}
                >
                  <option value="PURCHASE_RECEIPT">شراء وتوريد جديد</option>
                  <option value="RETURN">مرتجع إلى المخزون</option>
                </select>
              </div>
            )}

            {tab === 'ISSUE' && (
              <div className="form-group">
                <label>سبب الصرف *</label>
                <select
                  value={reasonCode}
                  onChange={(e) => setReasonCode(e.target.value as InventoryReasonCode)}
                >
                  <option value="CLINICAL_USE">استهلاك سريري</option>
                  <option value="DAMAGED">تالف / كسر</option>
                  <option value="EXPIRED">انتهاء صلاحية</option>
                  <option value="DISCREPANCY_CORRECTION">تسوية فروقات</option>
                </select>
              </div>
            )}

            {tab === 'ADJUST' && (
              <div className="form-group">
                <label>سبب التسوية الجردية *</label>
                <select
                  value={reasonCode}
                  onChange={(e) => setReasonCode(e.target.value as InventoryReasonCode)}
                >
                  <option value="DISCREPANCY_CORRECTION">تصحيح فروقات الجرد</option>
                  <option value="DAMAGED">تسجيل تلفيات</option>
                  <option value="EXPIRED">تسجيل منتهي الصلاحية</option>
                </select>
              </div>
            )}

            {isBatchRestricted && (
              <div className="regulated-notice">
                ⚠️ <strong>تنبيه تنظيمي (Phase 4 Step 4.2):</strong> هذا الصنف مصنف كمنتج حقن/منظم يتطلب
                تتبع رقم التشغيلة (Batch/Lot) وتاريخ الانتهاء قبل الاستخدام السريري. لا يُسمح بالصرف
                السريري العام بدون تخصيص الدفعة. يمكنك صرفه كـ (تالف) أو (منتهي الصلاحية) فقط في هذه المرحلة.
              </div>
            )}

            <div className="form-group">
              <label>
                {tab === 'ADJUST' || (tab === 'ISSUE' && reasonCode !== 'CLINICAL_USE')
                  ? 'البيان التوضيحي والملاحظات (مطلوب) *'
                  : 'ملاحظات اختيارية'}
              </label>
              <textarea
                rows={2}
                placeholder="أدخل أية تفاصيل أو رقم إذن الصرف أو سبب الجرد..."
                value={reasonExplanation}
                onChange={(e) => setReasonExplanation(e.target.value)}
                required={tab === 'ADJUST' || (tab === 'ISSUE' && reasonCode !== 'CLINICAL_USE')}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="inventory-btn inventory-btn-secondary"
              onClick={onClose}
              disabled={busy}
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="inventory-btn inventory-btn-primary"
              disabled={busy || isBatchRestricted}
            >
              {busy ? 'جارٍ المعالجة...' : 'تأكيد العملية'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

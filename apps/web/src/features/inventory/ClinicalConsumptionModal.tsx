import { useState, useEffect, useCallback } from 'react';
import {
  type InventoryProductRecord,
  type InventoryLocationRecord,
  type InventoryBatchRecord,
  type InventoryClinicalConsumptionRecord,
  clinicalConsumptionStatusLabels,
  inventoryApi,
} from './inventory-api';

interface Props {
  clinicId: string;
  csrfToken: string;
  procedureExecutionId: string;
  procedureNameAr: string;
  patientName?: string;
  products: InventoryProductRecord[];
  locations: InventoryLocationRecord[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

export function ClinicalConsumptionModal({
  clinicId,
  csrfToken,
  procedureExecutionId,
  procedureNameAr,
  patientName,
  products,
  locations,
  isOpen,
  onClose,
  onSuccess,
}: Props) {
  const [consumptions, setConsumptions] = useState<InventoryClinicalConsumptionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form
  const [productId, setProductId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [quantity, setQuantity] = useState('1.0000');
  const [wasteQuantity, setWasteQuantity] = useState('0.0000');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  // Available batches for selected product
  const [availableBatches, setAvailableBatches] = useState<InventoryBatchRecord[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);

  // Voiding state
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidBusy, setVoidBusy] = useState(false);

  const fetchConsumptions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await inventoryApi(clinicId).getProcedureConsumptions(procedureExecutionId);
      setConsumptions(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل استهلاكات الإجراء');
    } finally {
      setLoading(false);
    }
  }, [clinicId, procedureExecutionId]);

  useEffect(() => {
    if (isOpen) {
      fetchConsumptions();
      if (products.length > 0 && !productId) {
        setProductId(products[0].id);
      }
      if (locations.length > 0 && !locationId) {
        setLocationId(locations[0].id);
      }
    }
  }, [isOpen, fetchConsumptions, products, locations, productId, locationId]);

  // Load batches when product changes
  useEffect(() => {
    if (!productId || !isOpen) return;
    setLoadingBatches(true);
    const q = new URLSearchParams({ productId, status: 'AVAILABLE' });
    inventoryApi(clinicId)
      .listBatches(q)
      .then((res) => {
        // Sort FEFO (First-Expired, First-Out)
        const validBatches = res.items.filter((b) => !b.isExpired && Number(b.totalOnHandQuantity) > 0);
        setAvailableBatches(validBatches);
        if (validBatches.length > 0) {
          setBatchId(validBatches[0].id);
        } else {
          setBatchId('');
        }
      })
      .catch(() => {
        setAvailableBatches([]);
        setBatchId('');
      })
      .finally(() => setLoadingBatches(false));
  }, [clinicId, productId, isOpen]);

  if (!isOpen) return null;

  async function handleRecord(e: React.FormEvent) {
    e.preventDefault();
    if (!productId || !batchId || !locationId || !quantity) {
      setError('يرجى تحديد المنتج، التشغيلة، الموقع، والكمية المستهلكة');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await inventoryApi(clinicId).recordClinicalConsumption(
        {
          procedureExecutionId,
          productId,
          batchId,
          locationId,
          quantity,
          wasteQuantity: wasteQuantity || '0.0000',
          notes: notes.trim() || undefined,
        },
        csrfToken,
      );
      onSuccess('تم تسجيل صرف واستهلاك التشغيلة للإجراء الطبي بنجاح');
      setQuantity('1.0000');
      setWasteQuantity('0.0000');
      setNotes('');
      fetchConsumptions();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'فشل تسجيل استهلاك المخزون');
    } finally {
      setBusy(false);
    }
  }

  async function handleVoid(consumptionId: string) {
    if (!voidReason.trim() || voidReason.trim().length < 3) {
      setError('يرجى ذكر سبب الإلغاء والاسترجاع (3 أحرف على الأقل)');
      return;
    }
    setVoidBusy(true);
    setError('');
    try {
      await inventoryApi(clinicId).voidClinicalConsumption(consumptionId, voidReason.trim(), csrfToken);
      onSuccess('تم إلغاء الاستهلاك واسترجاع الرصيد للمخزون بنجاح');
      setVoidingId(null);
      setVoidReason('');
      fetchConsumptions();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'فشل إلغاء الاستهلاك');
    } finally {
      setVoidBusy(false);
    }
  }

  const selectedProduct = products.find((p) => p.id === productId);
  const fefoBatch = availableBatches[0];

  return (
    <div className="modal-backdrop" onClick={onClose} dir="rtl">
      <div className="modal-content modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>صرف واستهلاك المواد السريرية (Clinical Consumption)</h3>
            <p className="text-muted text-sm">
              الإجراء: <strong>{procedureNameAr}</strong>
              {patientName && ` | المريض: ${patientName}`}
            </p>
          </div>
          <button type="button" className="close-btn" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="alert alert-danger" role="alert">{error}</div>}

          {/* Record Form */}
          <form onSubmit={handleRecord} className="consumption-form">
            <h4 className="form-subheading">تسجيل مادة مستهلكة في الجلسة</h4>
            <div className="form-row">
              <div className="form-group flex-2">
                <label>المنتج *</label>
                <select
                  className="form-control"
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  required
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nameAr} ({p.sku}) - {p.unit}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group flex-2">
                <label>التشغيلة / الدفعة (Lot) *</label>
                <select
                  className="form-control"
                  value={batchId}
                  onChange={(e) => setBatchId(e.target.value)}
                  disabled={loadingBatches || availableBatches.length === 0}
                  required
                >
                  {availableBatches.length === 0 ? (
                    <option value="">
                      {loadingBatches ? 'جاري التحقق...' : 'لا توجد تشغيلات صالحة ومتاحة'}
                    </option>
                  ) : (
                    availableBatches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.batchNumber} (تنتهي: {b.expirationDate.slice(0, 10)} | متاح: {b.totalOnHandQuantity})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="form-group flex-1">
                <label>موقع الخصم *</label>
                <select
                  className="form-control"
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  required
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.nameAr}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* FEFO Recommendation Banner */}
            {fefoBatch && (
              <div className="alert alert-info fefo-banner">
                💡 <strong>اقتراح FEFO:</strong> يوصى باستخدام التشغيلة{' '}
                <strong>{fefoBatch.batchNumber}</strong> نظراً لقرب انتهاء صلاحيتها ({fefoBatch.expirationDate.slice(0, 10)}).
              </div>
            )}

            <div className="form-row">
              <div className="form-group flex-1">
                <label>الكمية المحقونة / المستخدمة *</label>
                <input
                  type="text"
                  className="form-control"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                />
                <small className="text-muted">{selectedProduct?.unit || 'الوحدة'}</small>
              </div>

              <div className="form-group flex-1">
                <label>الكمية الهالكة / الفائض (Waste)</label>
                <input
                  type="text"
                  className="form-control"
                  value={wasteQuantity}
                  onChange={(e) => setWasteQuantity(e.target.value)}
                />
                <small className="text-muted">متبقي في الفيال يتم إتلافه</small>
              </div>

              <div className="form-group flex-2">
                <label>ملاحظات سريرية</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="مثال: حقن في منطقة الجبهة والوجنتين..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <div className="form-group flex-shrink-0 align-self-end">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={busy || !batchId}
                >
                  {busy ? 'جاري الصرف...' : 'صرف وخصم المخزون'}
                </button>
              </div>
            </div>
          </form>

          {/* Previously Recorded Consumptions */}
          <div className="consumptions-history">
            <h4>المواد المسجلة في هذا الإجراء</h4>
            {loading ? (
              <div className="loading-state">جاري التحميل...</div>
            ) : consumptions.length === 0 ? (
              <p className="text-muted">لم يتم تسجيل مواد منصرفة لهذا الإجراء حتى الآن.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>المادة</th>
                    <th>رقم التشغيلة</th>
                    <th>الموقع</th>
                    <th>الكمية المنصرفة</th>
                    <th>الهالك</th>
                    <th>الحالة</th>
                    <th>التاريخ</th>
                    <th>إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {consumptions.map((c) => (
                    <tr key={c.id} className={c.status === 'VOIDED' ? 'row-voided' : ''}>
                      <td>{c.product?.nameAr || '-'}</td>
                      <td><strong>{c.batch?.batchNumber || '-'}</strong></td>
                      <td>{c.location?.nameAr || '-'}</td>
                      <td>{c.quantity} {c.unit}</td>
                      <td>{c.wasteQuantity}</td>
                      <td>
                        <span className={`status-badge status-${c.status.toLowerCase()}`}>
                          {clinicalConsumptionStatusLabels[c.status]}
                        </span>
                      </td>
                      <td>{new Date(c.createdAt).toLocaleDateString('ar-SA')}</td>
                      <td>
                        {c.status === 'RECORDED' && (
                          voidingId === c.id ? (
                            <div className="void-inline-form">
                              <input
                                type="text"
                                className="form-control form-control-xs"
                                placeholder="سبب الإلغاء..."
                                value={voidReason}
                                onChange={(e) => setVoidReason(e.target.value)}
                              />
                              <button
                                type="button"
                                className="btn btn-xs btn-danger"
                                onClick={() => handleVoid(c.id)}
                                disabled={voidBusy}
                              >
                                تأكيد
                              </button>
                              <button
                                type="button"
                                className="btn btn-xs btn-secondary"
                                onClick={() => setVoidingId(null)}
                              >
                                إلغاء
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-xs btn-outline-danger"
                              onClick={() => {
                                setVoidingId(c.id);
                                setVoidReason('');
                              }}
                            >
                              إلغاء واسترجاع
                            </button>
                          )
                        )}
                        {c.status === 'VOIDED' && (
                          <small className="text-muted">ملغى ({c.voidReason})</small>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}

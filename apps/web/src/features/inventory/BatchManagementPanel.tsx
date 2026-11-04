import { useState, useEffect, useCallback } from 'react';
import {
  type InventoryBatchRecord,
  type InventoryProductRecord,
  type InventoryLocationRecord,
  type ExpiryReport,
  inventoryBatchStatusLabels,
  inventoryApi,
} from './inventory-api';

interface Props {
  clinicId: string;
  csrfToken: string;
  products: InventoryProductRecord[];
  locations: InventoryLocationRecord[];
  canManage: boolean;
  onRefresh: () => void;
  onSuccess: (msg: string) => void;
}

export function BatchManagementPanel({
  clinicId,
  csrfToken,
  products,
  locations,
  canManage,
  onRefresh,
  onSuccess,
}: Props) {
  const [batches, setBatches] = useState<InventoryBatchRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Expiry Report modal/view
  const [showExpiryReport, setShowExpiryReport] = useState(false);
  const [expiryReport, setExpiryReport] = useState<ExpiryReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  // Create Batch modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createProductId, setCreateProductId] = useState('');
  const [createBatchNumber, setCreateBatchNumber] = useState('');
  const [createExpDate, setCreateExpDate] = useState('');
  const [createInitialQty, setCreateInitialQty] = useState('1.0000');
  const [createLocationId, setCreateLocationId] = useState('');
  const [createManufacturer, setCreateManufacturer] = useState('');
  const [createSupplier, setCreateSupplier] = useState('');
  const [createBusy, setCreateBusy] = useState(false);

  // Status Action Modal (Quarantine / Recall)
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [actionBatch, setActionBatch] = useState<InventoryBatchRecord | null>(null);
  const [actionType, setActionType] = useState<'QUARANTINE' | 'RECALL'>('QUARANTINE');
  const [actionReason, setActionReason] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  const fetchBatches = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams();
      if (selectedProductId !== 'ALL') q.set('productId', selectedProductId);
      if (statusFilter !== 'ALL') q.set('status', statusFilter);
      if (search.trim()) q.set('search', search.trim());

      const res = await inventoryApi(clinicId).listBatches(q);
      setBatches(res.items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل قائمة التشغيلات');
    } finally {
      setLoading(false);
    }
  }, [clinicId, selectedProductId, statusFilter, search]);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  async function fetchExpiryReport() {
    setLoadingReport(true);
    try {
      const q = new URLSearchParams({ daysThreshold: '60' });
      const report = await inventoryApi(clinicId).getExpiryReport(q);
      setExpiryReport(report);
      setShowExpiryReport(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'تعذر إعداد تقرير الصلاحية');
    } finally {
      setLoadingReport(false);
    }
  }

  async function handleCreateBatch(e: React.FormEvent) {
    e.preventDefault();
    if (!createProductId || !createBatchNumber.trim() || !createExpDate) {
      setError('يرجى ملء جميع الحقول الإلزامية');
      return;
    }
    setCreateBusy(true);
    setError('');
    try {
      await inventoryApi(clinicId).createBatch(
        {
          productId: createProductId,
          batchNumber: createBatchNumber.trim(),
          expirationDate: createExpDate,
          initialQuantity: createInitialQty,
          locationId: createLocationId || undefined,
          manufacturerName: createManufacturer.trim() || undefined,
          supplierName: createSupplier.trim() || undefined,
        },
        csrfToken,
      );
      setCreateModalOpen(false);
      onSuccess(`تم تسجيل التشغيلة ${createBatchNumber} بنجاح`);
      fetchBatches();
      onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'فشل تسجيل التشغيلة');
    } finally {
      setCreateBusy(false);
    }
  }

  async function handleActionSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!actionBatch || actionReason.trim().length < 3) {
      setError('يرجى توضيح سبب الإجراء (3 أحرف على الأقل)');
      return;
    }
    setActionBusy(true);
    setError('');
    try {
      if (actionType === 'QUARANTINE') {
        await inventoryApi(clinicId).quarantineBatch(actionBatch.id, actionReason.trim(), csrfToken);
        onSuccess(`تم وضع التشغيلة ${actionBatch.batchNumber} في الحجر الصحي`);
      } else {
        await inventoryApi(clinicId).recallBatch(actionBatch.id, actionReason.trim(), csrfToken);
        onSuccess(`تم سحب التشغيلة ${actionBatch.batchNumber} بنجاح`);
      }
      setActionModalOpen(false);
      fetchBatches();
      onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'فشل تنفيذ الإجراء');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleReleaseBatch(b: InventoryBatchRecord) {
    if (!window.confirm(`هل أنت متأكد من فك الحجر الصحي عن التشغيلة ${b.batchNumber} وإعادتها للاستخدام؟`)) {
      return;
    }
    setError('');
    try {
      await inventoryApi(clinicId).releaseBatch(b.id, csrfToken);
      onSuccess(`تمت إعادة التشغيلة ${b.batchNumber} إلى الحالة المتاحة`);
      fetchBatches();
      onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'فشل فك الحجر الصحي');
    }
  }

  return (
    <div className="inventory-section batch-management-panel" dir="rtl">
      <div className="section-header">
        <div>
          <h2 className="section-title">إدارة التشغيلات والصلاحية (Lots & Expiry)</h2>
          <p className="section-subtitle">
            تتبع دقيق لأرقام التشغيلات، تواريخ الصلاحية حسب تقويم العيادة، وإجراءات الحجر والسحب الطبي.
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={fetchExpiryReport}
            disabled={loadingReport}
          >
            {loadingReport ? 'جاري التحميل...' : 'تقرير مخاطر الصلاحية'}
          </button>
          {canManage && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setCreateProductId(products[0]?.id || '');
                setCreateBatchNumber('');
                setCreateExpDate('');
                setCreateInitialQty('1.0000');
                setCreateLocationId(locations[0]?.id || '');
                setCreateManufacturer('');
                setCreateSupplier('');
                setError('');
                setCreateModalOpen(true);
              }}
            >
              + تسجيل تشغيلة جديدة
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-danger" role="alert">{error}</div>}

      {/* Filter Bar */}
      <div className="filter-bar">
        <div className="search-box">
          <input
            type="text"
            className="form-control"
            placeholder="بحث برقم التشغيلة أو اسم المنتج..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <select
            className="form-control"
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
          >
            <option value="ALL">جميع المنتجات</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nameAr} ({p.sku})
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <select
            className="form-control"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">جميع الحالات</option>
            <option value="AVAILABLE">متاح للاستخدام</option>
            <option value="QUARANTINED">حجر صحي</option>
            <option value="RECALLED">مسحوب</option>
            <option value="EXPIRED">منتهي الصلاحية</option>
            <option value="DEPLETED">مستنفد</option>
          </select>
        </div>
        <button type="button" className="btn btn-outline" onClick={fetchBatches} disabled={loading}>
          تحديث
        </button>
      </div>

      {/* Batches Table */}
      {loading ? (
        <div className="loading-state">جاري تحميل التشغيلات...</div>
      ) : batches.length === 0 ? (
        <div className="empty-state">
          <p>لا توجد تشغيلات تطابق معايير البحث.</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>رقم التشغيلة</th>
                <th>المنتج</th>
                <th>تاريخ الصلاحية</th>
                <th>الحالة</th>
                <th>الرصيد المتاح</th>
                <th>الشركة المصنعة / المورد</th>
                {canManage && <th>الإجراءات</th>}
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => {
                const isExpired = b.isExpired || b.status === 'EXPIRED';
                const statusLabel = inventoryBatchStatusLabels[b.status] || b.status;
                const statusClass =
                  b.status === 'AVAILABLE'
                    ? 'status-available'
                    : b.status === 'QUARANTINED'
                      ? 'status-quarantined'
                      : b.status === 'RECALLED'
                        ? 'status-recalled'
                        : b.status === 'EXPIRED'
                          ? 'status-expired'
                          : 'status-depleted';

                return (
                  <tr key={b.id} className={isExpired ? 'row-expired' : ''}>
                    <td className="batch-number">
                      <strong>{b.batchNumber}</strong>
                    </td>
                    <td>
                      <div>{b.product?.nameAr || '-'}</div>
                      <small className="text-muted">{b.product?.sku}</small>
                    </td>
                    <td>
                      <div>{b.expirationDate.slice(0, 10)}</div>
                      {isExpired && <span className="pill pill-danger">منتهية</span>}
                    </td>
                    <td>
                      <span className={`status-badge ${statusClass}`}>{statusLabel}</span>
                    </td>
                    <td className="quantity-cell">
                      <strong>{b.totalOnHandQuantity}</strong> {b.product?.unit || ''}
                    </td>
                    <td>
                      <small>
                        {b.manufacturerName && <div>مصنع: {b.manufacturerName}</div>}
                        {b.supplierName && <div>مورد: {b.supplierName}</div>}
                        {!b.manufacturerName && !b.supplierName && '-'}
                      </small>
                    </td>
                    {canManage && (
                      <td className="actions-cell">
                        {b.status === 'AVAILABLE' && !isExpired && (
                          <div className="btn-group">
                            <button
                              type="button"
                              className="btn btn-xs btn-warning"
                              onClick={() => {
                                setActionBatch(b);
                                setActionType('QUARANTINE');
                                setActionReason('');
                                setError('');
                                setActionModalOpen(true);
                              }}
                            >
                              حجر
                            </button>
                            <button
                              type="button"
                              className="btn btn-xs btn-danger"
                              onClick={() => {
                                setActionBatch(b);
                                setActionType('RECALL');
                                setActionReason('');
                                setError('');
                                setActionModalOpen(true);
                              }}
                            >
                              سحب
                            </button>
                          </div>
                        )}
                        {b.status === 'QUARANTINED' && !isExpired && (
                          <div className="btn-group">
                            <button
                              type="button"
                              className="btn btn-xs btn-success"
                              onClick={() => handleReleaseBatch(b)}
                            >
                              فك الحجر
                            </button>
                            <button
                              type="button"
                              className="btn btn-xs btn-danger"
                              onClick={() => {
                                setActionBatch(b);
                                setActionType('RECALL');
                                setActionReason('');
                                setError('');
                                setActionModalOpen(true);
                              }}
                            >
                              سحب
                            </button>
                          </div>
                        )}
                        {b.status === 'RECALLED' && (
                          <span className="text-muted text-xs">تم السحب النهائي</span>
                        )}
                        {isExpired && (
                          <span className="text-muted text-xs">منتهية - محظورة</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Register Batch Modal */}
      {createModalOpen && (
        <div className="modal-backdrop" onClick={() => setCreateModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} dir="rtl">
            <div className="modal-header">
              <h3>تسجيل تشغيلة / دفعة جديدة</h3>
              <button type="button" className="close-btn" onClick={() => setCreateModalOpen(false)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleCreateBatch}>
              <div className="modal-body">
                {error && <div className="alert alert-danger">{error}</div>}
                <div className="form-group">
                  <label>المنتج *</label>
                  <select
                    className="form-control"
                    value={createProductId}
                    onChange={(e) => setCreateProductId(e.target.value)}
                    required
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nameAr} ({p.sku})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>رقم التشغيلة / الدفعة (Batch / Lot #) *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="مثال: LOT-2026-088"
                    value={createBatchNumber}
                    onChange={(e) => setCreateBatchNumber(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>تاريخ انتهاء الصلاحية *</label>
                  <input
                    type="date"
                    className="form-control"
                    value={createExpDate}
                    onChange={(e) => setCreateExpDate(e.target.value)}
                    required
                  />
                  <small className="form-hint">
                    يتم التحقق من الصلاحية وفق المنطقة الزمنية للعيادة عند منتصف الليل.
                  </small>
                </div>

                <div className="form-group">
                  <label>الكمية الافتتاحية *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={createInitialQty}
                    onChange={(e) => setCreateInitialQty(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>الموقع التخزيني للاستلام (اختياري)</label>
                  <select
                    className="form-control"
                    value={createLocationId}
                    onChange={(e) => setCreateLocationId(e.target.value)}
                  >
                    <option value="">بدون استلام فوري في موقع</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.nameAr} ({loc.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>الشركة المصنعة</label>
                    <input
                      type="text"
                      className="form-control"
                      value={createManufacturer}
                      onChange={(e) => setCreateManufacturer(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>اسم المورد</label>
                    <input
                      type="text"
                      className="form-control"
                      value={createSupplier}
                      onChange={(e) => setCreateSupplier(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setCreateModalOpen(false)}
                  disabled={createBusy}
                >
                  إلغاء
                </button>
                <button type="submit" className="btn btn-primary" disabled={createBusy}>
                  {createBusy ? 'جاري الحفظ...' : 'تسجيل التشغيلة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Action Modal (Quarantine / Recall) */}
      {actionModalOpen && actionBatch && (
        <div className="modal-backdrop" onClick={() => setActionModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} dir="rtl">
            <div className="modal-header">
              <h3>
                {actionType === 'QUARANTINE' ? 'وضع في الحجر الصحي' : 'سحب تشغيلة (Recall)'}
              </h3>
              <button type="button" className="close-btn" onClick={() => setActionModalOpen(false)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleActionSubmit}>
              <div className="modal-body">
                {error && <div className="alert alert-danger">{error}</div>}
                <p>
                  التشغيلة: <strong>{actionBatch.batchNumber}</strong> ({actionBatch.product?.nameAr})
                </p>
                {actionType === 'RECALL' && (
                  <div className="alert alert-warning">
                    تنبيه: عملية سحب التشغيلة نهائية ولا يمكن التراجع عنها. سيتم حظر صرف هذه التشغيلة سريرياً أو تحويلها فوراً.
                  </div>
                )}
                <div className="form-group">
                  <label>سبب {actionType === 'QUARANTINE' ? 'الحجر' : 'السحب'} *</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    placeholder="اذكر السبب الفني أو التنظيمي للإجراء (مثال: تعميم من هيئة الغذاء والدواء أو اشتباه تلف)..."
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setActionModalOpen(false)}
                  disabled={actionBusy}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className={`btn ${actionType === 'QUARANTINE' ? 'btn-warning' : 'btn-danger'}`}
                  disabled={actionBusy}
                >
                  {actionBusy ? 'جاري التنفيذ...' : actionType === 'QUARANTINE' ? 'تأكيد الحجر' : 'تأكيد السحب النهائي'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Expiry Report Modal */}
      {showExpiryReport && expiryReport && (
        <div className="modal-backdrop" onClick={() => setShowExpiryReport(false)}>
          <div className="modal-content modal-lg" onClick={(e) => e.stopPropagation()} dir="rtl">
            <div className="modal-header">
              <h3>تقرير مخاطر الصلاحية (خلال {expiryReport.daysThreshold} يوماً)</h3>
              <button type="button" className="close-btn" onClick={() => setShowExpiryReport(false)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="report-meta">
                <span>تاريخ التقييم: {expiryReport.evaluatedAt}</span>
                <span>المنطقة الزمنية للعيادة: {expiryReport.clinicTimezone}</span>
                <span>إجمالي التشغيلات المعرضة للمخاطر: {expiryReport.totalBatches}</span>
              </div>

              {expiryReport.items.length === 0 ? (
                <div className="empty-state">
                  <p>لا توجد تشغيلات منتهية أو قريبة الانتهاء خلال الفترة المحددة.</p>
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>رقم التشغيلة</th>
                      <th>المنتج</th>
                      <th>تاريخ الصلاحية</th>
                      <th>الأيام المتبقية</th>
                      <th>مستوى المخاطرة</th>
                      <th>الرصيد المتبقي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expiryReport.items.map((it) => (
                      <tr key={it.id}>
                        <td><strong>{it.batchNumber}</strong></td>
                        <td>{it.product.nameAr}</td>
                        <td>{it.expirationDate}</td>
                        <td>{it.daysRemaining < 0 ? 'منتهية' : `${it.daysRemaining} يوم`}</td>
                        <td>
                          <span className={`risk-badge risk-${it.riskLevel.toLowerCase()}`}>
                            {it.riskLevel === 'EXPIRED'
                              ? 'منتهية'
                              : it.riskLevel === 'CRITICAL'
                                ? 'حرجة (أقل من 7 أيام)'
                                : it.riskLevel === 'WARNING'
                                  ? 'تحذير (أقل من شهر)'
                                  : 'طبيعية'}
                          </span>
                        </td>
                        <td><strong>{it.totalOnHandQuantity}</strong> {it.product.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowExpiryReport(false)}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

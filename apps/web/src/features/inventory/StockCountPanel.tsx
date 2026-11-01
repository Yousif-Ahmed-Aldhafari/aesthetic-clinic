import { useEffect, useState, useCallback } from 'react';
import {
  type InventoryStockCountRecord,
  type InventoryLocationRecord,
  type InventoryProductRecord,
  STOCK_COUNT_STATUS_LABELS,
  inventoryApi,
} from './inventory-api';

interface Props {
  clinicId: string;
  csrfToken: string;
  locations: InventoryLocationRecord[];
  products: InventoryProductRecord[];
  canManage: boolean;
  canReconcile: boolean;
  onAuthError: (error: unknown) => void;
  onSuccess: (message: string) => void;
}

interface CountItemRow {
  productId: string;
  batchId: string | null;
  productName: string;
  productSku: string;
  batchNumber: string | null;
  systemQuantity: string;
  countedQuantity: string;
  discrepancyReason: string;
}

export function StockCountPanel({
  clinicId,
  csrfToken,
  locations,
  products: _products,
  canManage,
  canReconcile,
  onAuthError,
  onSuccess,
}: Props) {
  const [stockCounts, setStockCounts] = useState<InventoryStockCountRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSession, setActiveSession] = useState<InventoryStockCountRecord | null>(null);

  // New stock count modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Count entry items state
  const [countItems, setCountItems] = useState<CountItemRow[]>([]);
  const [savingCounts, setSavingCounts] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileNotes, setReconcileNotes] = useState('');

  const loadStockCounts = useCallback(async () => {
    setLoading(true);
    try {
      const api = inventoryApi(clinicId);
      const res = await api.listStockCounts();
      setStockCounts(res.items || []);
    } catch (err) {
      onAuthError(err);
    } finally {
      setLoading(false);
    }
  }, [clinicId, onAuthError]);

  useEffect(() => {
    loadStockCounts();
  }, [loadStockCounts]);

  function openSession(sc: InventoryStockCountRecord) {
    setActiveSession(sc);
    setReconcileNotes('');
    setCountItems(
      (sc.items || []).map((i) => ({
        productId: i.productId,
        batchId: i.batchId,
        productName: i.product?.nameAr || '—',
        productSku: i.product?.sku || '—',
        batchNumber: i.batch?.batchNumber || null,
        systemQuantity: i.systemQuantity,
        countedQuantity: i.countedQuantity,
        discrepancyReason: i.discrepancyReason || '',
      })),
    );
  }

  function updateCountRow(idx: number, patch: Partial<CountItemRow>) {
    setCountItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }

  async function handleCreateSession(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedLocationId) {
      setFormError('يرجى اختيار موقع الجرد');
      return;
    }

    setSubmitting(true);
    setFormError('');

    try {
      const api = inventoryApi(clinicId);
      const created = await api.createStockCount(
        {
          locationId: selectedLocationId,
          notes: notes.trim() || undefined,
        },
        csrfToken,
      );

      setCreateModalOpen(false);
      onSuccess(`تم إنشاء جلسة الجرد بنجاح برقم ${created.countNumber}`);
      loadStockCounts();
      openSession(created);
    } catch (err: any) {
      setFormError(err?.message || 'تعذر إنشاء جلسة الجرد');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveCounts() {
    if (!activeSession) return;
    setSavingCounts(true);

    try {
      const api = inventoryApi(clinicId);
      const updated = await api.recordStockCountItems(
        activeSession.id,
        {
          expectedVersion: activeSession.version,
          items: countItems.map((ci) => ({
            productId: ci.productId,
            batchId: ci.batchId || undefined,
            countedQuantity: ci.countedQuantity,
            discrepancyReason: ci.discrepancyReason.trim() || undefined,
          })),
        },
        csrfToken,
      );

      onSuccess(`تم تسجيل كميات الجرد الفعلي لجلسة ${activeSession.countNumber}`);
      openSession(updated);
      loadStockCounts();
    } catch (err: any) {
      alert(err?.message || 'تعذر تسجيل كميات الجرد');
    } finally {
      setSavingCounts(false);
    }
  }

  async function handleReconcile() {
    if (!activeSession) return;
    const confirmReconcile = window.confirm(
      'هل أنت متأكد من رغبتك في اعتماد التسوية المخزنية؟ سيتم ترحيل حركات تسوية تعويضية تلقائياً في دفتر المخزون.',
    );
    if (!confirmReconcile) return;

    setReconciling(true);
    try {
      const api = inventoryApi(clinicId);
      const reconciled = await api.reconcileStockCount(
        activeSession.id,
        {
          expectedVersion: activeSession.version,
          notes: reconcileNotes.trim() || undefined,
        },
        csrfToken,
      );

      onSuccess(`تمت تسوية الجرد ${reconciled.countNumber} وترحيل الفروقات بنجاح`);
      openSession(reconciled);
      loadStockCounts();
    } catch (err: any) {
      alert(err?.message || 'تعذر اعتماد تسوية الجرد');
    } finally {
      setReconciling(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h3 style={{ margin: 0, color: '#111827' }}>جلسات الجرد والتسوية الفعلية</h3>
          <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.85rem' }}>
            مطابقة المخزون الفعلي مع الدفتر المحاسبي وترحيل فروقات الجرد آلياً.
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            className="inventory-btn inventory-btn-primary"
            onClick={() => {
              setSelectedLocationId(locations[0]?.id || '');
              setNotes('');
              setFormError('');
              setCreateModalOpen(true);
            }}
          >
            + بدء جلسة جرد جديدة
          </button>
        )}
      </div>

      {/* Stock Counts Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>جارٍ تحميل جلسات الجرد...</div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.9rem' }}>
            <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <tr>
                <th style={{ padding: '0.75rem 1rem' }}>رقم الجلسة</th>
                <th style={{ padding: '0.75rem 1rem' }}>موقع الجرد</th>
                <th style={{ padding: '0.75rem 1rem' }}>الحالة</th>
                <th style={{ padding: '0.75rem 1rem' }}>تاريخ البدء</th>
                <th style={{ padding: '0.75rem 1rem' }}>تاريخ التسوية</th>
                <th style={{ padding: '0.75rem 1rem' }}>ملاحظات</th>
                <th style={{ padding: '0.75rem 1rem' }}>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {stockCounts.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: '#6b7280' }}>
                    لا توجد جلسات جرد سابقة. ابدأ جلسة جديدة لمعاينة الأرصدة ومطابقتها.
                  </td>
                </tr>
              ) : (
                stockCounts.map((sc) => {
                const statusColor =
                  sc.status === 'RECONCILED'
                    ? '#166534'
                    : sc.status === 'SUBMITTED'
                    ? '#92400e'
                    : sc.status === 'CANCELLED'
                    ? '#991b1b'
                    : '#4b5563';
                const statusBg =
                  sc.status === 'RECONCILED'
                    ? '#dcfce7'
                    : sc.status === 'SUBMITTED'
                    ? '#fef3c7'
                    : sc.status === 'CANCELLED'
                    ? '#fee2e2'
                    : '#f3f4f6';

                return (
                  <tr key={sc.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600, fontFamily: 'monospace' }}>
                      {sc.countNumber}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 600 }}>{sc.location?.nameAr || '—'}</div>
                      <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{sc.location?.code}</div>
                    </td>
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
                        {STOCK_COUNT_STATUS_LABELS[sc.status]}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>{sc.createdAt ? sc.createdAt.slice(0, 10) : '—'}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>{sc.approvedAt ? sc.approvedAt.slice(0, 10) : '—'}</td>
                    <td style={{ padding: '0.75rem 1rem', color: '#6b7280' }}>{sc.notes || '—'}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <button
                        type="button"
                        onClick={() => openSession(sc)}
                        style={{
                          background: 'none',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          padding: '0.25rem 0.5rem',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                        }}
                      >
                        فتح الجلسة
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

      {/* Active Count Session Modal */}
      {activeSession && (
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
              width: '840px',
              maxWidth: '94vw',
              maxHeight: '92vh',
              overflowY: 'auto',
              boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, color: '#111827' }}>جلسة الجرد: {activeSession.countNumber}</h3>
                <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  الموقع: {activeSession.location?.nameAr} | الحالة:{' '}
                  <strong>{STOCK_COUNT_STATUS_LABELS[activeSession.status]}</strong>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveSession(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#6b7280' }}
              >
                &times;
              </button>
            </div>

            {/* Snapshot Items Table */}
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '6px', overflow: 'hidden', marginBottom: '1rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.85rem' }}>
                <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <tr>
                    <th style={{ padding: '0.5rem 0.75rem' }}>الصنف</th>
                    <th style={{ padding: '0.5rem 0.75rem' }}>التشغيلة</th>
                    <th style={{ padding: '0.5rem 0.75rem' }}>رصيد النظام</th>
                    <th style={{ padding: '0.5rem 0.75rem' }}>الجرد الفعلي</th>
                    <th style={{ padding: '0.5rem 0.75rem' }}>الفارق (Variance)</th>
                    <th style={{ padding: '0.5rem 0.75rem' }}>سبب الفارق</th>
                  </tr>
                </thead>
                <tbody>
                  {countItems.map((item, idx) => {
                    const sys = parseFloat(item.systemQuantity) || 0;
                    const cnt = parseFloat(item.countedQuantity) || 0;
                    const variance = cnt - sys;
                    const isEditable = activeSession.status === 'DRAFT' || activeSession.status === 'COUNTING';

                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '0.5rem 0.75rem' }}>
                          <div style={{ fontWeight: 600 }}>{item.productName}</div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{item.productSku}</div>
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem' }}>{item.batchNumber || '—'}</td>
                        <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>{sys.toFixed(2)}</td>
                        <td style={{ padding: '0.5rem 0.75rem' }}>
                          {isEditable ? (
                            <input
                              type="number"
                              step="0.0001"
                              min="0"
                              value={item.countedQuantity}
                              onChange={(e) => updateCountRow(idx, { countedQuantity: e.target.value })}
                              style={{ width: '90px', padding: '0.3rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                            />
                          ) : (
                            <span style={{ fontWeight: 600 }}>{cnt.toFixed(2)}</span>
                          )}
                        </td>
                        <td
                          style={{
                            padding: '0.5rem 0.75rem',
                            fontWeight: 700,
                            color: variance === 0 ? '#166534' : variance < 0 ? '#dc2626' : '#2563eb',
                          }}
                        >
                          {variance > 0 ? `+${variance.toFixed(2)}` : variance.toFixed(2)}
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem' }}>
                          {isEditable ? (
                            <input
                              type="text"
                              value={item.discrepancyReason}
                              onChange={(e) => updateCountRow(idx, { discrepancyReason: e.target.value })}
                              placeholder="سبب النقص أو الزيادة..."
                              style={{ width: '100%', padding: '0.3rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                            />
                          ) : (
                            <span>{item.discrepancyReason || '—'}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Reconciliation Notes (if submitted or pending reconciliation) */}
            {activeSession.status === 'SUBMITTED' && canReconcile && (
              <div style={{ marginBottom: '1rem', background: '#eff6ff', padding: '0.75rem', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#1e40af', marginBottom: '0.25rem' }}>
                  ملاحظات اعتماد التسوية المخزنية:
                </label>
                <input
                  type="text"
                  value={reconcileNotes}
                  onChange={(e) => setReconcileNotes(e.target.value)}
                  placeholder="مثلاً: تم اعتماد تسوية الفاقد بعد مراجعة تقرير الجرد..."
                  style={{ width: '100%', padding: '0.45rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                />
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              {(activeSession.status === 'DRAFT' || activeSession.status === 'COUNTING') && canManage && (
                <button
                  type="button"
                  onClick={handleSaveCounts}
                  disabled={savingCounts}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: savingCounts ? 'not-allowed' : 'pointer',
                  }}
                >
                  {savingCounts ? 'جارٍ الحفظ...' : 'حفظ نتائج الجرد'}
                </button>
              )}

              {activeSession.status === 'SUBMITTED' && canReconcile && (
                <button
                  type="button"
                  onClick={handleReconcile}
                  disabled={reconciling}
                  style={{
                    padding: '0.5rem 1.25rem',
                    background: '#16a34a',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: reconciling ? 'not-allowed' : 'pointer',
                  }}
                >
                  {reconciling ? 'جارٍ التسوية...' : 'اعتماد التسوية وترحيل الفروقات'}
                </button>
              )}

              <button
                type="button"
                onClick={() => setActiveSession(null)}
                style={{ padding: '0.5rem 1rem', border: '1px solid #d1d5db', background: '#f9fafb', borderRadius: '4px', cursor: 'pointer' }}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Session Modal */}
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
          <div style={{ background: '#ffffff', borderRadius: '8px', padding: '1.5rem', width: '480px', maxWidth: '90vw' }}>
            <h3 style={{ margin: '0 0 1rem', color: '#111827' }}>بدء جلسة جرد مخزني جديدة</h3>

            {formError && (
              <div style={{ background: '#fee2e2', color: '#991b1b', padding: '0.5rem', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateSession}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  موقع التخزين المراد جرده *
                </label>
                <select
                  required
                  value={selectedLocationId}
                  onChange={(e) => setSelectedLocationId(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                >
                  {locations
                    .filter((l) => l.isActive)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nameAr} ({l.code})
                      </option>
                    ))}
                </select>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  ملاحظات أو مبرر الجرد
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="جرد ربع سنوي دوري، جرد نهاية العام..."
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
                  {submitting ? 'جارٍ أخذ لقطة المخزون...' : 'أخذ لقطة المخزون وبدء الجرد'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

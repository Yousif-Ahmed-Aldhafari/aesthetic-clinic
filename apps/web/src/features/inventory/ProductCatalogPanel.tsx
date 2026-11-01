import { useState } from 'react';
import {
  type InventoryProductRecord,
  type InventoryCategory,
  type InventoryUnit,
  inventoryCategoryLabels,
  inventoryUnitLabels,
  inventoryApi,
} from './inventory-api';

interface Props {
  clinicId: string;
  csrfToken: string;
  products: InventoryProductRecord[];
  canManage: boolean;
  onRefresh: () => void;
  onSuccess: (msg: string) => void;
}

export function ProductCatalogPanel({
  clinicId,
  csrfToken,
  products,
  canManage,
  onRefresh,
  onSuccess,
}: Props) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<InventoryProductRecord | null>(null);

  // Form state
  const [sku, setSku] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [category, setCategory] = useState<InventoryCategory>('INJECTABLE');
  const [unit, setUnit] = useState<InventoryUnit>('VIAL');
  const [reorderThreshold, setReorderThreshold] = useState('0.0000');
  const [requiresBatchTracking, setRequiresBatchTracking] = useState(true);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const filtered = products.filter((p) => {
    const matchesCat = categoryFilter === 'ALL' || p.category === categoryFilter;
    const s = search.trim().toLowerCase();
    const matchesSearch =
      !s ||
      p.sku.toLowerCase().includes(s) ||
      p.nameAr.toLowerCase().includes(s) ||
      (p.nameEn && p.nameEn.toLowerCase().includes(s));
    return matchesCat && matchesSearch;
  });

  function openCreateModal() {
    setEditingProduct(null);
    setSku('');
    setNameAr('');
    setNameEn('');
    setCategory('INJECTABLE');
    setUnit('VIAL');
    setReorderThreshold('5.0000');
    setRequiresBatchTracking(true);
    setDescription('');
    setError('');
    setModalOpen(true);
  }

  function openEditModal(p: InventoryProductRecord) {
    setEditingProduct(p);
    setSku(p.sku);
    setNameAr(p.nameAr);
    setNameEn(p.nameEn || '');
    setCategory(p.category);
    setUnit(p.unit);
    setReorderThreshold(p.reorderThreshold);
    setRequiresBatchTracking(p.requiresBatchTracking);
    setDescription(p.description || '');
    setError('');
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const api = inventoryApi(clinicId);

    try {
      if (editingProduct) {
        await api.updateProduct(
          editingProduct.id,
          {
            expectedVersion: editingProduct.version,
            nameAr,
            nameEn: nameEn.trim() || undefined,
            category,
            unit,
            reorderThreshold,
            requiresBatchTracking,
            description: description.trim() || undefined,
          },
          csrfToken,
        );
        onSuccess('تم تحديث بيانات الصنف بنجاح.');
      } else {
        await api.createProduct(
          {
            sku: sku.trim(),
            nameAr: nameAr.trim(),
            nameEn: nameEn.trim() || undefined,
            category,
            unit,
            reorderThreshold,
            requiresBatchTracking,
            description: description.trim() || undefined,
          },
          csrfToken,
        );
        onSuccess('تمت إضافة المنتج إلى دليل الأصناف بنجاح.');
      }
      setModalOpen(false);
      onRefresh();
    } catch (err: any) {
      setError(err?.message || 'تعذر حفظ الصنف. تحقق من صحة البيانات.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="inventory-actions-bar">
        <div className="inventory-search-box">
          <input
            type="text"
            placeholder="بحث بالاسم أو رمز الصنف (SKU)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="inventory-filter-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="ALL">جميع الفئات</option>
            {Object.entries(inventoryCategoryLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {canManage && (
          <button className="inventory-btn inventory-btn-primary" onClick={openCreateModal}>
            ＋ إضافة صنف جديد
          </button>
        )}
      </div>

      <div className="inventory-table-container">
        <table className="inventory-table">
          <thead>
            <tr>
              <th>رمز الصنف (SKU)</th>
              <th>اسم المنتج</th>
              <th>الفئة</th>
              <th>وحدة القياس</th>
              <th>حد إعادة الطلب</th>
              <th>تتبع الدفعة (Traceability)</th>
              <th>الحالة</th>
              {canManage && <th>الإجراءات</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 8 : 7} style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                  لا توجد أصناف مطابقة للبحث أو الفلتر المختار.
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id}>
                  <td>
                    <code style={{ background: '#f3f4f6', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>
                      {p.sku}
                    </code>
                  </td>
                  <td>
                    <strong>{p.nameAr}</strong>
                    {p.nameEn && <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{p.nameEn}</div>}
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        p.category === 'INJECTABLE'
                          ? 'badge-purple'
                          : p.category === 'SKINCARE'
                          ? 'badge-blue'
                          : p.category === 'CONSUMABLE'
                          ? 'badge-amber'
                          : 'badge-gray'
                      }`}
                    >
                      {inventoryCategoryLabels[p.category]}
                    </span>
                  </td>
                  <td>{inventoryUnitLabels[p.unit]}</td>
                  <td>
                    <span style={{ fontFamily: 'monospace' }}>{p.reorderThreshold}</span>
                  </td>
                  <td>
                    {p.requiresBatchTracking ? (
                      <span className="badge badge-purple">إلزامي (تشغيلة + انتهاء)</span>
                    ) : (
                      <span className="badge badge-gray">عام</span>
                    )}
                  </td>
                  <td>
                    {p.isActive ? (
                      <span className="badge badge-green">نشط</span>
                    ) : (
                      <span className="badge badge-red">معطل</span>
                    )}
                  </td>
                  {canManage && (
                    <td>
                      <button
                        className="inventory-btn inventory-btn-secondary"
                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                        onClick={() => openEditModal(p)}
                      >
                        تعديل
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>{editingProduct ? 'تعديل بيانات الصنف' : 'إضافة صنف جديد لدليل المنتجات'}</h3>
              <button className="modal-close-btn" onClick={() => setModalOpen(false)} disabled={busy}>
                &times;
              </button>
            </div>

            <form onSubmit={handleSave}>
              <div className="modal-body">
                {error && <div className="form-error-banner">{error}</div>}

                <div className="form-group">
                  <label>رمز الصنف (SKU) *</label>
                  <input
                    type="text"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="مثال: JUV-VOL-01"
                    disabled={Boolean(editingProduct)}
                    required
                  />
                  <span className="form-help">رمز تعريفي فريد على مستوى العيادة لا يتكرر.</span>
                </div>

                <div className="form-group">
                  <label>اسم المنتج بالعربية *</label>
                  <input
                    type="text"
                    value={nameAr}
                    onChange={(e) => setNameAr(e.target.value)}
                    placeholder="مثال: فيلر جوفيديرم فوليوم 1 مل"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>اسم المنتج بالإنجليزية (اختياري)</label>
                  <input
                    type="text"
                    value={nameEn}
                    onChange={(e) => setNameEn(e.target.value)}
                    placeholder="مثال: Juvederm Voluma 1ml"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label>الفئة *</label>
                    <select
                      value={category}
                      onChange={(e) => {
                        const val = e.target.value as InventoryCategory;
                        setCategory(val);
                        if (val === 'INJECTABLE') setRequiresBatchTracking(true);
                      }}
                      required
                    >
                      {Object.entries(inventoryCategoryLabels).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>وحدة القياس *</label>
                    <select
                      value={unit}
                      onChange={(e) => setUnit(e.target.value as InventoryUnit)}
                      required
                    >
                      {Object.entries(inventoryUnitLabels).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>حد إعادة الطلب (Reorder Threshold)</label>
                  <input
                    type="text"
                    value={reorderThreshold}
                    onChange={(e) => setReorderThreshold(e.target.value)}
                    placeholder="مثال: 5.0000"
                  />
                  <span className="form-help">ينبه النظام تلقائيًا عند انخفاض الرصيد عن هذا الحد.</span>
                </div>

                <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.6rem' }}>
                  <input
                    type="checkbox"
                    id="batchTrack"
                    checked={requiresBatchTracking}
                    onChange={(e) => setRequiresBatchTracking(e.target.checked)}
                    style={{ width: 'auto' }}
                  />
                  <label htmlFor="batchTrack" style={{ margin: 0, cursor: 'pointer' }}>
                    يتطلب تتبع رقم التشغيلة وتاريخ الصلاحية (إلزامي للحقن والمواد الطبية المنظمة)
                  </label>
                </div>

                <div className="form-group">
                  <label>الوصف والملاحظات</label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="أي تعليمات تخزين أو مواصفات للصنف..."
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="inventory-btn inventory-btn-secondary"
                  onClick={() => setModalOpen(false)}
                  disabled={busy}
                >
                  إلغاء
                </button>
                <button type="submit" className="inventory-btn inventory-btn-primary" disabled={busy}>
                  {busy ? 'جارٍ الحفظ...' : editingProduct ? 'حفظ التعديلات' : 'إضافة الصنف'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

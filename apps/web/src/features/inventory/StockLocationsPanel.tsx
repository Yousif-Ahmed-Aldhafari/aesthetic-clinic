import { useState } from 'react';
import {
  type InventoryLocationRecord,
  type InventoryLocationType,
  inventoryLocationTypeLabels,
  inventoryApi,
} from './inventory-api';

interface Props {
  clinicId: string;
  csrfToken: string;
  locations: InventoryLocationRecord[];
  canManage: boolean;
  onRefresh: () => void;
  onSuccess: (msg: string) => void;
}

export function StockLocationsPanel({
  clinicId,
  csrfToken,
  locations,
  canManage,
  onRefresh,
  onSuccess,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<InventoryLocationRecord | null>(null);

  const [code, setCode] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [type, setType] = useState<InventoryLocationType>('MAIN_STORE');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function openCreateModal() {
    setEditingLocation(null);
    setCode('');
    setNameAr('');
    setNameEn('');
    setType('MAIN_STORE');
    setDescription('');
    setIsActive(true);
    setError('');
    setModalOpen(true);
  }

  function openEditModal(l: InventoryLocationRecord) {
    setEditingLocation(l);
    setCode(l.code);
    setNameAr(l.nameAr);
    setNameEn(l.nameEn || '');
    setType(l.type);
    setDescription(l.description || '');
    setIsActive(l.isActive);
    setError('');
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const api = inventoryApi(clinicId);

    try {
      if (editingLocation) {
        await api.updateLocation(
          editingLocation.id,
          {
            expectedVersion: editingLocation.version,
            nameAr,
            nameEn: nameEn.trim() || undefined,
            type,
            description: description.trim() || undefined,
            isActive,
          },
          csrfToken,
        );
        onSuccess('تم تحديث بيانات موقع التخزين بنجاح.');
      } else {
        await api.createLocation(
          {
            code: code.trim(),
            nameAr: nameAr.trim(),
            nameEn: nameEn.trim() || undefined,
            type,
            description: description.trim() || undefined,
            isActive,
          },
          csrfToken,
        );
        onSuccess('تمت إضافة موقع التخزين بنجاح.');
      }
      setModalOpen(false);
      onRefresh();
    } catch (err: any) {
      setError(err?.message || 'تعذر حفظ الموقع. تأكد من عدم تكرار الكود.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="inventory-actions-bar">
        <div>
          <h4 style={{ margin: 0, color: '#111827' }}>مواقع وغرف التخزين والصرف بالعيادة</h4>
          <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
            تنظيم المستودع الرئيسي، غرف الحقن والعلاج، وصيدلية العيادة مع عزل أرصدة كل موقع.
          </span>
        </div>

        {canManage && (
          <button className="inventory-btn inventory-btn-primary" onClick={openCreateModal}>
            ＋ إضافة موقع تخزين جديد
          </button>
        )}
      </div>

      <div className="inventory-table-container">
        <table className="inventory-table">
          <thead>
            <tr>
              <th>كود الموقع</th>
              <th>اسم الموقع</th>
              <th>النوع</th>
              <th>الوصف</th>
              <th>الأصناف المخزنة</th>
              <th>الحالة</th>
              {canManage && <th>الإجراءات</th>}
            </tr>
          </thead>
          <tbody>
            {locations.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 7 : 6} style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                  لا توجد مواقع تخزين معرفة حاليًا.
                </td>
              </tr>
            ) : (
              locations.map((l) => (
                <tr key={l.id}>
                  <td>
                    <code style={{ background: '#f3f4f6', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>
                      {l.code}
                    </code>
                  </td>
                  <td>
                    <strong>{l.nameAr}</strong>
                    {l.nameEn && <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{l.nameEn}</div>}
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        l.type === 'MAIN_STORE'
                          ? 'badge-blue'
                          : l.type === 'TREATMENT_ROOM'
                          ? 'badge-purple'
                          : 'badge-gray'
                      }`}
                    >
                      {inventoryLocationTypeLabels[l.type]}
                    </span>
                  </td>
                  <td>{l.description || '—'}</td>
                  <td>
                    <span className="badge badge-gray">{l._count?.balances ?? 0} صنف</span>
                  </td>
                  <td>
                    {l.isActive ? (
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
                        onClick={() => openEditModal(l)}
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
              <h3>{editingLocation ? 'تعديل بيانات موقع التخزين' : 'إضافة موقع تخزين جديد'}</h3>
              <button className="modal-close-btn" onClick={() => setModalOpen(false)} disabled={busy}>
                &times;
              </button>
            </div>

            <form onSubmit={handleSave}>
              <div className="modal-body">
                {error && <div className="form-error-banner">{error}</div>}

                <div className="form-group">
                  <label>كود الموقع *</label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="مثال: MAIN-STORE أو ROOM-01"
                    disabled={Boolean(editingLocation)}
                    required
                  />
                  <span className="form-help">كود مختصر وفريد للموقع لا يتكرر في العيادة.</span>
                </div>

                <div className="form-group">
                  <label>اسم الموقع بالعربية *</label>
                  <input
                    type="text"
                    value={nameAr}
                    onChange={(e) => setNameAr(e.target.value)}
                    placeholder="مثال: المستودع الرئيسي أو غرفة حقن الفيلر 1"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>اسم الموقع بالإنجليزية (اختياري)</label>
                  <input
                    type="text"
                    value={nameEn}
                    onChange={(e) => setNameEn(e.target.value)}
                    placeholder="مثال: Main Central Depot"
                  />
                </div>

                <div className="form-group">
                  <label>نوع الموقع *</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as InventoryLocationType)}
                    required
                  >
                    {Object.entries(inventoryLocationTypeLabels).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>الوصف والملاحظات</label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="تفاصيل عن الموقع أو المسؤول عنه..."
                  />
                </div>

                {editingLocation && (
                  <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.6rem' }}>
                    <input
                      type="checkbox"
                      id="locActive"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      style={{ width: 'auto' }}
                    />
                    <label htmlFor="locActive" style={{ margin: 0, cursor: 'pointer' }}>
                      الموقع نشط ومتاح للعمليات المخزنية
                    </label>
                  </div>
                )}
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
                  {busy ? 'جارٍ الحفظ...' : editingLocation ? 'حفظ التعديلات' : 'إضافة الموقع'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState, useCallback } from 'react';
import {
  type InventorySupplierRecord,
  type SupplierStatus,
  SUPPLIER_STATUS_LABELS,
  inventoryApi,
} from './inventory-api';

interface Props {
  clinicId: string;
  csrfToken: string;
  canManage: boolean;
  onAuthError: (error: unknown) => void;
  onSuccess: (message: string) => void;
}

export function SupplierManagementPanel({
  clinicId,
  csrfToken,
  canManage,
  onAuthError,
  onSuccess,
}: Props) {
  const [suppliers, setSuppliers] = useState<InventorySupplierRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editSupplier, setEditSupplier] = useState<InventorySupplierRecord | null>(null);

  // Form State
  const [code, setCode] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [commercialRegister, setCommercialRegister] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<SupplierStatus>('ACTIVE');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const api = inventoryApi(clinicId);
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter) params.set('status', statusFilter);
      params.set('limit', '50');

      const res = await api.listSuppliers(params);
      setSuppliers(res.items || []);
    } catch (err) {
      onAuthError(err);
    } finally {
      setLoading(false);
    }
  }, [clinicId, search, statusFilter, onAuthError]);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  function resetForm() {
    setCode('');
    setNameAr('');
    setNameEn('');
    setContactPerson('');
    setEmail('');
    setPhone('');
    setTaxNumber('');
    setCommercialRegister('');
    setAddress('');
    setNotes('');
    setStatus('ACTIVE');
    setFormError('');
  }

  function openEdit(supplier: InventorySupplierRecord) {
    setEditSupplier(supplier);
    setCode(supplier.code);
    setNameAr(supplier.nameAr);
    setNameEn(supplier.nameEn || '');
    setContactPerson(supplier.contactPerson || '');
    setEmail(supplier.email || '');
    setPhone(supplier.phone || '');
    setTaxNumber(supplier.taxNumber || '');
    setCommercialRegister(supplier.commercialRegister || '');
    setAddress(supplier.address || '');
    setNotes(supplier.notes || '');
    setStatus(supplier.status);
    setFormError('');
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !nameAr.trim()) {
      setFormError('رمز المورد والاسم العربي مطلوبان');
      return;
    }
    setSaving(true);
    setFormError('');

    try {
      const api = inventoryApi(clinicId);
      await api.createSupplier(
        {
          code: code.trim(),
          nameAr: nameAr.trim(),
          nameEn: nameEn.trim() || undefined,
          contactPerson: contactPerson.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          taxNumber: taxNumber.trim() || undefined,
          commercialRegister: commercialRegister.trim() || undefined,
          address: address.trim() || undefined,
          notes: notes.trim() || undefined,
        },
        csrfToken,
      );

      setCreateModalOpen(false);
      resetForm();
      onSuccess('تمت إضافة المورد بنجاح');
      loadSuppliers();
    } catch (err: any) {
      setFormError(err?.message || 'تعذر إضافة المورد');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editSupplier) return;
    if (!nameAr.trim()) {
      setFormError('الاسم العربي للمورد مطلوب');
      return;
    }
    setSaving(true);
    setFormError('');

    try {
      const api = inventoryApi(clinicId);
      await api.updateSupplier(
        editSupplier.id,
        {
          expectedVersion: editSupplier.version,
          nameAr: nameAr.trim(),
          nameEn: nameEn.trim() || null,
          contactPerson: contactPerson.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          taxNumber: taxNumber.trim() || null,
          commercialRegister: commercialRegister.trim() || null,
          address: address.trim() || null,
          notes: notes.trim() || null,
          status,
        },
        csrfToken,
      );

      setEditSupplier(null);
      resetForm();
      onSuccess('تم تحديث بيانات المورد بنجاح');
      loadSuppliers();
    } catch (err: any) {
      setFormError(err?.message || 'تعذر تحديث المورد');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flex: 1 }}>
          <input
            type="search"
            placeholder="بحث بالرمز، الاسم العربي، أو جهة الاتصال..."
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
            <option value="ACTIVE">نشط</option>
            <option value="INACTIVE">غير نشط</option>
          </select>
        </div>

        {canManage && (
          <button
            type="button"
            className="inventory-btn inventory-btn-primary"
            onClick={() => {
              resetForm();
              setCreateModalOpen(true);
            }}
          >
            + إضافة مورد جديد
          </button>
        )}
      </div>

      {/* Suppliers Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>جارٍ تحميل الموردين...</div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.9rem' }}>
            <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <tr>
                <th style={{ padding: '0.75rem 1rem' }}>رمز المورد</th>
                <th style={{ padding: '0.75rem 1rem' }}>الاسم التجاري</th>
                <th style={{ padding: '0.75rem 1rem' }}>مسؤول الاتصال</th>
                <th style={{ padding: '0.75rem 1rem' }}>الهاتف / البريد</th>
                <th style={{ padding: '0.75rem 1rem' }}>الرقم الضريبي / السجل</th>
                <th style={{ padding: '0.75rem 1rem' }}>الحالة</th>
                {canManage && <th style={{ padding: '0.75rem 1rem' }}>إجراءات</th>}
              </tr>
            </thead>
            <tbody>
              {suppliers.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 7 : 6} style={{ textAlign: 'center', padding: '2.5rem', color: '#6b7280' }}>
                    لا توجد سجلات موردين مطابقة.
                  </td>
                </tr>
              ) : (
                suppliers.map((sup) => (
                  <tr key={sup.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600, fontFamily: 'monospace' }}>{sup.code}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{sup.nameAr}</div>
                      {sup.nameEn && <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{sup.nameEn}</div>}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>{sup.contactPerson || '—'}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {sup.phone && <div>{sup.phone}</div>}
                      {sup.email && <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{sup.email}</div>}
                      {!sup.phone && !sup.email && '—'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {sup.taxNumber && <div>ض: {sup.taxNumber}</div>}
                      {sup.commercialRegister && <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>س: {sup.commercialRegister}</div>}
                      {!sup.taxNumber && !sup.commercialRegister && '—'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span
                        style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          background: sup.status === 'ACTIVE' ? '#dcfce7' : '#f3f4f6',
                          color: sup.status === 'ACTIVE' ? '#166534' : '#6b7280',
                        }}
                      >
                        {SUPPLIER_STATUS_LABELS[sup.status]}
                      </span>
                    </td>
                    {canManage && (
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <button
                          type="button"
                          onClick={() => openEdit(sup)}
                          style={{
                            background: 'none',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            padding: '0.25rem 0.5rem',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                          }}
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
      )}

      {/* Create / Edit Modal */}
      {(createModalOpen || editSupplier) && (
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
              width: '560px',
              maxWidth: '92vw',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            }}
          >
            <h3 style={{ margin: '0 0 1rem', color: '#111827' }}>
              {createModalOpen ? 'إضافة مورد جديد' : `تعديل بيانات المورد (${editSupplier?.code})`}
            </h3>

            {formError && (
              <div style={{ background: '#fee2e2', color: '#991b1b', padding: '0.5rem', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                {formError}
              </div>
            )}

            <form onSubmit={createModalOpen ? handleCreate : handleUpdate}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    رمز المورد * {editSupplier && <small style={{ color: '#6b7280' }}>(ثابت)</small>}
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!!editSupplier}
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="مثلاً: SUP-ALLERGAN"
                    style={{ width: '100%', padding: '0.45rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    الاسم العربي *
                  </label>
                  <input
                    type="text"
                    required
                    value={nameAr}
                    onChange={(e) => setNameAr(e.target.value)}
                    placeholder="شركة الأدوية والمستلزمات"
                    style={{ width: '100%', padding: '0.45rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    الاسم الإنجليزي
                  </label>
                  <input
                    type="text"
                    value={nameEn}
                    onChange={(e) => setNameEn(e.target.value)}
                    placeholder="Pharmaceuticals Co."
                    style={{ width: '100%', padding: '0.45rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    اسم مسؤول الاتصال
                  </label>
                  <input
                    type="text"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    placeholder="د. محمد العمري"
                    style={{ width: '100%', padding: '0.45rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    رقم الهاتف
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+967771234567"
                    style={{ width: '100%', padding: '0.45rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    البريد الإلكتروني
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="sales@supplier.com"
                    style={{ width: '100%', padding: '0.45rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    الرقم الضريبي
                  </label>
                  <input
                    type="text"
                    value={taxNumber}
                    onChange={(e) => setTaxNumber(e.target.value)}
                    placeholder="300000000000003"
                    style={{ width: '100%', padding: '0.45rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    رقم السجل التجاري
                  </label>
                  <input
                    type="text"
                    value={commercialRegister}
                    onChange={(e) => setCommercialRegister(e.target.value)}
                    placeholder="1010000000"
                    style={{ width: '100%', padding: '0.45rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                  />
                </div>
              </div>

              {editSupplier && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    حالة المورد
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as SupplierStatus)}
                    style={{ width: '100%', padding: '0.45rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                  >
                    <option value="ACTIVE">نشط</option>
                    <option value="INACTIVE">غير نشط</option>
                  </select>
                </div>
              )}

              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  العنوان
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="المدينة، الشارع، المبنى"
                  style={{ width: '100%', padding: '0.45rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                />
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  ملاحظات
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="ملاحظات حول المورد والاتفاقيات..."
                  style={{ width: '100%', padding: '0.45rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setCreateModalOpen(false);
                    setEditSupplier(null);
                  }}
                  style={{ padding: '0.5rem 1rem', border: '1px solid #d1d5db', background: '#f9fafb', borderRadius: '4px', cursor: 'pointer' }}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: '0.5rem 1.25rem',
                    border: 'none',
                    background: '#2563eb',
                    color: '#ffffff',
                    borderRadius: '4px',
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving ? 'جارٍ الحفظ...' : createModalOpen ? 'إضافة المورد' : 'حفظ التعديلات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

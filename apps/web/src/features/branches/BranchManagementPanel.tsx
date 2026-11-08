import { useEffect, useState, type FormEvent } from 'react';
import type { ClinicContext } from '../auth/api';
import {
  listBranches,
  createBranch,
  updateBranch,
  listBranchStaff,
  assignBranchStaff,
  setPrimaryBranch,
  removeBranchStaff,
  listTransfers,
  dispatchTransfer,
  receiveTransfer,
  cancelTransfer,
  type ClinicBranchItem,
  type BranchStaffItem,
  type InterBranchTransferItem,
} from './branch-api';
import { Modal } from '../../components/ui';

interface Props {
  clinic: ClinicContext;
  csrfToken: string;
  onAuthError?: (error: unknown) => void;
  onBranchChanged?: () => void;
}

export function BranchManagementPanel({ clinic, csrfToken, onAuthError }: Props) {
  const [activeTab, setActiveTab] = useState<'branches' | 'staff' | 'transfers'>('branches');
  const [branches, setBranches] = useState<ClinicBranchItem[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [staffList, setStaffList] = useState<BranchStaffItem[]>([]);
  const [transfers, setTransfers] = useState<InterBranchTransferItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editBranch, setEditBranch] = useState<ClinicBranchItem | null>(null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [dispatchModalOpen, setDispatchModalOpen] = useState(false);
  const [receiveModalTransfer, setReceiveModalTransfer] = useState<InterBranchTransferItem | null>(null);
  const [cancelModalTransfer, setCancelModalTransfer] = useState<InterBranchTransferItem | null>(null);

  // Form states
  const [newCode, setNewCode] = useState('');
  const [newNameAr, setNewNameAr] = useState('');
  const [newNameEn, setNewNameEn] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newTimezone, setNewTimezone] = useState(clinic.branding ? 'Asia/Aden' : 'UTC');

  // Staff assignment form
  const [assignMembershipId, setAssignMembershipId] = useState('');
  const [assignIsPrimary, setAssignIsPrimary] = useState(false);

  // Transfer form
  const [transferSrcBranch, setTransferSrcBranch] = useState('');
  const [transferDstBranch, setTransferDstBranch] = useState('');
  const [transferSrcLocation, setTransferSrcLocation] = useState('');
  const [transferDstLocation, setTransferDstLocation] = useState('');
  const [transferProductId, setTransferProductId] = useState('');
  const [transferQuantity, setTransferQuantity] = useState(1);
  const [transferNotes, setTransferNotes] = useState('');

  // Receive / Cancel form
  const [receiveCondition, setReceiveCondition] = useState('GOOD');
  const [receiveDiscrepancy, setReceiveDiscrepancy] = useState(0);
  const [receiveNotes, setReceiveNotes] = useState('');
  const [cancelReason, setCancelReason] = useState('');

  const canManage = clinic.permissions.includes('branches.manage');
  const canTransfer = clinic.permissions.includes('inventory.transfers.manage');

  async function loadBranches() {
    try {
      setLoading(true);
      setError('');
      const res = await listBranches(clinic.clinicId, csrfToken);
      setBranches(res.items);
      if (res.items.length > 0 && !selectedBranchId) {
        setSelectedBranchId(res.items[0].id);
      }
    } catch (err: any) {
      setError(err?.message || 'تعذّر تحميل قائمة الفروع');
      if (err?.status === 401 && onAuthError) onAuthError(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadStaff(branchId: string) {
    if (!branchId) return;
    try {
      setLoading(true);
      setError('');
      const res = await listBranchStaff(clinic.clinicId, branchId, csrfToken);
      setStaffList(res.items);
    } catch (err: any) {
      setError(err?.message || 'تعذّر تحميل طاقم الفرع');
      if (err?.status === 401 && onAuthError) onAuthError(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadTransfers() {
    try {
      setLoading(true);
      setError('');
      const res = await listTransfers(clinic.clinicId, undefined, csrfToken);
      setTransfers(res.items);
    } catch (err: any) {
      setError(err?.message || 'تعذّر تحميل سجل التحويلات');
      if (err?.status === 401 && onAuthError) onAuthError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBranches();
  }, [clinic.clinicId]);

  useEffect(() => {
    if (activeTab === 'staff' && selectedBranchId) {
      loadStaff(selectedBranchId);
    } else if (activeTab === 'transfers') {
      loadTransfers();
    }
  }, [activeTab, selectedBranchId]);

  async function handleCreateBranch(e: FormEvent) {
    e.preventDefault();
    try {
      setLoading(true);
      setError('');
      await createBranch(
        clinic.clinicId,
        {
          code: newCode,
          nameAr: newNameAr,
          nameEn: newNameEn || undefined,
          phone: newPhone || undefined,
          address: newAddress || undefined,
          timezone: newTimezone || undefined,
        },
        csrfToken,
      );
      setSuccess('تم إنشاء الفرع بنجاح');
      setCreateModalOpen(false);
      setNewCode('');
      setNewNameAr('');
      setNewNameEn('');
      setNewPhone('');
      setNewAddress('');
      await loadBranches();
    } catch (err: any) {
      setError(err?.message || 'تعذّر إنشاء الفرع');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateBranch(e: FormEvent) {
    e.preventDefault();
    if (!editBranch) return;
    try {
      setLoading(true);
      setError('');
      await updateBranch(
        clinic.clinicId,
        editBranch.id,
        {
          nameAr: editBranch.nameAr,
          nameEn: editBranch.nameEn || undefined,
          phone: editBranch.phone || undefined,
          address: editBranch.address || undefined,
          status: editBranch.status,
          expectedVersion: editBranch.version,
        },
        csrfToken,
      );
      setSuccess('تم تحديث بيانات الفرع بنجاح');
      setEditBranch(null);
      await loadBranches();
    } catch (err: any) {
      setError(err?.message || 'تعذّر تحديث الفرع');
    } finally {
      setLoading(false);
    }
  }

  async function handleAssignStaff(e: FormEvent) {
    e.preventDefault();
    if (!selectedBranchId || !assignMembershipId) return;
    try {
      setLoading(true);
      setError('');
      await assignBranchStaff(
        clinic.clinicId,
        selectedBranchId,
        {
          membershipId: assignMembershipId,
          isPrimary: assignIsPrimary,
        },
        csrfToken,
      );
      setSuccess('تم تخصيص الموظف للفرع');
      setAssignModalOpen(false);
      setAssignMembershipId('');
      setAssignIsPrimary(false);
      await loadStaff(selectedBranchId);
    } catch (err: any) {
      setError(err?.message || 'تعذّر تخصيص الموظف للفرع');
    } finally {
      setLoading(false);
    }
  }

  async function handleSetPrimary(membershipId: string) {
    if (!selectedBranchId) return;
    try {
      setLoading(true);
      setError('');
      await setPrimaryBranch(clinic.clinicId, selectedBranchId, membershipId, csrfToken);
      setSuccess('تم تعيين الفرع الرئيسي للموظف');
      await loadStaff(selectedBranchId);
    } catch (err: any) {
      setError(err?.message || 'تعذّر تعيين الفرع الرئيسي');
    } finally {
      setLoading(false);
    }
  }

  async function handleRemoveStaff(membershipId: string) {
    if (!selectedBranchId) return;
    try {
      setLoading(true);
      setError('');
      await removeBranchStaff(clinic.clinicId, selectedBranchId, membershipId, csrfToken);
      setSuccess('تم إلغاء تخصيص الموظف من هذا الفرع');
      await loadStaff(selectedBranchId);
    } catch (err: any) {
      setError(err?.message || 'تعذّر إزالة الموظف من الفرع');
    } finally {
      setLoading(false);
    }
  }

  async function handleDispatch(e: FormEvent) {
    e.preventDefault();
    try {
      setLoading(true);
      setError('');
      await dispatchTransfer(
        clinic.clinicId,
        {
          sourceBranchId: transferSrcBranch,
          destinationBranchId: transferDstBranch,
          sourceLocationId: transferSrcLocation,
          destinationLocationId: transferDstLocation,
          productId: transferProductId,
          quantity: Number(transferQuantity),
          notes: transferNotes || undefined,
        },
        csrfToken,
      );
      setSuccess('تم إرسال شحنة التحويل بنجاح');
      setDispatchModalOpen(false);
      await loadTransfers();
    } catch (err: any) {
      setError(err?.message || 'تعذّر إرسال التحويل المخزني');
    } finally {
      setLoading(false);
    }
  }

  async function handleReceive(e: FormEvent) {
    e.preventDefault();
    if (!receiveModalTransfer) return;
    try {
      setLoading(true);
      setError('');
      await receiveTransfer(
        clinic.clinicId,
        receiveModalTransfer.id,
        {
          expectedVersion: 1,
          condition: receiveCondition,
          discrepancyQuantity: Number(receiveDiscrepancy) || 0,
          notes: receiveNotes || undefined,
        },
        csrfToken,
      );
      setSuccess('تم تأكيد استلام الشحنة وإضافتها لمخزون الفرع');
      setReceiveModalTransfer(null);
      await loadTransfers();
    } catch (err: any) {
      setError(err?.message || 'تعذّر استلام الشحنة');
    } finally {
      setLoading(false);
    }
  }

  async function handleCancelTransfer(e: FormEvent) {
    e.preventDefault();
    if (!cancelModalTransfer) return;
    try {
      setLoading(true);
      setError('');
      await cancelTransfer(
        clinic.clinicId,
        cancelModalTransfer.id,
        {
          expectedVersion: 1,
          reason: cancelReason,
        },
        csrfToken,
      );
      setSuccess('تم إلغاء التحويل واسترجاع الكميات');
      setCancelModalTransfer(null);
      await loadTransfers();
    } catch (err: any) {
      setError(err?.message || 'تعذّر إلغاء التحويل');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="branch-management-panel" dir="rtl">
      <div className="settings-intro">
        <span className="auth-kicker">إدارة المنظمة متعددة الفروع</span>
        <h3>فروع العيادة والعمليات المشتركة</h3>
        <p>إدارة الفروع ومواقع العمل، توزيع الكادر الطبي، ومتابعة التحويلات المخزنية بين الفروع بأمان كامل.</p>
      </div>

      <nav className="settings-tabs" aria-label="أقسام الفروع">
        <button
          className={activeTab === 'branches' ? 'selected' : ''}
          onClick={() => { setActiveTab('branches'); setError(''); setSuccess(''); }}
        >
          الفروع ومواقع العمل ({branches.length})
        </button>
        <button
          className={activeTab === 'staff' ? 'selected' : ''}
          onClick={() => { setActiveTab('staff'); setError(''); setSuccess(''); }}
        >
          طاقم العمل وتوزيع الفروع
        </button>
        <button
          className={activeTab === 'transfers' ? 'selected' : ''}
          onClick={() => { setActiveTab('transfers'); setError(''); setSuccess(''); }}
        >
          التحويلات المخزنية بين الفروع
        </button>
      </nav>

      {error && <p className="patient-error" role="alert">{error}</p>}
      {success && <p className="settings-success" role="status">{success}</p>}

      {/* Tab 1: Branches list */}
      {activeTab === 'branches' && (
        <div className="branches-tab-content">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h4>قائمة الفروع العاملة</h4>
            {canManage && (
              <button className="primary-btn" onClick={() => setCreateModalOpen(true)}>
                + إضافة فرع جديد
              </button>
            )}
          </div>

          <div className="branches-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
            {branches.map((b) => (
              <div
                key={b.id}
                className="branch-card"
                style={{
                  border: '1px solid var(--border-color, #e2e8f0)',
                  borderRadius: '8px',
                  padding: '1.25rem',
                  background: 'var(--card-bg, #ffffff)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0 }}>{b.nameAr}</h4>
                  <span
                    className={`badge badge-${b.status.toLowerCase()}`}
                    style={{
                      fontSize: '0.8rem',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: b.status === 'ACTIVE' ? '#e6fffa' : '#fed7d7',
                      color: b.status === 'ACTIVE' ? '#234e52' : '#742a2a',
                    }}
                  >
                    {b.status === 'ACTIVE' ? 'نشط' : b.status === 'INACTIVE' ? 'غير نشط' : 'موقوف'}
                  </span>
                </div>
                {b.nameEn && <p style={{ color: '#718096', fontSize: '0.9rem', margin: '4px 0' }}>{b.nameEn}</p>}
                <p style={{ fontSize: '0.85rem', color: '#4a5568', margin: '6px 0' }}>
                  <strong>رمز الفرع:</strong> <code>{b.code}</code>
                </p>
                {b.address && (
                  <p style={{ fontSize: '0.85rem', color: '#4a5568', margin: '4px 0' }}>
                    <strong>العنوان:</strong> {b.address}
                  </p>
                )}
                {b.phone && (
                  <p style={{ fontSize: '0.85rem', color: '#4a5568', margin: '4px 0' }}>
                    <strong>الهاتف:</strong> <span dir="ltr">{b.phone}</span>
                  </p>
                )}
                <p style={{ fontSize: '0.85rem', color: '#4a5568', margin: '4px 0' }}>
                  <strong>المنطقة الزمنية:</strong> <span dir="ltr">{b.timezone}</span>
                </p>
                {b._count && (
                  <div style={{ display: 'flex', gap: '12px', fontSize: '0.8rem', color: '#718096', marginTop: '8px' }}>
                    <span>👥 {b._count.memberships} موظف</span>
                    <span>🏥 {b._count.resources} مورد</span>
                    <span>📦 {b._count.inventoryLocations} مستودع</span>
                  </div>
                )}
                {canManage && (
                  <div style={{ marginTop: '1rem', borderTop: '1px solid #edf2f7', paddingTop: '0.75rem' }}>
                    <button
                      className="table-btn"
                      onClick={() => setEditBranch({ ...b })}
                    >
                      تعديل الفرع
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Staff assignments */}
      {activeTab === 'staff' && (
        <div className="staff-tab-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
            <label htmlFor="branch-select"><strong>اختر الفرع:</strong></label>
            <select
              id="branch-select"
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              style={{ minWidth: '220px', padding: '6px 12px' }}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.nameAr} ({b.code})</option>
              ))}
            </select>
            {canManage && (
              <button className="primary-btn" onClick={() => setAssignModalOpen(true)}>
                + تخصيص موظف لهذا الفرع
              </button>
            )}
          </div>

          <table className="settings-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'right', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '8px' }}>اسم الموظف</th>
                <th style={{ padding: '8px' }}>البريد الإلكتروني</th>
                <th style={{ padding: '8px' }}>الدور الوظيفي</th>
                <th style={{ padding: '8px' }}>الفرع الرئيسي؟</th>
                <th style={{ padding: '8px' }}>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {staffList.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '1.5rem', color: '#a0aec0' }}>
                    لا يوجد طاقم عمل مخصص لهذا الفرع حاليًا
                  </td>
                </tr>
              ) : (
                staffList.map((s) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #edf2f7' }}>
                    <td style={{ padding: '8px' }}>{s.membership?.user?.name || '—'}</td>
                    <td style={{ padding: '8px' }} dir="ltr">{s.membership?.user?.email || '—'}</td>
                    <td style={{ padding: '8px' }}>{s.membership?.role || '—'}</td>
                    <td style={{ padding: '8px' }}>
                      {s.isPrimary ? (
                        <span style={{ color: '#2b6cb0', fontWeight: 'bold' }}>⭐ الفرع الرئيسي</span>
                      ) : (
                        <span style={{ color: '#718096' }}>فرع إضافي</span>
                      )}
                    </td>
                    <td style={{ padding: '8px' }}>
                      {canManage && (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {!s.isPrimary && (
                            <button
                              className="table-btn"
                              onClick={() => handleSetPrimary(s.membershipId)}
                            >
                              تعيين كرئيسي
                            </button>
                          )}
                          <button
                            className="table-btn"
                            style={{ color: '#e53e3e' }}
                            onClick={() => handleRemoveStaff(s.membershipId)}
                          >
                            إلغاء التخصيص
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 3: Inter-Branch Stock Transfers */}
      {activeTab === 'transfers' && (
        <div className="transfers-tab-content">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h4>سجل التحويلات المخزنية</h4>
            {canTransfer && (
              <button className="primary-btn" onClick={() => setDispatchModalOpen(true)}>
                + إرسال شحنة تحويل جديدة
              </button>
            )}
          </div>

          <table className="settings-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'right', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '8px' }}>رقم التحويل</th>
                <th style={{ padding: '8px' }}>من فرع</th>
                <th style={{ padding: '8px' }}>إلى فرع</th>
                <th style={{ padding: '8px' }}>المنتج</th>
                <th style={{ padding: '8px' }}>الكمية</th>
                <th style={{ padding: '8px' }}>الحالة</th>
                <th style={{ padding: '8px' }}>تاريخ الإرسال</th>
                <th style={{ padding: '8px' }}>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {transfers.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '1.5rem', color: '#a0aec0' }}>
                    لا توجد تحويلات مخزنية مسجلة
                  </td>
                </tr>
              ) : (
                transfers.map((t) => (
                  <tr key={t.id} style={{ borderBottom: '1px solid #edf2f7' }}>
                    <td style={{ padding: '8px' }}><code>{t.transferNumber}</code></td>
                    <td style={{ padding: '8px' }}>{t.sourceBranch?.nameAr || '—'}</td>
                    <td style={{ padding: '8px' }}>{t.destinationBranch?.nameAr || '—'}</td>
                    <td style={{ padding: '8px' }}>{t.product?.nameAr || '—'}</td>
                    <td style={{ padding: '8px' }}>{t.quantity} {t.product?.unit}</td>
                    <td style={{ padding: '8px' }}>
                      <span
                        style={{
                          fontSize: '0.8rem',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background:
                            t.status === 'RECEIVED'
                              ? '#c6f6d5'
                              : t.status === 'DISPATCHED'
                              ? '#feebc8'
                              : '#fed7d7',
                          color:
                            t.status === 'RECEIVED'
                              ? '#22543d'
                              : t.status === 'DISPATCHED'
                              ? '#744210'
                              : '#742a2a',
                        }}
                      >
                        {t.status === 'RECEIVED'
                          ? 'مستلمة'
                          : t.status === 'DISPATCHED'
                          ? 'قيد النقل'
                          : t.status === 'CANCELLED'
                          ? 'ملغاة'
                          : 'معلقة'}
                      </span>
                    </td>
                    <td style={{ padding: '8px', fontSize: '0.85rem' }}>
                      {new Date(t.dispatchedAt).toLocaleDateString('ar-YE')}
                    </td>
                    <td style={{ padding: '8px' }}>
                      {canTransfer && t.status === 'DISPATCHED' && (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            className="table-btn"
                            onClick={() => setReceiveModalTransfer(t)}
                          >
                            تأكيد الاستلام
                          </button>
                          <button
                            className="table-btn"
                            style={{ color: '#e53e3e' }}
                            onClick={() => setCancelModalTransfer(t)}
                          >
                            إلغاء
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Assign Staff */}
      {assignModalOpen && (
        <Modal title="تخصيص موظف للفرع" onClose={() => setAssignModalOpen(false)}>
          <form onSubmit={handleAssignStaff} className="settings-form">
            <label className="settings-field">
              معرف عضوية الموظف (Membership ID)
              <input
                type="text"
                required
                value={assignMembershipId}
                onChange={(e) => setAssignMembershipId(e.target.value)}
                placeholder="UUID عضوية الموظف"
                dir="ltr"
              />
            </label>
            <label className="settings-check" style={{ marginTop: '0.5rem' }}>
              <input
                type="checkbox"
                checked={assignIsPrimary}
                onChange={(e) => setAssignIsPrimary(e.target.checked)}
              />
              تعيين هذا الفرع كفرع رئيسي للموظف
            </label>
            <div style={{ display: 'flex', gap: '8px', marginTop: '1rem' }}>
              <button className="primary-btn" type="submit" disabled={loading}>
                {loading ? 'جارٍ التخصيص...' : 'تخصيص للفرع'}
              </button>
              <button type="button" className="table-btn" onClick={() => setAssignModalOpen(false)}>
                إلغاء
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Create Branch */}
      {createModalOpen && (
        <Modal title="إضافة فرع جديد" onClose={() => setCreateModalOpen(false)}>
          <form onSubmit={handleCreateBranch} className="settings-form">
            <label className="settings-field">
              رمز الفرع الفريد (مثل: NORTH, MAIN, DOWNTOWN)
              <input
                type="text"
                required
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                placeholder="NORTH"
                dir="ltr"
              />
            </label>
            <label className="settings-field">
              اسم الفرع بالعربية
              <input
                type="text"
                required
                value={newNameAr}
                onChange={(e) => setNewNameAr(e.target.value)}
                placeholder="فرع صنعاء الشمالي"
              />
            </label>
            <label className="settings-field">
              الاسم بالإنجليزية (اختياري)
              <input
                type="text"
                value={newNameEn}
                onChange={(e) => setNewNameEn(e.target.value)}
                placeholder="North Sanaa Branch"
                dir="ltr"
              />
            </label>
            <label className="settings-field">
              هاتف التواصل
              <input
                type="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="+967..."
                dir="ltr"
              />
            </label>
            <label className="settings-field">
              العنوان الفعلي
              <input
                type="text"
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder="شارع الستين، برج لمسة"
              />
            </label>
            <label className="settings-field">
              المنطقة الزمنية
              <input
                type="text"
                value={newTimezone}
                onChange={(e) => setNewTimezone(e.target.value)}
                dir="ltr"
              />
            </label>
            <div style={{ display: 'flex', gap: '8px', marginTop: '1rem' }}>
              <button className="primary-btn" type="submit" disabled={loading}>
                {loading ? 'جارٍ الإنشاء...' : 'إنشاء الفرع'}
              </button>
              <button type="button" className="table-btn" onClick={() => setCreateModalOpen(false)}>
                إلغاء
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Edit Branch */}
      {editBranch && (
        <Modal title={`تعديل الفرع: ${editBranch.nameAr}`} onClose={() => setEditBranch(null)}>
          <form onSubmit={handleUpdateBranch} className="settings-form">
            <label className="settings-field">
              رمز الفرع (ثابت)
              <input type="text" disabled value={editBranch.code} dir="ltr" />
            </label>
            <label className="settings-field">
              اسم الفرع بالعربية
              <input
                type="text"
                required
                value={editBranch.nameAr}
                onChange={(e) => setEditBranch({ ...editBranch, nameAr: e.target.value })}
              />
            </label>
            <label className="settings-field">
              الاسم بالإنجليزية
              <input
                type="text"
                value={editBranch.nameEn || ''}
                onChange={(e) => setEditBranch({ ...editBranch, nameEn: e.target.value })}
                dir="ltr"
              />
            </label>
            <label className="settings-field">
              هاتف التواصل
              <input
                type="tel"
                value={editBranch.phone || ''}
                onChange={(e) => setEditBranch({ ...editBranch, phone: e.target.value })}
                dir="ltr"
              />
            </label>
            <label className="settings-field">
              العنوان الفعلي
              <input
                type="text"
                value={editBranch.address || ''}
                onChange={(e) => setEditBranch({ ...editBranch, address: e.target.value })}
              />
            </label>
            <label className="settings-field">
              حالة الفرع
              <select
                value={editBranch.status}
                onChange={(e) => setEditBranch({ ...editBranch, status: e.target.value as any })}
              >
                <option value="ACTIVE">نشط (ACTIVE)</option>
                <option value="INACTIVE">غير نشط (INACTIVE)</option>
                <option value="SUSPENDED">موقوف مؤقتًا (SUSPENDED)</option>
              </select>
            </label>
            <div style={{ display: 'flex', gap: '8px', marginTop: '1rem' }}>
              <button className="primary-btn" type="submit" disabled={loading}>
                {loading ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}
              </button>
              <button type="button" className="table-btn" onClick={() => setEditBranch(null)}>
                إلغاء
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Dispatch Transfer */}
      {dispatchModalOpen && (
        <Modal title="إرسال شحنة تحويل مخزني بين الفروع" onClose={() => setDispatchModalOpen(false)}>
          <form onSubmit={handleDispatch} className="settings-form">
            <label className="settings-field">
              فرع المصدر
              <select
                required
                value={transferSrcBranch}
                onChange={(e) => setTransferSrcBranch(e.target.value)}
              >
                <option value="">-- اختر فرع المصدر --</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.nameAr} ({b.code})</option>
                ))}
              </select>
            </label>
            <label className="settings-field">
              فرع الوجهة
              <select
                required
                value={transferDstBranch}
                onChange={(e) => setTransferDstBranch(e.target.value)}
              >
                <option value="">-- اختر فرع الوجهة --</option>
                {branches.filter((b) => b.id !== transferSrcBranch).map((b) => (
                  <option key={b.id} value={b.id}>{b.nameAr} ({b.code})</option>
                ))}
              </select>
            </label>
            <label className="settings-field">
              معرف مستودع المصدر
              <input
                type="text"
                required
                value={transferSrcLocation}
                onChange={(e) => setTransferSrcLocation(e.target.value)}
                placeholder="UUID مستودع المصدر"
                dir="ltr"
              />
            </label>
            <label className="settings-field">
              معرف مستودع الوجهة
              <input
                type="text"
                required
                value={transferDstLocation}
                onChange={(e) => setTransferDstLocation(e.target.value)}
                placeholder="UUID مستودع الوجهة"
                dir="ltr"
              />
            </label>
            <label className="settings-field">
              معرف المنتج
              <input
                type="text"
                required
                value={transferProductId}
                onChange={(e) => setTransferProductId(e.target.value)}
                placeholder="UUID المنتج"
                dir="ltr"
              />
            </label>
            <label className="settings-field">
              الكمية المحولة
              <input
                type="number"
                min="0.0001"
                step="any"
                required
                value={transferQuantity}
                onChange={(e) => setTransferQuantity(Number(e.target.value))}
              />
            </label>
            <label className="settings-field">
              ملاحظات التحويل
              <input
                type="text"
                value={transferNotes}
                onChange={(e) => setTransferNotes(e.target.value)}
                placeholder="ملاحظات الشحن أو سبب النقل"
              />
            </label>
            <div style={{ display: 'flex', gap: '8px', marginTop: '1rem' }}>
              <button className="primary-btn" type="submit" disabled={loading}>
                {loading ? 'جارٍ الإرسال...' : 'تأكيد إرسال الشحنة'}
              </button>
              <button type="button" className="table-btn" onClick={() => setDispatchModalOpen(false)}>
                إلغاء
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Receive Transfer */}
      {receiveModalTransfer && (
        <Modal
          title={`تأكيد استلام الشحنة: ${receiveModalTransfer.transferNumber}`}
          onClose={() => setReceiveModalTransfer(null)}
        >
          <form onSubmit={handleReceive} className="settings-form">
            <p>
              الكمية المرسلة: <strong>{receiveModalTransfer.quantity}</strong>
            </p>
            <label className="settings-field">
              حالة الشحنة عند الاستلام
              <select
                value={receiveCondition}
                onChange={(e) => setReceiveCondition(e.target.value)}
              >
                <option value="GOOD">سليمة بالكامل (GOOD)</option>
                <option value="DAMAGED">متضررة جزئيًا (DAMAGED)</option>
                <option value="DISCREPANCY">يوجد نقص في العدد (DISCREPANCY)</option>
              </select>
            </label>
            <label className="settings-field">
              كمية النقص أو التلف (إن وجد)
              <input
                type="number"
                min="0"
                step="any"
                value={receiveDiscrepancy}
                onChange={(e) => setReceiveDiscrepancy(Number(e.target.value))}
              />
            </label>
            <label className="settings-field">
              ملاحظات الاستلام
              <input
                type="text"
                value={receiveNotes}
                onChange={(e) => setReceiveNotes(e.target.value)}
                placeholder="ملاحظات فحص الطرد"
              />
            </label>
            <div style={{ display: 'flex', gap: '8px', marginTop: '1rem' }}>
              <button className="primary-btn" type="submit" disabled={loading}>
                {loading ? 'جارٍ التأكيد...' : 'تأكيد الاستلام وإيداع المخزون'}
              </button>
              <button type="button" className="table-btn" onClick={() => setReceiveModalTransfer(null)}>
                إلغاء
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Cancel Transfer */}
      {cancelModalTransfer && (
        <Modal
          title={`إلغاء التحويل: ${cancelModalTransfer.transferNumber}`}
          onClose={() => setCancelModalTransfer(null)}
        >
          <form onSubmit={handleCancelTransfer} className="settings-form">
            <p style={{ color: '#c53030' }}>
              سيتم إلغاء الشحنة واسترجاع الكمية ({cancelModalTransfer.quantity}) إلى رصيد الفرع المرسل.
            </p>
            <label className="settings-field">
              سبب الإلغاء
              <input
                type="text"
                required
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="مثل: إلغاء طلب الفرع، تعذر الشحن..."
              />
            </label>
            <div style={{ display: 'flex', gap: '8px', marginTop: '1rem' }}>
              <button
                className="primary-btn"
                type="submit"
                style={{ background: '#e53e3e' }}
                disabled={loading}
              >
                {loading ? 'جارٍ الإلغاء...' : 'تأكيد إلغاء الشحنة'}
              </button>
              <button type="button" className="table-btn" onClick={() => setCancelModalTransfer(null)}>
                تراجع
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

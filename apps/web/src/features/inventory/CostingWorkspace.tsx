import { useEffect, useState, useCallback } from 'react';
import type { ClinicContext } from '../auth/api';
import {
  type ValuationReportResponse,
  type InventoryCostLayerRecord,
  type InventoryLandedCostRecord,
  type InventoryCostMovementRecord,
  costingApi,
  COST_STATUS_LABELS,
  PROVENANCE_LABELS,
  ALLOCATION_METHOD_LABELS,
  LANDED_STATUS_LABELS,
  MOVEMENT_TYPE_LABELS,
  type LandedCostAllocationMethod,
} from './costing-api';
import { inventoryApi, type InventoryGoodsReceiptRecord } from './inventory-api';

interface Props {
  clinic: ClinicContext;
  csrfToken: string;
  onAuthError: (error: unknown) => void;
}

type CostingSubTab = 'VALUATION' | 'LAYERS' | 'LANDED_COSTS' | 'MOVEMENTS' | 'ADJUSTMENTS';

export function CostingWorkspace({ clinic, csrfToken, onAuthError }: Props) {
  const [activeTab, setActiveTab] = useState<CostingSubTab>('VALUATION');
  const [report, setReport] = useState<ValuationReportResponse | null>(null);
  const [layers, setLayers] = useState<InventoryCostLayerRecord[]>([]);
  const [landedCosts, setLandedCosts] = useState<InventoryLandedCostRecord[]>([]);
  const [movements, setMovements] = useState<InventoryCostMovementRecord[]>([]);
  const [receipts, setReceipts] = useState<InventoryGoodsReceiptRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Modals & form state
  const [draftModalOpen, setDraftModalOpen] = useState(false);
  const [selectedReceiptId, setSelectedReceiptId] = useState('');
  const [freightCost, setFreightCost] = useState('0.00');
  const [customsDuty, setCustomsDuty] = useState('0.00');
  const [insuranceCost, setInsuranceCost] = useState('0.00');
  const [handlingCost, setHandlingCost] = useState('0.00');
  const [discountCredit, setDiscountCredit] = useState('0.00');
  const [allocationMethod, setAllocationMethod] = useState<LandedCostAllocationMethod>('BY_VALUE');
  const [landedNotes, setLandedNotes] = useState('');

  // Cost Adjustment Modal state
  const [adjustmentModalOpen, setAdjustmentModalOpen] = useState(false);
  const [targetLayer, setTargetLayer] = useState<InventoryCostLayerRecord | null>(null);
  const [newUnitCost, setNewUnitCost] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');

  // Snapshot notes
  const [snapshotNotes, setSnapshotNotes] = useState('');
  const [snapshotModalOpen, setSnapshotModalOpen] = useState(false);

  // Opening balance state
  const [defaultOpeningCost, setDefaultOpeningCost] = useState('10.00');

  const permissions = clinic.permissions || [];
  const canManageCosting = permissions.includes('inventory.costing.manage');
  const canApproveCosting = permissions.includes('inventory.costing.approve');

  const api = costingApi(clinic.clinicId);
  const invApi = inventoryApi(clinic.clinicId);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [valRes, layersRes, landedRes, movRes, receiptsRes] = await Promise.all([
        api.getValuationReport().catch(() => null),
        api.listCostLayers(new URLSearchParams({ limit: '100' })).catch(() => ({ items: [], total: 0 })),
        api.listLandedCosts().catch(() => []),
        api.listCostMovements().catch(() => []),
        invApi.listGoodsReceipts(new URLSearchParams({ limit: '50' })).catch(() => ({ items: [], nextCursor: null })),
      ]);

      if (valRes) setReport(valRes);
      setLayers(layersRes.items);
      setLandedCosts(landedRes);
      setMovements(movRes);
      setReceipts(receiptsRes.items);
    } catch (err) {
      onAuthError(err);
    } finally {
      setLoading(false);
    }
  }, [clinic.clinicId, onAuthError]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleDraftLandedCost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReceiptId) {
      setNotice({ text: 'يرجى اختيار إيصال الاستلام المراد توزيع التكاليف عليه.', type: 'error' });
      return;
    }

    try {
      await api.draftLandedCost(
        {
          goodsReceiptId: selectedReceiptId,
          freightCost,
          customsDuty,
          insuranceCost,
          handlingCost,
          discountCredit,
          allocationMethod,
          notes: landedNotes,
        },
        csrfToken,
      );
      setNotice({ text: 'تم إنشاء مسودة توزيع تكاليف الوصول بنجاح.', type: 'success' });
      setDraftModalOpen(false);
      void loadData();
    } catch (err: any) {
      setNotice({ text: `فشل إنشاء مسودة التكاليف: ${err.message || err}`, type: 'error' });
    }
  };

  const handleApproveLandedCost = async (lc: InventoryLandedCostRecord) => {
    if (!confirm(`هل أنت متأكد من اعتماد وترحيل تكاليف الوصول رقم ${lc.allocationNumber}؟`)) return;

    try {
      await api.approveLandedCost(lc.id, { expectedVersion: lc.version }, csrfToken);
      setNotice({ text: `تم اعتماد وترحيل تكاليف الوصول ${lc.allocationNumber} بنجاح.`, type: 'success' });
      void loadData();
    } catch (err: any) {
      setNotice({ text: `فشل اعتماد التكاليف: ${err.message || err}`, type: 'error' });
    }
  };

  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const snap = await api.createValuationSnapshot({ notes: snapshotNotes }, csrfToken);
      setNotice({ text: `تم تسجيل لقطة التقييم المحاسبي بنجاح برقم ${snap.snapshotNumber}.`, type: 'success' });
      setSnapshotModalOpen(false);
      setSnapshotNotes('');
      void loadData();
    } catch (err: any) {
      setNotice({ text: `فشل حفظ لقطة التقييم: ${err.message || err}`, type: 'error' });
    }
  };

  const handleInitializeOpening = async () => {
    if (!confirm('سيتم إنشاء طبقات تكلفة غير محققة (UNVERIFIED_COST) للأرصدة الموجودة بدون طبقات. هل تريد المتابعة؟'))
      return;
    try {
      const res = await api.initializeOpeningBalances({ defaultUnitCost: defaultOpeningCost }, csrfToken);
      setNotice({ text: res.message, type: 'success' });
      void loadData();
    } catch (err: any) {
      setNotice({ text: `فشل تهيئة الأرصدة الافتتاحية: ${err.message || err}`, type: 'error' });
    }
  };

  const handleApproveOpening = async () => {
    if (!confirm('هل أنت متأكد من الاعتماد المالي للأرصدة الافتتاحية وترقيتها إلى طبقات محققة (VERIFIED)؟'))
      return;
    try {
      const res = await api.approveOpeningBalances({ notes: 'اعتماد رسمي للأرصدة الافتتاحية' }, csrfToken);
      setNotice({ text: res.message, type: 'success' });
      void loadData();
    } catch (err: any) {
      setNotice({ text: `فشل اعتماد الأرصدة الافتتاحية: ${err.message || err}`, type: 'error' });
    }
  };

  const handleCreateAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetLayer || !newUnitCost || !adjustmentReason) return;
    try {
      await api.createCostAdjustment(
        {
          costLayerId: targetLayer.id,
          newUnitLandedCost: newUnitCost,
          reason: adjustmentReason,
        },
        csrfToken,
      );
      setNotice({ text: 'تم رفع طلب تعديل التكلفة للمراجعة والاعتماد.', type: 'success' });
      setAdjustmentModalOpen(false);
      setTargetLayer(null);
      setNewUnitCost('');
      setAdjustmentReason('');
      void loadData();
    } catch (err: any) {
      setNotice({ text: `فشل رفع طلب التعديل: ${err.message || err}`, type: 'error' });
    }
  };

  return (
    <div className="costing-workspace" dir="rtl">
      {/* Header & Disclaimer */}
      <div className="costing-header">
        <div>
          <h2>تقييم المخزون المحاسبي وتكاليف الوصول (FIFO Actual Landed Cost)</h2>
          <p className="costing-subtitle">
            نظام محاسبة المخزون الفعلي، توزيع تكاليف الشحن والجمارك، وتتبع طبقات التكلفة بالتسلسل التاريخي.
          </p>
        </div>
        <div className="costing-header-actions">
          {canManageCosting && (
            <button className="btn btn-secondary" onClick={() => setSnapshotModalOpen(true)}>
              حفظ لقطة تقييم رسمية
            </button>
          )}
          {canManageCosting && (
            <button className="btn btn-primary" onClick={() => setDraftModalOpen(true)}>
              + توزيع تكاليف شحن ووصول (Landed Cost)
            </button>
          )}
        </div>
      </div>

      {/* Audit & Legal Disclaimer Banner */}
      <div className="costing-disclaimer-banner">
        <span className="disclaimer-badge">إشعار محاسبي وقانوني</span>
        <span>
          تقييم المخزون المحاسبي الفعلي قائم على طبقات التكلفة التاريخية وتكلفة الوصول الفعلية (FIFO Landed Cost)
          وفق المعايير المعمول بها داخلياً، ولا يشكل إقراراً ضريبياً أو فحصاً خارجياً دون تدقيق محاسب قانوني مستقل.
        </span>
      </div>

      {notice && (
        <div className={`costing-alert ${notice.type === 'error' ? 'alert-danger' : 'alert-success'}`}>
          <span>{notice.text}</span>
          <button className="btn-close" onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      )}

      {/* Sub Tabs Navigation */}
      <div className="costing-tabs-nav">
        <button
          className={`costing-tab-btn ${activeTab === 'VALUATION' ? 'active' : ''}`}
          onClick={() => setActiveTab('VALUATION')}
        >
          تقرير التقييم المحاسبي
        </button>
        <button
          className={`costing-tab-btn ${activeTab === 'LAYERS' ? 'active' : ''}`}
          onClick={() => setActiveTab('LAYERS')}
        >
          طبقات التكلفة ({layers.length})
        </button>
        <button
          className={`costing-tab-btn ${activeTab === 'LANDED_COSTS' ? 'active' : ''}`}
          onClick={() => setActiveTab('LANDED_COSTS')}
        >
          تكاليف الوصول والشحن ({landedCosts.length})
        </button>
        <button
          className={`costing-tab-btn ${activeTab === 'MOVEMENTS' ? 'active' : ''}`}
          onClick={() => setActiveTab('MOVEMENTS')}
        >
          حركات التكلفة و COGS ({movements.length})
        </button>
        <button
          className={`costing-tab-btn ${activeTab === 'ADJUSTMENTS' ? 'active' : ''}`}
          onClick={() => setActiveTab('ADJUSTMENTS')}
        >
          الأرصدة الافتتاحية والتسويات
        </button>
      </div>

      {loading && <div className="costing-loading">جاري معالجة وتحميل البيانات المحاسبية...</div>}

      {/* Tab 1: Valuation Report */}
      {!loading && activeTab === 'VALUATION' && report && (
        <div className="costing-valuation-tab">
          <div className="valuation-metrics-grid">
            <div className="valuation-metric-card primary">
              <span className="metric-label">إجمالي تقييم المخزون الفعلي</span>
              <span className="metric-value">
                {report.summary.totalValuation} {report.currency}
              </span>
              <span className="metric-hint">{report.summary.totalOnHandUnits} وحدة بالمستودعات</span>
            </div>

            <div className="valuation-metric-card success">
              <span className="metric-label">تكلفة موثقة ومحققة (Verified)</span>
              <span className="metric-value">
                {report.summary.verifiedValuation} {report.currency}
              </span>
              <span className="metric-hint">مدعومة بفواتير وتكاليف وصول معتمدة</span>
            </div>

            <div className="valuation-metric-card warning">
              <span className="metric-label">تكلفة غير محققة (Unverified)</span>
              <span className="metric-value">
                {report.summary.unverifiedValuation} {report.currency}
              </span>
              <span className="metric-hint">أرصدة افتتاحية بانتظار الاعتماد الرسمي</span>
            </div>

            <div className="valuation-metric-card info">
              <span className="metric-label">بضاعة قيد النقل بين الفروع</span>
              <span className="metric-value">
                {report.summary.transitValuation} {report.currency}
              </span>
              <span className="metric-hint">تحويلات جارية محتفظة بالتكلفة التاريخية</span>
            </div>

            <div className="valuation-metric-card danger">
              <span className="metric-label">مخزون منتهي / محجور</span>
              <span className="metric-value">
                {report.summary.quarantinedValuation} {report.currency}
              </span>
              <span className="metric-hint">معزول عن التداول السريري والتقييم الحر</span>
            </div>
          </div>

          <div className="costing-table-container">
            <div className="table-header-title">
              <h3>تفصيل تقييم المنتجات والمستلزمات (حسب الطبقات الفعلية)</h3>
            </div>
            <table className="costing-table">
              <thead>
                <tr>
                  <th>رمز المنتج (SKU)</th>
                  <th>اسم المنتج</th>
                  <th>التصنيف</th>
                  <th>الوحدات المتاحة</th>
                  <th>متوسط تكلفة الوصول الفعلية</th>
                  <th>إجمالي القيمة التقديرية</th>
                  <th>الوحدات المحققة</th>
                  <th>الوحدات غير المحققة</th>
                  <th>عدد الطبقات النشطة</th>
                </tr>
              </thead>
              <tbody>
                {report.products.map((p) => (
                  <tr key={p.productId}>
                    <td><code>{p.sku}</code></td>
                    <td><strong>{p.nameAr}</strong></td>
                    <td>{p.category}</td>
                    <td>{p.totalUnits} {p.unit}</td>
                    <td>{p.averageLandedUnitCost} {report.currency}</td>
                    <td><strong>{p.totalValuation} {report.currency}</strong></td>
                    <td><span className="badge badge-success">{p.verifiedUnits}</span></td>
                    <td>
                      {parseFloat(p.unverifiedUnits) > 0 ? (
                        <span className="badge badge-warning">{p.unverifiedUnits}</span>
                      ) : (
                        '0.0000'
                      )}
                    </td>
                    <td>{p.activeLayersCount}</td>
                  </tr>
                ))}
                {report.products.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center">لا توجد منتجات مسجلة في التقييم المحاسبي.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Cost Layers */}
      {!loading && activeTab === 'LAYERS' && (
        <div className="costing-layers-tab">
          <div className="costing-table-container">
            <table className="costing-table">
              <thead>
                <tr>
                  <th>تاريخ الطبقة</th>
                  <th>المنتج</th>
                  <th>الفرع والموقع</th>
                  <th>الكمية المتبقية / الابتدائية</th>
                  <th>تكلفة الشراء الأصلية</th>
                  <th>تكلفة الوصول الفعلية للوحدة</th>
                  <th>إجمالي القيمة المتبقية</th>
                  <th>المصدر</th>
                  <th>الحالة المحاسبية</th>
                  {canManageCosting && <th>إجراء</th>}
                </tr>
              </thead>
              <tbody>
                {layers.map((l) => (
                  <tr key={l.id}>
                    <td>{new Date(l.layerDate).toLocaleDateString('ar-SA')}</td>
                    <td>
                      <div><strong>{l.product?.nameAr || l.productId}</strong></div>
                      <code>{l.product?.sku}</code>
                    </td>
                    <td>
                      {l.branch?.nameAr || 'الفرع الرئيسي'}
                      {l.location && <div className="sub-text">{l.location.nameAr}</div>}
                    </td>
                    <td>
                      <strong>{l.remainingQuantity}</strong> / {l.initialQuantity}
                    </td>
                    <td>{l.unitAcquisitionCost} {l.currency}</td>
                    <td><strong>{l.unitLandedCost} {l.currency}</strong></td>
                    <td><strong>{l.totalRemainingCost} {l.currency}</strong></td>
                    <td>
                      <span className="badge badge-info">{PROVENANCE_LABELS[l.sourceProvenance] || l.sourceProvenance}</span>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          l.costStatus === 'VERIFIED'
                            ? 'badge-success'
                            : l.costStatus === 'UNVERIFIED_COST'
                            ? 'badge-warning'
                            : 'badge-secondary'
                        }`}
                      >
                        {COST_STATUS_LABELS[l.costStatus] || l.costStatus}
                      </span>
                    </td>
                    {canManageCosting && (
                      <td>
                        {l.costStatus !== 'EXHAUSTED' && (
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => {
                              setTargetLayer(l);
                              setNewUnitCost(l.unitLandedCost);
                              setAdjustmentModalOpen(true);
                            }}
                          >
                            تعديل تكلفة
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {layers.length === 0 && (
                  <tr>
                    <td colSpan={10} className="text-center">لا توجد طبقات تكلفة مسجلة حالياً.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Landed Costs */}
      {!loading && activeTab === 'LANDED_COSTS' && (
        <div className="costing-landed-tab">
          <div className="costing-table-container">
            <table className="costing-table">
              <thead>
                <tr>
                  <th>رقم التوزيع</th>
                  <th>إيصال الاستلام</th>
                  <th>رسوم الشحن</th>
                  <th>الجمارك والضرائب</th>
                  <th>التخليص والمناولة</th>
                  <th>خصومات مورد</th>
                  <th>صافي رسوم الوصول</th>
                  <th>طريقة التوزيع</th>
                  <th>الحالة</th>
                  <th>تاريخ الإنشاء</th>
                  {canApproveCosting && <th>الإجراء</th>}
                </tr>
              </thead>
              <tbody>
                {landedCosts.map((lc) => (
                  <tr key={lc.id}>
                    <td><code>{lc.allocationNumber}</code></td>
                    <td>{lc.goodsReceipt?.receiptNumber || lc.goodsReceiptId || '-'}</td>
                    <td>{lc.freightCost}</td>
                    <td>{lc.customsDuty}</td>
                    <td>{lc.handlingCost}</td>
                    <td>{lc.discountCredit}</td>
                    <td><strong>{lc.totalLandedCharges}</strong></td>
                    <td>{ALLOCATION_METHOD_LABELS[lc.allocationMethod]}</td>
                    <td>
                      <span className={`badge ${lc.status === 'APPROVED' ? 'badge-success' : 'badge-warning'}`}>
                        {LANDED_STATUS_LABELS[lc.status] || lc.status}
                      </span>
                    </td>
                    <td>{new Date(lc.createdAt).toLocaleDateString('ar-SA')}</td>
                    {canApproveCosting && (
                      <td>
                        {lc.status === 'DRAFT' && (
                          <button className="btn btn-sm btn-success" onClick={() => handleApproveLandedCost(lc)}>
                            اعتماد وترحيل
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {landedCosts.length === 0 && (
                  <tr>
                    <td colSpan={11} className="text-center">لا توجد عمليات توزيع تكاليف وصول مسجلة.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Cost Movements */}
      {!loading && activeTab === 'MOVEMENTS' && (
        <div className="costing-movements-tab">
          <div className="costing-table-container">
            <table className="costing-table">
              <thead>
                <tr>
                  <th>رقم الحركة</th>
                  <th>نوع الحركة المحاسبية</th>
                  <th>المنتج</th>
                  <th>الفرع</th>
                  <th>الكمية</th>
                  <th>تكلفة الوحدة المحملة</th>
                  <th>إجمالي التكلفة</th>
                  <th>تكلفة الهدر المنسوبة</th>
                  <th>التاريخ والوقت</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td><code>{m.movementNumber}</code></td>
                    <td>
                      <span className="badge badge-secondary">{MOVEMENT_TYPE_LABELS[m.movementType] || m.movementType}</span>
                    </td>
                    <td>{m.costLayer?.product?.nameAr || '-'}</td>
                    <td>{m.costLayer?.branch?.nameAr || 'الفرع الرئيسي'}</td>
                    <td>{m.quantity}</td>
                    <td>{m.unitCost}</td>
                    <td><strong>{m.totalCost}</strong></td>
                    <td>{parseFloat(m.wasteCost) > 0 ? <span className="text-danger">{m.wasteCost}</span> : '0.00'}</td>
                    <td>{new Date(m.occurredAt).toLocaleString('ar-SA')}</td>
                  </tr>
                ))}
                {movements.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center">لا توجد حركات تكلفة مسجلة حتى الآن.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 5: Opening Balances & Adjustments */}
      {!loading && activeTab === 'ADJUSTMENTS' && (
        <div className="costing-adjustments-tab">
          <div className="adjustments-cards-grid">
            {/* Opening Balance Card */}
            <div className="costing-action-card">
              <h3>الأرصدة الافتتاحية للمخزون (Opening Balances)</h3>
              <p>
                في حال وجود أرصدة مخزون سابقة مسجلة دون طبقات تكلفة دقيقة، يمكنك توليد طبقات تكلفة غير محققة
                (UNVERIFIED_COST) اعتماداً على التكلفة التقديرية، تمهيداً لمراجعتها واعتمادها محاسبياً.
              </p>
              {canManageCosting && (
                <div className="form-group inline">
                  <label>التكلفة التقديرية الافتراضية:</label>
                  <input
                    type="number"
                    step="0.01"
                    value={defaultOpeningCost}
                    onChange={(e) => setDefaultOpeningCost(e.target.value)}
                    className="form-control"
                    style={{ width: '120px' }}
                  />
                  <button className="btn btn-secondary" onClick={handleInitializeOpening}>
                    توليد طبقات الأرصدة الافتتاحية
                  </button>
                </div>
              )}
              {canApproveCosting && (
                <div style={{ marginTop: '1rem' }}>
                  <button className="btn btn-success" onClick={handleApproveOpening}>
                    اعتماد كافة الأرصدة الافتتاحية وترقيتها إلى VERIFIED
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Draft Landed Cost Modal */}
      {draftModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>توزيع تكاليف الشحن والوصول (Landed Cost Allocation)</h3>
              <button className="btn-close" onClick={() => setDraftModalOpen(false)}>×</button>
            </div>
            <form onSubmit={handleDraftLandedCost}>
              <div className="modal-body">
                <div className="form-group">
                  <label>إيصال الاستلام المستهدف:</label>
                  <select
                    className="form-control"
                    value={selectedReceiptId}
                    onChange={(e) => setSelectedReceiptId(e.target.value)}
                    required
                  >
                    <option value="">-- اختر إيصال استلام بضاعة --</option>
                    {receipts.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.receiptNumber} - {r.supplierDeliveryNote || 'بدون إشعار'} ({new Date(r.receivedAt).toLocaleDateString('ar-SA')})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>تكلفة الشحن والنقل:</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control"
                      value={freightCost}
                      onChange={(e) => setFreightCost(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>الرسوم الجمركية:</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control"
                      value={customsDuty}
                      onChange={(e) => setCustomsDuty(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>رسوم التأمين:</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control"
                      value={insuranceCost}
                      onChange={(e) => setInsuranceCost(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>رسوم المناولة والتخليص:</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control"
                      value={handlingCost}
                      onChange={(e) => setHandlingCost(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>خصومات أو ائتمان المورد:</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control"
                      value={discountCredit}
                      onChange={(e) => setDiscountCredit(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>طريقة التوزيع على البنود:</label>
                    <select
                      className="form-control"
                      value={allocationMethod}
                      onChange={(e) => setAllocationMethod(e.target.value as LandedCostAllocationMethod)}
                    >
                      <option value="BY_VALUE">حسب القيمة الإجمالية للبنود (تناسبي مع السعر)</option>
                      <option value="BY_QUANTITY">حسب عدد الوحدات المستلمة (تناسبي مع الكمية)</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>ملاحظات التوزيع والاعتماد:</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    value={landedNotes}
                    onChange={(e) => setLandedNotes(e.target.value)}
                    placeholder="رقم بوليصة الشحن، اسم المخلص الجمركي..."
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setDraftModalOpen(false)}>
                  إلغاء
                </button>
                <button type="submit" className="btn btn-primary">
                  حفظ وتوزيع التكاليف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Snapshot Modal */}
      {snapshotModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>حفظ لقطة تقييم محاسبي رسمية (Valuation Snapshot)</h3>
              <button className="btn-close" onClick={() => setSnapshotModalOpen(false)}>×</button>
            </div>
            <form onSubmit={handleCreateSnapshot}>
              <div className="modal-body">
                <p>
                  سيتم إنشاء لقطة غير قابلة للتعديل تمثل المركز المالي وتقييم المخزون في هذه اللحظة، وتوليد رقم إقفال تسلسلي رسمي.
                </p>
                <div className="form-group">
                  <label>ملاحظات الإقفال أو الغرض:</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    value={snapshotNotes}
                    onChange={(e) => setSnapshotNotes(e.target.value)}
                    placeholder="مثال: إقفال مالي لنهاية الربع الرابع 2026..."
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setSnapshotModalOpen(false)}>
                  إلغاء
                </button>
                <button type="submit" className="btn btn-primary">
                  تأكيد وحفظ اللقطة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cost Adjustment Modal */}
      {adjustmentModalOpen && targetLayer && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>طلب تعديل تكلفة طبقة مخزون (Revaluation Adjustment)</h3>
              <button className="btn-close" onClick={() => setAdjustmentModalOpen(false)}>×</button>
            </div>
            <form onSubmit={handleCreateAdjustment}>
              <div className="modal-body">
                <p>
                  المنتج: <strong>{targetLayer.product?.nameAr}</strong> ({targetLayer.product?.sku})
                  <br />
                  التكلفة المحملة الحالية للوحدة: <strong>{targetLayer.unitLandedCost} {targetLayer.currency}</strong>
                  <br />
                  الكمية المتأثرة بالتعديل: <strong>{targetLayer.remainingQuantity}</strong>
                </p>

                <div className="form-group">
                  <label>تكلفة الوحدة الجديدة المقترحة:</label>
                  <input
                    type="number"
                    step="0.0001"
                    className="form-control"
                    value={newUnitCost}
                    onChange={(e) => setNewUnitCost(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>سبب التعديل المحاسبي (مطلوب):</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    value={adjustmentReason}
                    onChange={(e) => setAdjustmentReason(e.target.value)}
                    placeholder="فروقات فواتير جمركية نهائية، خصم استرجاع تجاري من المورد..."
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setAdjustmentModalOpen(false)}>
                  إلغاء
                </button>
                <button type="submit" className="btn btn-primary">
                  إرسال الطلب للاعتماد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

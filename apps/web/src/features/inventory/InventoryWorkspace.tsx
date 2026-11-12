import { useEffect, useState, useCallback } from 'react';
import type { ClinicContext } from '../auth/api';
import {
  type InventoryProductRecord,
  type InventoryLocationRecord,
  type InventoryBalanceRecord,
  type InventoryMovementRecord,
  type InventoryMovementType,
  type InventorySupplierRecord,
  inventoryApi,
} from './inventory-api';
import { ProductCatalogPanel } from './ProductCatalogPanel';
import { StockLocationsPanel } from './StockLocationsPanel';
import { StockOperationsModal } from './StockOperationsModal';
import { StockMovementsHistory } from './StockMovementsHistory';
import { LedgerReconciliationPanel } from './LedgerReconciliationPanel';
import { BatchManagementPanel } from './BatchManagementPanel';
import { SupplierManagementPanel } from './SupplierManagementPanel';
import { PurchaseOrderManagementPanel } from './PurchaseOrderManagementPanel';
import { StockCountPanel } from './StockCountPanel';
import { InventoryAlertsBanner } from './InventoryAlertsBanner';
import { CostingWorkspace } from './CostingWorkspace';
import './inventory.css';

interface Props {
  clinic: ClinicContext;
  csrfToken: string;
  onAuthError: (error: unknown) => void;
}

type MainTab =
  | 'OVERVIEW'
  | 'PRODUCTS'
  | 'LOCATIONS'
  | 'BALANCES'
  | 'BATCHES'
  | 'SUPPLIERS'
  | 'PURCHASE_ORDERS'
  | 'STOCK_COUNTS'
  | 'MOVEMENTS'
  | 'RECONCILE'
  | 'COSTING';

export function InventoryWorkspace({ clinic, csrfToken, onAuthError }: Props) {
  const [activeTab, setActiveTab] = useState<MainTab>('OVERVIEW');
  const [products, setProducts] = useState<InventoryProductRecord[]>([]);
  const [locations, setLocations] = useState<InventoryLocationRecord[]>([]);
  const [balances, setBalances] = useState<InventoryBalanceRecord[]>([]);
  const [movements, setMovements] = useState<InventoryMovementRecord[]>([]);
  const [suppliers, setSuppliers] = useState<InventorySupplierRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [operationsModalOpen, setOperationsModalOpen] = useState(false);

  const permissions = clinic.permissions || [];
  const canManageProducts = permissions.includes('inventory.products.manage');
  const canManageLocations = permissions.includes('inventory.locations.manage');
  const canPerformStock =
    permissions.includes('inventory.stock.receive') ||
    permissions.includes('inventory.stock.issue') ||
    permissions.includes('inventory.stock.transfer') ||
    permissions.includes('inventory.stock.adjust');
  const canReconcile = permissions.includes('inventory.reconcile');
  const canManageSuppliers = permissions.includes('inventory.suppliers.manage');
  const canCreatePO = permissions.includes('inventory.purchase-orders.create');
  const canApprovePO = permissions.includes('inventory.purchase-orders.approve');
  const canReceiveGoods = permissions.includes('inventory.goods-receipt.record');
  const canManageStockCounts = permissions.includes('inventory.stock-counts.manage');
  const canReconcileStockCounts = permissions.includes('inventory.stock-counts.reconcile');
  const canAcknowledgeAlerts = permissions.includes('inventory.alerts.acknowledge');
  const canCostingRead = permissions.includes('inventory.costing.read');

  const loadData = useCallback(async () => {
    setLoading(true);
    const api = inventoryApi(clinic.clinicId);
    try {
      const [prodRes, locRes, balRes, movRes, supRes] = await Promise.all([
        api.listProducts(new URLSearchParams({ limit: '100' })),
        api.listLocations(),
        api.listBalances(new URLSearchParams()),
        api.listMovements(new URLSearchParams({ limit: '50' })),
        api.listSuppliers(new URLSearchParams({ limit: '100' })),
      ]);
      setProducts(prodRes.items || []);
      setLocations(locRes || []);
      setBalances(balRes || []);
      setMovements(movRes.items || []);
      setSuppliers(supRes.items || []);
    } catch (err: any) {
      if (err?.status === 401 || err?.status === 403) {
        onAuthError(err);
      }
    } finally {
      setLoading(false);
    }
  }, [clinic.clinicId, onAuthError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const lowStockBalances = balances.filter((b) => b.isLowStock);
  const totalProductsCount = products.length;
  const activeLocationsCount = locations.filter((l) => l.isActive).length;

  async function handleFilterMovements(q: {
    productId?: string;
    locationId?: string;
    movementType?: InventoryMovementType;
  }) {
    const api = inventoryApi(clinic.clinicId);
    const params = new URLSearchParams();
    if (q.productId) params.set('productId', q.productId);
    if (q.locationId) params.set('locationId', q.locationId);
    if (q.movementType) params.set('movementType', q.movementType);
    try {
      const res = await api.listMovements(params);
      setMovements(res.items || []);
    } catch (err) {
      onAuthError(err);
    }
  }

  function handleSuccess(msg: string) {
    setNotice(msg);
    loadData();
    setTimeout(() => setNotice(''), 5000);
  }

  return (
    <div className="inventory-workspace">
      {notice && (
        <div className="notice" role="status">
          ✓ {notice}
          <button aria-label="إغلاق التنبيه" onClick={() => setNotice('')}>
            &times;
          </button>
        </div>
      )}

      {/* Operations & Expiry Alerts Banner */}
      <InventoryAlertsBanner
        clinicId={clinic.clinicId}
        csrfToken={csrfToken}
        canAcknowledge={canAcknowledgeAlerts}
        onRefreshNeeded={loadData}
      />

      {/* Main KPI Cards */}
      <div className="inventory-summary-grid">
        <div className="inventory-stat-card">
          <span className="card-label">إجمالي الأصناف المعرفة</span>
          <span className="card-value">{totalProductsCount}</span>
          <span className="card-subtext">أصناف طبية ومستهلكات وتجزئة</span>
        </div>

        <div className={`inventory-stat-card ${lowStockBalances.length > 0 ? 'alert-card' : ''}`}>
          <span className="card-label">أصناف تحت حد الطلب (نقص مخزون)</span>
          <span className="card-value">{lowStockBalances.length}</span>
          <span className="card-subtext">تتطلب إعادة توريد فورية</span>
        </div>

        <div className="inventory-stat-card">
          <span className="card-label">مواقع التخزين النشطة</span>
          <span className="card-value">{activeLocationsCount}</span>
          <span className="card-subtext">مستودعات وغرف علاج</span>
        </div>

        <div className="inventory-stat-card success-card">
          <span className="card-label">سلامة دفتر المخزون</span>
          <span className="card-value">سليم 100%</span>
          <span className="card-subtext">حركات مقيدة بالتوقيع والوقت</span>
        </div>
      </div>

      {/* Tabs and Quick Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <nav className="inventory-tabs">
          <button
            className={`inventory-tab-btn ${activeTab === 'OVERVIEW' ? 'active' : ''}`}
            onClick={() => setActiveTab('OVERVIEW')}
          >
            <span>▦</span> نظرة عامة
          </button>
          <button
            className={`inventory-tab-btn ${activeTab === 'PRODUCTS' ? 'active' : ''}`}
            onClick={() => setActiveTab('PRODUCTS')}
          >
            <span>🏷️</span> دليل المنتجات
          </button>
          <button
            className={`inventory-tab-btn ${activeTab === 'LOCATIONS' ? 'active' : ''}`}
            onClick={() => setActiveTab('LOCATIONS')}
          >
            <span>🏢</span> مواقع التخزين
          </button>
          <button
            className={`inventory-tab-btn ${activeTab === 'BALANCES' ? 'active' : ''}`}
            onClick={() => setActiveTab('BALANCES')}
          >
            <span>📊</span> الأرصدة الحالية
          </button>
          <button
            className={`inventory-tab-btn ${activeTab === 'BATCHES' ? 'active' : ''}`}
            onClick={() => setActiveTab('BATCHES')}
          >
            <span>🧪</span> التشغيلات والصلاحية (Lots)
          </button>
          <button
            className={`inventory-tab-btn ${activeTab === 'SUPPLIERS' ? 'active' : ''}`}
            onClick={() => setActiveTab('SUPPLIERS')}
          >
            <span>🤝</span> الموردون
          </button>
          <button
            className={`inventory-tab-btn ${activeTab === 'PURCHASE_ORDERS' ? 'active' : ''}`}
            onClick={() => setActiveTab('PURCHASE_ORDERS')}
          >
            <span>📋</span> أوامر الشراء
          </button>
          <button
            className={`inventory-tab-btn ${activeTab === 'STOCK_COUNTS' ? 'active' : ''}`}
            onClick={() => setActiveTab('STOCK_COUNTS')}
          >
            <span>📝</span> الجرد والتسوية
          </button>
          <button
            className={`inventory-tab-btn ${activeTab === 'MOVEMENTS' ? 'active' : ''}`}
            onClick={() => setActiveTab('MOVEMENTS')}
          >
            <span>📜</span> سجل الحركات (Ledger)
          </button>
          <button
            className={`inventory-tab-btn ${activeTab === 'RECONCILE' ? 'active' : ''}`}
            onClick={() => setActiveTab('RECONCILE')}
          >
            <span>⚖️</span> مطابقة الدفتر
          </button>

          {canCostingRead && (
            <button
              className={`inventory-tab-btn ${activeTab === 'COSTING' ? 'active' : ''}`}
              onClick={() => setActiveTab('COSTING')}
            >
              <span>💰</span> تكاليف ومحاسبة المخزون (FIFO)
            </button>
          )}
        </nav>

        {canPerformStock && (
          <button
            className="inventory-btn inventory-btn-primary"
            onClick={() => setOperationsModalOpen(true)}
          >
            ⇄ إجراء حركة مخزنية
          </button>
        )}
      </div>

      {/* Tab Contents */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
          جارٍ تحميل بيانات المخزون...
        </div>
      ) : (
        <>
          {activeTab === 'OVERVIEW' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {lowStockBalances.length > 0 && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '1.25rem' }}>
                  <h4 style={{ margin: '0 0 0.75rem', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    ⚠️ تنبيه نقص المخزون: أصناف بلغت أو تجاوزت حد إعادة الطلب
                  </h4>
                  <table className="inventory-table" style={{ background: '#ffffff', borderRadius: '8px' }}>
                    <thead>
                      <tr>
                        <th>الصنف</th>
                        <th>الموقع</th>
                        <th>الرصيد المتبقي</th>
                        <th>حد إعادة الطلب</th>
                        <th>الإجراء السريع</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lowStockBalances.map((b) => (
                        <tr key={`${b.productId}-${b.locationId}`}>
                          <td>
                            <strong>{b.product.nameAr}</strong> ({b.product.sku})
                          </td>
                          <td>{b.location.nameAr}</td>
                          <td>
                            <span className="quantity-negative">
                              {b.onHandQuantity} {b.product.unit}
                            </span>
                          </td>
                          <td>{b.product.reorderThreshold}</td>
                          <td>
                            {canPerformStock && (
                              <button
                                className="inventory-btn inventory-btn-primary"
                                style={{ padding: '0.2rem 0.6rem', fontSize: '0.8rem' }}
                                onClick={() => setOperationsModalOpen(true)}
                              >
                                توريد الآن
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="two-column" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div className="inventory-table-container">
                  <div style={{ padding: '1rem', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>
                    آخر حركات المخزون المقيدة
                  </div>
                  <table className="inventory-table">
                    <thead>
                      <tr>
                        <th>المنتج</th>
                        <th>نوع الحركة</th>
                        <th>الكمية</th>
                        <th>الرصيد بعد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movements.slice(0, 5).map((m) => (
                        <tr key={m.id}>
                          <td>{m.product.nameAr}</td>
                          <td>
                            <span className="badge badge-purple">{m.movementType}</span>
                          </td>
                          <td dir="ltr" style={{ textAlign: 'right' }}>
                            {m.quantity}
                          </td>
                          <td dir="ltr" style={{ textAlign: 'right' }}>
                            {m.balanceAfter}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="inventory-table-container">
                  <div style={{ padding: '1rem', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>
                    توزيع الأرصدة حسب المواقع
                  </div>
                  <table className="inventory-table">
                    <thead>
                      <tr>
                        <th>الموقع</th>
                        <th>النوع</th>
                        <th>عدد الأصناف المخزنة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {locations.map((l) => (
                        <tr key={l.id}>
                          <td><strong>{l.nameAr}</strong> ({l.code})</td>
                          <td>{l.type}</td>
                          <td>{balances.filter((b) => b.locationId === l.id).length} صنف</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'PRODUCTS' && (
            <ProductCatalogPanel
              clinicId={clinic.clinicId}
              csrfToken={csrfToken}
              products={products}
              canManage={canManageProducts}
              onRefresh={loadData}
              onSuccess={handleSuccess}
            />
          )}

          {activeTab === 'LOCATIONS' && (
            <StockLocationsPanel
              clinicId={clinic.clinicId}
              csrfToken={csrfToken}
              locations={locations}
              canManage={canManageLocations}
              onRefresh={loadData}
              onSuccess={handleSuccess}
            />
          )}

          {activeTab === 'BALANCES' && (
            <div className="inventory-table-container">
              <table className="inventory-table">
                <thead>
                  <tr>
                    <th>رمز الصنف (SKU)</th>
                    <th>اسم المنتج</th>
                    <th>موقع التخزين</th>
                    <th>الرصيد المتوفر</th>
                    <th>حد إعادة الطلب</th>
                    <th>حالة المخزون</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                        لا توجد أرصدة مسجلة بعد. استخدم "إجراء حركة مخزنية" لإضافة رصيد افتتاحي أو توريد.
                      </td>
                    </tr>
                  ) : (
                    balances.map((b) => (
                      <tr key={`${b.productId}-${b.locationId}`}>
                        <td><code>{b.product.sku}</code></td>
                        <td><strong>{b.product.nameAr}</strong></td>
                        <td>{b.location.nameAr} ({b.location.code})</td>
                        <td>
                          <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '1rem' }}>
                            {b.onHandQuantity} {b.product.unit}
                          </span>
                        </td>
                        <td>{b.product.reorderThreshold}</td>
                        <td>
                          {b.isLowStock ? (
                            <span className="badge badge-red">نقص مخزون</span>
                          ) : (
                            <span className="badge badge-green">متوفر كافٍ</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'BATCHES' && (
            <BatchManagementPanel
              clinicId={clinic.clinicId}
              csrfToken={csrfToken}
              products={products}
              locations={locations}
              canManage={canManageProducts || permissions.includes('inventory.batches.manage')}
              onRefresh={loadData}
              onSuccess={handleSuccess}
            />
          )}

          {activeTab === 'SUPPLIERS' && (
            <SupplierManagementPanel
              clinicId={clinic.clinicId}
              csrfToken={csrfToken}
              canManage={canManageSuppliers}
              onAuthError={onAuthError}
              onSuccess={handleSuccess}
            />
          )}

          {activeTab === 'PURCHASE_ORDERS' && (
            <PurchaseOrderManagementPanel
              clinicId={clinic.clinicId}
              csrfToken={csrfToken}
              suppliers={suppliers}
              locations={locations}
              products={products}
              canCreate={canCreatePO}
              canApprove={canApprovePO}
              canReceive={canReceiveGoods}
              onAuthError={onAuthError}
              onSuccess={handleSuccess}
            />
          )}

          {activeTab === 'STOCK_COUNTS' && (
            <StockCountPanel
              clinicId={clinic.clinicId}
              csrfToken={csrfToken}
              locations={locations}
              products={products}
              canManage={canManageStockCounts}
              canReconcile={canReconcileStockCounts}
              onAuthError={onAuthError}
              onSuccess={handleSuccess}
            />
          )}

          {activeTab === 'MOVEMENTS' && (
            <StockMovementsHistory
              movements={movements}
              products={products}
              locations={locations}
              onFilterChange={handleFilterMovements}
            />
          )}

          {activeTab === 'RECONCILE' && (
            <LedgerReconciliationPanel
              clinicId={clinic.clinicId}
              csrfToken={csrfToken}
              canReconcile={canReconcile}
            />
          )}

          {activeTab === 'COSTING' && (
            <CostingWorkspace
              clinic={clinic}
              csrfToken={csrfToken}
              onAuthError={onAuthError}
            />
          )}
        </>
      )}

      {operationsModalOpen && (
        <StockOperationsModal
          clinicId={clinic.clinicId}
          csrfToken={csrfToken}
          products={products}
          locations={locations}
          balances={balances}
          onClose={() => setOperationsModalOpen(false)}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}

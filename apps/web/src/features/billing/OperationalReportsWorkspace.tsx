import { useState, useEffect, useMemo } from 'react';
import type { ClinicContext } from '../auth/api';
import { ApiError } from '../auth/api';
import { RequestScope } from '../../lib/request-scope';
import {
  billingApi,
  type RevenueCollectionsReport,
  type InstallmentAgingReport,
  type PackageLiabilityReport,
  type PractitionerPerformanceReport,
  type InventoryValuationReport,
  type AppointmentUtilizationReport,
} from './billing-api';
import { formatMoney } from './billing-money';

interface Props {
  clinic: ClinicContext;
  onAuthError: (error: unknown) => void;
}

type ReportSection = 'REVENUE' | 'AGING' | 'PACKAGES' | 'PRACTITIONERS' | 'INVENTORY' | 'UTILIZATION';

const message = (e: unknown) =>
  e instanceof ApiError ? e.message : 'تعذّر تحميل التقرير التشغيلي. يُرجى مراجعة الاتصال والمحاولة مجدداً.';

export function OperationalReportsWorkspace({ clinic, onAuthError }: Props) {
  const client = useMemo(() => billingApi(clinic.clinicId), [clinic.clinicId]);
  const gates = useMemo(() => ({ report: new RequestScope() }), [clinic.clinicId]);
  const can = (p: string) => clinic.permissions.includes(p);
  const canReport = can('reports.operational.read');

  const [activeSection, setActiveSection] = useState<ReportSection>('REVENUE');

  // Common Date Filter
  const [startDate, setStartDate] = useState(
    new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  // Reports data
  const [revenueData, setRevenueData] = useState<RevenueCollectionsReport | null>(null);
  const [agingData, setAgingData] = useState<InstallmentAgingReport | null>(null);
  const [packageData, setPackageData] = useState<PackageLiabilityReport | null>(null);
  const [practitionerData, setPractitionerData] = useState<PractitionerPerformanceReport | null>(null);
  const [inventoryData, setInventoryData] = useState<InventoryValuationReport | null>(null);
  const [utilizationData, setUtilizationData] = useState<AppointmentUtilizationReport | null>(null);

  useEffect(() => {
    return () => {
      gates.report.cancel();
    };
  }, [gates]);

  function auth(e: unknown) {
    if (e instanceof ApiError && (e.status === 401 || e.code === 'MFA_STEP_UP_REQUIRED' || e.code === 'MFA_SETUP_REQUIRED')) {
      onAuthError(e);
    }
  }

  useEffect(() => {
    if (!canReport) return;
    const scope = gates.report.start();
    setLoading(true);
    setError('');

    let task: Promise<void>;

    if (activeSection === 'REVENUE') {
      task = client.revenueCollections(startDate, endDate, scope.signal).then((r) => {
        if (scope.current()) setRevenueData(r);
      });
    } else if (activeSection === 'AGING') {
      task = client.installmentAging(scope.signal).then((r) => {
        if (scope.current()) setAgingData(r);
      });
    } else if (activeSection === 'PACKAGES') {
      task = client.packageLiability(scope.signal).then((r) => {
        if (scope.current()) setPackageData(r);
      });
    } else if (activeSection === 'PRACTITIONERS') {
      task = client.practitionerPerformance(startDate, endDate, scope.signal).then((r) => {
        if (scope.current()) setPractitionerData(r);
      });
    } else if (activeSection === 'INVENTORY') {
      task = client.inventoryValuation(scope.signal).then((r) => {
        if (scope.current()) setInventoryData(r);
      });
    } else {
      task = client.appointmentUtilization(startDate, endDate, scope.signal).then((r) => {
        if (scope.current()) setUtilizationData(r);
      });
    }

    task
      .then(() => {
        if (scope.current()) setLoading(false);
      })
      .catch((e) => {
        if (scope.current()) {
          setError(message(e));
          setLoading(false);
          auth(e);
        }
      });

    return () => gates.report.cancel();
  }, [client, gates, activeSection, startDate, endDate, reload, canReport]);

  if (!canReport) {
    return (
      <div className="patient-error" role="alert">
        لا تملك صلاحية عرض التقارير التشغيلية والمالية للعيادة.
      </div>
    );
  }

  return (
    <section className="billing-workspace" aria-busy={loading}>
      <div className="patient-intro">
        <div>
          <b>التقارير التشغيلية والمؤشرات المالية</b>
          <p>لوحة تحليلية متكاملة للإيرادات، التحصيلات، التزامات الباقات، أعمار الديون، أداء الأطباء والمخزون.</p>
        </div>
      </div>

      {error && (
        <div className="patient-error" role="alert">
          {error}
          <button className="table-btn" onClick={() => setReload((n) => n + 1)}>
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* Navigation tabs for report sections */}
      <div className="inventory-tabs" style={{ marginBottom: '16px' }}>
        <button
          className={`inventory-tab-btn ${activeSection === 'REVENUE' ? 'active' : ''}`}
          onClick={() => setActiveSection('REVENUE')}
        >
          الإيرادات والتحصيلات
        </button>
        <button
          className={`inventory-tab-btn ${activeSection === 'AGING' ? 'active' : ''}`}
          onClick={() => setActiveSection('AGING')}
        >
          أعمار ديون التقسيط
        </button>
        <button
          className={`inventory-tab-btn ${activeSection === 'PACKAGES' ? 'active' : ''}`}
          onClick={() => setActiveSection('PACKAGES')}
        >
          التزامات باقات الجلسات
        </button>
        <button
          className={`inventory-tab-btn ${activeSection === 'PRACTITIONERS' ? 'active' : ''}`}
          onClick={() => setActiveSection('PRACTITIONERS')}
        >
          أداء وإنتاجية الأطباء
        </button>
        <button
          className={`inventory-tab-btn ${activeSection === 'INVENTORY' ? 'active' : ''}`}
          onClick={() => setActiveSection('INVENTORY')}
        >
          تقييم المخزون المالي
        </button>
        <button
          className={`inventory-tab-btn ${activeSection === 'UTILIZATION' ? 'active' : ''}`}
          onClick={() => setActiveSection('UTILIZATION')}
        >
          معدل إشغال المواعيد
        </button>
      </div>

      {/* Date filters for time-ranged reports */}
      {['REVENUE', 'PRACTITIONERS', 'UTILIZATION'].includes(activeSection) && (
        <div className="panel" style={{ padding: '12px 16px', marginBottom: '18px' }}>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px' }}>
              من تاريخ:
              <input
                type="date"
                className="search"
                style={{ padding: '4px 8px' }}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>
            <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px' }}>
              إلى تاريخ:
              <input
                type="date"
                className="search"
                style={{ padding: '4px 8px' }}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
            <button className="table-btn" onClick={() => setReload((n) => n + 1)}>
              تحديث النتائج
            </button>
          </div>
        </div>
      )}

      {loading && <p className="billing-empty">جارٍ إعداد وتحميل التقرير…</p>}

      {/* 1. REVENUE & COLLECTIONS */}
      {!loading && activeSection === 'REVENUE' && revenueData && (
        <div className="panel full-panel">
          <div className="billing-overview" style={{ marginBottom: '16px' }}>
            <div className="finance-row">
              <div>
                <small>إجمالي الفواتير الصادرة</small>
                <strong>
                  {formatMoney(revenueData.invoicedRevenueMinor, revenueData.currency, revenueData.currencyScale)}
                </strong>
                <span style={{ fontSize: '12px', color: '#718096' }}>({revenueData.invoicesCount} فاتورة)</span>
              </div>
              <div>
                <small>المقبوضات المحصلة</small>
                <strong>
                  {formatMoney(revenueData.collectedPaymentsMinor, revenueData.currency, revenueData.currencyScale)}
                </strong>
                <span style={{ fontSize: '12px', color: '#718096' }}>({revenueData.paymentsCount} دفعة)</span>
              </div>
              <div>
                <small>المسترد / المعكوس</small>
                <strong style={{ color: '#E53E3E' }}>
                  {formatMoney(revenueData.refundedReversedMinor, revenueData.currency, revenueData.currencyScale)}
                </strong>
              </div>
              <div>
                <small>صافي التدفق المالي المحصل</small>
                <strong style={{ color: '#087F8C' }}>
                  {formatMoney(revenueData.netCollectedMinor, revenueData.currency, revenueData.currencyScale)}
                </strong>
              </div>
              <div>
                <small>الرصيد المتبقي تحت التحصيل</small>
                <strong>
                  {formatMoney(revenueData.outstandingBalanceMinor, revenueData.currency, revenueData.currencyScale)}
                </strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. INSTALLMENT AGING */}
      {!loading && activeSection === 'AGING' && agingData && (
        <div className="panel full-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h4>تحليل أعمار ديون التقسيط والأقساط المستحقة</h4>
            <div style={{ fontSize: '13px', color: '#4A5568' }}>
              إجمالي خطط التقسيط النشطة: <b>{agingData.totalPlansCount}</b> · إجمالي الرصيد المتبقي:{' '}
              <b style={{ color: '#087F8C' }}>
                {formatMoney(agingData.totalRemainingMinor, agingData.currency, agingData.currencyScale)}
              </b>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>فئة الاستحقاق والعمر الزمني</th>
                  <th>عدد الأقساط</th>
                  <th>إجمالي المبالغ المتبقية</th>
                </tr>
              </thead>
              <tbody>
                {agingData.buckets.map((b) => (
                  <tr key={b.bucket}>
                    <td><b>{b.labelAr}</b></td>
                    <td>{b.count}</td>
                    <td>
                      <b>{formatMoney(b.totalRemainingMinor, agingData.currency, agingData.currencyScale)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. PACKAGE LIABILITY */}
      {!loading && activeSection === 'PACKAGES' && packageData && (
        <div className="panel full-panel">
          <div className="billing-overview" style={{ marginBottom: '16px' }}>
            <div className="finance-row">
              <div>
                <small>الباقات النشطة</small>
                <strong>{packageData.totalPackagesActive}</strong>
              </div>
              <div>
                <small>إجمالي المقبوض مسبقاً</small>
                <strong>
                  {formatMoney(packageData.totalPrepaidMinor, packageData.currency, packageData.currencyScale)}
                </strong>
              </div>
              <div>
                <small>الإيراد المحقق من الجلسات المنفذة</small>
                <strong style={{ color: '#38A169' }}>
                  {formatMoney(packageData.totalRecognizedRevenueMinor, packageData.currency, packageData.currencyScale)}
                </strong>
              </div>
              <div>
                <small>الإيراد المؤجل (التزام الجلسات)</small>
                <strong style={{ color: '#DD6B20' }}>
                  {formatMoney(packageData.totalDeferredRevenueMinor, packageData.currency, packageData.currencyScale)}
                </strong>
              </div>
              <div>
                <small>الجلسات المتبقية غير المستهلكة</small>
                <strong style={{ color: '#7854D9' }}>{packageData.unredeemedSessionsCount} جلسة</strong>
              </div>
            </div>
          </div>
          <p className="form-hint">
            الإيراد المؤجل يمثل التزام العيادة بتقديم الجلسات المتبقية التي تم قبض قيمتها مسبقاً، ولا يتحول إلى إيراد محقق إلا بعد استهلاك الجلسة في إجراء علاجي فعلي.
          </p>
        </div>
      )}

      {/* 4. PRACTITIONER PERFORMANCE */}
      {!loading && activeSection === 'PRACTITIONERS' && practitionerData && (
        <div className="panel full-panel">
          <h4 style={{ marginBottom: '14px' }}>إنتاجية الأطباء والممارسين والعمولات المستحقة</h4>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>اسم الممارس</th>
                  <th>الإجراءات المنفذة</th>
                  <th>الإيراد المحقق</th>
                  <th>العمولات المحتسبة</th>
                  <th>العمولات المسواة (المصروفة)</th>
                </tr>
              </thead>
              <tbody>
                {practitionerData.practitioners.map((p) => (
                  <tr key={p.practitionerMembershipId}>
                    <td><b>{p.practitionerName}</b></td>
                    <td>{p.proceduresCompleted}</td>
                    <td>{formatMoney(p.revenueGeneratedMinor, practitionerData.currency, practitionerData.currencyScale)}</td>
                    <td>
                      <b style={{ color: '#087F8C' }}>
                        {formatMoney(p.commissionsAccruedMinor, practitionerData.currency, practitionerData.currencyScale)}
                      </b>
                    </td>
                    <td>
                      <span style={{ color: '#38A169' }}>
                        {formatMoney(p.commissionsSettledMinor, practitionerData.currency, practitionerData.currencyScale)}
                      </span>
                    </td>
                  </tr>
                ))}
                {practitionerData.practitioners.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '24px' }}>
                      لا توجد بيانات إنتاجية للأطباء خلال الفترة المحددة.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. INVENTORY VALUATION */}
      {!loading && activeSection === 'INVENTORY' && inventoryData && (
        <div className="panel full-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h4>التقييم المالي الشامل للمخزون</h4>
            <div style={{ fontSize: '14px' }}>
              إجمالي القيمة الدفترية للمخزون:{' '}
              <strong style={{ color: '#087F8C', fontSize: '16px' }}>
                {formatMoney(inventoryData.totalValuationMinor, inventoryData.currency, inventoryData.currencyScale)}
              </strong>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>مستودع المخزون</th>
                  <th>عدد المنتجات المسجلة</th>
                  <th>إجمالي الوحدات المتوفرة</th>
                  <th>القيمة المالية للمخزون</th>
                </tr>
              </thead>
              <tbody>
                {inventoryData.locations.map((loc) => (
                  <tr key={loc.locationId}>
                    <td><b>{loc.locationName}</b></td>
                    <td>{loc.productsCount}</td>
                    <td>{loc.totalUnits}</td>
                    <td>
                      <b>{formatMoney(loc.valuationMinor, inventoryData.currency, inventoryData.currencyScale)}</b>
                    </td>
                  </tr>
                ))}
                {inventoryData.locations.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '24px' }}>
                      لا توجد مستودعات أو أرصدة مخزون مسجلة.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. APPOINTMENT UTILIZATION */}
      {!loading && activeSection === 'UTILIZATION' && utilizationData && (
        <div className="panel full-panel">
          <div className="billing-overview">
            <div className="finance-row">
              <div>
                <small>إجمالي المواعيد المجدولة</small>
                <strong>{utilizationData.totalAppointments}</strong>
              </div>
              <div>
                <small>المواعيد المكتملة بنجاح</small>
                <strong style={{ color: '#38A169' }}>{utilizationData.completedAppointments}</strong>
              </div>
              <div>
                <small>المواعيد الملغاة</small>
                <strong style={{ color: '#E53E3E' }}>{utilizationData.cancelledAppointments}</strong>
              </div>
              <div>
                <small>عدم الحضور (No-Show)</small>
                <strong style={{ color: '#DD6B20' }}>{utilizationData.noShowAppointments}</strong>
              </div>
              <div>
                <small>معدل إشغال العيادة</small>
                <strong style={{ color: '#7854D9' }}>{utilizationData.utilizationRatePercentage}%</strong>
              </div>
              <div>
                <small>معدل الإلغاء</small>
                <strong>{utilizationData.cancellationRatePercentage}%</strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

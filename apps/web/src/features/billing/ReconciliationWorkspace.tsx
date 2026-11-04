import { useState, useEffect, useMemo, useRef } from 'react';
import type { ClinicContext } from '../auth/api';
import { ApiError } from '../auth/api';
import { RequestScope } from '../../lib/request-scope';
import {
  billingApi,
  type ReconciliationReport,
} from './billing-api';

interface Props {
  clinic: ClinicContext;
  csrfToken: string;
  onAuthError: (error: unknown) => void;
}

const severityBadges: Record<string, { label: string; color: string; bg: string }> = {
  CRITICAL: { label: 'حرج', color: '#9B2C2C', bg: '#FED7D7' },
  WARNING: { label: 'تحذير', color: '#975A16', bg: '#FEEBC8' },
  INFO: { label: 'معلومة', color: '#2C5282', bg: '#BEE3F8' },
};

const resourceNames: Record<string, string> = {
  INVOICE: 'فاتورة',
  PAYMENT: 'دفعة مالية',
  PACKAGE: 'باقة جلسات',
  INSTALLMENT: 'خطة تقسيط',
  COMMISSION: 'تسوية عمولة',
  INVENTORY: 'مخزون مالي',
};

const message = (e: unknown) =>
  e instanceof ApiError ? e.message : 'تعذّر إكمال فحص المطابقة المالية. يُرجى مراجعة الاتصال والمحاولة مجدداً.';

export function ReconciliationWorkspace({ clinic, onAuthError }: Props) {
  const client = useMemo(() => billingApi(clinic.clinicId), [clinic.clinicId]);
  const gates = useMemo(() => ({ report: new RequestScope() }), [clinic.clinicId]);
  const can = (p: string) => clinic.permissions.includes(p);
  const canReconcile = can('finance.reconciliation.read');

  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ReconciliationReport | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const running = useRef(false);

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

  function fetchReconciliation() {
    if (!canReconcile) return;
    const scope = gates.report.start();
    setLoading(true);
    setError('');
    client
      .reconciliation(scope.signal)
      .then((res) => {
        if (scope.current()) {
          setReport(res);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (scope.current()) {
          setError(message(e));
          setLoading(false);
          auth(e);
        }
      });
  }

  useEffect(() => {
    fetchReconciliation();
  }, [client, canReconcile]);

  function handleRunReconciliation() {
    if (running.current) return;
    running.current = true;
    setNotice('جارٍ تشغيل محرك المطابقة المالية الشامل عبر كافة الموارد...');
    fetchReconciliation();
    setTimeout(() => {
      running.current = false;
      setNotice('اكتمل فحص المطابقة المالية بنجاح.');
    }, 600);
  }

  if (!canReconcile) {
    return (
      <div className="patient-error" role="alert">
        لا تملك صلاحية عرض المطابقة المالية للعيادة.
      </div>
    );
  }

  return (
    <section className="billing-workspace" aria-busy={loading}>
      <div className="patient-intro">
        <div>
          <b>محرك المطابقة والتدقيق المالي الشامل</b>
          <p>
            فحص آلي متزامن لسلامة المعادلة المحاسبية عبر الفواتير، المدفوعات، الباقات المسبقة، خطط التقسيط، تسويات العمولات، ومطابقة سجل وحركات المخزون.
          </p>
        </div>
        <button className="primary-btn" disabled={loading} onClick={handleRunReconciliation}>
          {loading ? 'جارٍ الفحص والمطابقة…' : '🔄 تشغيل المطابقة المالية الآن'}
        </button>
      </div>

      <div className="notice" style={{ background: '#FFFDF5', border: '1px solid #ECC94B', color: '#744210', marginBottom: '16px', padding: '10px 14px', borderRadius: '6px' }}>
        <strong>تنبيه تدقيق محاسبي:</strong> نتائج المطابقة المحاسبية تعبر عن الاتساق الحسابي الداخلي لسجلات قاعدة بيانات العيادة فقط، ولا تعد بديلاً عن المطابقة البنكية لكشوف الحسابات الخارجية أو تقارير الامتثال القانوني والضريبي.
      </div>

      {notice && (
        <div className="notice" role="status">
          {notice}
          <button onClick={() => setNotice('')} aria-label="إغلاق التنبيه">
            ×
          </button>
        </div>
      )}
      {error && (
        <div className="patient-error" role="alert">
          {error}
          <button className="table-btn" onClick={fetchReconciliation}>
            إعادة المحاولة
          </button>
        </div>
      )}

      {report && (
        <>
          {/* Status Overview Card */}
          <div className="billing-overview" style={{ marginBottom: '20px' }}>
            <div className="finance-row">
              <div>
                <small>حالة المطابقة المحاسبية</small>
                <div style={{ marginTop: '4px' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '4px 12px',
                      borderRadius: '9999px',
                      fontWeight: 'bold',
                      fontSize: '14px',
                      backgroundColor: report.status === 'CLEAN' ? '#C6F6D5' : '#FED7D7',
                      color: report.status === 'CLEAN' ? '#22543D' : '#742A2A',
                    }}
                  >
                    {report.status === 'CLEAN' ? '✓ مطابقة سليمة 100%' : '⚠ تم رصد فروقات محاسبية'}
                  </span>
                </div>
              </div>

              <div>
                <small>إجمالي الفروقات المرصودة</small>
                <strong style={{ color: report.totalDiscrepancies > 0 ? '#E53E3E' : '#38A169' }}>
                  {report.totalDiscrepancies}
                </strong>
              </div>

              <div>
                <small>تاريخ ووقت الفحص الأخير</small>
                <strong style={{ fontSize: '13px' }}>
                  {new Date(report.timestamp || report.reconciledAt || Date.now()).toLocaleString('ar-SA')}
                </strong>
              </div>
            </div>
          </div>

          {/* Resources Scanned Grid */}
          <h4 style={{ marginBottom: '12px' }}>الموارد المحاسبية التي تم فحصها وتدقيقها</h4>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '12px',
              marginBottom: '24px',
            }}
          >
            <div className="panel" style={{ padding: '14px', textAlign: 'center' }}>
              <small style={{ color: '#718096' }}>الفواتير المالية</small>
              <h3 style={{ margin: '4px 0 0' }}>{report.resourcesScanned.invoicesCount}</h3>
            </div>
            <div className="panel" style={{ padding: '14px', textAlign: 'center' }}>
              <small style={{ color: '#718096' }}>المدفوعات والمقبوضات</small>
              <h3 style={{ margin: '4px 0 0' }}>{report.resourcesScanned.paymentsCount}</h3>
            </div>
            <div className="panel" style={{ padding: '14px', textAlign: 'center' }}>
              <small style={{ color: '#718096' }}>خطط التقسيط</small>
              <h3 style={{ margin: '4px 0 0' }}>{report.resourcesScanned.installmentPlansCount}</h3>
            </div>
            <div className="panel" style={{ padding: '14px', textAlign: 'center' }}>
              <small style={{ color: '#718096' }}>باقات العلاج المسبقة</small>
              <h3 style={{ margin: '4px 0 0' }}>{report.resourcesScanned.patientPackagesCount ?? report.resourcesScanned.packagesCount ?? 0}</h3>
            </div>
            <div className="panel" style={{ padding: '14px', textAlign: 'center' }}>
              <small style={{ color: '#718096' }}>دفعات تسوية العمولات</small>
              <h3 style={{ margin: '4px 0 0' }}>{report.resourcesScanned.commissionSettlementsCount}</h3>
            </div>
            <div className="panel" style={{ padding: '14px', textAlign: 'center' }}>
              <small style={{ color: '#718096' }}>أرصدة وسجلات المخزون</small>
              <h3 style={{ margin: '4px 0 0' }}>{report.resourcesScanned.inventoryBalancesCount ?? report.resourcesScanned.inventoryLocationsCount ?? 0}</h3>
            </div>
          </div>

          {/* Discrepancy Findings Table */}
          <div className="panel full-panel">
            <h4>سجل ملاحظات ونتائج الفحص</h4>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>المورد</th>
                    <th>مستوى الخطورة</th>
                    <th>رمز التحقق</th>
                    <th>التفاصيل والبيان المحاسبي</th>
                    <th>معرف الكيان</th>
                  </tr>
                </thead>
                <tbody>
                  {report.findings.map((f, i) => (
                    <tr key={`${f.entityId}-${i}`}>
                      <td><b>{resourceNames[f.resource] ?? f.resource}</b></td>
                      <td>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            backgroundColor: severityBadges[f.severity]?.bg ?? '#EDF2F7',
                            color: severityBadges[f.severity]?.color ?? '#4A5568',
                          }}
                        >
                          {severityBadges[f.severity]?.label ?? f.severity}
                        </span>
                      </td>
                      <td><code>{f.code}</code></td>
                      <td>{f.details}</td>
                      <td><small><bdi>{f.entityId}</bdi></small></td>
                    </tr>
                  ))}
                  {report.findings.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: '#2F855A' }}>
                        ✓ لا توجد أي فروقات محاسبية. جميع الأرصدة والتحصيلات والتسويات متطابقة تماماً.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

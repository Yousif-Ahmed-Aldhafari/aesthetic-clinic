import { useState } from 'react';
import { type ReconciliationReport, inventoryApi } from './inventory-api';

interface Props {
  clinicId: string;
  csrfToken: string;
  canReconcile: boolean;
}

export function LedgerReconciliationPanel({
  clinicId,
  csrfToken,
  canReconcile,
}: Props) {
  const [report, setReport] = useState<ReconciliationReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleRunReconciliation() {
    setError('');
    setBusy(true);
    const api = inventoryApi(clinicId);
    try {
      const res = await api.reconcileLedger(csrfToken);
      setReport(res);
    } catch (err: any) {
      setError(err?.message || 'تعذر تشغيل فحص المطابقة المخزنية.');
    } finally {
      setBusy(false);
    }
  }

  function formatDateTime(iso: string) {
    try {
      const d = new Date(iso);
      return new Intl.DateTimeFormat('ar-SA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(d);
    } catch {
      return iso;
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div className="inventory-actions-bar">
        <div>
          <h4 style={{ margin: 0, color: '#111827' }}>مطابقة الدفتر المخزني (Ledger Reconciliation)</h4>
          <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
            فحص رياضي تدقيقي يقارن الأرصدة الحالية في جدول الأرصدة التراكمية مع مجموع الحركات المقيدة في الدفتر غير القابل للتعديل.
          </span>
        </div>

        {canReconcile && (
          <button
            className="inventory-btn inventory-btn-primary"
            onClick={handleRunReconciliation}
            disabled={busy}
          >
            {busy ? 'جارٍ الفحص والمطابقة...' : '⚡ تشغيل فحص المطابقة الآن'}
          </button>
        )}
      </div>

      {error && <div className="form-error-banner">{error}</div>}

      {report && (
        <div
          className={`reconciliation-card ${
            report.status === 'RECONCILED' ? 'clean' : 'alert'
          }`}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span
                className={`badge ${
                  report.status === 'RECONCILED' ? 'badge-green' : 'badge-red'
                }`}
                style={{ fontSize: '0.9rem', padding: '0.4rem 0.8rem' }}
              >
                {report.status === 'RECONCILED'
                  ? '✓ الدفتر متطابق بنسبة 100%'
                  : '⚠️ تم رصد فروقات محاسبية في المخزون'}
              </span>
              <div style={{ fontSize: '0.85rem', color: '#4b5563', marginTop: '0.5rem' }}>
                تاريخ وتوقيت آخر فحص: <strong>{formatDateTime(report.verifiedAt)}</strong>
              </div>
            </div>

            <div style={{ textAlign: 'left', direction: 'ltr' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>
                {report.totalItemsChecked}
              </div>
              <small style={{ color: '#6b7280' }}>Items Checked</small>
            </div>
          </div>

          {report.status === 'RECONCILED' ? (
            <p style={{ margin: 0, color: '#15803d', fontSize: '0.9rem' }}>
              جميع أرصدة المستودعات والغرف الحالية تطابق بدقة متناهية مجموع قيود الحركات الواردة والصادرة والتسويات في الدفتر التدقيقي.
            </p>
          ) : (
            <div>
              <p style={{ color: '#b91c1c', fontWeight: 600 }}>
                توجد فروقات بين الرصيد المحسوب والرصيد الفعلي في الأصناف التالية:
              </p>
              <table className="inventory-table" style={{ background: '#ffffff', borderRadius: '8px' }}>
                <thead>
                  <tr>
                    <th>رمز الصنف (SKU)</th>
                    <th>اسم المنتج</th>
                    <th>كود الموقع</th>
                    <th>الرصيد في النظام</th>
                    <th>مجموع حركات الدفتر</th>
                    <th>الفارق</th>
                  </tr>
                </thead>
                <tbody>
                  {report.discrepancies.map((d) => (
                    <tr key={`${d.productId}-${d.locationId}`}>
                      <td><code>{d.productSku}</code></td>
                      <td>{d.productNameAr}</td>
                      <td>{d.locationCode}</td>
                      <td>{d.balanceQuantity}</td>
                      <td>{d.ledgerSumQuantity}</td>
                      <td><span className="quantity-negative">{d.difference}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState, useCallback } from 'react';
import {
  type InventoryAlertItem,
  type InventoryAlertsReport,
  inventoryApi,
} from './inventory-api';

interface Props {
  clinicId: string;
  csrfToken: string;
  canAcknowledge: boolean;
  onRefreshNeeded?: () => void;
}

export function InventoryAlertsBanner({
  clinicId,
  csrfToken,
  canAcknowledge,
  onRefreshNeeded,
}: Props) {
  const [report, setReport] = useState<InventoryAlertsReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<InventoryAlertItem | null>(null);
  const [snoozeDays, setSnoozeDays] = useState('7');
  const [snoozeNotes, setSnoozeNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const api = inventoryApi(clinicId);
      const res = await api.getAlerts();
      setReport(res);
    } catch {
      // Silent error for non-critical alerts derivation
    } finally {
      setLoading(false);
    }
  }, [clinicId]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  async function handleAcknowledge(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAlert) return;
    setSubmitting(true);
    setErrorMsg('');

    try {
      const api = inventoryApi(clinicId);
      const days = parseInt(snoozeDays, 10) || 7;
      const snoozedUntil = new Date(Date.now() + days * 86400000).toISOString();

      await api.acknowledgeAlert(
        {
          alertType: selectedAlert.alertType,
          targetType: selectedAlert.targetType,
          targetId: selectedAlert.targetId,
          snoozedUntil,
          notes: snoozeNotes.trim() || undefined,
        },
        csrfToken,
      );

      setSelectedAlert(null);
      setSnoozeNotes('');
      loadAlerts();
      if (onRefreshNeeded) onRefreshNeeded();
    } catch (err: any) {
      setErrorMsg(err?.message || 'تعذر تأجيل التنبيه');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && !report) return null;
  if (!report || report.summary.total === 0) return null;

  return (
    <div
      style={{
        background: '#fffbeb',
        border: '1px solid #fde68a',
        borderRadius: '8px',
        padding: '1rem',
        marginBottom: '1.25rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.25rem' }}>⚠️</span>
          <strong style={{ color: '#92400e', fontSize: '1.05rem' }}>
            تنبيهات العمليات المخزنية ({report.summary.total})
          </strong>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {report.summary.critical > 0 && (
            <span
              style={{
                background: '#fee2e2',
                color: '#991b1b',
                padding: '0.2rem 0.6rem',
                borderRadius: '9999px',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}
            >
              حرجة: {report.summary.critical}
            </span>
          )}
          {report.summary.warning > 0 && (
            <span
              style={{
                background: '#fef3c7',
                color: '#92400e',
                padding: '0.2rem 0.6rem',
                borderRadius: '9999px',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}
            >
              تحذيرات: {report.summary.warning}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {report.items.slice(0, 5).map((alert) => {
          const isCritical = alert.severity === 'CRITICAL';
          return (
            <div
              key={alert.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.6rem 0.75rem',
                background: isCritical ? '#fef2f2' : '#ffffff',
                border: `1px solid ${isCritical ? '#fca5a5' : '#fef08a'}`,
                borderRadius: '6px',
              }}
            >
              <div>
                <strong style={{ color: isCritical ? '#991b1b' : '#854d0e', marginLeft: '0.5rem' }}>
                  {alert.titleAr}:
                </strong>
                <span style={{ color: '#374151' }}>{alert.messageAr}</span>
              </div>
              {canAcknowledge && (
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: '1px solid #d1d5db',
                    padding: '0.25rem 0.6rem',
                    borderRadius: '4px',
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    color: '#4b5563',
                  }}
                  onClick={() => setSelectedAlert(alert)}
                >
                  تأجيل التنبيه
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Snooze Modal */}
      {selectedAlert && (
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
              width: '420px',
              maxWidth: '90vw',
              boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            }}
          >
            <h3 style={{ margin: '0 0 1rem', color: '#111827' }}>تأجيل تنبيه المخزون</h3>
            <p style={{ margin: '0 0 1rem', color: '#4b5563', fontSize: '0.9rem' }}>
              <strong>{selectedAlert.titleAr}:</strong> {selectedAlert.messageAr}
            </p>

            {errorMsg && (
              <div style={{ background: '#fee2e2', color: '#991b1b', padding: '0.5rem', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleAcknowledge}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  فترة التأجيل (لن يظهر التنبيه خلالها):
                </label>
                <select
                  value={snoozeDays}
                  onChange={(e) => setSnoozeDays(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #d1d5db' }}
                >
                  <option value="1">يوم واحد (24 ساعة)</option>
                  <option value="3">3 أيام</option>
                  <option value="7">أسبوع كامل (7 أيام)</option>
                  <option value="14">أسبوعان (14 يوماً)</option>
                  <option value="30">شهر كامل (30 يوماً)</option>
                </select>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  ملاحظات أو سبب التأجيل:
                </label>
                <textarea
                  rows={2}
                  value={snoozeNotes}
                  onChange={(e) => setSnoozeNotes(e.target.value)}
                  placeholder="مثلاً: تم إصدار أمر شراء بالمتبقي..."
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #d1d5db' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setSelectedAlert(null)}
                  style={{
                    padding: '0.5rem 1rem',
                    border: '1px solid #d1d5db',
                    background: '#f9fafb',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: '0.5rem 1rem',
                    border: 'none',
                    background: '#2563eb',
                    color: '#ffffff',
                    borderRadius: '4px',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {submitting ? 'جارٍ التأجيل...' : 'تأكيد التأجيل'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

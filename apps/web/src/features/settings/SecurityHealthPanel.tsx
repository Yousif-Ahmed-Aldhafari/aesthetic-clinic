import { useEffect, useState, useCallback } from 'react';
import { api, ApiError, type ClinicContext } from '../auth/api';

interface KmsHealthData {
  kms: {
    ok: boolean;
    provider: string;
    activeKeyId: string | null;
    activeKeyVersion: number | null;
    activeKeyState: 'ACTIVE' | 'RETIRED' | 'DISABLED' | 'REVOKED' | null;
    latencyMs: number;
    error?: string;
    details?: {
      totalKeys?: number;
      retiredKeys?: number;
      disabledKeys?: number;
      revokedKeys?: number;
      [key: string]: unknown;
    };
  };
  migration: {
    totalAudited: number;
    successful: number;
    failed: number;
    recentAudits: Array<{
      id: string;
      resourceType: string;
      recordId: string;
      sourceKeyId: string;
      targetKeyId: string;
      status: string;
      migratedAt: string;
    }>;
  };
}

interface SecurityHealthPanelProps {
  clinic: ClinicContext;
  csrfToken: string;
  revision: number;
}

export function SecurityHealthPanel({ clinic, revision }: SecurityHealthPanelProps) {
  const [data, setData] = useState<KmsHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadHealth = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api<{ success: boolean; data: KmsHealthData }>(
        `clinics/${clinic.clinicId}/security/health`,
      );
      if (response?.data) {
        setData(response.data);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر فحص حالة الأمان والتشفير');
    } finally {
      setLoading(false);
    }
  }, [clinic.clinicId]);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth, revision]);

  const stateLabel = (state: string | null) => {
    switch (state) {
      case 'ACTIVE':
        return <span style={{ color: '#059669', fontWeight: 600 }}>نشط (ACTIVE)</span>;
      case 'RETIRED':
        return <span style={{ color: '#d97706', fontWeight: 600 }}>متقاعد (RETIRED)</span>;
      case 'DISABLED':
        return <span style={{ color: '#dc2626', fontWeight: 600 }}>معطّل (DISABLED)</span>;
      case 'REVOKED':
        return <span style={{ color: '#991b1b', fontWeight: 700 }}>ملغى نهائيًا (REVOKED)</span>;
      default:
        return 'غير محدد';
    }
  };

  const providerLabel = (p: string) => {
    switch (p) {
      case 'local':
        return 'مزود تشفير محلي آمن (Local Envelope KMS)';
      case 'external':
        return 'سحابة إدارة المفاتيح السحابية (Cloud KMS / Vault)';
      case 'synthetic-test':
        return 'بيئة فحص المحاكاة التشغيلية (Synthetic KMS)';
      default:
        return p;
    }
  };

  return (
    <div className="security-health-panel" dir="rtl" style={{ marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: '1.15rem' }}>حالة التشفير وإدارة المفاتيح المركزية (KMS & Cryptography)</h4>
          <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
            عزل بيانات الهوية الحساسة، التشفير المغلّف (Envelope Encryption)، وسجل ترحيل المفاتيح
          </p>
        </div>
        <button
          type="button"
          className="table-btn"
          disabled={loading}
          onClick={() => void loadHealth()}
        >
          {loading ? 'جارٍ الفحص…' : 'إعادة فحص الأمان'}
        </button>
      </div>

      {error && <p className="patient-error" role="alert">{error}</p>}

      {loading && !data && (
        <p role="status" style={{ color: '#6b7280' }}>جارٍ فحص استجابة محرك التشفير وسجل المفاتيح…</p>
      )}

      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Status Banner */}
          <div
            style={{
              padding: '1rem',
              borderRadius: '8px',
              backgroundColor: data.kms.ok ? '#ecfdf5' : '#fef2f2',
              border: `1px solid ${data.kms.ok ? '#a7f3d0' : '#fecaca'}`,
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
            }}
          >
            <span style={{ fontSize: '1.5rem' }}>{data.kms.ok ? '🛡️' : '⚠️'}</span>
            <div>
              <strong style={{ color: data.kms.ok ? '#065f46' : '#991b1b', display: 'block' }}>
                {data.kms.ok ? 'منظومة إدارة المفاتيح تعمل بكفاءة وأمان' : 'تنبيه: محرك المفاتيح يتطلب الفحص الفوري'}
              </strong>
              <small style={{ color: data.kms.ok ? '#047857' : '#b91c1c' }}>
                {data.kms.ok
                  ? `تم تأكيد سلامة دورة التشفير وفك التشفير. زمن استجابة المحرك: ${data.kms.latencyMs} مللي ثانية`
                  : `خطأ: ${data.kms.error || 'فشل التحقق من صحة المفتاح النشط'}`}
              </small>
            </div>
          </div>

          {/* Key Details Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1rem',
              backgroundColor: '#f9fafb',
              padding: '1rem',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
            }}
          >
            <div>
              <span style={{ fontSize: '0.8rem', color: '#6b7280', display: 'block' }}>المزود المعتمد (Provider)</span>
              <strong style={{ fontSize: '0.95rem' }}>{providerLabel(data.kms.provider)}</strong>
            </div>
            <div>
              <span style={{ fontSize: '0.8rem', color: '#6b7280', display: 'block' }}>المفتاح الأساسي النشط (Active KEK)</span>
              <code dir="ltr" style={{ fontSize: '0.9rem', color: '#1f2937' }}>{data.kms.activeKeyId || 'غير متوفر'}</code>
            </div>
            <div>
              <span style={{ fontSize: '0.8rem', color: '#6b7280', display: 'block' }}>الإصدار والحالة</span>
              <span style={{ fontSize: '0.95rem' }}>
                الإصدار v{data.kms.activeKeyVersion ?? 1} · {stateLabel(data.kms.activeKeyState)}
              </span>
            </div>
            <div>
              <span style={{ fontSize: '0.8rem', color: '#6b7280', display: 'block' }}>إجمالي المفاتيح في السجل</span>
              <span style={{ fontSize: '0.95rem' }}>
                {data.kms.details?.totalKeys ?? 1} مفتاح ({data.kms.details?.retiredKeys ?? 0} متقاعد)
              </span>
            </div>
          </div>

          {/* Migration Audit Summary */}
          <div
            style={{
              backgroundColor: '#ffffff',
              padding: '1rem',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
            }}
          >
            <h5 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>سجل ترحيل وإعادة تشفير البيانات (Cryptographic Migration Audit)</h5>
            <div style={{ display: 'flex', gap: '2rem', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
              <span>إجمالي السجلات المفحوصة: <strong>{data.migration.totalAudited}</strong></span>
              <span style={{ color: '#059669' }}>تمت بنجاح: <strong>{data.migration.successful}</strong></span>
              {data.migration.failed > 0 && (
                <span style={{ color: '#dc2626' }}>فشل: <strong>{data.migration.failed}</strong></span>
              )}
            </div>

            {data.migration.recentAudits.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: '0.85rem', textAlign: 'right', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e5e7eb', color: '#6b7280' }}>
                      <th style={{ padding: '0.5rem' }}>نوع المورد</th>
                      <th style={{ padding: '0.5rem' }}>معرف السجل</th>
                      <th style={{ padding: '0.5rem' }}>المفتاح الأصلي</th>
                      <th style={{ padding: '0.5rem' }}>المفتاح المستهدف</th>
                      <th style={{ padding: '0.5rem' }}>الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.migration.recentAudits.slice(0, 5).map((audit) => (
                      <tr key={audit.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '0.5rem' }}>{audit.resourceType}</td>
                        <td style={{ padding: '0.5rem' }} dir="ltr"><code>{audit.recordId.slice(0, 8)}…</code></td>
                        <td style={{ padding: '0.5rem' }} dir="ltr"><code>{audit.sourceKeyId}</code></td>
                        <td style={{ padding: '0.5rem' }} dir="ltr"><code>{audit.targetKeyId}</code></td>
                        <td style={{ padding: '0.5rem' }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              backgroundColor: audit.status === 'SUCCESS' ? '#d1fae5' : '#fee2e2',
                              color: audit.status === 'SUCCESS' ? '#065f46' : '#991b1b',
                            }}
                          >
                            {audit.status === 'SUCCESS' ? 'ناجح' : 'فاشل'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: 0 }}>
                كافة السجلات التشفيرية الحالية متوافقة ومحمية بالمفتاح الأساسي النشط دون أي متأخرات ترحيل.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { ApiError, type ClinicContext } from '../auth/api';
import { RequestScope } from '../../lib/request-scope';
import {
  integrationsApi,
  type ExternalPayoutRecord,
  type ExternalRefundRecord,
  type PaymentIntentRecord,
  type PaymentProviderCode,
  type ProviderConfigRecord,
  type ReconciliationRunRecord,
  type RegulatoryDocumentRecord,
  type RegulatoryFramework,
  type RegulatoryProfileRecord,
  type WebhookEventRecord,
} from './integrations-api';

type IntegrationSubTab = 'PROVIDERS' | 'INTENTS' | 'PAYOUTS' | 'RECONCILIATION' | 'REGULATORY';

const PROVIDER_LABELS: Record<PaymentProviderCode, string> = {
  SANDBOX_MOCK: 'محاكي الدفع التجريبي (Sandbox Mock)',
  MOYASAR: 'ميسر (Moyasar — معطّل افتراضياً)',
  CHECKOUT_COM: 'Checkout.com (معطّل افتراضياً)',
  STRIPE: 'Stripe (معطّل افتراضياً)',
  REGIONAL_BANK_GATEWAY: 'بوابة البنك الإقليمية (معطّل افتراضياً)',
};

const FRAMEWORK_LABELS: Record<RegulatoryFramework, string> = {
  NOT_CONFIGURED: 'غير مفعّل',
  SA_ZATCA: 'هيئة الزكاة والضريبة والجمارك (ZATCA — متوافق هيكلياً / تجريبي)',
  AE_FTA: 'الهيئة الاتحادية للضرائب (الإمارات)',
  GENERIC_TAX_INVOICE: 'فاتورة ضريبية قياسية',
};

export function IntegrationsWorkspace({
  clinic,
  csrfToken,
  onAuthError,
}: {
  clinic: ClinicContext;
  csrfToken: string;
  onAuthError: (e: unknown) => void;
}) {
  const [subTab, setSubTab] = useState<IntegrationSubTab>('PROVIDERS');
  const client = useMemo(() => integrationsApi(clinic.clinicId), [clinic.clinicId]);
  const scope = useMemo(() => new RequestScope(), [clinic.clinicId]);

  const can = (p: string) => clinic.permissions.includes(p);
  const canProvidersRead = can('integrations.providers.read');
  const canProvidersManage = can('integrations.providers.manage');
  const canPaymentsRead = can('integrations.payments.read');
  const canPayouts = can('integrations.payouts.manage');
  const canReconcileRead = can('integrations.reconciliation.read');
  const canReconcileRun = can('integrations.reconciliation.run');
  const canRegulatoryRead = can('integrations.regulatory.read');
  const canRegulatoryManage = can('integrations.regulatory.manage');

  const [providers, setProviders] = useState<ProviderConfigRecord[]>([]);
  const [intents, setIntents] = useState<PaymentIntentRecord[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookEventRecord[]>([]);
  const [refunds, setRefunds] = useState<ExternalRefundRecord[]>([]);
  const [payouts, setPayouts] = useState<ExternalPayoutRecord[]>([]);
  const [runs, setRuns] = useState<ReconciliationRunRecord[]>([]);
  const [regProfile, setRegProfile] = useState<RegulatoryProfileRecord | null>(null);
  const [regDocs, setRegDocs] = useState<RegulatoryDocumentRecord[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reloadTick, setReloadTick] = useState(0);

  // Provider form state
  const [providerCode, setProviderCode] = useState<PaymentProviderCode>('SANDBOX_MOCK');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [apiKey, setApiKey] = useState('');

  // Regulatory profile form state
  const [framework, setFramework] = useState<RegulatoryFramework>('SA_ZATCA');
  const [taxNumber, setTaxNumber] = useState('');
  const [docPrefix, setDocPrefix] = useState('ZAT');

  // Reset state whenever clinic or selected branch changes to prevent cross-tenant/branch bleed
  useEffect(() => {
    setProviders([]);
    setIntents([]);
    setWebhooks([]);
    setRefunds([]);
    setPayouts([]);
    setRuns([]);
    setRegProfile(null);
    setRegDocs([]);
    setError('');
    setNotice('');
    return () => scope.cancel();
  }, [clinic.clinicId, scope]);

  useEffect(() => {
    const req = scope.start();
    setLoading(true);
    setError('');

    const load = async () => {
      try {
        if (subTab === 'PROVIDERS' && canProvidersRead) {
          setProviders(await client.listProviders(req.signal));
        } else if (subTab === 'INTENTS' && canPaymentsRead) {
          const [i, w] = await Promise.all([
            client.listPaymentIntents(req.signal),
            client.listWebhookEvents(req.signal),
          ]);
          if (req.current()) {
            setIntents(i);
            setWebhooks(w);
          }
        } else if (subTab === 'PAYOUTS') {
          const [r, p] = await Promise.all([
            canPaymentsRead ? client.listExternalRefunds(req.signal) : Promise.resolve([]),
            canPayouts ? client.listExternalPayouts(req.signal) : Promise.resolve([]),
          ]);
          if (req.current()) {
            setRefunds(r);
            setPayouts(p);
          }
        } else if (subTab === 'RECONCILIATION' && canReconcileRead) {
          setRuns(await client.listReconciliationRuns(req.signal));
        } else if (subTab === 'REGULATORY' && canRegulatoryRead) {
          const [prof, docs] = await Promise.all([
            client.getRegulatoryProfile(req.signal),
            client.listRegulatoryDocuments(req.signal),
          ]);
          if (req.current()) {
            setRegProfile(prof);
            setRegDocs(docs);
            if (prof) {
              setFramework(prof.framework);
              setTaxNumber(prof.taxRegistrationNumber ?? '');
              setDocPrefix(prof.invoiceNumberingPrefix ?? 'ZAT');
            }
          }
        }
        if (req.current()) setLoading(false);
      } catch (err) {
        if (!req.current()) return;
        setLoading(false);
        if (err instanceof ApiError && (err.status === 401 || err.code === 'MFA_STEP_UP_REQUIRED' || err.code === 'MFA_SETUP_REQUIRED')) {
          onAuthError(err);
          return;
        }
        setError(err instanceof ApiError ? err.message : 'تعذر تحميل بيانات الربط والتسوية.');
      }
    };

    void load();
  }, [subTab, client, scope, reloadTick, canProvidersRead, canPaymentsRead, canPayouts, canReconcileRead, canRegulatoryRead]);

  async function handleEnableSandboxProvider() {
    setError('');
    setNotice('');
    try {
      await client.upsertProvider(csrfToken, {
        providerCode,
        mode: 'SANDBOX',
        isEnabled: providerCode === 'SANDBOX_MOCK',
        supportedCurrencies: ['SAR', 'AED', 'USD'],
        jurisdiction: 'SA',
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        ...(webhookSecret.trim() ? { webhookSecret: webhookSecret.trim() } : {}),
      });
      setApiKey('');
      setWebhookSecret('');
      setNotice('تم حفظ إعدادات مزود الدفع في الوضع التجريبي (Sandbox) مع تشفير الأسرار.');
      setReloadTick((t) => t + 1);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.code === 'MFA_STEP_UP_REQUIRED')) {
        onAuthError(err);
        return;
      }
      setError(err instanceof ApiError ? err.message : 'تعذر حفظ إعدادات المزود.');
    }
  }

  async function handleRunReconciliation() {
    setError('');
    setNotice('');
    try {
      const now = new Date();
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      await client.runReconciliation(csrfToken, {
        periodStart: start.toISOString(),
        periodEnd: now.toISOString(),
        scope: 'PAYMENT_PROVIDER',
      });
      setNotice('تم تشغيل المطابقة الخارجية بنجاح (قراءة مقارنة فقط دون تعديل الدفتر).');
      setReloadTick((t) => t + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تشغيل المطابقة الخارجية.');
    }
  }

  async function handleSaveRegulatoryProfile() {
    setError('');
    setNotice('');
    try {
      await client.upsertRegulatoryProfile(csrfToken, {
        countryCode: framework === 'AE_FTA' ? 'AE' : 'SA',
        framework,
        taxRegistrationNumber: taxNumber.trim() || undefined,
        invoiceNumberingPrefix: docPrefix.trim() || undefined,
        isEInvoicingEnabled: true,
        sandboxMode: true,
      });
      setNotice('تم حفظ الملف التنظيمي في الوضع التجريبي (لا يتم الإرسال الفعلي للجهات الرسمية).');
      setReloadTick((t) => t + 1);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.code === 'MFA_STEP_UP_REQUIRED')) {
        onAuthError(err);
        return;
      }
      setError(err instanceof ApiError ? err.message : 'تعذر حفظ الملف التنظيمي.');
    }
  }

  return (
    <div className="panel full-panel" dir="rtl" data-testid="integrations-workspace">
      <div className="toolbar" style={{ flexWrap: 'wrap', gap: '8px' }}>
        {canProvidersRead && (
          <button
            className={`inventory-tab-btn ${subTab === 'PROVIDERS' ? 'active' : ''}`}
            onClick={() => setSubTab('PROVIDERS')}
          >
            مزودو الدفع
          </button>
        )}
        {canPaymentsRead && (
          <button
            className={`inventory-tab-btn ${subTab === 'INTENTS' ? 'active' : ''}`}
            onClick={() => setSubTab('INTENTS')}
          >
            نيات الدفع والويب هوك
          </button>
        )}
        {(canPaymentsRead || canPayouts) && (
          <button
            className={`inventory-tab-btn ${subTab === 'PAYOUTS' ? 'active' : ''}`}
            onClick={() => setSubTab('PAYOUTS')}
          >
            الاستردادات والدفعات
          </button>
        )}
        {canReconcileRead && (
          <button
            className={`inventory-tab-btn ${subTab === 'RECONCILIATION' ? 'active' : ''}`}
            onClick={() => setSubTab('RECONCILIATION')}
          >
            المطابقة الخارجية
          </button>
        )}
        {canRegulatoryRead && (
          <button
            className={`inventory-tab-btn ${subTab === 'REGULATORY' ? 'active' : ''}`}
            onClick={() => setSubTab('REGULATORY')}
          >
            الامتثال التنظيمي (ZATCA / الضرائب)
          </button>
        )}
      </div>

      {notice && (
        <div className="notice" role="status">
          {notice}
          <button onClick={() => setNotice('')} aria-label="إغلاق">×</button>
        </div>
      )}
      {error && <div className="patient-error" role="alert">{error}</div>}
      {loading && <p role="status">جارٍ تحميل بيانات البوابات والامتثال…</p>}

      {subTab === 'PROVIDERS' && canProvidersRead && (
        <div>
          <h3>إعدادات مزودي الدفع (الوضع التجريبي معزول عن الإنتاج)</h3>
          <p className="form-hint">
            الأسرار تُشفّر عند التخزين ولا تُعرض أبداً بعد الحفظ. البوابات الحية معطلة افتراضياً في هذه المرحلة.
          </p>
          {canProvidersManage && (
            <div className="toolbar" style={{ gap: '8px', flexWrap: 'wrap' }}>
              <select
                aria-label="مزود الدفع"
                value={providerCode}
                onChange={(e) => setProviderCode(e.target.value as PaymentProviderCode)}
              >
                {Object.entries(PROVIDER_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
              <input
                type="password"
                placeholder="مفتاح API (اختياري للتشفير)"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <input
                type="password"
                placeholder="سر توقيع Webhook (12 حرفاً فأكثر)"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
              />
              <button className="primary-btn" onClick={() => void handleEnableSandboxProvider()}>
                حفظ إعدادات المزود
              </button>
            </div>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>المزود</th>
                  <th>البيئة</th>
                  <th>الحالة</th>
                  <th>البصمة الأمنية للسر</th>
                  <th>الفحص الصحي</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((p) => (
                  <tr key={p.id}>
                    <td>{PROVIDER_LABELS[p.providerCode]}</td>
                    <td><span className="status">{p.mode === 'SANDBOX' ? 'تجريبي (Sandbox)' : 'إنتاج (Live)'}</span></td>
                    <td>{p.isEnabled ? 'مفعّل' : 'معطّل'}</td>
                    <td><bdi>{p.secretFingerprint ?? 'غير مضبوط'}</bdi></td>
                    <td>
                      {p.healthStatus}
                      <button
                        className="table-btn"
                        style={{ marginInlineStart: '8px' }}
                        onClick={() => void client.checkProviderHealth(csrfToken, p.id).then(() => setReloadTick((t) => t + 1))}
                      >
                        فحص
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {providers.length === 0 && <p>لا توجد إعدادات مزودي دفع مسجلة بعد.</p>}
          </div>
        </div>
      )}

      {subTab === 'INTENTS' && canPaymentsRead && (
        <div>
          <h3>نيات الدفع وسجل أحداث Webhook</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>المعرّف الخارجي</th>
                  <th>المزود</th>
                  <th>المبلغ (وحدة صغرى)</th>
                  <th>الحالة</th>
                  <th>قيد الدفع الداخلي</th>
                </tr>
              </thead>
              <tbody>
                {intents.map((i) => (
                  <tr key={i.id}>
                    <td><bdi>{i.providerIntentId ?? i.id}</bdi></td>
                    <td>{i.providerCode}</td>
                    <td><bdi>{i.amountMinor} {i.currency}</bdi></td>
                    <td>{i.status}</td>
                    <td><bdi>{i.postedPaymentId ?? '—'}</bdi></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {intents.length === 0 && <p>لا توجد نيات دفع مسجلة.</p>}
          </div>
          <h4>أحداث Webhook المستلمة</h4>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>معرّف الحدث</th>
                  <th>النوع</th>
                  <th>حالة المعالجة</th>
                  <th>التحقق من التوقيع</th>
                  <th>ملاحظة / خطأ</th>
                </tr>
              </thead>
              <tbody>
                {webhooks.map((w) => (
                  <tr key={w.id}>
                    <td><bdi>{w.providerEventId}</bdi></td>
                    <td><bdi>{w.eventType}</bdi></td>
                    <td>{w.processingStatus}</td>
                    <td>{w.signatureVerified ? 'موثّق' : 'مرفوض'}</td>
                    <td>{w.errorMessage ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'PAYOUTS' && (
        <div>
          <h3>الاستردادات الخارجية ودفعات تسوية الأطباء</h3>
          <p className="form-hint">
            اعتماد الدفعات يخضع لفصل الصلاحيات (لا يمكن لمُعد الدفعة اعتمادها)، ولا يتم تنفيذ تحويل مالي حي تلقائياً.
          </p>
          {canPayouts && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>رقم الدفعة</th>
                    <th>البيئة</th>
                    <th>المبلغ</th>
                    <th>الحالة</th>
                    <th>إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.map((p) => (
                    <tr key={p.id}>
                      <td><bdi>{p.payoutNumber}</bdi></td>
                      <td>{p.mode}</td>
                      <td><bdi>{p.amountMinor} {p.currency}</bdi></td>
                      <td>{p.status}</td>
                      <td>
                        {p.status === 'PREPARED' && (
                          <button
                            className="table-btn"
                            onClick={() => void client.approvePayout(csrfToken, p.id, p.mode === 'SANDBOX').then(() => setReloadTick((t) => t + 1)).catch((e) => setError(e instanceof ApiError ? e.message : 'تعذر الاعتماد'))}
                          >
                            اعتماد (مع التحقق من فصل الصلاحيات)
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {payouts.length === 0 && <p>لا توجد دفعات خارجية مسجلة.</p>}
            </div>
          )}
          {canPaymentsRead && (
            <div className="table-wrap" style={{ marginTop: '12px' }}>
              <h4>الاستردادات الخارجية</h4>
              <table>
                <thead>
                  <tr>
                    <th>مرجع المزود</th>
                    <th>المبلغ</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {refunds.map((r) => (
                    <tr key={r.id}>
                      <td><bdi>{r.providerRefundId ?? r.id}</bdi></td>
                      <td><bdi>{r.amountMinor} {r.currency}</bdi></td>
                      <td>{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {refunds.length === 0 && <p>لا توجد استردادات خارجية مسجلة.</p>}
            </div>
          )}
        </div>
      )}

      {subTab === 'RECONCILIATION' && canReconcileRead && (
        <div>
          <div className="toolbar">
            <h3>المطابقة المالية الخارجية (قراءة مقارنة فقط)</h3>
            {canReconcileRun && (
              <button className="primary-btn" onClick={() => void handleRunReconciliation()}>
                تشغيل مطابقة جديدة (آخر 30 يوماً)
              </button>
            )}
          </div>
          {runs.map((run) => (
            <div key={run.id} className="panel" style={{ marginBottom: '12px' }}>
              <p>
                <strong><bdi>{run.runNumber}</bdi></strong> · الحالة: {run.status} · تم فحص: {run.totalChecked} · الفروقات: {run.discrepancyCount}
              </p>
              <p className="form-hint">
                إجمالي الدفتر الداخلي: <bdi>{run.summaryJson?.internalPostedTotalMinor ?? '0'}</bdi> |
                إجمالي مزود الدفع: <bdi>{run.summaryJson?.providerReportedTotalMinor ?? '0'}</bdi> |
                إجمالي كشف البنك: <bdi>{run.summaryJson?.bankSettledTotalMinor ?? '0'}</bdi>
              </p>
              {run.findings.length > 0 && (
                <ul>
                  {run.findings.map((f) => (
                    <li key={f.id}>[{f.severity}] {f.descriptionAr}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {runs.length === 0 && <p>لم يتم تنفيذ أي مطابقة خارجية بعد.</p>}
        </div>
      )}

      {subTab === 'REGULATORY' && canRegulatoryRead && (
        <div>
          <h3>الامتثال التنظيمي والفوترة الإلكترونية</h3>
          <p className="form-hint">
            تنبيه: الإرسال الحي للهيئة (مثل ZATCA المرحلة الثانية) غير مفعّل في هذه المرحلة؛ وضع المحاكاة يسجل حالة
            {' '}<bdi>MOCK_SUBMITTED</bdi> فقط ولا يُعدّ اعتماداً ضريبياً رسمياً.
          </p>
          {canRegulatoryManage && (
            <div className="toolbar" style={{ gap: '8px', flexWrap: 'wrap' }}>
              <select
                aria-label="الإطار التنظيمي"
                value={framework}
                onChange={(e) => setFramework(e.target.value as RegulatoryFramework)}
              >
                {Object.entries(FRAMEWORK_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
              <input
                placeholder="الرقم الضريبي"
                value={taxNumber}
                onChange={(e) => setTaxNumber(e.target.value)}
              />
              <input
                placeholder="بادئة الترقيم"
                value={docPrefix}
                onChange={(e) => setDocPrefix(e.target.value)}
              />
              <button className="primary-btn" onClick={() => void handleSaveRegulatoryProfile()}>
                حفظ الملف التنظيمي
              </button>
            </div>
          )}
          {regProfile && (
            <p>
              الإطار الحالي: <strong>{FRAMEWORK_LABELS[regProfile.framework]}</strong> ·
              الرقم الضريبي: <bdi>{regProfile.taxRegistrationNumber ?? 'غير محدد'}</bdi> ·
              الوضع: {regProfile.sandboxMode ? 'تجريبي (Sandbox)' : 'حي (غير مفعّل للنقل)'}
            </p>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>رقم المستند</th>
                  <th>النوع</th>
                  <th>الإطار</th>
                  <th>الحالة</th>
                  <th>البصمة (Hash)</th>
                  <th>إجراء</th>
                </tr>
              </thead>
              <tbody>
                {regDocs.map((d) => (
                  <tr key={d.id}>
                    <td><bdi>{d.documentNumber}</bdi></td>
                    <td>{d.documentType}</td>
                    <td>{d.framework}</td>
                    <td>{d.status}</td>
                    <td><bdi>{d.canonicalHash.slice(0, 12)}…</bdi></td>
                    <td>
                      {canRegulatoryManage && d.status !== 'MOCK_SUBMITTED' && (
                        <button
                          className="table-btn"
                          onClick={() => void client.submitRegulatoryDocument(csrfToken, d.id).then(() => setReloadTick((t) => t + 1))}
                        >
                          إرسال تجريبي (Mock)
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {regDocs.length === 0 && <p>لا توجد مستندات تنظيمية مُعدّة بعد.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

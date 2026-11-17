import React, { useState, useEffect, useMemo } from 'react';
import type { ClinicContext } from '../auth/api';
import { api, ApiError } from '../auth/api';
import { RequestScope } from '../../lib/request-scope';
import './clinical-governance.css';

interface Props {
  clinic: ClinicContext;
  csrfToken: string;
  onAuthError: (error: unknown) => void;
}

type GovernanceTab =
  | 'policies'
  | 'privileges'
  | 'incidents'
  | 'break-glass'
  | 'interoperability'
  | 'compliance';

interface PolicyItem {
  id: string;
  code: string;
  titleAr: string;
  titleEn?: string | null;
  category: string;
  status: string;
  activeVersion?: {
    id: string;
    versionNumber: number;
    rulesSha256: string;
    isApproved: boolean;
    approvedAt?: string | null;
  } | null;
}

interface IncidentItem {
  id: string;
  incidentNumber: string;
  severity: string;
  category: string;
  status: string;
  description: string;
  reportedAt: string;
  investigationFindings?: string | null;
}

interface BreakGlassItem {
  id: string;
  patientId: string;
  justification: string;
  durationMinutes: number;
  requestedAt: string;
  expiresAt: string;
  isExpired: boolean;
  auditReviewedAt?: string | null;
  reviewOutcome?: string | null;
}

interface InteropStatus {
  standardVersion: string;
  disclaimers: {
    liveTransmission: string;
    terminologyLicensing: string;
  };
  adapters: Array<{
    name: string;
    enabled: boolean;
    environment: string;
    endpointUrl: string;
    isAllowlisted: boolean;
  }>;
}

export function ClinicalGovernanceWorkspace({ clinic, csrfToken, onAuthError }: Props) {
  const [activeTab, setActiveTab] = useState<GovernanceTab>('policies');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Domain states
  const [policies, setPolicies] = useState<PolicyItem[]>([]);
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [breakGlasses, setBreakGlasses] = useState<BreakGlassItem[]>([]);
  const [interop, setInterop] = useState<InteropStatus | null>(null);

  // Terminology check tool state
  const [testSystem, setTestSystem] = useState('ICD_10');
  const [testCode, setTestCode] = useState('L70.0');
  const [termValidationResult, setTermValidationResult] = useState<any>(null);

  const scope = useMemo(() => new RequestScope(), [clinic.clinicId]);

  useEffect(() => {
    return () => scope.cancel();
  }, [scope]);

  const loadData = async () => {
    setBusy(true);
    setError('');
    const token = scope.start();

    try {
      if (activeTab === 'policies') {
        const res = await api<PolicyItem[]>(
          `clinics/${clinic.clinicId}/clinical-governance/policies`,
          'GET',
          undefined,
          undefined,
          token.signal,
        );
        if (token.current()) setPolicies(res || []);
      } else if (activeTab === 'incidents') {
        const res = await api<IncidentItem[]>(
          `clinics/${clinic.clinicId}/clinical-governance/incidents`,
          'GET',
          undefined,
          undefined,
          token.signal,
        );
        if (token.current()) setIncidents(res || []);
      } else if (activeTab === 'break-glass') {
        const res = await api<BreakGlassItem[]>(
          `clinics/${clinic.clinicId}/clinical-governance/break-glass`,
          'GET',
          undefined,
          undefined,
          token.signal,
        );
        if (token.current()) setBreakGlasses(res || []);
      } else if (activeTab === 'interoperability') {
        const res = await api<InteropStatus>(
          `clinics/${clinic.clinicId}/interoperability/status`,
          'GET',
          undefined,
          undefined,
          token.signal,
        );
        if (token.current()) setInterop(res);
      }
    } catch (err: any) {
      if (!token.current()) return;
      if (err instanceof ApiError && err.status === 401) {
        onAuthError(err);
      } else {
        setError(err.message || 'تعذر تحميل بيانات الحوكمة السريرية.');
      }
    } finally {
      if (token.current()) setBusy(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [activeTab, clinic.clinicId]);

  const validateTerminologyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setTermValidationResult(null);
    try {
      const res = await api(
        `clinics/${clinic.clinicId}/interoperability/terminology/validate`,
        'POST',
        { system: testSystem, code: testCode },
        csrfToken,
      );
      setTermValidationResult(res);
    } catch (err: any) {
      setError(err.message || 'تعذر التحقق من الترميز السريري.');
    }
  };

  return (
    <div className="clinical-governance-workspace" dir="rtl">
      <header className="gov-header">
        <div className="gov-title">
          <span className="gov-badge">الإدارة السريرية والامتثال الطبي</span>
          <h2>الحوكمة السريرية، سلامة المرضى وجاهزية الربط الصحي</h2>
          <p>
            منظومة الرقابة الطبية الموحدة تحت إشراف المدير الطبي: سياسات وبروتوكولات السلامة،
            الامتيازات السريرية، تدقيق كسر الحواجز الطارئ، ومعايير HL7 FHIR R4.
          </p>
        </div>
      </header>

      {notice && (
        <div className="gov-alert success" role="status">
          ✓ {notice}
          <button onClick={() => setNotice('')} aria-label="إغلاق التنبيه">×</button>
        </div>
      )}

      {error && (
        <div className="gov-alert error" role="alert">
          ⚠ {error}
          <button onClick={() => setError('')} aria-label="إغلاق التنبيه">×</button>
        </div>
      )}

      {/* Tabs Navigation */}
      <nav className="gov-tabs" aria-label="أقسام الحوكمة السريرية">
        <button
          className={activeTab === 'policies' ? 'active' : ''}
          onClick={() => setActiveTab('policies')}
        >
          📜 السياسات والبروتوكولات السريرية
        </button>
        <button
          className={activeTab === 'privileges' ? 'active' : ''}
          onClick={() => setActiveTab('privileges')}
        >
          🩺 مراجعة الامتيازات والاعتماد
        </button>
        <button
          className={activeTab === 'incidents' ? 'active' : ''}
          onClick={() => setActiveTab('incidents')}
        >
          🚨 حوادث وسلامة المرضى
        </button>
        <button
          className={activeTab === 'break-glass' ? 'active' : ''}
          onClick={() => setActiveTab('break-glass')}
        >
          ⚡ الوصول الطارئ الاستثنائي (Break-Glass)
        </button>
        <button
          className={activeTab === 'interoperability' ? 'active' : ''}
          onClick={() => setActiveTab('interoperability')}
        >
          🔗 جاهزية الربط الصحي والمعايير (FHIR R4)
        </button>
        <button
          className={activeTab === 'compliance' ? 'active' : ''}
          onClick={() => setActiveTab('compliance')}
        >
          ⚖ مصفوفة الامتثال التنظيمي (KSA / UAE)
        </button>
      </nav>

      {/* Tab 1: Clinical Safety Policies */}
      {activeTab === 'policies' && (
        <section className="gov-section">
          <div className="section-toolbar">
            <div>
              <h3>السياسات والبروتوكولات السريرية المعتمدة</h3>
              <p>
                تخضع كافة البروتوكولات والسياسات السريرية لاعتماد المدير الطبي حصرًا مع توثيق التجزئة
                الرقمية SHA-256 لمنع التعديل غير المصرح به بعد الاعتماد.
              </p>
            </div>
          </div>

          <div className="gov-card-list">
            {busy && <p className="loading-state">جارٍ تحميل السياسات السريرية...</p>}
            {!busy && policies.length === 0 && (
              <div className="empty-state">
                <p>لا توجد سياسات سريرية مسجلة حاليًا لهذه العيادة.</p>
              </div>
            )}
            {policies.map((policy) => (
              <div key={policy.id} className="gov-card">
                <div className="gov-card-header">
                  <span className="code-pill">{policy.code}</span>
                  <h4>{policy.titleAr}</h4>
                  <span className={`status-tag ${policy.status.toLowerCase()}`}>
                    {policy.status}
                  </span>
                </div>
                {policy.titleEn && <small className="en-sub">{policy.titleEn}</small>}
                <div className="policy-meta">
                  <span>التصنيف: {policy.category}</span>
                  {policy.activeVersion && (
                    <>
                      <span>الإصدار الفعّال: v{policy.activeVersion.versionNumber}</span>
                      <span className="sha-hash" title={policy.activeVersion.rulesSha256}>
                        SHA-256: {policy.activeVersion.rulesSha256.substring(0, 12)}...
                      </span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Tab 2: Privilege Reviews */}
      {activeTab === 'privileges' && (
        <section className="gov-section">
          <div className="section-toolbar">
            <div>
              <h3>مراجعة الامتيازات السريرية والاعتماد المهني</h3>
              <p>
                نظام التحقق الدوري من التراخيص الطبية وسريان الامتيازات مع صلاحية التعليق الطارئ
                الفوري للحد من المخاطر السريرية تحت سلطة المدير الطبي.
              </p>
            </div>
          </div>

          <div className="info-box-governance">
            <strong>قاعدة الأمان وعدم مراجعة الذات (Anti-Self-Review):</strong>
            <p>
              لا يمكن للممارس الطبي أو المدير الطبي مراجعة أو تمديد امتيازاته الخاصة ذاتيًا. يجب إجراء
              المراجعة عبر لجنة مستقلة أو إحالتها للتدقيق الإداري والمهني الأعلى.
            </p>
          </div>
        </section>
      )}

      {/* Tab 3: Incidents & Near-Misses */}
      {activeTab === 'incidents' && (
        <section className="gov-section">
          <div className="section-toolbar">
            <div>
              <h3>سجل حوادث السلامة والأخطاء وشبه الحوادث (Near-Miss)</h3>
              <p>
                ترقيم تسلسلي إلزامي وغير قابل للتكرار (INC-CLIN-XXXXXX) مع مسار تحليل الأسباب الجذرية
                (Root Cause Analysis) وخطط الإجراءات التصحيحية.
              </p>
            </div>
          </div>

          <div className="gov-card-list">
            {busy && <p className="loading-state">جارٍ تحميل سجل الحوادث السريرية...</p>}
            {!busy && incidents.length === 0 && (
              <div className="empty-state">
                <p>لم يتم تسجيل أي حوادث سريرية أو شبه حوادث في الفترة الحالية.</p>
              </div>
            )}
            {incidents.map((inc) => (
              <div key={inc.id} className="gov-card incident-card">
                <div className="gov-card-header">
                  <span className="code-pill alert">{inc.incidentNumber}</span>
                  <span className={`severity-tag ${inc.severity.toLowerCase()}`}>
                    {inc.severity}
                  </span>
                  <span className={`status-tag ${inc.status.toLowerCase()}`}>
                    {inc.status}
                  </span>
                </div>
                <p className="incident-desc">{inc.description}</p>
                <div className="incident-meta">
                  <small>تاريخ البلاغ: {new Date(inc.reportedAt).toLocaleDateString('ar-SA')}</small>
                  <small>التصنيف: {inc.category}</small>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Tab 4: Emergency Break-Glass Access */}
      {activeTab === 'break-glass' && (
        <section className="gov-section">
          <div className="section-toolbar">
            <div>
              <h3>سجل الوصول الطارئ الاستثنائي (Emergency Break-Glass)</h3>
              <p>
                إجراء محكوم زمنياً (بحد أقصى 120 دقيقة) ومبرر سريريًا (20 حرف على الأقل) مع فرض
                التدقيق المستقل ومنع الممارس من مراجعة عملية الوصول الخاصة به.
              </p>
            </div>
          </div>

          <div className="gov-table-wrap">
            <table className="gov-table">
              <thead>
                <tr>
                  <th>معرّف المريض</th>
                  <th>المبرر السريري الطارئ</th>
                  <th>المدة</th>
                  <th>وقت الطلب</th>
                  <th>حالة الصلاحية</th>
                  <th>نتيجة التدقيق</th>
                </tr>
              </thead>
              <tbody>
                {breakGlasses.map((bg) => (
                  <tr key={bg.id}>
                    <td><code>{bg.patientId.substring(0, 8)}...</code></td>
                    <td className="justification-cell">{bg.justification}</td>
                    <td>{bg.durationMinutes} دقيقة</td>
                    <td>{new Date(bg.requestedAt).toLocaleTimeString('ar-SA')}</td>
                    <td>
                      <span className={`status-tag ${bg.isExpired ? 'expired' : 'active'}`}>
                        {bg.isExpired ? 'منتهية' : 'سارية'}
                      </span>
                    </td>
                    <td>
                      {bg.auditReviewedAt ? (
                        <span className={`review-tag ${bg.reviewOutcome?.toLowerCase()}`}>
                          {bg.reviewOutcome}
                        </span>
                      ) : (
                        <span className="review-tag pending">بانتظار تدقيق مستقل</span>
                      )}
                    </td>
                  </tr>
                ))}
                {breakGlasses.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem' }}>
                      لا توجد محاولات وصول استثنائي مسجلة.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Tab 5: Interoperability Readiness & FHIR R4 */}
      {activeTab === 'interoperability' && (
        <section className="gov-section">
          <div className="section-toolbar">
            <div>
              <h3>جاهزية الربط الصحي ومعايير HL7 FHIR Release 4</h3>
              <p>
                محولات الربط مع بوابات المختبرات، الأشعة (PACS)، الصيدليات، ومنصات التبادل الصحي
                الوطنية (Seha/Nphies / Malaffi/Nabidh). الاتصال الفعلي معطّل افتراضيًا لضمان الأمان.
              </p>
            </div>
          </div>

          <div className="disclaimer-banner">
            <strong>تنبيه الأمان والامتثال:</strong> كافة محولات الربط الخارجي مقفلة وتعمل في الوضع
            التجريبي المعزول (Sandbox). التفعيل في بيئة الإنتاج يتطلب اعتمادًا تنظيميًا وعقود ربط رسمية.
          </div>

          {interop && (
            <div className="adapters-grid">
              {interop.adapters.map((adapter) => (
                <div key={adapter.name} className="adapter-card">
                  <div className="adapter-header">
                    <h4>{adapter.name}</h4>
                    <span className={`status-pill ${adapter.enabled ? 'green' : 'amber'}`}>
                      {adapter.enabled ? 'مفعّل' : 'معطّل افتراضيًا'}
                    </span>
                  </div>
                  <div className="adapter-details">
                    <div><span>البيئة:</span> <code>{adapter.environment}</code></div>
                    <div><span>نطاق الاتصال:</span> <code>{adapter.endpointUrl}</code></div>
                    <div><span>القائمة البيضاء:</span> {adapter.isAllowlisted ? '✓ معتمد' : '✗ غير معتمد'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Terminology Validation Tool */}
          <div className="terminology-tool-panel">
            <h4>أداة التحقق من الرموز والمصطلحات السريرية</h4>
            <p>تحقق من صحة نسق الرموز السريرية (ICD-10, LOINC, WHO-ATC, SNOMED CT).</p>
            <form onSubmit={validateTerminologyCode} className="term-form">
              <label>
                نظام الترميز:
                <select value={testSystem} onChange={(e) => setTestSystem(e.target.value)}>
                  <option value="ICD_10">ICD-10 (التشخيص الطبي)</option>
                  <option value="LOINC">LOINC (الفحوصات والعلامات الحيوية)</option>
                  <option value="ATC">WHO-ATC (التصنيف الدوائي)</option>
                  <option value="SNOMED_CT">SNOMED CT (المصطلحات السريرية)</option>
                </select>
              </label>
              <label>
                الرمز السريري:
                <input
                  type="text"
                  value={testCode}
                  onChange={(e) => setTestCode(e.target.value)}
                  placeholder="مثال: L70.0 أو 8480-6"
                  required
                />
              </label>
              <button type="submit" className="primary-btn">التحقق من النسق والترخيص</button>
            </form>

            {termValidationResult && (
              <div className="term-result-box">
                <h5>نتيجة التحقق:</h5>
                <p><strong>النظام:</strong> {termValidationResult.standardName}</p>
                <p><strong>صحة النسق:</strong> {termValidationResult.isValidFormat ? '✓ نسق صحيح' : '✗ نسق غير مطابق للمعيار'}</p>
                <div className="licensing-notice">
                  <strong>إشعار الترخيص والامتثال:</strong>
                  <p>{termValidationResult.licensingNotice}</p>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Tab 6: Jurisdiction Compliance Matrix */}
      {activeTab === 'compliance' && (
        <section className="gov-section">
          <div className="section-toolbar">
            <div>
              <h3>مصفوفة الامتثال التنظيمي الإقليمي (المملكة العربية السعودية / الإمارات)</h3>
              <p>توضيح التوافق المؤسسي والتقني مع المتطلبات التنظيمية والمعايير المعتمدة لكل ولاية قضائية.</p>
            </div>
          </div>

          <div className="compliance-columns">
            <div className="compliance-card">
              <div className="flag-title">
                <h4>المملكة العربية السعودية (KSA)</h4>
              </div>
              <ul className="compliance-list">
                <li>
                  <strong>وزارة الصحة (MOH):</strong> مطابقة سجلات الممارسين وتراخيص المنشأة ومعايير
                  التوثيق السريري الموحد.
                </li>
                <li>
                  <strong>منصة نفيس (Seha / Nphies):</strong> محول متوافق مع معايير FHIR R4 للمطالبات
                  والتفويضات الطبية والتقارير المخبرية.
                </li>
                <li>
                  <strong>وصفتي (Wasfaty):</strong> توافق نسق الوصفة الطبية الإلكترونية وصرف الأدوية
                  الخارجي مع التحقق من الحساسية الدوائية.
                </li>
                <li>
                  <strong>الفوترة الإلكترونية (ZATCA):</strong> الامتثال الكامل لمعايير الفوترة
                  المرحلة الثانية والربط مع هيئة الزكاة والضريبة.
                </li>
                <li>
                  <strong>نظام حماية البيانات الشخصية (PDPL):</strong> عزل بيانات الهوية واستخدام
                  التشفير وحفظ سجلات التدقيق غير القابلة للتعديل.
                </li>
              </ul>
            </div>

            <div className="compliance-card">
              <div className="flag-title">
                <h4>دولة الإمارات العربية المتحدة (UAE)</h4>
              </div>
              <ul className="compliance-list">
                <li>
                  <strong>دائرة الصحة / هيئة الصحة (DoH / DHA):</strong> معايير حوكمة التخصصات والامتيازات
                  السريرية والمسؤولية الطبية.
                </li>
                <li>
                  <strong>ملفي (Malaffi) ونبض (Nabidh):</strong> هيكل تبادل الملفات الصحية والربط عبر
                  معايير FHIR R4 ورقم الهوية الوطنية المعتمد.
                </li>
                <li>
                  <strong>الصيدلة والوصفات (e-Rx):</strong> دعم أرقام مراجع الوصفات ومطابقة الصرف
                  الصيدلاني الخارجي.
                </li>
                <li>
                  <strong>حماية البيانات الصحية:</strong> الامتثال لقانون تنظيم تداول البيانات الصحية
                  وتخزين السجلات السريرية بأمان داخل الدولة.
                </li>
              </ul>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

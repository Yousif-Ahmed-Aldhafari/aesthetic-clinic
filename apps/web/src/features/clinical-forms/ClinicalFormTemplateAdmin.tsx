import { useEffect, useMemo, useState } from 'react';
import { RequestScope } from '../../lib/request-scope';
import { formsApi, type FormDefinition } from './clinical-forms-api';
import './clinical-forms.css';

const aborted = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

export function ClinicalFormTemplateAdmin({ clinicId, csrfToken }: { clinicId: string; csrfToken: string }) {
  const scope = useMemo(() => new RequestScope(), [clinicId]);
  const [items, setItems] = useState<FormDefinition[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    const token = scope.start();
    void formsApi.definitions(clinicId, token.signal)
      .then(result => { if (token.current()) setItems(result.items); })
      .catch(cause => { if (token.current() && !aborted(cause)) setError('تعذّر تحميل قوالب النماذج السريرية.'); });
  };

  useEffect(() => { load(); return () => scope.cancel(); }, [scope]);

  const install = () => {
    const token = scope.start();
    setBusy(true); setError('');
    void formsApi.install(clinicId, csrfToken, token.signal)
      .then(() => { if (token.current()) { setBusy(false); setMessage('تم تثبيت القوالب المتاحة للتخصصات المفعّلة.'); load(); } })
      .catch(cause => { if (token.current() && !aborted(cause)) setError('تعذّر تثبيت قوالب النماذج.'); })
      .finally(() => { if (token.current()) setBusy(false); });
  };

  const publish = (definition: FormDefinition, version: FormDefinition['versions'][number]) => {
    const token = scope.start();
    setBusy(true); setError('');
    void formsApi.publish(clinicId, definition, version, csrfToken, token.signal)
      .then(() => { if (token.current()) { setBusy(false); setMessage('تم نشر نسخة النموذج.'); load(); } })
      .catch(cause => { if (token.current() && !aborted(cause)) setError('تعذّر نشر نسخة النموذج.'); })
      .finally(() => { if (token.current()) setBusy(false); });
  };

  return <section className="form-template-admin">
    <header><div><h3>قوالب النماذج السريرية</h3><p>إدارة القوالب لا تمنح صلاحية قراءة إجابات المرضى.</p></div><button className="primary-btn" disabled={busy} onClick={install}>تثبيت القوالب القياسية</button></header>
    {message && <p role="status" className="clinical-notice">{message}</p>}
    {error && <p role="alert" className="clinical-error">{error}</p>}
    <div className="template-cards">{items.map(definition => {
      const version = definition.versions.find(item => item.versionNumber === definition.currentVersion);
      return <article key={definition.id}><b>{definition.nameAr}</b><span>{definition.specialty.arabicName} · النسخة {definition.currentVersion.toLocaleString('ar')}</span><code dir="ltr">{version?.schemaDigest.slice(0, 12)}</code>{version?.status === 'DRAFT' && <button className="table-btn" disabled={busy} onClick={() => publish(definition, version)}>نشر النسخة</button>}<em>{version?.status === 'PUBLISHED' ? 'منشور' : 'مسودة'}</em></article>;
    })}</div>
  </section>;
}

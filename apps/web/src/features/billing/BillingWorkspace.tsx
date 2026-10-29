import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../../components/ui';
import { RequestScope } from '../../lib/request-scope';
import { ApiError, type ClinicContext } from '../auth/api';
import { billingApi, type BillingPage, type BillingProfile, type InvoiceRecord, type PaymentRecord, type Summary } from './billing-api';
import { DraftForm, FinancialForm, ProfileForm } from './BillingForms';
import { InvoicePrint } from './InvoicePrint';
import { formatMoney, invoiceStatuses, methodNames, reasonNames } from './billing-money';
import './billing.css';
const message=(e:unknown)=>e instanceof ApiError?e.message:'تعذّر الاتصال. راجع السجل قبل إعادة المحاولة؛ أعد إرسال الطلب نفسه عند الشك في نتيجته.';
export function BillingWorkspace({clinic,csrfToken,onAuthError,onLegacy}:{clinic:ClinicContext;csrfToken:string;onAuthError:(e:unknown)=>void;onLegacy:()=>void}){
  const client=useMemo(()=>billingApi(clinic.clinicId),[clinic.clinicId]);
  const gates=useMemo(()=>({list:new RequestScope(),detail:new RequestScope(),history:new RequestScope(),settings:new RequestScope(),write:new RequestScope()}),[clinic.clinicId]);
  const can=(p:string)=>clinic.permissions.includes(p),canRead=can('invoices.read'),canCreate=can('invoices.create'),canReport=can('reports.read');
  const [q,setQ]=useState(''),[status,setStatus]=useState('ALL'),[cursors,setCursors]=useState<(string|null)[]>([null]),[reload,setReload]=useState(0);
  const [page,setPage]=useState<BillingPage<InvoiceRecord>|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [profile,setProfile]=useState<BillingProfile|null>(null),[summary,setSummary]=useState<Summary|null>(null),[settingsError,setSettingsError]=useState('');
  const [modal,setModal]=useState<'new'|'detail'|'edit'|'payment'|'refund'|'void'|'profile'|null>(null),[selected,setSelected]=useState<InvoiceRecord|null>(null),[detailLoading,setDetailLoading]=useState(false),[formError,setFormError]=useState('');
  const [payments,setPayments]=useState<PaymentRecord[]>([]),[paymentNext,setPaymentNext]=useState<string|null>(null),[historyBusy,setHistoryBusy]=useState(false),[historyError,setHistoryError]=useState(''),[targetPayment,setTargetPayment]=useState<PaymentRecord|null>(null),[printPayment,setPrintPayment]=useState<PaymentRecord|null>(null);
  const [busy,setBusy]=useState(false),mutating=useRef(false),issueRequests=useRef(new Map<string,{expectedVersion:number;requestKey:string}>());
  const cursor=cursors.at(-1);
  useEffect(()=>()=>{Object.values(gates).forEach(g=>g.cancel());},[gates]);
  function auth(e:unknown){if(e instanceof ApiError&&(e.status===401||e.code==='MFA_STEP_UP_REQUIRED'||e.code==='MFA_SETUP_REQUIRED'))onAuthError(e);}
  useEffect(()=>{
    if(!canRead)return;const scope=gates.list.start();setLoading(true);setPage(null);setError('');const timer=setTimeout(()=>{
      const query=new URLSearchParams({q,status,pageSize:'20'});if(cursor)query.set('cursor',cursor);
      void client.list(query,scope.signal).then(r=>{if(scope.current()){setPage(r);setLoading(false);}}).catch(e=>{if(scope.current()){setError(message(e));setLoading(false);auth(e);}});
    },200);return()=>{clearTimeout(timer);gates.list.cancel();};
  },[client,gates,q,status,cursor,reload,canRead]);
  useEffect(()=>{
    if(!canRead)return;const scope=gates.settings.start();setSettingsError('');
    void Promise.all([client.profile(scope.signal),canReport?client.summary(scope.signal):Promise.resolve(null)]).then(([p,s])=>{if(scope.current()){setProfile(p);setSummary(s);}}).catch(e=>{if(scope.current()){setSettingsError(message(e));auth(e);}});
    return()=>gates.settings.cancel();
  },[client,gates,reload,canRead,canReport]);
  function refresh(){setCursors([null]);setReload(n=>n+1);}
  async function loadHistory(id:string,cursor?:string){
    const scope=gates.history.start();setHistoryBusy(true);setHistoryError('');const q=new URLSearchParams({pageSize:'20'});if(cursor)q.set('cursor',cursor);
    try{const r=await client.payments(id,q,scope.signal);if(scope.current()){setPayments(old=>cursor?[...old,...r.items]:r.items);setPaymentNext(r.nextCursor);setHistoryBusy(false);}}catch(e){if(scope.current()){setHistoryError(message(e));setHistoryBusy(false);auth(e);}}
  }
  async function open(id:string){
    const scope=gates.detail.start();gates.history.cancel();setSelected(null);setPayments([]);setPaymentNext(null);setPrintPayment(null);setFormError('');setModal('detail');setDetailLoading(true);
    try{const r=await client.get(id,scope.signal);if(scope.current()){setSelected(r);setDetailLoading(false);void loadHistory(id);}}catch(e){if(scope.current()){setFormError(message(e));setDetailLoading(false);auth(e);}}
  }
  function close(){if(mutating.current)return;gates.detail.cancel();gates.history.cancel();setModal(null);setSelected(null);setPayments([]);setTargetPayment(null);setPrintPayment(null);setFormError('');refresh();}
  async function write(path:string,method:string,body:unknown){
    if(mutating.current)return;mutating.current=true;const scope=gates.write.start();setBusy(true);setFormError('');
    try{
      const result=await client.write<InvoiceRecord|{invoice:InvoiceRecord;payment:PaymentRecord}|BillingProfile['profile']>(path,method,body,csrfToken,scope.signal);
      if(!scope.current())return;const next='invoice' in result?result.invoice:'id' in result?result:null;
      setNotice('تم حفظ العملية في سجل العيادة.');refresh();setPrintPayment(null);
      if(next){setSelected(next);setModal('detail');setPayments([]);void loadHistory(next.id);}else{setModal(null);setSelected(null);}
    }catch(e){if(scope.current()){setFormError(message(e));auth(e);}}finally{if(scope.current()){setBusy(false);mutating.current=false;}}
  }
  function issue(){if(!selected)return;if(!window.confirm('إصدار الفاتورة يثبّت هوية العيادة والبنود والمبالغ. هل راجعتها؟'))return;
    const key=selected.id+':'+selected.version;let body=issueRequests.current.get(key);if(!body){body={expectedVersion:selected.version,requestKey:crypto.randomUUID()};issueRequests.current.set(key,body);}void write(`invoices/${selected.id}/issue`,'POST',body);
  }
  function print(p:PaymentRecord|null){setPrintPayment(p);requestAnimationFrame(()=>requestAnimationFrame(()=>window.print()));}
  const money=(v:string,i=selected!)=>formatMoney(v,i.currency,i.currencyScale);
  const titles={new:'مسودة فاتورة جديدة',detail:'تفاصيل الفاتورة',edit:'تعديل المسودة',payment:'تسجيل دفعة',refund:'استرداد / عكس دفعة',void:'إلغاء مالي مدقّق',profile:'بيانات العيادة للفوترة'};
  return <section className="billing-workspace" aria-busy={loading}>
    <div className="patient-intro"><div><b>الفوترة والمدفوعات المحفوظة للعيادة</b><p>سجلات مالية مستقلة لكل عيادة. لا تُدخل بيانات حقيقية قبل استكمال مراجعة التشغيل والخصوصية.</p></div><button className="table-btn legacy-patients" onClick={onLegacy}>الفواتير التجريبية القديمة</button></div>
    {!canRead?<div className="patient-error" role="alert">لا تملك صلاحية عرض السجلات المالية لهذه العيادة.</div>:<>
      <div className="billing-toolbar"><button className="primary-btn" disabled={!canCreate||!profile||busy} onClick={()=>{setFormError('');setSelected(null);setModal('new');}}>＋ مسودة فاتورة</button><button className="table-btn" onClick={refresh} disabled={busy}>تحديث الفواتير</button>{can('invoices.manage')&&profile&&<button className="table-btn" onClick={()=>{setFormError('');setModal('profile');}}>بيانات الفوترة</button>}</div>
      {settingsError&&<div className="patient-error" role="alert">{settingsError}<button className="table-btn" onClick={refresh}>إعادة المحاولة</button></div>}
      {summary&&<div className="billing-overview">{summary.items.length===0?<p>لا توجد فواتير صادرة بعد.</p>:summary.items.map(s=><div className="finance-row" key={s.currency}><div><small>إجمالي الصادر · {s.currency}</small><strong>{formatMoney(s.invoicedMinor,s.currency,s.currencyScale)}</strong></div><div><small>صافي المحصّل</small><strong>{formatMoney(s.collectedMinor,s.currency,s.currencyScale)}</strong></div><div><small>فواتير دون أي سداد</small><strong>{formatMoney(s.unpaidMinor,s.currency,s.currencyScale)}</strong></div><div><small>الرصيد المستحق</small><strong>{formatMoney(s.outstandingMinor,s.currency,s.currencyScale)}</strong></div><div><small>المسترد / المعكوس</small><strong>{formatMoney(s.refundedMinor,s.currency,s.currencyScale)}</strong></div></div>)}<p className="form-hint">ملخص جميع الفترات حسب العملة؛ يستبعد المسودات والفواتير الملغاة. لا تُجمع العملات المختلفة.</p></div>}
      {notice&&<div className="notice" role="status">{notice}<button onClick={()=>setNotice('')} aria-label="إغلاق التنبيه">×</button></div>}
      <div className="panel full-panel"><div className="toolbar"><label>بحث بالاسم أو رقم المريض أو الفاتورة<input id="billing-search" className="search" value={q} maxLength={60} onChange={e=>{setQ(e.target.value);setCursors([null]);}}/></label><label>حالة الفاتورة<select id="billing-status" value={status} onChange={e=>{setStatus(e.target.value);setCursors([null]);}}><option value="ALL">جميع الحالات</option>{Object.entries(invoiceStatuses).map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></label></div>
        {loading?<p className="billing-empty" role="status">جارٍ تحميل الفواتير…</p>:error?<div className="patient-error" role="alert">{error}<button className="table-btn" onClick={refresh}>إعادة المحاولة</button></div>:<div className="table-wrap"><table><thead><tr><th>رقم الفاتورة</th><th>المريض</th><th>الإجمالي</th><th>الرصيد</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>{page?.items.map(i=><tr key={i.id}><td><bdi>{i.number??'مسودة'}</bdi></td><td className="name-cell">{i.patientName}<small><bdi>{i.patientNumber}</bdi></small></td><td>{formatMoney(i.totalMinor,i.currency,i.currencyScale)}</td><td>{formatMoney(i.balanceMinor,i.currency,i.currencyScale)}</td><td><span className={`status bill-${i.status.toLowerCase()}`}>{invoiceStatuses[i.status]}</span></td><td><button className="table-btn" onClick={()=>void open(i.id)}>عرض الفاتورة</button></td></tr>)}</tbody></table>{page?.items.length===0&&<p className="billing-empty">لا توجد فواتير مطابقة. ابدأ بمسودة جديدة إذا كانت لديك الصلاحية.</p>}</div>}
        <div className="patient-pagination"><button className="table-btn" disabled={loading||cursors.length<=1} onClick={()=>setCursors(h=>h.slice(0,-1))}>السابق</button><span>صفحة {cursors.length}</span><button className="table-btn" disabled={loading||!page?.hasMore} onClick={()=>setCursors(h=>[...h,page!.nextCursor])}>التالي</button></div>
      </div>
    </>}
    {modal&&<Modal title={titles[modal]} onClose={close}>
      {modal==='new'&&profile&&<DraftForm clinicId={clinic.clinicId} profile={profile} invoice={null} busy={busy} error={formError} onSave={b=>void write('invoices','POST',b)}/>}
      {modal==='profile'&&profile&&<ProfileForm profile={profile} busy={busy} error={formError} onSave={b=>void write('profile','PATCH',b)}/>}
      {modal==='detail'&&<>{detailLoading?<p role="status">جارٍ تحميل الفاتورة…</p>:selected?<div className="billing-detail">
        <div className="billing-detail-heading"><h3>{selected.number??'مسودة غير صادرة'}</h3><span className={`status bill-${selected.status.toLowerCase()}`}>{invoiceStatuses[selected.status]}</span></div>
        <p><b>{selected.patientName}</b> · <bdi>{selected.patientNumber}</bdi></p><p className="billing-balance">المستحق: <strong>{money(selected.balanceMinor)}</strong> · صافي المدفوع: {money(selected.netPaidMinor)}</p>
        <div className="billing-actions">
          {selected.status==='DRAFT'&&canCreate&&profile&&<button className="table-btn" disabled={busy} onClick={()=>{setFormError('');setModal('edit');}}>تعديل المسودة</button>}
          {selected.status==='DRAFT'&&can('invoices.issue')&&<button className="primary-btn" disabled={busy} onClick={issue}>إصدار الفاتورة</button>}
          {['ISSUED','PARTIALLY_PAID'].includes(selected.status)&&can('payments.record')&&<button className="primary-btn" disabled={busy} onClick={()=>{setFormError('');setModal('payment');}}>تسجيل دفعة</button>}
          {selected.status==='ISSUED'&&can('invoices.manage')&&<button className="table-btn" disabled={busy} onClick={()=>{setFormError('');setModal('void');}}>إلغاء الفاتورة ماليًا</button>}
          {selected.issuer&&<button className="table-btn" disabled={busy} onClick={()=>print(null)}>طباعة الفاتورة</button>}<button className="table-btn" disabled={busy} onClick={()=>void open(selected.id)}>إعادة تحميل الفاتورة</button>
        </div>
        {formError&&<div className="patient-error" role="alert">{formError}</div>}
        {selected.issuer?<InvoicePrint invoice={selected} payment={printPayment}/>:<div className="billing-draft-lines">{selected.lines.map(l=><div key={l.position}><b>{l.serviceName}</b><span>{money(l.totalMinor)}</span></div>)}<strong>الإجمالي: {money(selected.totalMinor)}</strong><p>لن يُخصّص رقم أو تُعتمد لقطة نهائية حتى الإصدار.</p></div>}
        <section className="billing-payment-history"><h3>سجل المدفوعات والتصحيحات</h3>{payments.map(p=><article className="billing-payment" key={p.id}><div><b>{money(p.amountMinor)}</b><small>{methodNames[p.method]} · <bdi>{p.receiptNumber}</bdi></small></div><div className="billing-actions"><button className="table-btn" onClick={()=>print(p)}>طباعة الإيصال</button>{can('payments.reverse')&&BigInt(p.refundableMinor)>0n&&<button className="table-btn" onClick={()=>{setTargetPayment(p);setFormError('');setModal('refund');}}>استرداد / عكس دفعة</button>}</div>{p.reversals.map(r=><p key={r.id}>{r.kind==='REFUND'?'استرداد':'عكس كامل'}: {money(r.amountMinor)} · {reasonNames[r.reason]}</p>)}</article>)}{historyBusy&&<p role="status">جارٍ تحميل المدفوعات…</p>}{historyError&&<div role="alert" className="patient-error">{historyError}<button className="table-btn" onClick={()=>void loadHistory(selected.id)}>إعادة تحميل المدفوعات</button></div>}{!historyBusy&&!historyError&&payments.length===0&&<p>لا توجد دفعات مسجّلة.</p>}{paymentNext&&<button className="table-btn" disabled={historyBusy} onClick={()=>void loadHistory(selected.id,paymentNext)}>المزيد من المدفوعات</button>}</section>
      </div>:<div className="patient-error" role="alert">{formError||'الفاتورة غير متاحة.'}</div>}</>}
      {modal==='edit'&&selected&&profile&&<DraftForm clinicId={clinic.clinicId} invoice={selected} profile={profile} busy={busy} error={formError} onSave={b=>void write(`invoices/${selected.id}`,'PATCH',b)}/>}
      {(modal==='payment'||modal==='refund'||modal==='void')&&selected&&<FinancialForm mode={modal} invoice={selected} payment={targetPayment??undefined} busy={busy} error={formError} onSave={b=>void write(`invoices/${selected.id}/${modal==='void'?'void':modal==='payment'?'payments':`payments/${targetPayment!.id}/reversals`}`,'POST',b)}/>}
    </Modal>}
  </section>;
}

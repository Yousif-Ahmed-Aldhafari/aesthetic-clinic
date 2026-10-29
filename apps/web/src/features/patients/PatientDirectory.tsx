import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Empty, Modal } from '../../components/ui';
import { ApiError, type ClinicContext } from '../auth/api';
import { patientApi, type PatientGender, type PatientInput, type PatientPage, type PatientRecord } from './patient-api';
import { RequestScope } from './request-scope';
import { ClinicalPanel } from '../clinical/ClinicalPanel';
import './patients.css';
const genderNames:Record<PatientGender,string>={FEMALE:'أنثى',MALE:'ذكر',OTHER:'هوية أخرى',UNDISCLOSED:'يفضّل عدم الإفصاح'};
const date=(value:string)=>new Intl.DateTimeFormat('ar-YE',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value));
function errorText(error:unknown){
  if(error instanceof ApiError){
    if(error.status===400)return 'تحقق من البيانات: الاسم من حرفين إلى ١٥٠ حرفًا، والهاتف من ٧ إلى ١٥ رقمًا، وتاريخ الميلاد صحيح وغير مستقبلي.';
    if(error.status===403)return 'ليس لديك صلاحية لهذا الإجراء، أو تغيّر اختيار العيادة. حدّث الصفحة وحاول مجددًا.';
    if(error.status===404)return 'الملف غير متاح في هذه العيادة. حدّث القائمة وحاول مجددًا.';
    if(error.status===409)return 'تغيّر الملف منذ فتحه. أعد تحميل الملف وراجع البيانات قبل الحفظ.';
  }
  return 'تعذّر إتمام الطلب. تحقق من الاتصال. إذا كنت تسجّل مريضًا، ابحث عنه أولًا قبل إعادة المحاولة لتجنّب التكرار.';
}
function RecordForm({patient,busy,error,onSave,onReload}:{patient:PatientRecord|null;busy:boolean;error:string;onSave:(input:PatientInput)=>void;onReload?:()=>void}) {
  const [fullName,setFullName]=useState(patient?.fullName??''),[phone,setPhone]=useState(patient?.phone??'');
  const [email,setEmail]=useState(patient?.email??''),[birth,setBirth]=useState(patient?.dateOfBirth??''),[gender,setGender]=useState(patient?.gender??'');
  const [invalid,setInvalid]=useState('');
  function submit(e:FormEvent){e.preventDefault();if(fullName.trim().length<2){setInvalid('أدخل اسمًا من حرفين على الأقل.');return;}setInvalid('');onSave({fullName,phone:phone.trim()||null,email:email.trim()||null,dateOfBirth:birth||null,gender:gender as PatientGender||null});}
  return <form className="patient-form" onSubmit={submit} autoComplete="off" onInvalid={e=>{
    e.preventDefault();const input=e.target as HTMLInputElement;
    setInvalid(input.name==='email'?'أدخل بريدًا إلكترونيًا صحيحًا.':input.name==='dateOfBirth'?'أدخل تاريخ ميلاد صحيحًا وغير مستقبلي.':'أدخل اسمًا من حرفين على الأقل.');input.focus();
  }}>
    <p className="form-hint">بيانات إدارية فقط. لا تُدخل تفاصيل العلاج أو التشخيص. الحقول غير المعلّمة بنجمة اختيارية.</p>
    <label htmlFor="patient-fullName">الاسم الكامل *<input id="patient-fullName" name="fullName" required minLength={2} maxLength={150} value={fullName} onChange={e=>setFullName(e.target.value)} disabled={busy} autoFocus/></label>
    <div className="form-grid"><label htmlFor="patient-phone">رقم الهاتف<input id="patient-phone" name="phone" type="tel" dir="ltr" maxLength={40} value={phone} onChange={e=>setPhone(e.target.value)} disabled={busy} placeholder="+967777123456"/></label><label htmlFor="patient-email">البريد الإلكتروني<input id="patient-email" name="email" type="email" dir="ltr" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} disabled={busy}/></label></div>
    <div className="form-grid"><label htmlFor="patient-birth">تاريخ الميلاد<input id="patient-birth" name="dateOfBirth" lang="ar" type="date" min="0001-01-01" max={new Date().toISOString().slice(0,10)} value={birth} onChange={e=>setBirth(e.target.value)} disabled={busy}/></label><label htmlFor="patient-gender">النوع (اختياري)<select id="patient-gender" name="gender" value={gender} onChange={e=>setGender(e.target.value as PatientGender|'')} disabled={busy}><option value="">غير محدد</option>{Object.entries(genderNames).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div>
    {(error||invalid)&&<div className="patient-error" role="alert">{invalid||error}{onReload&&<button type="button" className="table-btn" onClick={onReload} disabled={busy}>إعادة تحميل الملف</button>}</div>}
    <button type="submit" className="primary-btn submit-btn" disabled={busy}>{busy?'جارٍ الحفظ…':patient?'حفظ التغييرات':'تسجيل المريض'}</button>
  </form>;
}
export function PatientDirectory({clinic,csrfToken,onAuthError,onLegacy}:{clinic:ClinicContext;csrfToken:string;onAuthError:(e:unknown)=>void;onLegacy:()=>void}) {
  const client=useMemo(()=>patientApi(clinic.clinicId),[clinic.clinicId]);
  const gates=useMemo(()=>({list:new RequestScope(),profile:new RequestScope(),mutation:new RequestScope()}),[clinic.clinicId]);
  const [search,setSearch]=useState(''),[status,setStatus]=useState('ACTIVE'),[history,setHistory]=useState<(string|null)[]>([null]);
  const [page,setPage]=useState<PatientPage|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[reload,setReload]=useState(0);
  const [modal,setModal]=useState<'new'|'detail'|'edit'|null>(null),[selected,setSelected]=useState<PatientRecord|null>(null),[profileLoading,setProfileLoading]=useState(false);
  const mutating=useRef(false);
  const [busy,setBusy]=useState(false),[formError,setFormError]=useState(''),[notice,setNotice]=useState('');
  const canRead=clinic.permissions.includes('patients.read'),canCreate=clinic.permissions.includes('patients.create'),canUpdate=clinic.permissions.includes('patients.update'),canClinical=clinic.permissions.includes('clinical.encounters.read');
  const cursor=history.at(-1);
  useEffect(()=>()=>{gates.list.cancel();gates.profile.cancel();gates.mutation.cancel();},[gates]);
  useEffect(()=>{
    if(!canRead)return;
    const ticket=gates.list.start();setLoading(true);setPage(null);setError('');
    const timer=setTimeout(()=>{
      const query=new URLSearchParams({q:search.trim(),status,pageSize:'20'});if(cursor)query.set('cursor',cursor);
      void client.list(query,ticket.signal).then(data=>{if(ticket.current()){setPage(data);setLoading(false);}}).catch(e=>{if(ticket.current()){setLoading(false);setPage(null);setError(errorText(e));if(e instanceof ApiError&&e.status===401)onAuthError(e);}});
    },250);
    return()=>{clearTimeout(timer);gates.list.cancel();};
  },[client,gates,search,status,cursor,reload,canRead]);
  function close(){if(mutating.current)return;gates.profile.cancel();setModal(null);setSelected(null);setFormError('');}
  function refresh(){setHistory([null]);setReload(n=>n+1);}
  async function open(id:string){
    const ticket=gates.profile.start();setSelected(null);setModal('detail');setProfileLoading(true);setFormError('');
    try{const p=await client.get(id,ticket.signal);if(ticket.current())setSelected(p);}
    catch(e){if(ticket.current()){setFormError(errorText(e));if(e instanceof ApiError&&e.status===401)onAuthError(e);}}
    finally{if(ticket.current())setProfileLoading(false);}
  }
  async function save(input:PatientInput){
    if(mutating.current)return;mutating.current=true;const ticket=gates.mutation.start();setBusy(true);setFormError('');
    try{const p=selected?await client.update(selected,input,csrfToken,ticket.signal):await client.create(input,csrfToken,ticket.signal);if(ticket.current()){setSelected(p);setModal('detail');setNotice(selected?'تم حفظ التغييرات.':'تم تسجيل المريض في هذه العيادة.');refresh();}}
    catch(e){if(ticket.current()){setFormError(errorText(e));if(e instanceof ApiError&&e.status===401)onAuthError(e);}}
    finally{mutating.current=false;if(ticket.current())setBusy(false);}
  }
  async function changeStatus(){
    if(!selected||mutating.current)return;mutating.current=true;const ticket=gates.mutation.start();setBusy(true);setFormError('');
    try{const p=await client.status(selected,selected.status==='ACTIVE'?'INACTIVE':'ACTIVE',csrfToken,ticket.signal);if(ticket.current()){setSelected(p);setNotice('تم تحديث حالة المريض. يبقى الملف متاحًا للرجوع إليه.');refresh();}}
    catch(e){if(ticket.current()){setFormError(errorText(e));if(e instanceof ApiError&&e.status===401)onAuthError(e);}}
    finally{mutating.current=false;if(ticket.current())setBusy(false);}
  }
  if(!canRead)return <section className="panel"><Empty text="ليس لديك صلاحية لعرض سجلات المرضى في هذه العيادة."/><button className="table-btn legacy-patients" onClick={onLegacy}>مرضى العرض القديم · بيانات وهمية محلية</button></section>;
  return <>
    <div className="patient-intro"><p><b>سجلات إدارية محفوظة للعيادة</b><span>منفصلة عن العرض التجريبي للمواعيد والفواتير. نسخة تطوير؛ استخدم بيانات وهمية فقط.</span></p>{canCreate&&<button className="primary-btn" onClick={()=>{setSelected(null);setFormError('');setModal('new');}}>＋ مريض جديد</button>}</div>
    {notice&&<div className="notice" role="status">{notice}<button onClick={()=>setNotice('')} aria-label="إغلاق التنبيه">×</button></div>}
    <section className="panel full-panel" aria-busy={loading}>
      <div className="toolbar patient-toolbar"><h2>سجل المرضى</h2><label className="visually-hidden" htmlFor="patient-search">ابحث ببداية الاسم أو رقم الملف أو الهاتف</label><input id="patient-search" className="search" maxLength={60} value={search} onChange={e=>{gates.list.cancel();setPage(null);setSearch(e.target.value);setHistory([null]);}} placeholder="بداية الاسم أو رقم الملف أو الهاتف…"/>
        <label className="patient-filter">الحالة<select aria-label="حالة المرضى" value={status} onChange={e=>{gates.list.cancel();setPage(null);setStatus(e.target.value);setHistory([null]);}}><option value="ACTIVE">نشط</option><option value="INACTIVE">غير نشط</option><option value="ALL">الكل</option></select></label>
      </div>
      {loading?<p className="empty" role="status">جارٍ تحميل المرضى…</p>:error?<div className="patient-error" role="alert">{error}<button className="table-btn" onClick={refresh}>إعادة المحاولة</button></div>:<><div className="table-wrap"><table><thead><tr><th>رقم الملف</th><th>اسم المريض</th><th>رقم الهاتف</th><th>الحالة</th><th>تاريخ التسجيل</th><th>الملف</th></tr></thead><tbody>{page?.items.map(p=><tr key={p.id}><td dir="ltr">{p.patientNumber}</td><td className="name-cell"><span className="initial" aria-hidden="true">{p.fullName[0]}</span>{p.fullName}</td><td dir="ltr">{p.phone??'—'}</td><td><span className={`status ${p.status==='ACTIVE'?'green':'gray'}`}>{p.status==='ACTIVE'?'نشط':'غير نشط'}</span></td><td>{date(p.createdAt)}</td><td><button className="table-btn" onClick={()=>void open(p.id)} aria-label={`فتح ملف ${p.fullName}`}>عرض الملف</button></td></tr>)}</tbody></table></div>{!page?.items.length&&<Empty text={search?'لم يتم العثور على مرضى مطابقين. جرّب بداية الاسم أو رقم الهاتف.':'لا توجد سجلات بهذه الحالة. يمكنك تغيير المرشّح أو تسجيل مريض جديد.'}/>}</>}
      <div className="patient-pagination"><button className="table-btn" disabled={loading||history.length===1} onClick={()=>setHistory(h=>h.slice(0,-1))}>الصفحة السابقة</button><span>الصفحة {history.length.toLocaleString('ar')} · حتى ٢٠ سجلًا</span><button className="table-btn" disabled={loading||!page?.hasMore} onClick={()=>{if(page?.nextCursor)setHistory(h=>[...h,page.nextCursor]);}}>الصفحة التالية</button></div>
    </section>
    <button className="table-btn legacy-patients" onClick={onLegacy}>مرضى العرض القديم · للمواعيد والطابور والفواتير التجريبية فقط</button>
    {modal&&<Modal title={modal==='new'?'تسجيل مريض جديد':modal==='edit'?'تعديل بيانات المريض':'ملف المريض'} onClose={close}>
      {modal==='new'||modal==='edit'?<RecordForm key={selected?`${selected.id}-${selected.version}`:'new'} patient={selected} busy={busy} error={formError} onSave={input=>void save(input)} onReload={selected?()=>void open(selected.id):undefined}/>:profileLoading?<p className="empty" role="status">جارٍ تحميل الملف…</p>:selected?<div className="patient-profile">
        <div className="profile-title"><span className="initial">{selected.fullName[0]}</span><h3>{selected.fullName}</h3><span dir="ltr">{selected.patientNumber}</span></div>
        <dl><dt>رقم الهاتف</dt><dd dir="ltr">{selected.phone??'غير مسجل'}</dd><dt>البريد الإلكتروني</dt><dd dir="ltr">{selected.email??'غير مسجل'}</dd><dt>تاريخ الميلاد</dt><dd>{selected.dateOfBirth?date(selected.dateOfBirth):'غير مسجل'}</dd><dt>النوع</dt><dd>{selected.gender?genderNames[selected.gender]:'غير محدد'}</dd><dt>الحالة</dt><dd>{selected.status==='ACTIVE'?'نشط':'غير نشط'}</dd><dt>تاريخ التسجيل</dt><dd>{date(selected.createdAt)}</dd></dl>
        {selected.status==='INACTIVE'&&<p className="form-hint">الملف غير نشط ويظل متاحًا للرجوع الإداري إليه.</p>}
        {formError&&<div className="patient-error" role="alert">{formError}<button className="table-btn" onClick={()=>void open(selected.id)}>إعادة تحميل الملف</button></div>}
        {canUpdate&&<div className="profile-actions"><button className="primary-btn" disabled={busy} onClick={()=>{setFormError('');setModal('edit');}}>تعديل البيانات</button><button className="table-btn" disabled={busy} onClick={()=>void changeStatus()}>{busy?'جارٍ التحديث…':selected.status==='ACTIVE'?'تعطيل الملف':'إعادة تنشيط الملف'}</button></div>}
        {canClinical&&<ClinicalPanel clinicId={clinic.clinicId} patientId={selected.id} csrfToken={csrfToken} onAuthError={onAuthError}/>}
      </div>:<div className="patient-error" role="alert">{formError}</div>}
    </Modal>}
  </>;
}

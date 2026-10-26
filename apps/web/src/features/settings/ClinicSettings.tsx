import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError, roleNames, type ClinicContext } from '../auth/api';
import { RequestScope } from '../../lib/request-scope';
import { brandStyle, readableColors } from './branding';
import { uploadAsset, type AuditEvent, type Branding, type ClinicProfile, type Domain, type DomainChallenge, type Page, type StaffMember, type CentralAuditResponse } from './settings-api';
import { Modal } from '../../components/ui';
import './settings.css';
type Props={clinic:ClinicContext;csrfToken:string;onAuthError:(error:unknown)=>void;onUpdated:()=>Promise<void>};
type Actions={busy:boolean;write:<T>(path:string,body:unknown,method?:string)=>Promise<T|undefined>;upload:(purpose:string,file:File)=>Promise<{id:string;previewUrl:string}|undefined>};
function useResource<T>(p:Props,path:string,revision:number){
  const[data,setData]=useState<T|null>(null),[error,setError]=useState('');const gate=useMemo(()=>new RequestScope(),[p.clinic.clinicId,path]);
  useEffect(()=>{setData(null);setError('');const token=gate.start();void api<T>(`clinics/${p.clinic.clinicId}/identity/${path}`,'GET',undefined,undefined,token.signal).then(value=>{if(token.current())setData(value);}).catch(e=>{if(!token.current())return;setError(e instanceof ApiError?e.message:'تعذّر تحميل الإعدادات. أعد المحاولة.');if(e instanceof ApiError&&e.status===401)p.onAuthError(e);});return()=>gate.cancel();},[gate,revision]);
  return{data,error};
}
function Resource({error,children}:{error:string;children:ReactNode}){return error?<p role="alert" className="patient-error">{error}</p>:children;}
const nullable=(v:FormDataEntryValue|null)=>typeof v==='string'&&v.trim()?v.trim():null;
export function ClinicSettings(p:Props){
  const[tab,setTab]=useState('profile'),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  const gate=useMemo(()=>new RequestScope(),[p.clinic.clinicId]);useEffect(()=>()=>gate.cancel(),[gate]);
  const execute=async<T,>(work:(signal:AbortSignal)=>Promise<T>)=>{if(busy)return;const token=gate.start();setBusy(true);setError('');setMessage('');try{const value=await work(token.signal);if(token.current()){setMessage('تم حفظ التغيير.');return value;}}catch(e){if(token.current()){setError(e instanceof ApiError?e.message:'تعذّر تأكيد العملية. حدّث السجل قبل إعادة الإرسال.');if(e instanceof ApiError&&e.status===401)p.onAuthError(e);}}finally{if(token.current())setBusy(false);}};
  const actions:Actions={busy,write:<T,>(path:string,body:unknown,method='PATCH')=>execute<T>(signal=>api<T>(`clinics/${p.clinic.clinicId}/identity/${path}`,method,body,p.csrfToken,signal)),upload:(purpose,file)=>execute(signal=>uploadAsset(p.clinic.clinicId,purpose,file,p.csrfToken,signal))};
  const refresh=()=>setRevision(n=>n+1),updated=async()=>{refresh();try{await p.onUpdated();}catch(e){setError('حُفظ التغيير، وتعذّر تحديث هوية الصفحة. أعد تحميل الصفحة.');if(e instanceof ApiError&&e.status===401)p.onAuthError(e);}};
  if(!p.clinic.permissions.includes('clinic.settings.read'))return <p role="alert">لا تملك صلاحية إدارة إعدادات هذه العيادة.</p>;
  return <section className="clinic-settings" dir="rtl"><div className="settings-intro"><span className="auth-kicker">هوية مستقلة لكل عيادة</span><h3>{p.clinic.displayName}</h3><p>هذه إعدادات العيادة المختارة. إدارة المنصة منفصلة ولا تمنح وصولًا إلى سجلات العيادات.</p></div>
    <nav className="settings-tabs" aria-label="أقسام إعدادات العيادة">{[['profile','بيانات العيادة'],['branding','الهوية البصرية'],['domains','النطاقات'],['members','فريق العمل'],['audit','سجل التغييرات']].map(([id,label])=><button key={id} className={tab===id?'selected':''} aria-pressed={tab===id} disabled={busy} onClick={()=>{setTab(id);setMessage('');setError('');}}>{label}</button>)}</nav>
    {error&&<p className="patient-error" role="alert">{error}</p>}{message&&<p className="settings-success" role="status">{message}</p>}<div aria-busy={busy}>
    {tab==='profile'&&<ProfilePane key={tab} p={p} actions={actions} revision={revision} saved={updated}/>}
    {tab==='branding'&&<BrandingPane key={tab} p={p} actions={actions} revision={revision} saved={updated}/>}
    {tab==='domains'&&<DomainsPane key={tab} p={p} actions={actions} revision={revision} saved={updated}/>}
    {tab==='members'&&<StaffPane key={tab} p={p} actions={actions} revision={revision} saved={refresh}/>}
    {tab==='audit'&&<AuditPane key={tab} p={p} revision={revision}/>}
    </div><button className="auth-text-button" disabled={busy} onClick={refresh}>تحديث البيانات</button>
  </section>;
}
function ProfilePane({p,actions,revision,saved}:{p:Props;actions:Actions;revision:number;saved:()=>Promise<void>}){const{data,error}=useResource<ClinicProfile>(p,'profile',revision);return <Resource error={error}>{data?<ProfileForm key={data.version} profile={data} actions={actions} saved={saved}/>:<p role="status">جارٍ تحميل بيانات العيادة…</p>}</Resource>;}
function ProfileForm({profile:s,actions:a,saved}:{profile:ClinicProfile;actions:Actions;saved:()=>Promise<void>}){
  const[timezone,setTimezone]=useState(s.timezone),[currency,setCurrency]=useState(s.currency);
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);const result=await a.write('profile',{expectedVersion:s.version,displayName:f.get('displayName'),legalName:f.get('legalName'),englishName:nullable(f.get('englishName')),contactPhone:nullable(f.get('contactPhone')),contactEmail:nullable(f.get('contactEmail')),address:nullable(f.get('address')),latitude:nullable(f.get('latitude')),longitude:nullable(f.get('longitude')),timezone,currency,confirmTimezoneChange:f.get('confirmTimezone')==='on',confirmCurrencyChange:f.get('confirmCurrency')==='on'});if(result)await saved();}
  const field=(name:string,label:string,value:string|null,max:number,type='text',dir?:'ltr')=><label className="settings-field" htmlFor={`clinic-${name}`}>{label}<input id={`clinic-${name}`} name={name} defaultValue={value??''} maxLength={max} type={type} dir={dir} required={['displayName','legalName'].includes(name)}/></label>;
  return <form onSubmit={e=>void submit(e)} className="settings-form"><fieldset disabled={a.busy}><legend>البيانات الخاصة والهوية القانونية</legend><div className="settings-grid">
    {field('displayName','اسم العيادة بالعربية',s.displayName,150)}{field('englishName','الاسم بالإنجليزية · اختياري',s.englishName,150,'text','ltr')}{field('legalName','الاسم القانوني للنشاط',s.legalName,200)}{field('contactPhone','هاتف العيادة · اختياري',s.contactPhone,24,'tel','ltr')}{field('contactEmail','البريد الإلكتروني · اختياري',s.contactEmail,254,'email','ltr')}{field('address','العنوان الفعلي · اختياري',s.address,250)}{field('latitude','خط العرض · اختياري مع خط الطول',s.latitude,12,'text','ltr')}{field('longitude','خط الطول · اختياري مع خط العرض',s.longitude,12,'text','ltr')}
    <label className="settings-field" htmlFor="clinic-timezone">المنطقة الزمنية<input id="clinic-timezone" dir="ltr" value={timezone} maxLength={100} required disabled={s.timezoneLocked} onChange={e=>setTimezone(e.target.value)}/><small>{s.timezoneLocked?'مثبّتة لوجود جداول أو زيارات.':'اسم IANA، مثل Asia/Aden'}</small></label>
    <label className="settings-field" htmlFor="clinic-currency">العملة<select id="clinic-currency" dir="ltr" value={currency} disabled={s.currencyLocked} onChange={e=>setCurrency(e.target.value)}>{['YER','SAR','AED','USD','EUR','GBP','QAR','EGP','JPY','KWD','BHD','OMR','JOD','TND'].map(v=><option key={v}>{v}</option>)}</select><small>{s.currencyLocked?'مثبّتة لوجود سجل مالي.':'لا يحدث تحويل تلقائي بين العملات.'}</small></label>
    </div>{timezone!==s.timezone&&<label className="settings-check"><input name="confirmTimezone" type="checkbox" required/>أؤكد تغيير المنطقة الزمنية قبل إنشاء الجداول والزيارات.</label>}{currency!==s.currency&&<label className="settings-check"><input name="confirmCurrency" type="checkbox" required/>أؤكد تغيير عملة الحجوزات المالية الجديدة.</label>}
    <p className="settings-note">حالة العيادة: <b>{s.status==='ACTIVE'?'نشطة':s.status==='SUSPENDED'?'موقوفة':'مؤرشفة'}</b> · للقراءة فقط. تفاصيل التواصل والموقع لا تُنشر ضمن الهوية العامة. الفواتير الصادرة تحتفظ بلقطة هويتها الأصلية.</p>
    <button className="primary-btn" type="submit">حفظ بيانات العيادة</button></fieldset></form>;
}
function BrandingPane({p,actions,revision,saved}:{p:Props;actions:Actions;revision:number;saved:()=>Promise<void>}){const{data,error}=useResource<Branding>(p,'branding',revision);return <Resource error={error}>{data?<BrandingForm key={data.version} p={p} initial={data} actions={actions} saved={saved}/>:<p role="status">جارٍ تحميل الهوية البصرية…</p>}</Resource>;}
function BrandingForm({p,initial:b,actions:a,saved}:{p:Props;initial:Branding;actions:Actions;saved:()=>Promise<void>}){
  const[primary,setPrimary]=useState(b.primaryColor),[secondary,setSecondary]=useState(b.secondaryColor),[accent,setAccent]=useState(b.accentColor??''),[font,setFont]=useState(b.typography),[logo,setLogo]=useState(b.logoUrl),[favicon,setFavicon]=useState(b.faviconUrl);
  const[logoId,setLogoId]=useState<string|null|undefined>(b.logoAssetId??undefined),[faviconId,setFaviconId]=useState<string|null|undefined>(b.faviconAssetId??undefined),[validation,setValidation]=useState('');
  const readable=readableColors(primary,secondary,accent||null);
  async function upload(file:File|undefined,purpose:string){if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2097152){setValidation('اختر صورة PNG أو JPEG أو WebP حتى ٢ م.ب.');return;}setValidation('');const result=await a.upload(purpose,file);if(result){if(purpose==='LOGO'){setLogoId(result.id);setLogo(result.previewUrl);}else{setFaviconId(result.id);setFavicon(result.previewUrl);}}}
  async function submit(e:FormEvent){e.preventDefault();if(!readable){setValidation('اختر ألوانًا بتباين مقروء؛ اللون الرئيسي مع الأبيض بنسبة ٤٫٥ على الأقل.');return;}const result=await a.write('branding',{expectedVersion:b.version,primaryColor:primary,secondaryColor:secondary,accentColor:accent||null,typography:font,...(logoId!==undefined?{logoAssetId:logoId}:{}),...(faviconId!==undefined?{faviconAssetId:faviconId}:{})});if(result)await saved();}
  return <div className="branding-editor"><form className="settings-form" onSubmit={e=>void submit(e)}><fieldset disabled={a.busy}><legend>الشعار والألوان والخط</legend><p className="settings-note">الصور الجديدة خاصة حتى الحفظ والنشر. يُزال الملف الأصلي وبياناته الوصفية أثناء المعالجة. لا ترفع صور مرضى.</p>
    <label className="settings-field" htmlFor="clinic-logo">شعار العيادة<span className="asset-picker">اختيار صورة الشعار<input className="asset-file-input" id="clinic-logo" type="file" aria-label="اختيار صورة شعار العيادة" accept="image/png,image/jpeg,image/webp" onChange={e=>void upload(e.target.files?.[0],'LOGO')}/></span></label><button type="button" className="table-btn" onClick={()=>{setLogoId(null);setLogo(null);}}>إزالة الشعار من الهوية الحالية</button>
    <label className="settings-field" htmlFor="clinic-favicon">أيقونة المتصفح · اختياري<span className="asset-picker">اختيار صورة الأيقونة<input className="asset-file-input" id="clinic-favicon" type="file" aria-label="اختيار أيقونة المتصفح" accept="image/png,image/jpeg,image/webp" onChange={e=>void upload(e.target.files?.[0],'FAVICON')}/></span></label><button type="button" className="table-btn" onClick={()=>{setFaviconId(null);setFavicon(null);}}>إزالة أيقونة المتصفح</button>
    <div className="settings-grid">{[['primary','اللون الرئيسي',primary,setPrimary],['secondary','لون الخلفية',secondary,setSecondary],['accent','لون إضافي · اختياري',accent,setAccent]].map(([id,label,value,set])=><label key={id as string} className="settings-field" htmlFor={`brand-${id}`}>{label as string}<input id={`brand-${id}`} dir="ltr" value={value as string} maxLength={7} placeholder="#7854D9" onChange={e=>(set as (v:string)=>void)(e.target.value)}/></label>)}<label className="settings-field" htmlFor="brand-typography">الخط العربي<select id="brand-typography" value={font} onChange={e=>setFont(e.target.value)}><option value="TAJAWAL">تجوال</option><option value="SYSTEM">خط النظام العربي</option><option value="NOTO_NASKH">نسخ عربي</option></select></label></div>
    {!readable&&<p className="patient-error" role="alert">الألوان الحالية لا تحقق التباين المطلوب.</p>}{validation&&<p className="patient-error" role="alert">{validation}</p>}<button className="primary-btn" type="submit" disabled={!readable}>حفظ ونشر الهوية</button><button className="auth-text-button" type="button" onClick={()=>void a.write('assets/cleanup',{confirmUnpublishedOnly:true},'POST')}>تنظيف الصور غير المنشورة الأقدم من يوم</button>
    <p className="settings-note">استبدال الشعار لا يمسح الشعارات المنشورة سابقًا، للحفاظ على الفواتير الصادرة. المعاينة هنا لا تغيّر بقية التطبيق حتى الحفظ. الخط يعتمد على الخطوط المثبتة مع بدائل عربية آمنة.</p></fieldset></form>
    <aside className="branding-preview" aria-label="معاينة الهوية" style={brandStyle({primaryColor:readable?primary:'#7854D9',secondaryColor:readable?secondary:'#F6F8FC',accentColor:accent||null,logoUrl:logo,typography:font})}><span className="auth-kicker">معاينة مباشرة</span><div className="preview-bar">{favicon&&<img src={favicon} alt="معاينة أيقونة المتصفح"/>}<span>{p.clinic.displayName}</span></div>{logo?<img className="preview-logo" src={logo} alt="معاينة شعار العيادة"/>:<span className="preview-symbol">✧</span>}<h3>{p.clinic.displayName}</h3><p>رعاية تبدأ بالتفاصيل</p><div className="preview-appointment">موعدك القادم · الساعة ١٠:٠٠</div><button type="button" className="primary-btn">زر بمعيار تباين مقروء</button><p>فاتورة تجريبية للمعاينة · رقم INV-000001</p></aside>
  </div>;
}
function DomainsPane({p,actions:a,revision,saved}:{p:Props;actions:Actions;revision:number;saved:()=>Promise<void>}){
  const{data:profile,error:profileError}=useResource<ClinicProfile>(p,'profile',revision),{data,error}=useResource<{items:Domain[]}>(p,'domains',revision);const[challenge,setChallenge]=useState<DomainChallenge|null>(null);
  const create=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget);const result=await a.write<DomainChallenge>('domains',{hostname:f.get('hostname')},'POST');if(result){setChallenge(result);await saved();}};
  return <Resource error={error||profileError}>{profile&&<form className="settings-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void a.write('subdomain',{slug:f.get('slug'),expectedVersion:profile.version}).then(async value=>{if(value)await saved();});}}><fieldset disabled={a.busy}><legend>حجز نطاق المنصة الفرعي</legend><label className="settings-field" htmlFor="clinic-slug">الاسم المحجوز<input id="clinic-slug" key={profile.slug} name="slug" dir="ltr" defaultValue={profile.slug} required maxLength={63}/></label><p><bdi>{profile.platformHostname}</bdi></p><small>الأسماء المحفوظة: <bdi>{profile.reservedSlugs.join('، ')}</bdi></small><p className="settings-note">الحجز فريد، والتوجيه غير مفعّل. تغيير الاسم يغيّر رابط التعريف العام؛ لا تُنشأ تحويلات تلقائية من الاسم السابق، وتبقى الأسماء السابقة محفوظة لعيادتك لمنع استحواذ عيادة أخرى عليها.</p><button className="primary-btn">حفظ الحجز</button></fieldset></form>}
    <form className="settings-form" onSubmit={e=>void create(e)}><fieldset disabled={a.busy}><legend>نطاق مخصص</legend><label className="settings-field" htmlFor="clinic-hostname">اسم المضيف فقط<input id="clinic-hostname" name="hostname" dir="ltr" placeholder="clinic.example.com" required maxLength={253}/></label><button className="primary-btn">طلب إثبات ملكية النطاق</button></fieldset></form>
    <p className="settings-note">إثبات الملكية لا يفعّل الموقع. إعداد DNS للتوجيه وشهادة HTTPS والوكيل العكسي مؤجّل للنشر. لا تستخدم عناوين IP أو أسماء داخلية.</p>
    {challenge&&<section className="domain-challenge" aria-label="تعليمات إثبات الملكية"><h4>أضف سجل TXT لدى مزوّد DNS</h4><p>اسم السجل: <bdi>{challenge.dnsRecord.name}</bdi></p><code dir="ltr">{challenge.dnsRecord.value}</code><p>يظهر الرمز هنا مرة واحدة، وصلاحيته سبعة أيام. تجديده يلغي الإثبات السابق.</p><button className="table-btn" onClick={()=>setChallenge(null)}>إخفاء الرمز</button></section>}
    {!data&&!error&&<p role="status">جارٍ تحميل النطاقات…</p>}<div className="domain-list">{data?.items.map(d=><article key={d.id}><div><bdi>{d.hostname}</bdi><p>{d.verificationStatus==='VERIFIED'?'تم إثبات الملكية':d.verificationStatus==='FAILED'?'لم يُعثر على إثبات مطابق':'بانتظار إثبات الملكية'} · التوجيه غير مفعّل</p></div><div className="settings-actions"><button className="table-btn" disabled={a.busy} onClick={()=>void a.write<DomainChallenge>(`domains/${d.id}/challenge`,{expectedVersion:d.version},'POST').then(async r=>{if(r){setChallenge(r);await saved();}})}>تجديد رمز الإثبات</button><button className="table-btn" disabled={a.busy} onClick={()=>void a.write(`domains/${d.id}/verify`,{expectedVersion:d.version},'POST').then(async r=>{if(r)await saved();})}>التحقق من الملكية</button></div></article>)}</div>{data&&!data.items.length&&<p className="empty">لم تُضف نطاقات مخصصة.</p>}</Resource>;
}
function StaffPane({p,actions:a,revision,saved}:{p:Props;actions:Actions;revision:number;saved:()=>void}){
  const[cursor,setCursor]=useState('');const{data,error}=useResource<Page<StaffMember>>(p,`members?pageSize=20${cursor?'&cursor='+cursor:''}`,revision);
  return <Resource error={error}><p className="settings-note">تغيير الدور أو تعطيل العضوية ينهي جلسات المستخدم، ويحافظ على حسابه وعضوياته الأخرى. آخر مالك نشط محمي في قاعدة البيانات. لا يمنح المدير صلاحيات مالية جديدة؛ منح دور الاستقبال أو إعادة تفعيله بصلاحياته المالية يتطلب المالك. الدعوات الإلكترونية وقبولها مؤجّلان؛ إضافة الحسابات محليًا تتم بإجراء التطوير المقيّد، دون كلمات مرور افتراضية.</p>{!data&&!error&&<p role="status">جارٍ تحميل فريق العمل…</p>}<div className="staff-list">{data?.items.map(m=><StaffRow key={`${m.id}-${m.version}`} member={m} owner={p.clinic.role==='CLINIC_OWNER'} busy={a.busy} save={async body=>{const result=await a.write<{reauthenticationRequired:boolean}>(`members/${m.id}`,body);if(result?.reauthenticationRequired)p.onAuthError(new ApiError(401,'SESSION_EXPIRED','تغيّرت صلاحياتك'));else if(result)saved();}}/>)}</div><div className="settings-actions"><button className="table-btn" disabled={!cursor||a.busy} onClick={()=>setCursor('')}>بداية القائمة</button><button className="table-btn" disabled={!data?.hasMore||a.busy} onClick={()=>setCursor(data?.nextCursor??'')}>المزيد من الأعضاء</button></div></Resource>;
}
function StaffRow({member:m,owner,busy,save}:{member:StaffMember;owner:boolean;busy:boolean;save:(body:unknown)=>Promise<void>}){
  const[role,setRole]=useState(m.role),[status,setStatus]=useState(m.status);const editable=owner||['DOCTOR','RECEPTIONIST'].includes(m.role),allowed=owner?Object.keys(roleNames):['DOCTOR'];
  return <form className="staff-row" onSubmit={e=>{e.preventDefault();void save({expectedVersion:m.version,role,status});}}><div><strong>{m.user.name}</strong><small><bdi>{m.user.email}</bdi></small><small>{m.user.status==='ACTIVE'?'حساب نشط':'حساب غير نشط أو مدعو'}</small></div><label>الدور<select aria-label={`دور ${m.user.name}`} disabled={!editable||busy} value={role} onChange={e=>setRole(e.target.value)}>{[...new Set([...allowed,m.role])].map(r=><option key={r} value={r}>{roleNames[r]}</option>)}</select></label><label>العضوية<select aria-label={`حالة ${m.user.name}`} disabled={!editable||busy} value={status} onChange={e=>setStatus(e.target.value)}><option value="ACTIVE" disabled={!owner&&role==='RECEPTIONIST'&&m.status!=='ACTIVE'}>نشطة</option><option value="SUSPENDED">معطّلة</option>{m.status==='INVITED'&&<option value="INVITED" disabled>مدعوة</option>}</select></label><button className="table-btn" disabled={!editable||busy||status==='INVITED'}>حفظ العضوية</button></form>;
}
function AuditPane({p,revision}:{p:Props;revision:number}){
  const[viewMode,setViewMode]=useState<'central'|'chain'>('chain');
  const[category,setCategory]=useState<string>('');
  const[from,setFrom]=useState<string>('');
  const[to,setTo]=useState<string>('');
  const[cursor,setCursor]=useState<string>('');
  const[selectedMetadata,setSelectedMetadata]=useState<Record<string,unknown>|null>(null);

  const queryParts = [
    'limit=20',
    cursor ? `cursor=${encodeURIComponent(cursor)}` : '',
    category ? `category=${encodeURIComponent(category)}` : '',
    from ? `from=${encodeURIComponent(new Date(from).toISOString())}` : '',
    to ? `to=${encodeURIComponent(new Date(to).toISOString())}` : '',
  ].filter(Boolean).join('&');

  const[centralData,setCentralData]=useState<CentralAuditResponse|null>(null);
  const[centralError,setCentralError]=useState('');
  const centralGate=useMemo(()=>new RequestScope(),[p.clinic.clinicId,queryParts]);

  useEffect(()=>{
    if(viewMode!=='central')return;
    setCentralData(null);setCentralError('');
    const token=centralGate.start();
    void api<CentralAuditResponse>(`clinics/${p.clinic.clinicId}/audit/events?${queryParts}`,'GET',undefined,undefined,token.signal)
      .then(v=>{if(token.current())setCentralData(v);})
      .catch(e=>{
        if(!token.current())return;
        setCentralError(e instanceof ApiError?e.message:'تعذّر تحميل سجل التدقيق.');
        if(e instanceof ApiError&&e.status===401)p.onAuthError(e);
      });
    return()=>centralGate.cancel();
  },[centralGate,revision,viewMode]);

  const{data:chainData,error:chainError}=useResource<Page<AuditEvent>>(p,`audit?pageSize=20${cursor?'&cursor='+cursor:''}`,revision);

  const catLabels:Record<string,string>={AUTH:'المصادقة',IDENTITY:'الهوية',STAFF:'فريق العمل',PATIENTS:'المرضى',SCHEDULING:'المواعيد',QUEUE:'طابور الانتظار',FINANCE:'المالية',SECURITY:'الأمان',PLATFORM:'المنصة'};
  const outLabels:Record<string,string>={SUCCESS:'ناجح',DENIED:'مرفوض',FAILURE:'فشل'};
  const outClasses:Record<string,string>={SUCCESS:'outcome-success',DENIED:'outcome-denied',FAILURE:'outcome-failure'};
  const names:Record<string,string>={Clinic:'بيانات العيادة',ClinicBranding:'الهوية البصرية',ClinicDomain:'النطاق',ClinicMembership:'العضوية',ClinicAsset:'ملف الهوية'},verbs:Record<string,string>={INSERT:'إضافة',UPDATE:'تحديث',DELETE:'تنظيف'};

  return <section aria-label="سجل التدقيق والتغييرات">
    <div className="audit-view-switch">
      <button type="button" className={viewMode==='central'?'active':''} onClick={()=>{setViewMode('central');setCursor('');}}>السجل الموحد للعمليات</button>
      <button type="button" className={viewMode==='chain'?'active':''} onClick={()=>{setViewMode('chain');setCursor('');}}>سلسلة بصمات الهوية (التشفيرية)</button>
    </div>

    {viewMode==='central'&&<>
      <p className="settings-note">سجل تدقيق مركزي غير قابل للتعديل أو الحذف، مسجل بالتوقيت العالمي UTC مع عزل تام لكل عيادة عبر RLS. بيانات الاعتماد والبطاقات والتفاصيل الطبية محجوبة تلقائيًا.</p>
      <div className="audit-toolbar">
        <label>الفئة:
          <select value={category} onChange={e=>{setCategory(e.target.value);setCursor('');}}>
            <option value="">جميع الفئات</option>
            {Object.entries(catLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>من:
          <input type="date" value={from} onChange={e=>{setFrom(e.target.value);setCursor('');}}/>
        </label>
        <label>إلى:
          <input type="date" value={to} onChange={e=>{setTo(e.target.value);setCursor('');}}/>
        </label>
        {(category||from||to)&&<button type="button" className="table-btn" onClick={()=>{setCategory('');setFrom('');setTo('');setCursor('');}}>إعادة ضبط الفلاتر</button>}
        {centralData&&<span style={{marginRight:'auto',fontSize:12,color:'#64748b'}}>إجمالي الأحداث: {centralData.totalCount.toLocaleString('ar-YE')}</span>}
      </div>

      <Resource error={centralError}>
        {!centralData&&!centralError&&<p role="status">جارٍ تحميل سجل التدقيق…</p>}
        {centralData&&(
          centralData.events.length===0?<p className="empty">لا توجد أحداث تدقيق مطابقة للبحث.</p>:(
            <div style={{overflowX:'auto'}}>
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>الوقت (UTC)</th>
                    <th>الفئة</th>
                    <th>الإجراء</th>
                    <th>المنفذ</th>
                    <th>الهدف</th>
                    <th>الحالة</th>
                    <th>التفاصيل</th>
                  </tr>
                </thead>
                <tbody>
                  {centralData.events.map(ev=>(
                    <tr key={ev.id}>
                      <td style={{whiteSpace:'nowrap'}}>
                        <time dateTime={ev.createdAt}>
                          {new Intl.DateTimeFormat('ar-YE',{dateStyle:'short',timeStyle:'short',timeZone:'UTC'}).format(new Date(ev.createdAt))}
                        </time>
                      </td>
                      <td><span className="audit-badge badge-category">{catLabels[ev.category]??ev.category}</span></td>
                      <td><code>{ev.action}</code></td>
                      <td><small>{ev.actorEmail??ev.actorId?.slice(0,8)??'النظام'}</small></td>
                      <td><small>{ev.targetType ? `${ev.targetType}${ev.targetId ? ` (${ev.targetId.slice(0,6)}…)` : ''}` : '—'}</small></td>
                      <td><span className={`audit-badge ${outClasses[ev.outcome]??''}`}>{outLabels[ev.outcome]??ev.outcome}</span></td>
                      <td>
                        {ev.metadata ? (
                          <button type="button" className="table-btn" onClick={()=>setSelectedMetadata(ev.metadata)} title="عرض التفاصيل">
                            عرض
                          </button>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
        <div className="settings-actions">
          <button type="button" className="table-btn" disabled={!cursor} onClick={()=>setCursor('')}>الأحدث</button>
          <button type="button" className="table-btn" disabled={!centralData?.nextCursor} onClick={()=>setCursor(centralData?.nextCursor??'')}>أقدم</button>
        </div>
      </Resource>
    </>}

    {viewMode==='chain'&&<Resource error={chainError}>
      <p className="settings-note">سجل متسلسل يولّد في قاعدة البيانات، مع بصمات مترابطة SHA-256 لا يمكن للتطبيق تعديلها. الأوقات بالتوقيت العالمي UTC.</p>
      {!chainData&&!chainError&&<p role="status">جارٍ تحميل سجل البصمات…</p>}
      <ol className="identity-audit-list">
        {chainData?.items.map(e=>(
          <li key={e.id}>
            <b>{verbs[e.action.split('.')[1]]} · {names[e.action.split('.')[0]]}</b>
            <time>{new Intl.DateTimeFormat('ar-YE',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(e.createdAt))}</time>
            <small>تسلسل {e.sequence} · البصمة <bdi>{e.eventHash.slice(0,16)}…</bdi></small>
          </li>
        ))}
      </ol>
      {chainData&&!chainData.items.length&&<p className="empty">لا توجد تغييرات مسجلة بعد.</p>}
      <div className="settings-actions">
        <button className="table-btn" disabled={!cursor} onClick={()=>setCursor('')}>أحدث التغييرات</button>
        <button className="table-btn" disabled={!chainData?.hasMore} onClick={()=>setCursor(chainData?.nextCursor??'')}>تغييرات أقدم</button>
      </div>
    </Resource>}

    {selectedMetadata&&(
      <Modal title="تفاصيل بيانات التدقيق (محجوبة وآمنة)" onClose={()=>setSelectedMetadata(null)}>
        <div className="metadata-dialog">
          <pre>{JSON.stringify(selectedMetadata,null,2)}</pre>
          <div style={{marginTop:12,textAlign:'left'}}>
            <button type="button" className="primary-btn" onClick={()=>setSelectedMetadata(null)}>إغلاق</button>
          </div>
        </div>
      </Modal>
    )}
  </section>;
}

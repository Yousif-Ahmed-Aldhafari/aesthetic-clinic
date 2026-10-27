import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import App from '../../App';
import { api, ApiError, roleNames, type ClinicContext, type SessionInfo } from './api';
import './auth.css';
import { Modal } from '../../components/ui';
import { ClinicSettings } from '../settings/ClinicSettings';
import { brandStyle, useDocumentIdentity, type BrandIdentity } from '../settings/branding';
import { RequestScope } from '../../lib/request-scope';

export default function AuthShell() {
  const [session,setSession]=useState<SessionInfo|null>(null);
  const [clinics,setClinics]=useState<ClinicContext[]>([]);
  const [clinic,setClinic]=useState<ClinicContext|null>(null);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [message,setMessage]=useState(''),[unavailable,setUnavailable]=useState(false);
  const [email,setEmail]=useState(''),[password,setPassword]=useState('');
  const [mfaChallenge,setMfaChallenge]=useState<{ challengeToken: string; methods: string[] }|null>(null);
  const [mfaCode,setMfaCode]=useState(''),[useRecovery,setUseRecovery]=useState(false);
  const [stepUpOpen,setStepUpOpen]=useState(false),[stepUpCode,setStepUpCode]=useState('');
  const [stepUpMethod,setStepUpMethod]=useState<'totp'|'recovery'>('totp');
  const [stepUpBusy,setStepUpBusy]=useState(false),[stepUpMessage,setStepUpMessage]=useState('');
  const [showSettings,setShowSettings]=useState(false),[showPlatform,setShowPlatform]=useState(false),[platformAdmin,setPlatformAdmin]=useState(false);
  const [loginBrand,setLoginBrand]=useState<BrandIdentity|null>(null);
  const selectedClinic=useRef<string|null>(null);selectedClinic.current=clinic?.clinicId??null;
  const mutating=useRef(false),generation=useRef(0);
  const clear = () => {
    setSession(null);setClinics([]);setClinic(null);setShowSettings(false);setShowPlatform(false);setPlatformAdmin(false);
    setMfaChallenge(null);setMfaCode('');setUseRecovery(false);setStepUpOpen(false);
  };
  const visibleIdentity=session?clinic:loginBrand;
  useDocumentIdentity(visibleIdentity);
  useEffect(()=>{
    const slug=new URLSearchParams(window.location.search).get('clinic');
    if(!slug||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>63)return;
    const gate=new RequestScope(),token=gate.start();
    void api<BrandIdentity>(`public/clinics/${encodeURIComponent(slug)}/branding`,'GET',undefined,undefined,token.signal).then(value=>{if(token.current())setLoginBrand(value);}).catch(()=>{if(token.current())setLoginBrand(null);});
    return()=>gate.cancel();
  },[]);
  useEffect(()=>{
    setPlatformAdmin(false);setShowPlatform(false);if(!session)return;
    const gate=new RequestScope(),token=gate.start();void api('platform/me','GET',undefined,undefined,token.signal).then(()=>{if(token.current())setPlatformAdmin(true);}).catch(()=>{});return()=>gate.cancel();
  },[session?.user.id]);
  async function refreshClinic(){
    const id=selectedClinic.current,started=generation.current;if(!id)return;
    const value=await api<ClinicContext>(`clinics/${id}/me`);
    if(generation.current===started&&selectedClinic.current===id)setClinic(value);
  }
  const failure = (error: unknown) => {
    if(error instanceof ApiError && error.status===401){clear();setMessage('انتهت الجلسة أو تغيّرت صلاحياتك. يرجى تسجيل الدخول مجددًا.');}
    else if(error instanceof ApiError && error.code==='MFA_STEP_UP_REQUIRED'){setStepUpCode('');setStepUpMessage('');setStepUpOpen(true);}
    else if(error instanceof ApiError && error.code==='MFA_SETUP_REQUIRED'){setMessage('تتطلب هذه العملية الحساسة إعداد التحقق بخطوتين لحسابك أولًا. يرجى تفعيل التحقق بخطوتين من إعدادات العيادة.');}
    else setMessage(error instanceof ApiError && error.status===403 ? 'ليس لديك إذن لتنفيذ هذا الإجراء، أو انتهت صلاحية الطلب. حدّث الصفحة وحاول مجددًا.' : error instanceof ApiError ? error.message : 'تعذّر الاتصال بالخدمة. تحقق من الاتصال وحاول مجددًا.');
  };
  async function restore() {
    setLoading(true);setUnavailable(false);
    try{
      const current=await api<SessionInfo>('auth/me');
      const list=await api<{clinics:ClinicContext[]}>('auth/clinics');
      let selected:ClinicContext|null=null;
      if(current.selectedClinicId) selected=await api<ClinicContext>(`clinics/${current.selectedClinicId}/me`);
      setSession(current);setClinics(list.clinics);setClinic(selected);
    }catch(error){
      clear();
      if(error instanceof ApiError && error.status===401){if(error.code==='SESSION_EXPIRED')setMessage('انتهت جلستك. يرجى تسجيل الدخول مجددًا.');}
      else{setUnavailable(true);failure(error);}
    }finally{setLoading(false);}
  }
  useEffect(()=>{void restore();},[]);
  // Periodic/focus verification locks the demo UI when the server revokes or expires a session.
  useEffect(()=>{
    if(!session)return;
    let active=true,checking=false;
    const check=async()=>{
      if(document.hidden || mutating.current || checking)return;
      checking=true;const started=generation.current;
      try{
        const current=await api<SessionInfo>('auth/me');
        if(active && generation.current===started){
          if(current.user.id!==session.user.id){clear();setMessage('تغيّر الحساب في نافذة أخرى. يرجى تسجيل الدخول مجددًا.');}
          else if(current.selectedClinicId!==session.selectedClinicId){setClinic(null);setSession(current);setMessage('تغيّر اختيار العيادة في نافذة أخرى. اختر عيادتك مجددًا.');}
          else {setSession(current);if(current.selectedClinicId){const value=await api<ClinicContext>(`clinics/${current.selectedClinicId}/me`);if(active&&generation.current===started&&selectedClinic.current===value.clinicId)setClinic(value);}}
        }
      }catch(error){if(active && generation.current===started){clear();setMessage(error instanceof ApiError && error.status===401?'انتهت الجلسة أو تغيّرت صلاحياتك. يرجى تسجيل الدخول مجددًا.':'تعذّر التحقق من الجلسة. سجّل الدخول بعد استعادة الاتصال.');}}finally{checking=false;}
    };
    const timer=window.setInterval(()=>void check(),60000);
    const focus=()=>void check();window.addEventListener('focus',focus);
    return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',focus);};
  },[session?.user.id,session?.selectedClinicId]);
  async function login(event:FormEvent) {
    event.preventDefault();setBusy(true);mutating.current=true;generation.current++;setMessage('');
    try{
      const pre=await api<{csrfToken:string}>('auth/csrf');
      const current=await api<SessionInfo | { mfaRequired: true; challengeToken: string; methods: string[] }>('auth/login','POST',{email,password},pre.csrfToken);
      setPassword('');
      if('mfaRequired' in current && current.mfaRequired) {
        setMfaChallenge({ challengeToken: current.challengeToken, methods: current.methods });
        return;
      }
      const list=await api<{clinics:ClinicContext[]}>('auth/clinics');
      setSession(current as SessionInfo);setClinics(list.clinics);setClinic(null);
    }catch(error){setMessage(error instanceof ApiError && error.status===401?'البريد الإلكتروني أو كلمة المرور غير صحيحة، أو الحساب غير متاح.':error instanceof ApiError && error.status===429?'محاولات كثيرة. يرجى الانتظار قبل المحاولة مجددًا.':'تعذّر تسجيل الدخول. تحقق من الاتصال وحدّث الصفحة للمحاولة مجددًا.');}
    finally{setBusy(false);mutating.current=false;setPassword('');}
  }
  async function verifyMfa(event:FormEvent) {
    event.preventDefault();if(!mfaChallenge)return;
    setBusy(true);mutating.current=true;generation.current++;setMessage('');
    try{
      const pre=await api<{csrfToken:string}>('auth/csrf');
      const payload=useRecovery ? { challengeToken: mfaChallenge.challengeToken, recoveryCode: mfaCode.trim() } : { challengeToken: mfaChallenge.challengeToken, code: mfaCode.trim() };
      const current=await api<SessionInfo>('auth/mfa/verify','POST',payload,pre.csrfToken);
      setMfaChallenge(null);setMfaCode('');setUseRecovery(false);
      const list=await api<{clinics:ClinicContext[]}>('auth/clinics');
      setSession(current);setClinics(list.clinics);setClinic(null);
    }catch(error){
      if(error instanceof ApiError && error.code==='MFA_CHALLENGE_EXPIRED'){setMfaChallenge(null);setMfaCode('');setMessage('انتهت صلاحية جلسة التحقق. يرجى تسجيل الدخول مجددًا.');}
      else if(error instanceof ApiError && error.code==='MFA_CHALLENGE_LOCKED'){setMfaChallenge(null);setMfaCode('');setMessage('تم تجاوز عدد محاولات التحقق المسموح بها. يرجى تسجيل الدخول مجددًا.');}
      else setMessage(error instanceof ApiError && error.status===400 ? (useRecovery?'رمز الاسترداد غير صحيح أو مستخدم مسبقًا.':'رمز التحقق غير صحيح أو منتهي الصلاحية.') : 'تعذّر التحقق من الرمز. تأكد من صحته وحاول مجددًا.');
    }finally{setBusy(false);mutating.current=false;}
  }
  async function submitStepUp(event:FormEvent) {
    event.preventDefault();if(!session)return;
    setStepUpBusy(true);setStepUpMessage('');
    try{
      const payload=stepUpMethod==='recovery'?{recoveryCode:stepUpCode.trim()}:{code:stepUpCode.trim()};
      await api('auth/mfa/step-up','POST',payload,session.csrfToken);
      setStepUpOpen(false);setStepUpCode('');setMessage('تم تأكيد الهوية بنجاح. يمكنك إعادة محاولة تنفيذ العملية الآن.');
    }catch(err){
      if(err instanceof ApiError && (err.code==='MFA_INVALID_CODE'||err.code==='RECOVERY_CODE_INVALID')){
        setStepUpMessage(err.message);
      }else{
        setStepUpMessage('تعذّر تأكيد الهوية. تأكد من صحة الرمز وحاول مجددًا.');
      }
    }finally{setStepUpBusy(false);}
  }
  async function select(selected:ClinicContext) {
    if(!session)return;
    setBusy(true);mutating.current=true;generation.current++;setMessage('');
    try{const current=await api<SessionInfo & {clinic:ClinicContext}>('auth/clinic','POST',{clinicId:selected.clinicId},session.csrfToken);setSession(current);setClinic(current.clinic);}
    catch(error){failure(error);}finally{setBusy(false);mutating.current=false;}
  }
  async function logout() {
    if(!session)return;
    setBusy(true);mutating.current=true;generation.current++;setMessage('');
    try{await api('auth/logout','POST',{},session.csrfToken);clear();setMessage('تم تسجيل الخروج.');}
    catch(error){failure(error);}finally{setBusy(false);mutating.current=false;}
  }
  const brand = <div className="auth-brand">{visibleIdentity?.branding?.logoUrl?<img src={visibleIdentity.branding.logoUrl} alt="شعار العيادة"/>:<span>✧</span>}<strong>{visibleIdentity?.displayName??'لمسة'}</strong><small>مساحة عيادتك، بهويتها</small></div>;
  if(loading)return <main className="auth-page" dir="rtl" style={brandStyle(visibleIdentity?.branding??null)}><section className="auth-card" role="status">{brand}<div className="auth-spinner"/><h1>جارٍ التحقق من الجلسة…</h1><p>لحظات ونجهّز مساحة العمل</p></section></main>;
  if(!session&&mfaChallenge)return <main className="auth-page" dir="rtl" style={brandStyle(visibleIdentity?.branding??null)}><aside className="auth-story">{brand}<div><span className="auth-kicker">حماية إضافية لحسابك</span><h2>التحقق بخطوتين<br/>لحماية بيانات العيادة والمرضى.</h2><p>يساعد التحقق بخطوتين في منع الوصول غير المصرح به حتى في حال معرفة كلمة المرور.</p><div className="auth-ornament">✧</div></div><small>نسخة تطوير · استخدم بيانات وهمية فقط</small></aside><section className="auth-card">{brand}<span className="auth-kicker">الخطوة الثانية</span><h1>{useRecovery?'إدخال رمز الاسترداد':'رمز تطبيق المصادقة'}</h1><p>{useRecovery?'أدخل أحد رموز الاسترداد التي تم حفظها عند تفعيل التحقق بخطوتين.':'أدخل الرمز المكون من 6 أرقام الظاهر في تطبيق المصادقة (Authenticator).'}</p>{message&&<div className="auth-message" role="alert">{message}</div>}<form onSubmit={verifyMfa}>{useRecovery?(<><label htmlFor="auth-mfa-recovery">رمز الاسترداد</label><input id="auth-mfa-recovery" type="text" dir="ltr" autoComplete="one-time-code" autoFocus required maxLength={64} value={mfaCode} onChange={e=>setMfaCode(e.target.value)} placeholder="xxxx-xxxx-xxxx-xxxx" disabled={busy}/></>):(<><label htmlFor="auth-mfa-totp">رمز التحقق (6 أرقام)</label><input id="auth-mfa-totp" type="text" inputMode="numeric" pattern="[0-9]*" dir="ltr" autoComplete="one-time-code" autoFocus required maxLength={8} value={mfaCode} onChange={e=>setMfaCode(e.target.value.replace(/\s+/g,''))} placeholder="000000" disabled={busy}/></>)}<button className="primary-btn" type="submit" disabled={busy}>{busy?'جارٍ التحقق…':'تأكيد وتسجيل الدخول ←'}</button></form><div style={{display:'flex',flexDirection:'column',gap:'0.5rem',marginTop:'1rem',alignItems:'center'}}><button type="button" className="auth-text-button" onClick={()=>{setUseRecovery(!useRecovery);setMfaCode('');setMessage('');}} disabled={busy}>{useRecovery?'← استخدام رمز تطبيق المصادقة':'فقدت هاتفك؟ استخدام رمز استرداد'}</button><button type="button" className="auth-text-button" onClick={()=>{setMfaChallenge(null);setMfaCode('');setUseRecovery(false);setMessage('');}} disabled={busy} style={{color:'#888'}}>العودة لتسجيل الدخول</button></div></section></main>;
  if(!session)return <main className="auth-page" dir="rtl" style={brandStyle(visibleIdentity?.branding??null)}><aside className="auth-story">{brand}<div><span className="auth-kicker">إدارة عيادتك تبدأ من هنا</span><h2>اهتمام بالتفاصيل.<br/>ومساحة لكل عيادة.</h2><p>سجّل الدخول إلى حسابك للوصول إلى العيادات المرتبطة بك، واختيار مساحة عملك.</p><div className="auth-ornament">✧</div></div><small>نسخة تطوير · استخدم بيانات وهمية فقط</small></aside><section className="auth-card">{brand}<span className="auth-kicker">أهلًا بعودتك</span><h1>تسجيل الدخول</h1><p>أدخل بيانات حسابك الذي أعدّه مسؤول التطوير.</p>{message&&<div className="auth-message" role="alert">{message}</div>}{unavailable?<button className="primary-btn" onClick={()=>void restore()}>إعادة الاتصال</button>:<form onSubmit={login}><label htmlFor="auth-email">البريد الإلكتروني</label><input id="auth-email" type="email" dir="ltr" autoComplete="username" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com" disabled={busy}/><label htmlFor="auth-password">كلمة المرور</label><input id="auth-password" type="password" dir="ltr" autoComplete="current-password" required maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} disabled={busy}/><button className="primary-btn" type="submit" disabled={busy}>{busy?'جارٍ تسجيل الدخول…':'دخول إلى مساحة العمل ←'}</button></form>}<p className="auth-footnote">الحسابات تُنشأ بإجراء تطوير مقيّد. تواصل مع مسؤول التطوير إذا لم يكن لديك حساب.</p></section></main>;
  if(!clinic)return <main className="auth-page auth-selection" dir="rtl" style={brandStyle(null)}><section className="auth-card clinic-picker">{brand}<span className="auth-kicker">مرحبًا {session.user.name}</span><h1>اختر عيادتك</h1><p>تظهر هنا العيادات النشطة التي لديك عضوية نشطة فيها.</p>{message&&<div className="auth-message" role="alert">{message}</div>}<div className="clinic-options">{clinics.map(item=><button className="clinic-option" key={item.clinicId} onClick={()=>void select(item)} disabled={busy} style={{'--clinic-color':item.branding?.primaryColor??'#7854D9'} as CSSProperties}><span className="clinic-option-symbol">{item.branding?.logoUrl?<img src={item.branding.logoUrl} alt="شعار العيادة" style={{width:32,height:32,objectFit:'contain'}}/>:'✦'}</span><span><b>{item.displayName}</b><small>{roleNames[item.role]??'عضو العيادة'}</small></span><span className="clinic-option-arrow">←</span></button>)}</div>{platformAdmin&&<button className="table-btn" onClick={()=>setShowPlatform(v=>!v)}>إدارة المنصة · صلاحية منفصلة</button>}{showPlatform&&<p role="status">أساس إدارة المنصة للقراءة فقط. إنشاء وتفعيل وإيقاف العيادات مؤجّل حتى توفير التحقق متعدد العوامل والتدقيق العالمي. لا توجد صلاحية تجاوز لعضوية العيادات.</p>}{clinics.length===0&&<div className="auth-message">لا توجد عضوية نشطة في عيادة متاحة. تواصل مع مسؤول العيادة.</div>}<p className="auth-footnote">سجلات العرض التجريبي محفوظة في هذا المتصفح ومشتركة بين اختيارات العيادات. لا تُدخل بيانات مرضى حقيقية.</p><button className="auth-text-button" onClick={()=>void logout()} disabled={busy}>تسجيل الخروج</button></section></main>;
  return <div className="authenticated-app" style={brandStyle(clinic.branding)}>
    <div className="session-strip"><span><b>نسخة تطوير · بيانات وهمية فقط</b> · المرضى والمواعيد والانتظار والفواتير محفوظة لكل عيادة؛ ملخص اللوحة والعرض القديم تجريبيان محليان.</span>{clinic.permissions.includes('clinic.settings.read')&&<button onClick={()=>setShowSettings(true)} disabled={busy}>إعدادات العيادة</button>}{platformAdmin&&<button onClick={()=>setShowPlatform(true)}>إدارة المنصة</button>}</div>
    {message&&<div className="session-message" role="alert">{message}<button aria-label="إغلاق التنبيه" onClick={()=>setMessage('')}>×</button></div>}
    <App key={clinic.clinicId} csrfToken={session.csrfToken} onAuthError={failure} clinic={clinic} userName={session.user.name} busy={busy} onSwitch={()=>{generation.current++;setShowSettings(false);setClinic(null);setMessage('');}} onLogout={()=>void logout()}/>
    {showSettings&&<Modal title="إعدادات العيادة وهويتها" onClose={()=>setShowSettings(false)}><ClinicSettings key={clinic.clinicId} clinic={clinic} csrfToken={session.csrfToken} onAuthError={failure} onUpdated={refreshClinic}/></Modal>}
    {showPlatform&&<Modal title="إدارة المنصة · أساس آمن محدود" onClose={()=>setShowPlatform(false)}><p>هذه مساحة منفصلة لصلاحية مدير المنصة، ولا تمنح صلاحيات عضوية في العيادات.</p><p>إنشاء العيادات وتفعيلها أو إيقافها عبر الواجهة غير متاح حاليًا. يلزم أولًا إجراء توفير إداري مراجع، وتحقق متعدد العوامل، وصلاحيات تشغيل دقيقة وسجل تدقيق عالمي.</p></Modal>}
    {stepUpOpen&&<Modal title="تأكيد الهوية للعمليات الحساسة" onClose={()=>setStepUpOpen(false)}>
      <div className="step-up-dialog" style={{padding:'0.5rem'}}>
        <p style={{margin:'0 0 1rem 0',color:'#555',fontSize:'0.95rem'}}>
          تتطلب هذه العملية الحساسة تأكيد الهوية الحديث (خلال آخر 15 دقيقة) لحماية بيانات العيادة وأمان النظام.
        </p>
        {stepUpMessage&&<div className="auth-message" role="alert" style={{marginBottom:'1rem'}}>{stepUpMessage}</div>}
        <form onSubmit={submitStepUp}>
          {stepUpMethod==='totp'&&(<>
            <label htmlFor="step-up-totp" style={{display:'block',marginBottom:'0.35rem',fontWeight:600}}>رمز تطبيق المصادقة (6 أرقام)</label>
            <input id="step-up-totp" type="text" inputMode="numeric" dir="ltr" autoFocus required maxLength={8} value={stepUpCode} onChange={e=>setStepUpCode(e.target.value.replace(/\s+/g,''))} placeholder="000000" disabled={stepUpBusy} style={{width:'100%',padding:'0.6rem',fontSize:'1.2rem',textAlign:'center',letterSpacing:'4px',marginBottom:'1rem'}}/>
          </>)}
          {stepUpMethod==='recovery'&&(<>
            <label htmlFor="step-up-recovery" style={{display:'block',marginBottom:'0.35rem',fontWeight:600}}>رمز الاسترداد</label>
            <input id="step-up-recovery" type="text" dir="ltr" autoFocus required maxLength={64} value={stepUpCode} onChange={e=>setStepUpCode(e.target.value)} placeholder="xxxx-xxxx-xxxx-xxxx" disabled={stepUpBusy} style={{width:'100%',padding:'0.6rem',fontSize:'1.1rem',textAlign:'center',marginBottom:'1rem'}}/>
          </>)}
          <div style={{display:'flex',gap:'0.5rem',justifyContent:'flex-end',marginTop:'1rem'}}>
            <button type="button" className="table-btn" onClick={()=>setStepUpOpen(false)} disabled={stepUpBusy}>إلغاء</button>
            <button type="submit" className="primary-btn" disabled={stepUpBusy||!stepUpCode.trim()}>{stepUpBusy?'جارٍ التأكيد…':'تأكيد ومتابعة'}</button>
          </div>
        </form>
        <div style={{display:'flex',gap:'1rem',marginTop:'1.25rem',paddingTop:'0.75rem',borderTop:'1px solid #eee',fontSize:'0.85rem'}}>
          {stepUpMethod!=='totp'&&<button type="button" className="auth-text-button" onClick={()=>{setStepUpMethod('totp');setStepUpCode('');setStepUpMessage('');}}>استخدام تطبيق المصادقة</button>}
          {stepUpMethod!=='recovery'&&<button type="button" className="auth-text-button" onClick={()=>{setStepUpMethod('recovery');setStepUpCode('');setStepUpMessage('');}}>استخدام رمز استرداد</button>}
        </div>
      </div>
    </Modal>}
  </div>;
}

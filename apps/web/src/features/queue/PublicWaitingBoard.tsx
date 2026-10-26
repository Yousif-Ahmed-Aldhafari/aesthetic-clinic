import { brandStyle, useDocumentIdentity } from '../settings/branding';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../auth/api';
import { RequestScope } from '../../lib/request-scope';
import { queueEvents, type PublicBoard } from './queue-api';
import './queue.css';
export function PublicWaitingBoard({slug}:{slug:string}){
  const [board,setBoard]=useState<PublicBoard|null>(null),[error,setError]=useState(''),[connected,setConnected]=useState(false),[refresh,setRefresh]=useState(0);
  useDocumentIdentity(board?.clinic??null);
  const gate=useMemo(()=>new RequestScope(),[slug]),path=`public/clinics/${encodeURIComponent(slug)}/queue`,reload=useCallback(()=>setRefresh(n=>n+1),[]);
  useEffect(()=>()=>gate.cancel(),[gate]);
  useEffect(()=>{const t=gate.start();void api<PublicBoard>(path,'GET',undefined,undefined,t.signal).then(data=>{if(t.current()){setBoard(data);setError('');}}).catch(e=>{if(t.current()){setBoard(null);setError(e instanceof ApiError&&e.status===404?'شاشة الانتظار غير مفعّلة أو العيادة غير متاحة.':'تعذّر تحديث الشاشة. جارٍ إعادة الاتصال…');}});return()=>gate.cancel();},[gate,path,refresh]);
  useEffect(()=>{const close=queueEvents(`${path}/events`,reload,setConnected,()=>{setBoard(null);reload();});const timer=setInterval(reload,15000);return()=>{close();clearInterval(timer);};},[path,reload]);
  return <main className="public-waiting-board" dir="rtl" style={brandStyle(board?.clinic.branding??null)}>
    <header>{board?.clinic.branding?.logoUrl&&<img src={board.clinic.branding.logoUrl} alt="شعار العيادة"/>}<div><h1>{board?.clinic.displayName??'شاشة الانتظار'}</h1><p>أرقام النداء · يرجى التوجه إلى الطبيب أو الغرفة عند ظهور رقمك</p></div><span role="status">{connected?'● مباشر':'◌ إعادة الاتصال'}</span></header>
    {error&&<p role="alert" className="patient-error">{error}<button className="table-btn" onClick={reload}>إعادة المحاولة</button></p>}
    {!board&&!error&&<p className="empty">جارٍ تحميل شاشة الانتظار…</p>}
    <div className="public-ticket-grid" aria-live="polite">{board?.items.map(item=><article key={`${item.businessDate}-${item.ticketNumber}`} className={item.status.toLowerCase()}><span>{item.status==='CALLED'?'يرجى التوجه الآن':'قيد الخدمة'}</span><strong dir="ltr">{item.ticketNumber}</strong><h2>{item.doctorLabel}</h2>{item.roomLabel&&<p>{item.roomLabel}</p>}<small dir="ltr">{item.businessDate}</small>{item.recallCount>0&&<small>إعادة النداء</small>}</article>)}</div>
    {board&&!board.items.length&&<p className="empty">لا يوجد نداء حاليًا. يرجى الانتظار حتى ظهور رقمك.</p>}<footer>حفاظًا على الخصوصية، تعرض الشاشة أرقام الدور فقط دون بيانات المرضى.</footer>
  </main>;
}

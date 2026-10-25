import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../auth/api';
import { RequestScope } from '../../lib/request-scope';
import { patientApi, type PatientRecord, type PatientPage } from '../patients/patient-api';
import { appointmentApi, statuses, type AppointmentRecord, type Page, type Resource } from '../appointments/appointment-api';
import { addDays, timeLabel } from '../appointments/calendar-time';
import { queueApi, type QueueTicket } from './queue-api';
export function CheckInForm({clinicId,csrf,timezone,today,resources,onSaved,onAuthError}:{clinicId:string;csrf:string;timezone:string;today:string;resources:Resource[];onSaved:(t:QueueTicket)=>void;onAuthError:(e:unknown)=>void}){
  const [mode,setMode]=useState<'APPOINTMENT'|'WALK_IN'>('APPOINTMENT'),[search,setSearch]=useState(''),[patients,setPatients]=useState<PatientRecord[]>([]),[patientPage,setPatientPage]=useState<PatientPage|null>(null),[patientCursor,setPatientCursor]=useState<string|null>(null),[patientId,setPatientId]=useState('');
  const [bookingDate,setBookingDate]=useState(today);
  const [appointments,setAppointments]=useState<AppointmentRecord[]>([]),[more,setMore]=useState<string|null>(null),[appointmentId,setAppointmentId]=useState('');
  const doctors=resources.filter(r=>r.kind==='DOCTOR'),rooms=resources.filter(r=>r.kind==='ROOM');
  const [doctor,setDoctor]=useState(doctors[0]?.id??''),[room,setRoom]=useState(''),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const gates=useMemo(()=>({read:new RequestScope(),write:new RequestScope()}),[clinicId]),retry=useRef<{body:string;key:string}|null>(null),pending=useRef(false);
  const client=useMemo(()=>queueApi(clinicId,csrf),[clinicId,csrf]);
  useEffect(()=>()=>{gates.read.cancel();gates.write.cancel();},[gates]);
  function failed(e:unknown){setError(e instanceof ApiError?e.message:'تعذّر الاتصال بالخدمة. أعد المحاولة.');if(e instanceof ApiError&&e.status===401)onAuthError(e);}
  async function load(cursor?:string){const t=gates.read.start();setLoading(true);setError('');
    try{const page=await appointmentApi(clinicId,csrf).get<Page<AppointmentRecord>>(`appointments?${new URLSearchParams({fromDate:bookingDate,toDate:addDays(bookingDate,1),pageSize:'20',...(cursor?{cursor}:{})})}`,t.signal);
      if(t.current()){setAppointments(old=>cursor?[...old,...page.items]:page.items);setMore(page.nextCursor);}}
    catch(e){if(t.current())failed(e);}finally{if(t.current())setLoading(false);}
  }
  useEffect(()=>{if(mode==='APPOINTMENT'){void load();return;}const t=gates.read.start();if(!patientCursor)setPatients([]);setLoading(true);setError('');const timer=setTimeout(()=>{void patientApi(clinicId).list(new URLSearchParams({q:search,status:'ACTIVE',pageSize:'20',...(patientCursor?{cursor:patientCursor}:{})}),t.signal).then(page=>{if(t.current()){setPatients(old=>patientCursor?[...old,...page.items]:page.items);setPatientPage(page);setLoading(false);}}).catch(e=>{if(t.current()){setLoading(false);failed(e);}});},200);return()=>{clearTimeout(timer);gates.read.cancel();};},[mode,search,patientCursor,gates,bookingDate]);
  async function submit(e:FormEvent){e.preventDefault();if(pending.current)return;pending.current=true;setBusy(true);setError('');const t=gates.write.start();
    try{let result:QueueTicket;
      if(mode==='APPOINTMENT'){const appointment=appointments.find(a=>a.id===appointmentId);if(!appointment)return;result=await client.write(appointment.status==='ARRIVED'?'/reconcile':'/check-in','POST',{appointmentId,expectedVersion:appointment.version},t.signal);}
      else{const body={patientId,doctorResourceId:doctor,roomResourceId:room||null},fingerprint=JSON.stringify(body);if(retry.current?.body!==fingerprint)retry.current={body:fingerprint,key:crypto.randomUUID()};result=await client.write('/walk-ins','POST',{...body,requestKey:retry.current!.key},t.signal);}
      if(t.current())onSaved(result);
    }catch(e){if(t.current())failed(e);}finally{pending.current=false;if(t.current())setBusy(false);}
  }
  const appointment=appointments.find(a=>a.id===appointmentId);
  return <form className="booking-form" onSubmit={submit} autoComplete="off" onInvalid={e=>{e.preventDefault();setError('اختر الموعد أو المريض والطبيب وأكمل التاريخ المطلوب.');(e.target as HTMLElement).focus();}}>
    <div className="queue-tabs" role="group" aria-label="نوع الحضور"><button type="button" className={mode==='APPOINTMENT'?'primary-btn':'table-btn'} disabled={busy} onClick={()=>{setMode('APPOINTMENT');setError('');}}>موعد محجوز</button><button type="button" className={mode==='WALK_IN'?'primary-btn':'table-btn'} disabled={busy} onClick={()=>{setMode('WALK_IN');setError('');}}>حضور دون موعد</button></div>
    {mode==='APPOINTMENT'?<><p className="form-hint">مواعيد التاريخ المختار بتوقيت <bdi>{timezone}</bdi>. الموعد الحاضر سابقًا يُربط بالانتظار بطلب صريح وآمن دون تكرار الزيارة.</p><label htmlFor="queue-appointment-date">تاريخ الموعد بتوقيت العيادة<input id="queue-appointment-date" type="date" required disabled={busy} value={bookingDate} onChange={e=>{if(e.target.value){setBookingDate(e.target.value);setAppointmentId('');setAppointments([]);}}}/></label><label htmlFor="queue-appointment">الموعد<select id="queue-appointment" required disabled={busy} value={appointmentId} onChange={e=>setAppointmentId(e.target.value)}><option value="">{loading?'جارٍ تحميل المواعيد…':'اختر موعد المريض'}</option>{appointments.filter(a=>['SCHEDULED','CONFIRMED','ARRIVED'].includes(a.status)).map(a=><option key={a.id} value={a.id}>{timeLabel(a.startAt,timezone)} · {a.patient.fullName} · {a.doctor.label} · {statuses[a.status]}</option>)}</select></label>{more&&<button type="button" className="table-btn" disabled={loading} onClick={()=>void load(more)}>تحميل المزيد من المواعيد</button>}{appointment?.status==='ARRIVED'&&<p className="form-hint">سيُسترجع الدور الموجود، أو تُنشأ زيارة لهذا الموعد الحاضر سابقًا فقط. لن تتغير بقية المواعيد.</p>}</>:<>
      <p className="form-hint">اختر ملف مريض نشط. لتسجيل مريض جديد استخدم صفحة المرضى أولًا؛ لا تُستورد بيانات العرض القديم.</p>
      <label htmlFor="queue-patient-search">ابحث ببداية الاسم أو الهاتف<input id="queue-patient-search" maxLength={60} value={search} onChange={e=>{setSearch(e.target.value);setPatientCursor(null);setPatientId('');}} disabled={busy}/></label>
      <label htmlFor="queue-patient">المريض<select id="queue-patient" required value={patientId} onChange={e=>setPatientId(e.target.value)} disabled={busy}><option value="">{loading?'جارٍ التحميل…':'اختر سجل المريض'}</option>{patients.map(p=><option key={p.id} value={p.id}>{p.fullName} · {p.patientNumber}</option>)}</select></label>{patientPage?.hasMore&&<button type="button" className="table-btn" onClick={()=>setPatientCursor(patientPage.nextCursor)} disabled={loading}>تحميل المزيد من المرضى</button>}
      <div className="form-grid"><label htmlFor="queue-doctor">الطبيب<select id="queue-doctor" required value={doctor} onChange={e=>setDoctor(e.target.value)} disabled={busy}>{doctors.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}</select></label><label htmlFor="queue-room">الغرفة (اختياري)<select id="queue-room" value={room} onChange={e=>setRoom(e.target.value)} disabled={busy}><option value="">دون غرفة</option>{rooms.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}</select></label></div></>}
    {error&&<p className="patient-error" role="alert">{error}</p>}<button type="submit" className="primary-btn submit-btn" disabled={busy||loading}>{busy?'جارٍ تسجيل الحضور…':appointment?.status==='ARRIVED'?'ربط الموعد الحاضر بالانتظار':'تسجيل الحضور وإصدار الدور'}</button>
  </form>;
}

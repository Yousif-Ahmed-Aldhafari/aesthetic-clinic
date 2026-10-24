import { useState } from 'react';
import type { Appointment, Patient } from '../../types/clinic';
import { localDate, makeId } from '../../lib/demo';

export function AppointmentForm({patients,onSubmit}:{patients:Patient[];onSubmit:(a:Appointment)=>void}) {
 const [patientId,setPatientId]=useState(patients[0]?.id||''), [service,setService]=useState('استشارة تجميلية'), [doctor,setDoctor]=useState(''), [date,setDate]=useState(localDate()), [time,setTime]=useState('09:00');
 return <form onSubmit={e=>{e.preventDefault();onSubmit({id:makeId(),patientId,service:service.trim(),doctor:doctor.trim(),date,time,status:'مجدول'});}}><label>المريض<select required value={patientId} onChange={e=>setPatientId(e.target.value)}>{patients.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>الخدمة<input required value={service} maxLength={120} onChange={e=>setService(e.target.value)}/></label><label>اسم الطبيب<input required value={doctor} maxLength={100} onChange={e=>setDoctor(e.target.value)} placeholder="د. ..."/></label><div className="form-grid"><label>التاريخ<input required type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>الوقت<input required type="time" value={time} onChange={e=>setTime(e.target.value)}/></label></div><button className="primary-btn submit-btn" type="submit" disabled={!patientId||!service.trim()||!doctor.trim()}>حفظ الموعد</button></form>;
}

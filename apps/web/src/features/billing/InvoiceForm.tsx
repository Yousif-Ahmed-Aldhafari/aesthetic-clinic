import { useState } from 'react';
import type { Invoice, Patient } from '../../types/clinic';
import { localDate, makeId } from '../../lib/demo';

export function InvoiceForm({patients,onSubmit}:{patients:Patient[];onSubmit:(i:Invoice)=>void}) {
 const [patientId,setPatientId]=useState(patients[0]?.id||''), [description,setDescription]=useState(''),[amount,setAmount]=useState(''),[paid,setPaid]=useState(false);
 return <form onSubmit={e=>{e.preventDefault();const parsed=Number(amount);if(!Number.isFinite(parsed)||parsed<=0)return;onSubmit({id:makeId(),patientId,description:description.trim(),amount:parsed,paid,createdAt:localDate()});}}><label>المريض<select required value={patientId} onChange={e=>setPatientId(e.target.value)}>{patients.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>وصف الخدمة<input required maxLength={120} value={description} onChange={e=>setDescription(e.target.value)} placeholder="اسم العلاج أو الخدمة"/></label><label>المبلغ بالريال اليمني<input required min="1" step="1" type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="10000"/></label><label className="checkbox-label"><input type="checkbox" checked={paid} onChange={e=>setPaid(e.target.checked)}/> تم تحصيل المبلغ</label><button className="primary-btn submit-btn" type="submit" disabled={!patientId||!description.trim()||!(Number(amount)>0)}>إنشاء الفاتورة</button></form>;
}

import { useState } from 'react';
import type { Patient } from '../../types/clinic';
import { localDate, makeId } from '../../lib/demo';

export function PatientForm({onSubmit}:{onSubmit:(p:Patient)=>void}) {
 const [name,setName]=useState(''), [phone,setPhone]=useState(''), [notes,setNotes]=useState('');
 return <form onSubmit={e=>{e.preventDefault();onSubmit({id:makeId(),name:name.trim(),phone:phone.trim(),notes:notes.trim(),createdAt:localDate()});}}><label>اسم المريض الكامل<input required maxLength={100} value={name} onChange={e=>setName(e.target.value)} placeholder="الاسم الكامل" /></label><label>رقم الهاتف<input required maxLength={25} dir="ltr" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="777000000" /></label><label>ملاحظات غير طبية (اختياري)<textarea maxLength={300} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="ملاحظة إدارية قصيرة" /></label><button className="primary-btn submit-btn" type="submit" disabled={!name.trim()||!phone.trim()}>حفظ المريض</button></form>;
}

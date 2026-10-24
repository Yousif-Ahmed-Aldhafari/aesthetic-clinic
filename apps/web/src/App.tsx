import { useEffect, useMemo, useRef, useState } from 'react';
import type { Appointment, Data } from './types/clinic';
import { loadData, makeId, rial, seed, STORAGE_KEY, today } from './lib/demo';
import { Empty, Modal, PanelHeading, Stat, Status } from './components/ui';
import { PatientDirectory } from './features/patients/PatientDirectory';
import { PatientForm } from './features/patients/PatientForm';
import { AppointmentForm } from './features/appointments/AppointmentForm';
import { InvoiceForm } from './features/billing/InvoiceForm';

import type { ClinicContext } from './features/auth/api';

type Section = 'overview' | 'patients' | 'appointments' | 'queue' | 'invoices';

const sections: { id: Section; label: string; symbol: string }[] = [
  { id: 'overview', label: 'لوحة التحكم', symbol: '▦' },
  { id: 'patients', label: 'المرضى', symbol: '♙' },
  { id: 'appointments', label: 'المواعيد', symbol: '▣' },
  { id: 'queue', label: 'طابور الانتظار', symbol: '◷' },
  { id: 'invoices', label: 'الفواتير', symbol: '▤' },
];

export default function App({ clinic, userName, busy, onSwitch, onLogout, csrfToken, onAuthError }: { csrfToken: string; onAuthError: (error: unknown) => void; clinic: ClinicContext; userName: string; busy: boolean; onSwitch: () => void; onLogout: () => void }) {
  const [data, setData] = useState<Data>(loadData);
  const [section, setSection] = useState<Section>('overview');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'patient' | 'legacy' | 'appointment' | 'invoice' | null>(null);
  const [notice, setNotice] = useState('');
  const initialDemo = useRef(data);
  useEffect(() => {
    // Existing browser data is never rewritten by API-only activity.
    if (data !== initialDemo.current || localStorage.getItem(STORAGE_KEY) === null) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);
  const patientName = (id: string) => data.patients.find(p => p.id === id)?.name || 'مريض غير معروف';
  const todayAppointments = useMemo(() => data.appointments.filter(a => a.date === today), [data.appointments]);
  const waiting = data.queue.filter(q => q.status === 'انتظار').sort((a,b) => a.number - b.number);
  const active = data.queue.find(q => q.status === 'داخل الغرفة');
  const totals = {
    today: todayAppointments.length,
    patients: data.patients.length,
    waiting: waiting.length,
    revenue: data.invoices.filter(i => i.paid).reduce((sum, i) => sum + i.amount, 0),
  };
  function toast(message: string) { setNotice(message); }
  function checkIn(appointment: Appointment) {
    if (appointment.status === 'ملغي' || appointment.status === 'مكتمل') return;
    if (data.queue.some(q => q.appointmentId === appointment.id)) { toast('المريض مسجل مسبقًا في الطابور'); return; }
    setData(d => ({
      ...d,
      appointments: d.appointments.map(a => a.id === appointment.id ? { ...a, status: 'حضر' } : a),
      queue: [...d.queue, { id: makeId(), patientId: appointment.patientId, appointmentId: appointment.id, number: Math.max(0, ...d.queue.filter(q => q.arrivedAt.slice(0,10) === new Date().toISOString().slice(0,10)).map(q => q.number)) + 1, status: 'انتظار', arrivedAt: new Date().toISOString() }],
    }));
    toast('تم تسجيل حضور المريض وإضافته إلى الطابور');
  }
  function callNext() {
    if (active) { toast('يرجى إنهاء زيارة المريض الموجود داخل الغرفة أولًا'); return; }
    const next = waiting[0];
    if (!next) { toast('لا يوجد مرضى في الانتظار'); return; }
    setData(d => ({ ...d, queue: d.queue.map(q => q.id === next.id ? { ...q, status: 'داخل الغرفة' } : q) }));
    toast(`حان دور ${patientName(next.patientId)} — رقم ${next.number}`);
  }
  function finishVisit() {
    if (!active) return;
    setData(d => ({ ...d,
      queue: d.queue.map(q => q.id === active.id ? { ...q, status: 'انتهى' } : q),
      appointments: d.appointments.map(a => a.id === active.appointmentId ? { ...a, status: 'مكتمل' } : a),
    }));
    toast('تم إنهاء الزيارة');
  }
  function resetDemo() {
    if (!window.confirm('هل تريد استعادة البيانات التجريبية؟ سيتم حذف التغييرات المحفوظة في هذا المتصفح.')) return;
    setData(seed); setSection('overview'); setSearch(''); toast('تمت استعادة البيانات التجريبية');
  }
  const title = sections.find(s => s.id === section)?.label;
  const match = (values: string[]) => values.some(v => v.toLowerCase().includes(search.trim().toLowerCase()));

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">✧</span><div><strong>لمسة</strong><small>إدارة العيادات التجميلية</small></div></div>
      <button className="clinic-switch" onClick={onSwitch} disabled={busy} aria-label="تغيير العيادة">{clinic.branding?.logoUrl ? <img className="clinic-logo" src={clinic.branding.logoUrl} alt="شعار العيادة"/> : <span className="clinic-icon">✦</span>}<div><b>{clinic.displayName}</b><small>تغيير العيادة</small></div><span className="chevron">⌄</span></button>
      <div className="menu-label">القائمة الرئيسية</div>
      <nav aria-label="القائمة الرئيسية">{sections.map(item => <button key={item.id} className={`nav-link ${section === item.id ? 'selected' : ''}`} onClick={() => { setSection(item.id); setSearch(''); setNotice(''); }}><span className="nav-icon">{item.symbol}</span>{item.label}{item.id === 'queue' && waiting.length > 0 && <em>{waiting.length}</em>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><b>نسخة تطوير</b><p>المرضى محفوظون للعيادة عبر الخدمة. بقية الأقسام عرض محلي تجريبي. استخدم بيانات وهمية فقط.</p></div><button className="reset" onClick={resetDemo}>↻ استعادة البيانات التجريبية</button></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="breadcrumb">العيادة <span>/</span> <b>{title}</b></div><div className="top-actions"><span className="date-pill">◷ {new Intl.DateTimeFormat('ar-YE', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}</span><span className="user-name">{userName}</span><span className="avatar">{userName.slice(0,1)}</span><button className="logout-button" onClick={onLogout} disabled={busy}>تسجيل الخروج</button></div></header>
      <div className="content">
        <div className="page-header"><div><div className="eyebrow">نظام إدارة عيادات التجميل</div><h1>{section === 'overview' ? 'صباح الخير، أهلاً بك 👋' : title}</h1><p>{section === 'overview' ? 'إليك ملخص ما يحدث في عيادتك اليوم.' : section === 'queue' ? 'متابعة دور المرضى داخل العيادة لحظة بلحظة.' : section === 'patients' ? 'ملفات المرضى وبيانات التواصل الأساسية.' : section === 'appointments' ? 'تنظيم الحجوزات وحضور المرضى.' : 'إدارة الفواتير والمدفوعات.'}</p></div><div className="header-buttons">{section !== 'queue' && section !== 'patients' && <button className="primary-btn" onClick={() => setModal(section === 'invoices' ? 'invoice' : 'appointment')}>＋ {section === 'invoices' ? 'فاتورة جديدة' : 'حجز موعد'}</button>}</div></div>
        {section !== 'patients' && <div className="demo-label"><b>عرض تجريبي محلي فقط</b> · هذه البيانات مشتركة بين اختيارات العيادات في هذا المتصفح، ومنفصلة عن سجل المرضى المحفوظ للعيادة. لا تستخدمها لسجلات حقيقية.<button className="table-btn" onClick={()=>setModal('legacy')}>مرضى العرض القديم</button></div>}
        {notice && <div className="notice" role="status">✓ {notice}<button aria-label="إغلاق التنبيه" onClick={() => setNotice('')}>×</button></div>}
        {section === 'overview' && <>
          <div className="stats-grid"><Stat label="مواعيد اليوم" value={totals.today.toLocaleString('ar')} accent="purple" icon="▣" note="جميع مواعيد اليوم"/><Stat label="إجمالي المرضى" value={totals.patients.toLocaleString('ar')} accent="blue" icon="♙" note="في سجلات النسخة التجريبية"/><Stat label="في قاعة الانتظار" value={totals.waiting.toLocaleString('ar')} accent="orange" icon="◷" note="بانتظار الدخول للطبيب"/><Stat label="المبالغ المحصلة" value={rial(totals.revenue)} accent="green" icon="◈" note="من جميع الفواتير المسددة"/></div>
          <div className="two-column"><section className="panel"><PanelHeading title="مواعيد اليوم" detail={`${todayAppointments.length} مواعيد`} action="عرض جميع المواعيد" onClick={() => setSection('appointments')}/><div className="table-wrap"><table><thead><tr><th>المريض</th><th>الخدمة</th><th>الوقت</th><th>الحالة</th></tr></thead><tbody>{todayAppointments.slice(0, 5).map(a => <tr key={a.id}><td className="name-cell">{patientName(a.patientId)}</td><td>{a.service}</td><td dir="ltr">{a.time}</td><td><Status value={a.status}/></td></tr>)}</tbody></table></div>{todayAppointments.length === 0 && <Empty text="لا توجد مواعيد اليوم"/>}</section>
          <section className="panel queue-summary"><PanelHeading title="حالة الانتظار" detail="متابعة مباشرة" action="فتح الطابور" onClick={() => setSection('queue')}/><div className="next-patient"><div className="next-icon">◷</div><small>المريض داخل الغرفة الآن</small><strong>{active ? patientName(active.patientId) : 'لا يوجد مريض حاليًا'}</strong><span>{active ? `رقم الدور ${active.number}` : 'يمكنك استدعاء المريض التالي'}</span></div><div className="queue-line"><span>المرضى المنتظرون</span><strong>{waiting.length.toLocaleString('ar')}</strong></div><button className="wide-btn" disabled={Boolean(active) || waiting.length === 0} onClick={callNext}>استدعاء المريض التالي ←</button></section></div>
          <div className="tip">✦ <div><b>ابدأ بتنظيم يوم عيادتك</b><span>سجل المرضى، أنشئ مواعيد، ثم سجّل الحضور لإضافة المرضى إلى طابور الانتظار.</span></div></div>
        </>}
        {section === 'patients' && <PatientDirectory clinic={clinic} csrfToken={csrfToken} onAuthError={onAuthError} onLegacy={()=>setModal('legacy')}/>}
        {section === 'appointments' && <section className="panel full-panel"><div className="toolbar"><h2>الحجوزات <span className="counter">{data.appointments.length}</span></h2><input className="search" placeholder="ابحث عن مريض أو خدمة..." aria-label="البحث عن المواعيد" value={search} onChange={e => setSearch(e.target.value)} /></div><div className="table-wrap"><table><thead><tr><th>المريض</th><th>الخدمة</th><th>الطبيب</th><th>التاريخ</th><th>الوقت</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>{[...data.appointments].sort((a,b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).filter(a => match([patientName(a.patientId),a.service,a.doctor])).map(a => <tr key={a.id}><td className="name-cell">{patientName(a.patientId)}</td><td>{a.service}</td><td>{a.doctor}</td><td>{a.date}</td><td dir="ltr">{a.time}</td><td><Status value={a.status}/></td><td><button className="table-btn" onClick={() => checkIn(a)} disabled={a.status !== 'مجدول' || data.queue.some(q => q.appointmentId === a.id)}>تسجيل حضور</button></td></tr>)}</tbody></table></div>{data.appointments.length === 0 && <Empty text="لا توجد مواعيد"/>}</section>}
        {section === 'queue' && <><div className="queue-top"><section className="queue-focus"><span className="pill-white">● داخل غرفة الكشف</span><div className="focus-label">الدور الحالي</div><strong>{active ? patientName(active.patientId) : 'لا يوجد مريض'}</strong><p>{active ? `رقم ${active.number} • ${new Intl.DateTimeFormat('ar-YE', { hour: '2-digit', minute: '2-digit' }).format(new Date(active.arrivedAt))}` : 'قم باستدعاء المريض التالي من قائمة الانتظار'}</p><button onClick={finishVisit} disabled={!active}>✓ إنهاء الزيارة</button></section><section className="queue-control"><span className="queue-symbol">◷</span><small>بانتظار الدخول</small><strong>{waiting.length.toLocaleString('ar')}</strong><p>مريض في قائمة الانتظار</p><button className="primary-btn" disabled={Boolean(active) || waiting.length === 0} onClick={callNext}>استدعاء المريض التالي ←</button></section></div><section className="panel full-panel"><PanelHeading title="قائمة الانتظار" detail="مرتبة حسب رقم الدور"/><div className="table-wrap"><table><thead><tr><th>رقم الدور</th><th>المريض</th><th>وقت الوصول</th><th>الحالة</th></tr></thead><tbody>{data.queue.filter(q => q.status !== 'انتهى').sort((a,b) => a.number - b.number).map(q => <tr key={q.id}><td><span className="ticket">#{q.number}</span></td><td className="name-cell">{patientName(q.patientId)}</td><td>{new Intl.DateTimeFormat('ar-YE', { hour: '2-digit', minute: '2-digit' }).format(new Date(q.arrivedAt))}</td><td><Status value={q.status}/></td></tr>)}</tbody></table></div>{data.queue.every(q => q.status === 'انتهى') && <Empty text="قائمة الانتظار فارغة. سجّل حضور مريض من صفحة المواعيد."/>}</section></>}
        {section === 'invoices' && <><div className="finance-row"><div><small>إجمالي الفواتير</small><strong>{rial(data.invoices.reduce((sum,i) => sum + i.amount, 0))}</strong></div><div><small>المبالغ المحصلة</small><strong>{rial(totals.revenue)}</strong></div><div><small>المبالغ المستحقة</small><strong>{rial(data.invoices.filter(i => !i.paid).reduce((sum,i) => sum + i.amount, 0))}</strong></div></div><section className="panel full-panel"><div className="toolbar"><h2>الفواتير <span className="counter">{data.invoices.length}</span></h2><input className="search" placeholder="ابحث عن اسم مريض أو خدمة..." aria-label="البحث عن الفواتير" value={search} onChange={e => setSearch(e.target.value)} /></div><div className="table-wrap"><table><thead><tr><th>رقم الفاتورة</th><th>المريض</th><th>الوصف</th><th>المبلغ</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>{data.invoices.filter(i => match([patientName(i.patientId),i.description,i.id])).map((i, index) => <tr key={i.id}><td>INV-{String(data.invoices.length - index).padStart(4,'0')}</td><td className="name-cell">{patientName(i.patientId)}</td><td>{i.description}</td><td className="amount">{rial(i.amount)}</td><td><span className={`status ${i.paid ? 'green' : 'amber'}`}>{i.paid ? 'مدفوعة' : 'غير مدفوعة'}</span></td><td><button className="table-btn" disabled={i.paid} onClick={() => {setData(d => ({ ...d, invoices: d.invoices.map(x => x.id === i.id ? {...x, paid: true} : x) })); toast('تم تسجيل سداد الفاتورة');}}>تسجيل سداد</button></td></tr>)}</tbody></table></div>{data.invoices.length === 0 && <Empty text="لا توجد فواتير"/>}</section></>}
      </div>
    </main>
    {modal && <Modal title={modal === 'legacy' ? 'مرضى العرض القديم · تجريبي محلي' : modal === 'patient' ? 'إضافة مريض تجريبي محلي' : modal === 'appointment' ? 'حجز موعد جديد' : 'إنشاء فاتورة'} onClose={() => setModal(null)}>
      {modal === 'legacy' ? <div className="legacy-list"><p>هذه سجلات المتصفح الأصلية للمواعيد والطابور والفواتير التجريبية فقط. لا تُستورد إلى قاعدة البيانات.</p><ul>{data.patients.map(p=><li key={p.id}>{p.name} · <bdi>{p.phone}</bdi>{p.notes && <small> · {p.notes}</small>}</li>)}</ul><button className="primary-btn" onClick={()=>setModal('patient')}>إضافة مريض للعرض التجريبي فقط</button></div> : modal === 'patient' ? <PatientForm onSubmit={p => {setData(d => ({ ...d, patients: [...d.patients, p] }));setModal(null);toast('تمت إضافة المريض');}} /> :
       modal === 'appointment' ? <AppointmentForm patients={data.patients} onSubmit={a => {setData(d => ({ ...d, appointments: [...d.appointments,a] }));setModal(null);toast('تم حجز الموعد');}} /> :
       <InvoiceForm patients={data.patients} onSubmit={i => {setData(d => ({ ...d, invoices: [i, ...d.invoices] }));setModal(null);toast('تم إنشاء الفاتورة');}} />}
    </Modal>}
  </div>;
}

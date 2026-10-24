// Demo-only helpers and storage. Keep the v1 key and serialized shape stable.
import type { Data } from '../types/clinic';

export const STORAGE_KEY = 'lamssa-clinic-demo-v1';
export const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export const today = localDate();
export const makeId = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
export const rial = (value: number) => new Intl.NumberFormat('ar-YE', { maximumFractionDigits: 0 }).format(value) + ' ر.ي';
export const seed: Data = {
  patients: [
    { id: 'p1', name: 'سارة أحمد', phone: '777000001', notes: 'مثال تجريبي', createdAt: today },
    { id: 'p2', name: 'مريم محمد', phone: '777000002', notes: 'مثال تجريبي', createdAt: today },
    { id: 'p3', name: 'نورا خالد', phone: '777000003', notes: 'مثال تجريبي', createdAt: today },
    { id: 'p4', name: 'ريم علي', phone: '777000004', notes: 'مثال تجريبي', createdAt: today },
  ],
  appointments: [
    { id: 'a1', patientId: 'p1', service: 'استشارة تجميلية', doctor: 'د. ليلى', date: today, time: '09:30', status: 'مجدول' },
    { id: 'a2', patientId: 'p2', service: 'جلسة ليزر', doctor: 'د. ليلى', date: today, time: '10:00', status: 'حضر' },
    { id: 'a3', patientId: 'p3', service: 'تنظيف بشرة', doctor: 'د. ياسمين', date: today, time: '11:15', status: 'مجدول' },
    { id: 'a4', patientId: 'p4', service: 'متابعة علاج', doctor: 'د. ياسمين', date: today, time: '12:00', status: 'مجدول' },
  ],
  queue: [{ id: 'q1', patientId: 'p2', appointmentId: 'a2', number: 1, status: 'انتظار', arrivedAt: new Date().toISOString() }],
  invoices: [
    { id: 'i1', patientId: 'p1', description: 'استشارة تجميلية', amount: 10000, paid: true, createdAt: today },
    { id: 'i2', patientId: 'p2', description: 'جلسة ليزر', amount: 25000, paid: false, createdAt: today },
  ],
};
export function loadData(): Data {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && 'patients' in parsed && 'appointments' in parsed && 'queue' in parsed && 'invoices' in parsed) {
        const data = parsed as Data;
        if ([data.patients, data.appointments, data.queue, data.invoices].every(Array.isArray)) return data;
      }
    }
  } catch { /* Ignore invalid local demo storage */ }
  return seed;
}

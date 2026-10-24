// Browser demo models; future API contracts will live in packages/shared.
export type Patient = { id: string; name: string; phone: string; notes: string; createdAt: string };
export type AppointmentStatus = 'مجدول' | 'حضر' | 'مكتمل' | 'ملغي';
export type Appointment = { id: string; patientId: string; service: string; doctor: string; date: string; time: string; status: AppointmentStatus };
export type QueueStatus = 'انتظار' | 'داخل الغرفة' | 'انتهى';
export type QueueEntry = { id: string; patientId: string; appointmentId?: string; number: number; status: QueueStatus; arrivedAt: string };
export type Invoice = { id: string; patientId: string; description: string; amount: number; paid: boolean; createdAt: string };
export type Data = { patients: Patient[]; appointments: Appointment[]; queue: QueueEntry[]; invoices: Invoice[] };

import { HttpException } from '@nestjs/common';
export const queueErrors={
  QUEUE_STALE:[409,'تغيّرت حالة الدور. حدّث القائمة قبل المحاولة مجددًا.'],
  QUEUE_TRANSITION:[409,'لا يمكن تنفيذ هذا الإجراء في حالة الدور الحالية.'],
  QUEUE_BUSY:[409,'يوجد مريض قيد النداء أو الخدمة لهذا الطبيب أو الغرفة.'],
  QUEUE_DUPLICATE:[409,'للمريض زيارة نشطة بالفعل. راجع قائمة الانتظار.'],
  QUEUE_RETRY:[409,'استُخدم معرّف الطلب لعملية أخرى. حدّث القائمة.'],
  QUEUE_INACTIVE_PATIENT:[400,'لا يمكن تسجيل حضور جديد لملف مريض غير نشط.'],
  QUEUE_WORKFLOW:[409,'أكمل الزيارة من قائمة الانتظار بعد بدء الخدمة.'],
} as const;
export class QueueError extends HttpException {
  constructor(readonly code:keyof typeof queueErrors){super(queueErrors[code][1],queueErrors[code][0]);}
}

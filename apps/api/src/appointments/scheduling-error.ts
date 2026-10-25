import { HttpException } from '@nestjs/common';
export const schedulingErrors = {
  SLOT_CONFLICT: [409,'هذا الوقت محجوز للطبيب أو الغرفة. اختر وقتًا أو موردًا آخر.'],
  STALE_VERSION: [409,'تغيّرت البيانات منذ فتحها. أعد التحميل وراجع التغييرات.'],
  INVALID_TRANSITION: [400,'لا يمكن تغيير الموعد إلى هذه الحالة أو تعديل موعد نهائي.'],
  OUTSIDE_AVAILABILITY: [400,'الوقت خارج ساعات العمل أو يتداخل مع فترة عدم التوفر.'],
  INVALID_LOCAL_TIME: [400,'هذا التوقيت المحلي غير موجود بسبب تغيير الساعة. اختر وقتًا آخر.'],
  AMBIGUOUS_LOCAL_TIME: [400,'الساعة المختارة تتكرر. اختر التوقيت الأول أو الثاني صراحةً.'],
  INVALID_TIME_RANGE: [400,'تحقق من التاريخ والمدة؛ الحجز من ٥ دقائق إلى ٨ ساعات وفي المستقبل خلال سنة.'],
  INACTIVE_PATIENT: [400,'لا يمكن حجز موعد جديد أو إعادة جدولة ملف مريض غير نشط.'],
  ROOM_REQUIRED: [400,'هذه الخدمة تتطلب اختيار غرفة متاحة.'],
  RESOURCE_UNAVAILABLE: [400,'الطبيب أو الغرفة أو الخدمة غير متاحة للحجز.'],
  SCHEDULE_CHANGE_CONFLICT: [409,'التعديل يتعارض مع حجوزات قائمة. أعد جدولة الحجوزات أو ألغها أولًا.'],
  IDEMPOTENCY_CONFLICT: [409,'استُخدم معرّف الطلب لحجز مختلف. راجع الحجوزات قبل إعادة المحاولة.'],
  INVALID_TIMEZONE: [503,'إعداد المنطقة الزمنية للعيادة غير صالح. تواصل مع مسؤول العيادة.'],
  SCHEDULING_BUSY: [503,'خدمة الجدولة مشغولة مؤقتًا. حدّث التقويم قبل إعادة المحاولة.'],
} as const;
export type SchedulingCode=keyof typeof schedulingErrors;
export class SchedulingError extends HttpException {
  constructor(readonly code:SchedulingCode){super(schedulingErrors[code][1],schedulingErrors[code][0]);}
}

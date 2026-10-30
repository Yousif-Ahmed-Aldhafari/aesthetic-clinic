# توثيق المتابعات السريرية ومراقبة التعافي ونتائج العلاج (Clinical Follow-ups, Recovery Monitoring & Treatment Outcomes)

تحدد هذه الوثيقة المعمارية السريرية والأمنية لنظام متابعة التعافي ومراقبة النتائج السريرية والأحداث الجانبية في منصة «لمسة» (Lamssa)، بما يتوافق مع أعلى معايير الخصوصية السريرية، عزل المستأجرين المتعددين (Multi-Tenancy RLS)، وحماية السجلات من التلاعب.

---

## ١. النطاق والأهداف السريرية (Scope & Clinical Objectives)

1. **إدارة دورة حياة المتابعات السريرية**:
   - جدولة جلسات المتابعة بعد الإجراءات التجميلية مع توثيق السبب وتعليمات العناية والتعافي.
   - حالات المتابعة: `SCHEDULED` (مجدولة)، `IN_PROGRESS` (قيد المتابعة السريرية)، `COMPLETED` (مكتملة وموثقة)، `CANCELLED` (ملغاة)، `MISSED` (فائتة / لم يحضر).
   - **عدم رجعية الحالات النهائية (Terminal Status Immutability)**: بمجرد وصول المتابعة إلى `COMPLETED` أو `CANCELLED` أو `MISSED`، يُحظر إعادة فتحها أو تعديل مسارها نهائياً على مستوى طبقة التطبيق وقواعد البيانات.

2. **التقييم السريري والتوقيع الرقمي (Cryptographic Digital Signature)**:
   - تتطلب المتابعة المكتملة تقييماً سريرياً معتمداً من الطبيب المعالج يشمل: الأعراض الملاحظة (`symptomsObserved`)، تقدم الالتئام (`healingProgress`)، والملاحظات السريرية (`clinicalNotes`).
   - يتم توقيع التقييم رقمياً بحساب بصمة تشفيرية موحدة (`SHA-256`) على بيانات التقييم بصيغة Canonical JSON مع هوية الطبيب وتاريخ التوقيع.
   - التقييم الموقع غير قابل للتعديل أو الحذف (`DELETE` محظور كلياً ومحمي بقواعد وحراس قاعدة البيانات).

3. **سجل التصويبات والملحقات التوثيقية المنسوبة (Attributable Amendments)**:
   - أي تصويب أو إضافة توضيحية لتقييم سريري موقع لا يُعدل السجل الأصلي، بل يُضاف كملحق تصويبي مستقل (`FollowUpAssessmentAmendment`) يتضمن: سبب التصويب (`amendmentReason`)، المحتوى المصوب (`amendedContent`)، هوية الطبيب المصوب، التوقيت الدقيق، وبصمة توقيع رقمية جديدة مستقلة.

4. **مقاييس ومراقبة نتائج العلاج (Treatment Outcomes)**:
   - توثيق موضوعي لنتائج الإجراءات التجميلية عبر مقاييس طبية معيارية محددة المدى:
     - `VISUAL_ANALOG_SCALE_10`: مقياس النظير البصري (0.0 إلى 10.0).
     - `PATIENT_SATISFACTION_5_POINT`: مقياس رضا المريض المعياري (1.0 إلى 5.0).
     - `CLINICAL_GLOBAL_IMPRESSION`: مقياس الانطباع السريري العام (1.0 إلى 7.0).
     - `STRUCTURED_OBSERVATION`: ملاحظات سريرية وصفية هيكلية دون درجة رقمية.
   - الفصل التام بين تقييم الطبيب السريري (`clinicianScore`, `clinicianNotes`) وتقييم وانطباع المريض المصرّح به (`patientReportedScore`, `patientReportedNotes`) مع منع استنتاج نسب مئوية مضللة.
   - إمكانية ربط النتيجة بمجموعات مقارنة الصور السريرية قبل/بعد (`PhotoComparisonGroup`) وبسجل تنفيذ الإجراء (`ProcedureExecution`).

5. **رصد وإدارة الأحداث والآثار الجانبية (Adverse Events)**:
   - توثيق سريري فوري لأي عارض أو تفاعل غير متوقع: نوع الحدث (`eventType`)، مستوى الشدة (`MILD`, `MODERATE`, `SEVERE`)، تاريخ الملاحظة، والموجودات المفصلة (`documentedFindings`).
   - تتبع مسار التعامل الطبي وتحديث الحالة: `REPORTED` -> `UNDER_EVALUATION` -> `RESOLVED` أو `ESCALATED`، مع توثيق تاريخ الاستقرار (`resolvedAt`) وتفاصيل التدخل العلاجي.

---

## ٢. الضوابط الأمنية وحماية البيانات (Security & Data Governance)

### أ. العزل التام متعدد المستأجرين (Tenant Isolation & FORCE RLS)
- تم تفعيل فرض سياسات أمان مستوى الصف (`FORCE ROW LEVEL SECURITY`) على كافة الجداول الخمسة:
  - `public."ClinicalFollowUp"`
  - `public."FollowUpAssessment"`
  - `public."FollowUpAssessmentAmendment"`
  - `public."TreatmentOutcome"`
  - `public."AdverseEvent"`
- ترتبط جميع الجداول بعمود `clinicId` وتعتمد المفاتيح الأجنبية المركبة `(clinicId, id)` لضمان مطابقة المنشأة على كافة المستويات ومنع أي اختراق عرضي أو عابر للمستأجرين.
- يتم تقييد الاستعلامات عبر حزمة المعاملات الخاصة بالمستأجر (`TenantDatabaseService.withClinicContext`) وضبط متغير الجلسة `app.current_clinic_id`.

### ب. صلاحيات الدور الوظيفي (Role-Based Access Control - RBAC)
- كافة صلاحيات المتابعات والنتائج السريرية والأحداث الجانبية مصنفة كبيانات حساسة شخصياً (`SENSITIVE_PERSONAL`) ومقصورة حصرياً على دور الطبيب (`DOCTOR`):
  - `clinical.follow-ups.read`
  - `clinical.follow-ups.create`
  - `clinical.follow-ups.update`
  - `clinical.follow-ups.assess`
  - `clinical.follow-ups.amend`
  - `clinical.outcomes.read`
  - `clinical.outcomes.create`
  - `clinical.adverse-events.read`
  - `clinical.adverse-events.create`
  - `clinical.adverse-events.update`
- يُحظر وصول الأدوار الإدارية (`OWNER`, `ADMIN`, `RECEPTIONIST`, `ACCOUNTANT`) إلى السجلات السريرية التخصصية ما لم تكن مصحوبة بصلاحية طبية مباشرة.

### ج. مبدأ عدم الحذف والحراس المشددون (Immutability & Guard Triggers)
- دور وقت التشغيل (`lamssa_app` / `lamssa_test_app`) ممنوح فقط صلاحيات `SELECT, INSERT, UPDATE` ومحروم تماماً من صلاحية `DELETE` على جداول المتابعات والنتائج.
- توجد مشغلات حراسة مشددة (Database Triggers) تمنع أي محاولة حذف:
  - `clinical_followup_guard`
  - `followup_assessment_guard`
  - `treatment_outcome_guard`
  - `adverse_event_guard`
- تمنع المشغلات التعديل على التقييمات المكتملة وتمنع إعادة فتح المتابعات النهائية.

### د. أمان الذاكرة في المتصفح (Browser Memory Safety)
- لا يتم حفظ أي بيانات متابعات أو تقييمات أو نتائج علاج في `localStorage` أو `sessionStorage`.
- يتم إلغاء طلبات الشبكة المعلقة تلقائياً عبر `AbortController` فور إغلاق الملف أو تبديل المريض أو المنشأة.

---

## ٣. بنية البيانات والعلاقات (Database Schema)

```sql
-- Enums
CREATE TYPE "FollowUpStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'MISSED');
CREATE TYPE "FollowUpSeverity" AS ENUM ('MILD', 'MODERATE', 'SEVERE');
CREATE TYPE "AdverseEventStatus" AS ENUM ('REPORTED', 'UNDER_EVALUATION', 'RESOLVED', 'ESCALATED');
CREATE TYPE "OutcomeMeasurementScale" AS ENUM ('CLINICAL_GLOBAL_IMPRESSION', 'PATIENT_SATISFACTION_5_POINT', 'VISUAL_ANALOG_SCALE_10', 'STRUCTURED_OBSERVATION');

-- Tables:
-- 1. ClinicalFollowUp
-- 2. FollowUpAssessment
-- 3. FollowUpAssessmentAmendment
-- 4. TreatmentOutcome
-- 5. AdverseEvent
```

---

## ٤. نقاط نهاية واجهة برمجة التطبيقات (API Endpoints)

| المسار | الطريقة | الوصف | الصلاحية المطلوبة |
|---|---|---|---|
| `/api/v1/clinics/:clinicId/clinical/follow-ups` | GET | استرجاع قائمة متابعات المريض | `clinical.follow-ups.read` |
| `/api/v1/clinics/:clinicId/clinical/follow-ups` | POST | جدولة متابعة سريرية جديدة | `clinical.follow-ups.create` |
| `/api/v1/clinics/:clinicId/clinical/follow-ups/:id` | GET | استرجاع تفاصيل المتابعة والتقييم | `clinical.follow-ups.read` |
| `/api/v1/clinics/:clinicId/clinical/follow-ups/:id/status` | PATCH | بدء المتابعة أو إلغاؤها | `clinical.follow-ups.update` |
| `/api/v1/clinics/:clinicId/clinical/follow-ups/:id/assess` | POST | اعتماد التقييم وتوقيعه رقمياً | `clinical.follow-ups.assess` |
| `/api/v1/clinics/:clinicId/clinical/assessments/:id/amend` | POST | إضافة تصويب موثق للتقييم | `clinical.follow-ups.amend` |
| `/api/v1/clinics/:clinicId/clinical/outcomes` | GET | استرجاع نتائج ومقاييس العلاج | `clinical.outcomes.read` |
| `/api/v1/clinics/:clinicId/clinical/outcomes` | POST | توثيق نتيجة سريرية جديدة | `clinical.outcomes.create` |
| `/api/v1/clinics/:clinicId/clinical/adverse-events` | GET | استرجاع سجل الآثار الجانبية | `clinical.adverse-events.read` |
| `/api/v1/clinics/:clinicId/clinical/adverse-events` | POST | الإبلاغ عن أثر جانبي جديد | `clinical.adverse-events.create` |
| `/api/v1/clinics/:clinicId/clinical/adverse-events/:id` | PATCH | تحديث مسار وحالة الأثر الجانبي | `clinical.adverse-events.update` |


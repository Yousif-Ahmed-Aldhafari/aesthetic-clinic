# Lamssa — المراقبة، تتبع الأخطاء والموثوقية (Monitoring, Error Tracking & Reliability)

تحدد هذه الوثيقة مواصفات المعمارية التشغيلية لنظام الرصد والمراقبة والموثوقية لمنصة **لمسة** (Lamssa)، بما يضمن استقرار الخدمة، وسرعة الاستجابة للحوادث، والامتثال الصارم لخصوصية البيانات وحوكمتها دون الاعتماد على خدمات خارجية مدفوعة أو تسريب أي بيانات شخصية أو سرية.

---

## 1. المبادئ المعمارية (Architectural Principles)

1. **الرصد الداخلي المجاني دون تبعيات خارجية (Zero-Dependency & Zero-Cost Observability)**:
   - جميع آليات التسجيل، والمقاييس، وتجميع الأخطاء، وإطلاق التنبيهات مدمجة ذاتيًا في المنصة بالاعتماد على مكتبات Node.js وNestJS الأصلية.
   - لا توجد تكاليف اشتراك شهرية أو اعتماد على خدمات سحابية مدفوعة لجمع المؤشرات الأساسية.

2. **عزل المقاييس وتعدد المستأجرين (Multi-Tenant Telemetry Isolation)**:
   - لا تتضمن المقاييس التشغيلية أي معلومات تكشف عن هويات المرضى أو أرقام الفواتير الخاصة بكل عيادة.
   - مسارات المقاييس (`/metrics`) والتشخيص (`/health/diagnostics`) محمية بالكامل ولا يمكن الوصول إليها من قبل العامة أو المستأجرين العاديين.

3. **الخصوصية والتطهير الاستباقي (Privacy-First Redaction by Design)**:
   - تلتزم جميع السجلات والمقاييس بقواعد تنقية استباقية صارمة تمنع وصول كلمات المرور، والرموز المشفرة، وبيانات البطاقات، والملفات الطبية، وعناوين IP الكاملة إلى مسارات التسجيل.

4. **فصل تتبع الأخطاء عن المزودين (Decoupled Error Tracking)**:
   - توفير خدمة `ErrorTrackerService` داخلية تقوم بحساب بصمات فريدة (Deterministic SHA-256 Fingerprints) للأخطاء مع تجريد المعاملات المتغيرة (مثل المعرفات العشوائية والأوقات).
   - دعم واجهة `ErrorReportingProvider` التي تتيح ربط أي مزود خارجي (مثل Sentry أو Datadog) مستقبلاً بمجرد تسجيل المزود دون تعديل كود الأعمال الأساسي.

---

## 2. مواصفات التسجيل الهيكلي (Structured JSON Logging Specification)

تعتمد المنصة صيغة **JSON أحادية السطر (Single-line JSON Lines)** لتسجيل الأحداث التشغيلية، بما يتيح معالجتها وفهرستها بسهولة عبر أدوات تجميع السجلات (مثل Vector، Fluentbit، Grafana Loki، أو Logstash).

### بنية حقل السجل الهيكلي:
```json
{
  "timestamp": "2026-10-28T00:30:15.123Z",
  "level": "info",
  "message": "POST /api/v1/auth/login 200 45ms",
  "requestId": "4532a51d-069a-494f-b78c-af9872899ca3",
  "correlationId": "4532a51d-069a-494f-b78c-af9872899ca3",
  "method": "POST",
  "path": "/api/v1/auth/login",
  "statusCode": 200,
  "durationMs": 45,
  "clinicId": null,
  "userId": "e3195247-05be-4a5c-b9a5-b092665947ae",
  "ip": "192.168.1.0/24",
  "metadata": {}
}
```

### قواعد حجب البيانات الحساسة وتطهير العناوين:
1. **حجب عناوين IP الشبكية (Network IP Masking)**:
   - شبكات IPv4: يتم استبدال البايت الأخير بصفر (`/24`)، مثل: `192.168.1.50` تتحول إلى `192.168.1.0/24`.
   - شبكات IPv6: يتم اقتطاع العنوان إلى أول 48 بت (`/48`)، مثل: `2001:db8:85a3:0:0:8a2e:370:7334` تتحول إلى `2001:db8:85a3::/48`.
   - العناوين المحلية: `127.0.0.1` و `::1` تسجل كـ `127.0.0.0/24`.

2. **تطهير ترويسات HTTP (Header Sanitization)**:
   - `authorization` -> `[REDACTED_AUTHORIZATION]`
   - `cookie` -> `[REDACTED_COOKIE]`
   - `set-cookie` -> `[REDACTED_SET_COOKIE]`
   - `x-csrf-token` -> `[REDACTED_CSRF_TOKEN]`
   - `x-metrics-key` أو أي مفتاح يحوي `secret`/`key` -> `[REDACTED_HEADER]`

3. **التنقية التكرارية للمدخلات والبيانات الطبية (Recursive PII/PHI Redaction)**:
   - يتم حجب الحقول الحساسة تلقائيًا في الكائنات العميقة والمصفوفات:
     `password`, `token`, `secret`, `cookie`, `credential`, `card`, `cvv`, `pan`, `iban`, `authorization`, `csrf`, `medical`, `diagnosis`, `clinical`, `symptom`, `prescription`, `treatment`, `nationalid`, `passport`, `totp`, `recoverycode`, `base32secret`, `encryptionkey`, `notes`, `history`.

---

## 3. مسارات المراقبة والفحص والتشخيص (Endpoints Directory)

| المسار | الطريقة | الصلاحية المطلوبة | الغرض |
|---|---|---|---|
| `/api/v1/health` | `GET` | عام (بدون قيود) | فحص الحيوية الأساسي لـ Kubernetes / موازن الحمل، يرجع `{ "status": "ok" }` |
| `/api/v1/health/live` | `GET` | عام | فحص الحيوية ومطابقة مواصفات Liveness Probe |
| `/api/v1/health/ready` | `GET` | عام | فحص الجاهزية (Readiness Probe). يرجع `200 { "status": "ready" }` عند جاهزية DB، و `503` عند انقطاعها |
| `/api/v1/metrics` | `GET` | محمية (`PLATFORM_ADMIN` أو `X-Metrics-Key`) | مقاييس الأداء التشغيلي (JSON أو صيغة Prometheus التلقائية) |
| `/api/v1/health/diagnostics` | `GET` | محمية (`PLATFORM_ADMIN` أو `CLINIC_ADMIN`) | تشخيص شامل (المقاييس + التنبيهات النشطة + مجموعات الأخطاء + آخر السجلات) |
| `/api/v1/alerts/active` | `GET` | محمية (`PLATFORM_ADMIN` أو `CLINIC_ADMIN`) | قائمة بالتنبيهات التشغيلية النشطة الحالية وقواعدها |

---

## 4. قاموس المقاييس وتكامل بروميثيوس (Prometheus Metrics Exposition)

توفر المنصة صيغة بروميثيوس المعيارية عبر مسار `GET /api/v1/metrics` عند طلب ترويسة `Accept: text/plain` أو إضافة استعلام `?format=prometheus`.

### المقاييس المتوفرة:
```text
# HELP lamssa_uptime_seconds Process uptime in seconds
# TYPE lamssa_uptime_seconds gauge
lamssa_uptime_seconds 3482

# HELP lamssa_http_requests_total Total number of HTTP requests by status class
# TYPE lamssa_http_requests_total counter
lamssa_http_requests_total{status_class="2xx"} 4520
lamssa_http_requests_total{status_class="3xx"} 12
lamssa_http_requests_total{status_class="4xx"} 84
lamssa_http_requests_total{status_class="5xx"} 2

# HELP lamssa_http_requests_active Current active in-flight requests
# TYPE lamssa_http_requests_active gauge
lamssa_http_requests_active 3

# HELP lamssa_http_request_duration_ms HTTP request latency percentiles in milliseconds
# TYPE lamssa_http_request_duration_ms summary
lamssa_http_request_duration_ms{quantile="0.5"} 18.2
lamssa_http_request_duration_ms{quantile="0.95"} 64.5
lamssa_http_request_duration_ms{quantile="0.99"} 142.1
lamssa_http_request_duration_ms{quantile="1.0"} 290.0

# HELP lamssa_auth_failed_logins_total Total number of failed login attempts
# TYPE lamssa_auth_failed_logins_total counter
lamssa_auth_failed_logins_total 14

# HELP lamssa_database_up Status of main PostgreSQL database connection (1=healthy, 0=unhealthy)
# TYPE lamssa_database_up gauge
lamssa_database_up 1

# HELP lamssa_database_ping_latency_ms Database health check ping latency in milliseconds
# TYPE lamssa_database_ping_latency_ms gauge
lamssa_database_ping_latency_ms 3.4

# HELP lamssa_backup_age_hours Hours elapsed since last verified encrypted backup
# TYPE lamssa_backup_age_hours gauge
lamssa_backup_age_hours 4.2

# HELP lamssa_backup_status Status of last backup operation (1=success, 0=failed/unknown)
# TYPE lamssa_backup_status gauge
lamssa_backup_status 1
```

### نموذج إعداد المسح لـ Prometheus (`prometheus.yml`):
```yaml
scrape_configs:
  - job_name: 'lamssa-api'
    scrape_interval: 15s
    metrics_path: '/api/v1/metrics'
    params:
      format: ['prometheus']
    headers:
      X-Metrics-Key: '${METRICS_SECRET_KEY}'
    static_configs:
      - targets: ['api.lamssa.internal:3000']
```

---

## 5. كتالوج التنبيهات وقواعد الكشف (Actionable Alerting Catalog)

يقوم محرك `AlertingService` بتقييم المؤشرات التشغيلية بصورة دورية، مع تطبيق قاعدة **منع التكرار (Deduplication) وفترة التهدئة (15-Minute Cooldown)** لضمان عدم إغراق قنوات التنبيه.

| معرف التنبيه (`ruleId`) | درجة الخطورة | شرط الإطلاق | المعنى التشغيلي |
|---|---|---|---|
| `DATABASE_DOWN` | `critical` | فشل الاتصال بقاعدة البيانات في فحص الجاهزية | انقطاع الاتصال بقاعدة بيانات PostgreSQL الرئيسية أو نفاد تجمع الاتصالات. |
| `HIGH_5XX_ERROR_RATE` | `critical` | تسجيل >= 10 أخطاء من فئة 5xx خلال الجلسة | ارتفاع معدل أخطاء الخادم الداخلية غير المعالجة، مما يستوجب فحص مجموعات الأخطاء. |
| `BACKUP_STALE` | `warning` | عمر آخر نسخة احتياطية ناجحة > 24 ساعة | توقف وظيفة النسخ الاحتياطي التلقائي أو تجاوز المدة المسموح بها للـ RPO. |
| `BACKUP_FAILED` | `critical` | تسجيل فشل في عملية النسخ أو اختبار الاستعادة الأخير | تعذّر إتمام النسخ المشفر، أو فشل فحص سلامة التشفير في تدريب الاستعادة. |
| `AUTH_BRUTE_FORCE_SPIKE` | `warning` | تسجيل >= 30 محاولة دخول أو تحقق ثنائي فاشلة | رصد هجوم تخمين لكلمات المرور أو رموز التحقق الثنائي ضد خوادم المصادقة. |

---

## 6. أدلة الاستجابة للحوادث ومستهدفات الموثوقية (Runbooks & Target SLOs)

### مستهدفات اتفاقية مستوى الخدمة (Target SLOs):
- **التوافر الشهري (Availability)**: 99.9% (ميزانية الخطأ: 43.8 دقيقة شهريًا).
- **زمن الاستجابة (Latency)**: p95 < 200ms لكافة العمليات التفاعلية.
- **نقطة التعافي من الكوارث (RPO)**: <= 24 ساعة (مع إجراء نسخ يومي مشفر).
- **زمن التعافي من الكوارث (RTO)**: <= 1 ساعة (استعادة مؤكدة عبر سيناريو `restore-database.mjs`).

### أدلة الإجراءات السريعة (Incident Playbooks):

#### 1. دليل انقطاع الاتصال بقاعدة البيانات (`DATABASE_DOWN`):
1. التحقق من حالة خادم PostgreSQL:
   ```bash
   sudo systemctl status postgresql
   ```
2. فحص عدد الاتصالات النشطة والتجمع:
   ```sql
   SELECT count(*), state FROM pg_stat_activity GROUP BY state;
   ```
3. فحص مساحة القرص الصلب لمحرك التخزين `/var/lib/postgresql`:
   ```bash
   df -h /var/lib/postgresql
   ```
4. إعادة تشغيل الخدمة أو تحرير الاتصالات العالقة إذا لزم الأمر.

#### 2. دليل تصاعد أخطاء الخادم الداخلية (`HIGH_5XX_ERROR_RATE`):
1. طلب تقرير التشخيص السريع عبر واجهة الإدارة أو واجهة برمجة التطبيقات:
   ```bash
   curl -H "X-Metrics-Key: $METRICS_SECRET_KEY" http://127.0.0.1:3000/api/v1/health/diagnostics
   ```
2. مراجعة `errorGroups` لتحديد بصمة الخطأ (`fingerprint`) والمسار المتأثر.
3. مراجعة السجلات الهيكلية الحديثة برمز التتبع (`correlationId`) المذكور في تقرير الخطأ.
4. اتخاذ قرار بالتراجع السريع (Rollback) في حال ارتباط الخطأ بتحديث برمجي حديث.

#### 3. دليل تعطل النسخ الاحتياطي (`BACKUP_STALE` أو `BACKUP_FAILED`):
1. فحص مساحة المجلد `/var/backups` وصلاحيات كتابة المستخدم المخصص.
2. التحقق من صلاحية مفتاح تشفير النسخ الاحتياطية وتوفر أداة `pg_dump`.
3. تنفيذ تجربة نسخ يدوية فورية والتحقق من المخرجات:
   ```bash
   node scripts/backup-database.mjs
   ```
4. تنفيذ تدريب الاستعادة المعزول للتحقق من سلامة الأرشيف:
   ```bash
   node scripts/restore-database.mjs --drill
   ```

---

## 7. واجهة معالجة الأخطاء في الواجهة الأمامية (Arabic RTL Error Boundary)

لضمان عدم انهيار تجربة المستخدم عند حدوث خطأ غير متوقع في واجهة React، تم تزويد الواجهة الأمامية بمكون `ErrorBoundary`:
- **تصميم عربي أصيل (Native RTL)**: واجهة رسومية أنيقة متسقة مع نظام تصميم لمسة.
- **رمز تتبع الحادثة (`correlationId`)**: توليد رمز مرجعي فريد (مثل `ERR-XXXXXX`) يظهر للمستخدم لتقديمه للدعم الفني.
- **أزرار استعادة آمنة**: زر "إعادة المحاولة" لإعادة تحميل الشجرة المتأثرة، وزر "العودة للرئيسية" لمسح الحالة غير المتسقة.
- **منع تسريب الاستثناءات**: حجب نصوص الأخطاء التقنية المباشرة وتفاصيل الـ Stack Trace عن شاشات المستخدمين.

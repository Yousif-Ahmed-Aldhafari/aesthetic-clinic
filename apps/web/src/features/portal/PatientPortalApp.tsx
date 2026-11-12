import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { brandStyle, useDocumentIdentity } from '../settings/branding';
import {
  activatePatientAccount,
  bookPatientAppointment,
  cancelPatientAppointment,
  createPatientCheckIn,
  fetchAvailability,
  fetchBookableDoctors,
  fetchBookableServices,
  fetchPatientAppointments,
  fetchPatientCheckIns,
  fetchPatientConsents,
  fetchPatientFollowUps,
  fetchPatientProfile,
  fetchPublicClinic,
  patientLogin,
  patientLogout,
  refusePatientConsent,
  requestPasswordReset,
  reschedulePatientAppointment,
  resetPassword,
  signPatientConsent,
  submitPatientOutcome,
  withdrawPatientConsent,
  type BookableDoctor,
  type BookableService,
  type PatientUser,
  type PortalAppointment,
  type PortalConsent,
  type PortalFollowUp,
  type PortalRecoveryCheckIn,
  type PublicClinic,
  type TimeSlot,
} from './portal-api';
import './portal.css';

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getClinicSlugFromPath(): string {
  const match = /^\/portal\/([a-z0-9][a-z0-9-]{0,62})\/?$/.exec(window.location.pathname);
  if (match) return match[1];
  const params = new URLSearchParams(window.location.search);
  const qSlug = params.get('clinic');
  if (qSlug && /^[a-z0-9][a-z0-9-]{0,62}$/.test(qSlug)) return qSlug;
  return 'derma-glow';
}

function getTokenFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('token') || '';
}

const COMMON_SYMPTOMS = [
  { key: 'mild_swelling', label: 'تورم خفيف أو متوسط', redFlag: false },
  { key: 'mild_redness', label: 'احمرار موضعي خفيف', redFlag: false },
  { key: 'mild_bruising', label: 'كدمات طفيفة', redFlag: false },
  { key: 'severe_pain', label: 'ألم شديد لا يستجيب للمسكنات', redFlag: true },
  { key: 'fever', label: 'ارتفاع في درجة الحرارة (حمى)', redFlag: true },
  { key: 'continuous_bleeding', label: 'نزيف مستمر لا يتوقف', redFlag: true },
  { key: 'skin_blanching', label: 'شحوب أو ابيضاض مفاجئ بالجلد', redFlag: true },
  { key: 'vision_changes', label: 'تغيرات في الرؤية أو تشوش مفاجئ', redFlag: true },
  { key: 'shortness_of_breath', label: 'صعوبة أو ضيق في التنفس', redFlag: true },
];

export function PatientPortalApp({ initialSlug }: { initialSlug?: string }) {
  const slug = initialSlug || getClinicSlugFromPath();
  const [clinic, setClinic] = useState<PublicClinic | null>(null);
  const [patient, setPatient] = useState<PatientUser | null>(null);
  const [csrfToken, setCsrfToken] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'appointments' | 'book' | 'consents' | 'recovery' | 'profile'>('appointments');
  const [authView, setAuthView] = useState<'login' | 'activate' | 'forgot'>(getTokenFromUrl() ? 'activate' : 'login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>('');
  const [successNotice, setSuccessNotice] = useState<string>('');

  // Auth form states
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [actToken, setActToken] = useState(getTokenFromUrl());
  const [actPhone, setActPhone] = useState('');
  const [actDob, setActDob] = useState('');
  const [actPassword, setActPassword] = useState('');
  const [actConfirmPassword, setActConfirmPassword] = useState('');

  const [forgotPhone, setForgotPhone] = useState('');
  const [forgotDob, setForgotDob] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Appointments state
  const [appointments, setAppointments] = useState<PortalAppointment[]>([]);
  const [selectedAppt, setSelectedAppt] = useState<PortalAppointment | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // Booking state
  const [services, setServices] = useState<BookableService[]>([]);
  const [doctors, setDoctors] = useState<BookableDoctor[]>([]);
  const [bookingService, setBookingService] = useState<BookableService | null>(null);
  const [bookingDoctor, setBookingDoctor] = useState<BookableDoctor | null>(null);
  const [bookingDate, setBookingDate] = useState<string>(() => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return tomorrow.toISOString().slice(0, 10);
  });
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [bookingStep, setBookingStep] = useState<1 | 2 | 3 | 4>(1);

  // Consents state (Step 5.2)
  const [consents, setConsents] = useState<PortalConsent[]>([]);
  const [selectedConsent, setSelectedConsent] = useState<PortalConsent | null>(null);
  const [viewConsentModal, setViewConsentModal] = useState(false);
  const [signModal, setSignModal] = useState(false);
  const [refuseModal, setRefuseModal] = useState(false);
  const [withdrawModal, setWithdrawModal] = useState(false);
  const [refuseReason, setRefuseReason] = useState('');
  const [withdrawReason, setWithdrawReason] = useState('');
  const [signatureMode, setSignatureMode] = useState<'DRAWN_BASE64' | 'TYPED_CONFIRMATION'>('TYPED_CONFIRMATION');
  const [typedName, setTypedName] = useState('');
  const [canvasDrawing, setCanvasDrawing] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Recovery & Outcomes state (Step 5.2)
  const [followUps, setFollowUps] = useState<PortalFollowUp[]>([]);
  const [checkIns, setCheckIns] = useState<PortalRecoveryCheckIn[]>([]);
  const [selectedFollowUpId, setSelectedFollowUpId] = useState<string>('');
  const [painScore, setPainScore] = useState<number>(0);
  const [selectedSymptoms, setSelectedSymptoms] = useState<Record<string, boolean>>({});
  const [recoveryNotes, setRecoveryNotes] = useState<string>('');
  const [emergencyAlert, setEmergencyAlert] = useState<string | null>(null);
  const [outcomeScore, setOutcomeScore] = useState<number>(5);
  const [outcomeNotes, setOutcomeNotes] = useState<string>('');

  useDocumentIdentity(clinic);

  // Load clinic information on start
  useEffect(() => {
    let active = true;
    fetchPublicClinic(slug)
      .then((data) => {
        if (active) setClinic(data);
      })
      .catch(() => {
        if (active) setError('تعذّر تحميل بيانات العيادة. يرجى التأكد من صحة الرابط.');
      });
    return () => {
      active = false;
    };
  }, [slug]);

  // Check if session is already active
  useEffect(() => {
    let active = true;
    fetchPatientProfile()
      .then((res) => {
        if (active) {
          setPatient(res.patient);
          if (res.clinic) setClinic(res.clinic);
        }
      })
      .catch(() => {
        // Not logged in or expired cookie
      });
    return () => {
      active = false;
    };
  }, []);

  const reloadAppointments = useCallback(() => {
    if (!patient) return;
    fetchPatientAppointments()
      .then((data) => setAppointments(data.appointments))
      .catch(() => {});
  }, [patient]);

  const reloadConsents = useCallback(() => {
    if (!patient) return;
    fetchPatientConsents()
      .then((data) => setConsents(data))
      .catch(() => {});
  }, [patient]);

  const reloadRecovery = useCallback(() => {
    if (!patient) return;
    fetchPatientFollowUps().then(setFollowUps).catch(() => {});
    fetchPatientCheckIns().then(setCheckIns).catch(() => {});
  }, [patient]);

  useEffect(() => {
    if (patient) {
      reloadAppointments();
      reloadConsents();
      reloadRecovery();
    }
  }, [patient, reloadAppointments, reloadConsents, reloadRecovery]);

  // Load services and doctors when booking tab is chosen
  useEffect(() => {
    if (activeTab === 'book' && patient) {
      fetchBookableServices().then(setServices).catch(() => {});
      fetchBookableDoctors().then(setDoctors).catch(() => {});
    }
  }, [activeTab, patient]);

  // Load slots when service, doctor, or date changes
  useEffect(() => {
    if (bookingService && bookingDate && activeTab === 'book') {
      setSelectedSlot(null);
      fetchAvailability({
        date: bookingDate,
        serviceId: bookingService.id,
        doctorResourceId: bookingDoctor?.id,
      })
        .then((res) => setSlots(res.slots))
        .catch(() => setSlots([]));
    }
  }, [bookingService, bookingDoctor, bookingDate, activeTab]);

  // Handlers
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await patientLogin({
        clinicSlug: slug,
        phone: loginPhone,
        password: loginPassword,
      });
      setPatient(res.patient);
      setCsrfToken(res.csrfToken);
      setLoginPassword('');
    } catch (err: any) {
      setError(err?.message || 'تعذّر تسجيل الدخول. يرجى التحقق من صحة رقم الهاتف وكلمة المرور.');
    } finally {
      setBusy(false);
    }
  }

  async function handleActivate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (actPassword !== actConfirmPassword) {
      setError('كلمتا المرور غير متطابقتين.');
      return;
    }
    if (actPassword.length < 8) {
      setError('يجب ألا تقل كلمة المرور عن 8 أحرف.');
      return;
    }
    setBusy(true);
    try {
      const res = await activatePatientAccount({
        clinicSlug: slug,
        token: actToken.trim(),
        phone: actPhone.trim(),
        dateOfBirth: actDob,
        password: actPassword,
      });
      setPatient(res.patient);
      setCsrfToken(res.csrfToken);
      setSuccessNotice('تم تفعيل حسابك بنجاح! مرحبًا بك في بوابة المريض.');
    } catch (err: any) {
      setError(err?.message || 'تعذّر تفعيل الحساب. يرجى التأكد من صحة رمز التفعيل وتطابق تاريخ الميلاد ورقم الهاتف.');
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await requestPasswordReset({
        clinicSlug: slug,
        phone: forgotPhone.trim(),
        dateOfBirth: forgotDob,
      });
      if (res.testToken) {
        setResetToken(res.testToken);
      }
      setSuccessNotice('تم إرسال تعليمات استعادة كلمة المرور إذا كانت البيانات متطابقة.');
    } catch (err: any) {
      setError(err?.message || 'تعذّر طلب الاستعادة.');
    } finally {
      setBusy(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await resetPassword({
        clinicSlug: slug,
        token: resetToken.trim(),
        newPassword,
      });
      setSuccessNotice('تم تغيير كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول.');
      setAuthView('login');
      setResetToken('');
      setNewPassword('');
    } catch (err: any) {
      setError(err?.message || 'تعذّر إعادة تعيين كلمة المرور. الرمز غير صالح أو منتهي الصلاحية.');
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    try {
      await patientLogout(csrfToken);
    } finally {
      setPatient(null);
      setCsrfToken('');
      setBusy(false);
    }
  }

  async function handleBook() {
    if (!bookingService || !bookingDoctor || !selectedSlot) return;
    setError('');
    setBusy(true);
    try {
      await bookPatientAppointment(
        {
          serviceId: bookingService.id,
          doctorResourceId: bookingDoctor.id,
          startLocal: selectedSlot.startLocal,
          disambiguation: selectedSlot.disambiguation,
          bookingKey: generateUuid(),
        },
        csrfToken,
      );
      setSuccessNotice('تم حجز موعدك بنجاح!');
      setActiveTab('appointments');
      setBookingStep(1);
      setBookingService(null);
      setBookingDoctor(null);
      setSelectedSlot(null);
      reloadAppointments();
    } catch (err: any) {
      setError(err?.message || 'تعذّر تأكيد الحجز. قد يكون الموعد قد حُجز مسبقًا، يرجى اختيار وقت آخر.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelConfirm() {
    if (!selectedAppt) return;
    setBusy(true);
    setError('');
    try {
      await cancelPatientAppointment(
        selectedAppt.id,
        {
          expectedVersion: selectedAppt.version,
          reason: cancelReason || undefined,
        },
        csrfToken,
      );
      setShowCancelModal(false);
      setSelectedAppt(null);
      setCancelReason('');
      reloadAppointments();
    } catch (err: any) {
      setError(err?.message || 'تعذّر إلغاء الموعد.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRescheduleConfirm() {
    if (!selectedAppt || !selectedSlot) return;
    setBusy(true);
    setError('');
    try {
      await reschedulePatientAppointment(
        selectedAppt.id,
        {
          expectedVersion: selectedAppt.version,
          serviceId: selectedAppt.service.id,
          doctorResourceId: selectedAppt.doctor.id,
          startLocal: selectedSlot.startLocal,
          disambiguation: selectedSlot.disambiguation,
        },
        csrfToken,
      );
      setShowRescheduleModal(false);
      setSelectedAppt(null);
      setSelectedSlot(null);
      reloadAppointments();
    } catch (err: any) {
      setError(err?.message || 'تعذّر تغيير الموعد.');
    } finally {
      setBusy(false);
    }
  }

  // --- Consent Handlers (Step 5.2) ---
  async function handleSignConsentConfirm() {
    if (!selectedConsent) return;
    const signatureData = signatureMode === 'DRAWN_BASE64' ? canvasDrawing : typedName.trim();
    if (!signatureData) {
      setError(signatureMode === 'DRAWN_BASE64' ? 'يرجى رسم التوقيع أولاً' : 'يرجى كتابة الاسم الكامل كتأكيد');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await signPatientConsent(
        selectedConsent.id,
        {
          expectedVersion: selectedConsent.version,
          signerCapacity: 'PATIENT',
          signatureType: signatureMode,
          signatureData,
        },
        csrfToken,
      );
      setSuccessNotice('تم توقيع إقرار الموافقة بنجاح! سينتقل الإقرار للمراجعة الطبية للتحقق.');
      setSignModal(false);
      setSelectedConsent(null);
      setTypedName('');
      setCanvasDrawing('');
      reloadConsents();
    } catch (err: any) {
      setError(err?.message || 'تعذّر توقيع الإقرار.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRefuseConsentConfirm() {
    if (!selectedConsent || !refuseReason.trim()) {
      setError('يرجى ذكر سبب رفض الإقرار');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await refusePatientConsent(
        selectedConsent.id,
        {
          expectedVersion: selectedConsent.version,
          reason: refuseReason.trim(),
        },
        csrfToken,
      );
      setSuccessNotice('تم تسجيل رفض الإقرار وإشعار الطاقم الطبي.');
      setRefuseModal(false);
      setSelectedConsent(null);
      setRefuseReason('');
      reloadConsents();
    } catch (err: any) {
      setError(err?.message || 'تعذّر تسجيل الرفض.');
    } finally {
      setBusy(false);
    }
  }

  async function handleWithdrawConsentConfirm() {
    if (!selectedConsent || !withdrawReason.trim()) {
      setError('يرجى ذكر سبب سحب الموافقة');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await withdrawPatientConsent(
        selectedConsent.id,
        {
          expectedVersion: selectedConsent.version,
          reason: withdrawReason.trim(),
        },
        csrfToken,
      );
      setSuccessNotice('تم سحب الموافقة رسميًا وإلغاء صلاحية الإجراء.');
      setWithdrawModal(false);
      setSelectedConsent(null);
      setWithdrawReason('');
      reloadConsents();
    } catch (err: any) {
      setError(err?.message || 'تعذّر سحب الموافقة.');
    } finally {
      setBusy(false);
    }
  }

  // --- Recovery Check-In Handlers (Step 5.2) ---
  async function handleSubmitCheckIn(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setEmergencyAlert(null);
    setBusy(true);
    try {
      const res = await createPatientCheckIn(
        {
          followUpId: selectedFollowUpId || undefined,
          painScore,
          symptoms: selectedSymptoms,
          recoveryNotes: recoveryNotes.trim() || undefined,
        },
        csrfToken,
      );
      if (res.emergencyNotice) {
        setEmergencyAlert(res.emergencyNotice);
      } else {
        setSuccessNotice('تم تسجيل تقرير المتابعة وحالتك مستقرة. شكرًا لتعاونك!');
      }
      setPainScore(0);
      setSelectedSymptoms({});
      setRecoveryNotes('');
      reloadRecovery();
    } catch (err: any) {
      setError(err?.message || 'تعذّر إرسال تقرير المتابعة.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitOutcome(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await submitPatientOutcome(
        {
          measurementScale: 'PATIENT_SATISFACTION_5PT',
          score: outcomeScore,
          notes: outcomeNotes.trim() || undefined,
        },
        csrfToken,
      );
      setSuccessNotice('شكرًا لتقييمك! تم حفظ تقييم النتيجة السريرية بنجاح.');
      setOutcomeNotes('');
      reloadRecovery();
    } catch (err: any) {
      setError(err?.message || 'تعذّر حفظ التقييم.');
    } finally {
      setBusy(false);
    }
  }

  // Canvas drawing handlers
  function startDrawing(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1E293B';
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  }

  function draw(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  }

  function stopDrawing() {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      setCanvasDrawing(canvas.toDataURL('image/png'));
    }
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setCanvasDrawing('');
    }
  }

  const upcomingAppointments = useMemo(
    () => appointments.filter((a) => ['SCHEDULED', 'CONFIRMED'].includes(a.status)),
    [appointments],
  );
  const pastAppointments = useMemo(
    () => appointments.filter((a) => !['SCHEDULED', 'CONFIRMED'].includes(a.status)),
    [appointments],
  );

  return (
    <div className="patient-portal-container" style={brandStyle(clinic?.branding ?? null)} dir="rtl">
      {/* Top Clinic Branding Header */}
      <header className="portal-header">
        <div className="portal-brand">
          {clinic?.branding?.logoUrl ? (
            <img src={clinic.branding.logoUrl} alt={clinic.displayName} />
          ) : (
            <div className="portal-brand-text">
              <h1>{clinic?.displayName || 'بوابة المريض'}</h1>
              <p>الرعاية التجميلية الذاتية والخدمات المتميزة</p>
            </div>
          )}
        </div>
        {patient && (
          <div className="portal-user-badge">
            <div className="portal-user-details">
              <strong>{patient.fullName}</strong>
              <small>رقم الملف: {patient.patientNumber}</small>
            </div>
            <button className="portal-logout-btn" onClick={handleLogout} disabled={busy}>
              تسجيل الخروج
            </button>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="portal-content">
        {error && <div className="portal-error-banner" role="alert">{error}</div>}
        {successNotice && <div className="portal-success-banner" role="status">{successNotice}</div>}

        {!patient ? (
          /* Unauthenticated Views: Login / Activation / Reset */
          <div className="portal-auth-card">
            <div className="portal-auth-header">
              <h2>{clinic?.displayName || 'عيادة لمسة'}</h2>
              <p style={{ color: '#64748B', fontSize: '0.9rem', margin: 0 }}>
                مرحبًا بك في بوابة المريض الذاتية
              </p>
            </div>

            <div className="portal-auth-tabs">
              <button
                className={`portal-auth-tab ${authView === 'login' ? 'active' : ''}`}
                onClick={() => { setAuthView('login'); setError(''); }}
              >
                تسجيل الدخول
              </button>
              <button
                className={`portal-auth-tab ${authView === 'activate' ? 'active' : ''}`}
                onClick={() => { setAuthView('activate'); setError(''); }}
              >
                تفعيل الحساب
              </button>
              <button
                className={`portal-auth-tab ${authView === 'forgot' ? 'active' : ''}`}
                onClick={() => { setAuthView('forgot'); setError(''); }}
              >
                استعادة الرمز
              </button>
            </div>

            {authView === 'login' && (
              <form onSubmit={handleLogin}>
                <div className="portal-form-group">
                  <label htmlFor="portal-login-phone">رقم الهاتف المسجل</label>
                  <input
                    id="portal-login-phone"
                    type="tel"
                    dir="ltr"
                    placeholder="+967700000000"
                    value={loginPhone}
                    onChange={(e) => setLoginPhone(e.target.value)}
                    required
                  />
                </div>
                <div className="portal-form-group">
                  <label htmlFor="portal-login-pass">كلمة المرور</label>
                  <input
                    id="portal-login-pass"
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="portal-submit-btn" disabled={busy}>
                  {busy ? 'جارٍ تسجيل الدخول…' : 'دخول'}
                </button>
              </form>
            )}

            {authView === 'activate' && (
              <form onSubmit={handleActivate}>
                <div className="portal-form-group">
                  <label htmlFor="portal-act-token">رمز التفعيل (المستلم من العيادة)</label>
                  <input
                    id="portal-act-token"
                    type="text"
                    dir="ltr"
                    placeholder="رمز التفعيل المكون من أحرف وأرقام"
                    value={actToken}
                    onChange={(e) => setActToken(e.target.value)}
                    required
                  />
                </div>
                <div className="portal-form-group">
                  <label htmlFor="portal-act-phone">رقم الهاتف للتأكيد</label>
                  <input
                    id="portal-act-phone"
                    type="tel"
                    dir="ltr"
                    placeholder="+967700000000"
                    value={actPhone}
                    onChange={(e) => setActPhone(e.target.value)}
                    required
                  />
                </div>
                <div className="portal-form-group">
                  <label htmlFor="portal-act-dob">تاريخ الميلاد للتحقق</label>
                  <input
                    id="portal-act-dob"
                    type="date"
                    value={actDob}
                    onChange={(e) => setActDob(e.target.value)}
                    required
                  />
                </div>
                <div className="portal-form-group">
                  <label htmlFor="portal-act-pass">إنشاء كلمة المرور (8 أحرف على الأقل)</label>
                  <input
                    id="portal-act-pass"
                    type="password"
                    value={actPassword}
                    onChange={(e) => setActPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="portal-form-group">
                  <label htmlFor="portal-act-conf">تأكيد كلمة المرور</label>
                  <input
                    id="portal-act-conf"
                    type="password"
                    value={actConfirmPassword}
                    onChange={(e) => setActConfirmPassword(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="portal-submit-btn" disabled={busy}>
                  {busy ? 'جارٍ تفعيل الحساب…' : 'تفعيل الحساب والدخول'}
                </button>
              </form>
            )}

            {authView === 'forgot' && (
              <div>
                {!resetToken ? (
                  <form onSubmit={handleForgotPassword}>
                    <div className="portal-form-group">
                      <label htmlFor="portal-forgot-phone">رقم الهاتف</label>
                      <input
                        id="portal-forgot-phone"
                        type="tel"
                        dir="ltr"
                        placeholder="+967700000000"
                        value={forgotPhone}
                        onChange={(e) => setForgotPhone(e.target.value)}
                        required
                      />
                    </div>
                    <div className="portal-form-group">
                      <label htmlFor="portal-forgot-dob">تاريخ الميلاد</label>
                      <input
                        id="portal-forgot-dob"
                        type="date"
                        value={forgotDob}
                        onChange={(e) => setForgotDob(e.target.value)}
                        required
                      />
                    </div>
                    <button type="submit" className="portal-submit-btn" disabled={busy}>
                      {busy ? 'جارٍ المعالجة…' : 'طلب رمز الاستعادة'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleResetPassword}>
                    <div className="portal-form-group">
                      <label htmlFor="portal-reset-tok">رمز الاستعادة</label>
                      <input
                        id="portal-reset-tok"
                        type="text"
                        dir="ltr"
                        value={resetToken}
                        onChange={(e) => setResetToken(e.target.value)}
                        required
                      />
                    </div>
                    <div className="portal-form-group">
                      <label htmlFor="portal-reset-newpass">كلمة المرور الجديدة</label>
                      <input
                        id="portal-reset-newpass"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                      />
                    </div>
                    <button type="submit" className="portal-submit-btn" disabled={busy}>
                      {busy ? 'جارٍ تغيير كلمة المرور…' : 'تعيين كلمة المرور الجديدة'}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Authenticated Dashboard */
          <div>
            {/* Navigation Tabs */}
            <nav className="portal-nav">
              <button
                className={`portal-nav-btn ${activeTab === 'appointments' ? 'active' : ''}`}
                onClick={() => { setActiveTab('appointments'); setSuccessNotice(''); }}
              >
                <span>▣</span> مواعيدي
              </button>
              <button
                className={`portal-nav-btn ${activeTab === 'book' ? 'active' : ''}`}
                onClick={() => { setActiveTab('book'); setSuccessNotice(''); }}
              >
                <span>➕</span> حجز موعد جديد
              </button>
              <button
                className={`portal-nav-btn ${activeTab === 'consents' ? 'active' : ''}`}
                onClick={() => { setActiveTab('consents'); setSuccessNotice(''); reloadConsents(); }}
              >
                <span>📝</span> إقرارات الموافقة ({consents.filter((c) => c.status === 'DRAFT').length})
              </button>
              <button
                className={`portal-nav-btn ${activeTab === 'recovery' ? 'active' : ''}`}
                onClick={() => { setActiveTab('recovery'); setSuccessNotice(''); reloadRecovery(); }}
              >
                <span>❤️‍🩹</span> المتابعة والتعافي
              </button>
              <button
                className={`portal-nav-btn ${activeTab === 'profile' ? 'active' : ''}`}
                onClick={() => { setActiveTab('profile'); setSuccessNotice(''); }}
              >
                <span>👤</span> الملف الشخصي
              </button>
            </nav>

            <div style={{ marginTop: '1.5rem' }}>
              {/* Tab 1: Appointments List */}
              {activeTab === 'appointments' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h2 style={{ margin: 0, fontSize: '1.3rem' }}>المواعيد القادمة</h2>
                    <button
                      className="portal-submit-btn"
                      style={{ width: 'auto', padding: '0.5rem 1rem', fontSize: '0.9rem', margin: 0 }}
                      onClick={() => setActiveTab('book')}
                    >
                      + حجز موعد جديد
                    </button>
                  </div>

                  {upcomingAppointments.length === 0 ? (
                    <div className="portal-card portal-empty-state">
                      <p>لا توجد لديك مواعيد قادمة مجدولة حاليًا.</p>
                      <button
                        className="portal-btn-secondary"
                        onClick={() => setActiveTab('book')}
                      >
                        احجز موعدك الأول الآن
                      </button>
                    </div>
                  ) : (
                    upcomingAppointments.map((appt) => (
                      <div key={appt.id} className="portal-card">
                        <div className="portal-card-header">
                          <h3>{appt.service.name}</h3>
                          <span className={`portal-status-badge status-${appt.status}`}>
                            {appt.status === 'SCHEDULED' ? 'مجدول' : 'مؤكد'}
                          </span>
                        </div>
                        <div className="portal-appt-grid">
                          <div className="portal-appt-item">
                            <label>الطبيب المعالج</label>
                            <strong>{appt.doctor.label}</strong>
                          </div>
                          <div className="portal-appt-item">
                            <label>تاريخ الموعد والوقت</label>
                            <strong dir="ltr">{appt.startLocal}</strong>
                          </div>
                          <div className="portal-appt-item">
                            <label>المدة المقدرة</label>
                            <strong>{appt.service.durationMinutes} دقيقة</strong>
                          </div>
                          {appt.room && (
                            <div className="portal-appt-item">
                              <label>الغرفة</label>
                              <strong>{appt.room.label}</strong>
                            </div>
                          )}
                        </div>
                        <div className="portal-appt-actions">
                          <button
                            className="portal-btn-secondary"
                            onClick={() => {
                              setSelectedAppt(appt);
                              setShowRescheduleModal(true);
                              setBookingDate(appt.startLocal.slice(0, 10));
                              fetchAvailability({
                                date: appt.startLocal.slice(0, 10),
                                serviceId: appt.service.id,
                                doctorResourceId: appt.doctor.id,
                              }).then((r) => setSlots(r.slots));
                            }}
                          >
                            تعديل الموعد
                          </button>
                          <button
                            className="portal-btn-danger"
                            onClick={() => {
                              setSelectedAppt(appt);
                              setShowCancelModal(true);
                            }}
                          >
                            إلغاء الموعد
                          </button>
                        </div>
                      </div>
                    ))
                  )}

                  {pastAppointments.length > 0 && (
                    <div style={{ marginTop: '2.5rem' }}>
                      <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: '#64748B' }}>
                        سجل المواعيد السابقة
                      </h2>
                      {pastAppointments.map((appt) => (
                        <div key={appt.id} className="portal-card" style={{ opacity: 0.85 }}>
                          <div className="portal-card-header">
                            <h3 style={{ fontSize: '1.05rem' }}>{appt.service.name}</h3>
                            <span className={`portal-status-badge status-${appt.status}`}>
                              {appt.status === 'COMPLETED'
                                ? 'مكتمل'
                                : appt.status === 'CANCELLED'
                                ? 'ملغي'
                                : appt.status === 'ARRIVED'
                                ? 'حضر'
                                : 'لم يحضر'}
                            </span>
                          </div>
                          <div className="portal-appt-grid">
                            <div className="portal-appt-item">
                              <label>الطبيب</label>
                              <span>{appt.doctor.label}</span>
                            </div>
                            <div className="portal-appt-item">
                              <label>التاريخ والوقت</label>
                              <span dir="ltr">{appt.startLocal}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Book Appointment Wizard */}
              {activeTab === 'book' && (
                <div className="portal-card">
                  <div className="portal-wizard-steps">
                    <div className={`portal-step ${bookingStep >= 1 ? 'active' : ''}`}>
                      <span className="portal-step-num">1</span> الخدمة
                    </div>
                    <div className={`portal-step ${bookingStep >= 2 ? 'active' : ''}`}>
                      <span className="portal-step-num">2</span> الطبيب
                    </div>
                    <div className={`portal-step ${bookingStep >= 3 ? 'active' : ''}`}>
                      <span className="portal-step-num">3</span> الموعد
                    </div>
                    <div className={`portal-step ${bookingStep >= 4 ? 'active' : ''}`}>
                      <span className="portal-step-num">4</span> التأكيد
                    </div>
                  </div>

                  {bookingStep === 1 && (
                    <div>
                      <h3 style={{ marginBottom: '1rem' }}>اختر الخدمة التجميلية المطلوبة</h3>
                      <div className="portal-service-grid">
                        {services.map((svc) => (
                          <div
                            key={svc.id}
                            className={`portal-service-card ${bookingService?.id === svc.id ? 'selected' : ''}`}
                            onClick={() => {
                              setBookingService(svc);
                              setBookingStep(2);
                            }}
                          >
                            <h4>{svc.name}</h4>
                            <p>المدة: {svc.durationMinutes} دقيقة</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {bookingStep === 2 && (
                    <div>
                      <h3 style={{ marginBottom: '1rem' }}>اختر الطبيب المعالج</h3>
                      <div className="portal-service-grid">
                        {doctors.map((doc) => (
                          <div
                            key={doc.id}
                            className={`portal-service-card ${bookingDoctor?.id === doc.id ? 'selected' : ''}`}
                            onClick={() => {
                              setBookingDoctor(doc);
                              setBookingStep(3);
                            }}
                          >
                            <h4>{doc.label}</h4>
                            <p>طبيب أخصائي معتمد</p>
                          </div>
                        ))}
                      </div>
                      <button
                        className="portal-btn-secondary"
                        style={{ marginTop: '1.25rem' }}
                        onClick={() => setBookingStep(1)}
                      >
                        ← الرجوع لاختيار الخدمة
                      </button>
                    </div>
                  )}

                  {bookingStep === 3 && (
                    <div>
                      <h3 style={{ marginBottom: '1rem' }}>حدد التاريخ والوقت المناسبين</h3>
                      <div className="portal-form-group" style={{ maxWidth: '300px' }}>
                        <label htmlFor="portal-book-date">تاريخ الحجز</label>
                        <input
                          id="portal-book-date"
                          type="date"
                          min={new Date().toISOString().slice(0, 10)}
                          value={bookingDate}
                          onChange={(e) => setBookingDate(e.target.value)}
                        />
                      </div>

                      <div style={{ marginTop: '1.5rem' }}>
                        <label style={{ fontWeight: 600, color: '#334155' }}>الأوقات المتاحة لهذا اليوم</label>
                        {slots.length === 0 ? (
                          <p style={{ color: '#64748B', marginTop: '0.5rem' }}>
                            لا توجد فترات متاحة في هذا التاريخ. يرجى اختيار تاريخ آخر.
                          </p>
                        ) : (
                          <div className="portal-slots-grid">
                            {slots.map((s) => (
                              <button
                                key={s.startAt}
                                type="button"
                                className={`portal-slot-btn ${selectedSlot?.startAt === s.startAt ? 'selected' : ''}`}
                                onClick={() => setSelectedSlot(s)}
                                dir="ltr"
                              >
                                {s.startLocal.slice(11, 16)}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '2rem' }}>
                        <button className="portal-btn-secondary" onClick={() => setBookingStep(2)}>
                          ← الرجوع لاختيار الطبيب
                        </button>
                        <button
                          className="portal-submit-btn"
                          style={{ width: 'auto', margin: 0 }}
                          disabled={!selectedSlot}
                          onClick={() => setBookingStep(4)}
                        >
                          المتابعة للتأكيد →
                        </button>
                      </div>
                    </div>
                  )}

                  {bookingStep === 4 && (
                    <div>
                      <h3 style={{ marginBottom: '1rem' }}>مراجعة وتأكيد الحجز</h3>
                      <div
                        style={{
                          background: '#F8FAFC',
                          border: '1px solid #E2E8F0',
                          borderRadius: '8px',
                          padding: '1.25rem',
                          marginBottom: '1.5rem',
                        }}
                      >
                        <div className="portal-appt-grid">
                          <div className="portal-appt-item">
                            <label>الخدمة</label>
                            <strong>{bookingService?.name}</strong>
                          </div>
                          <div className="portal-appt-item">
                            <label>الطبيب المعالج</label>
                            <strong>{bookingDoctor?.label}</strong>
                          </div>
                          <div className="portal-appt-item">
                            <label>التاريخ والوقت</label>
                            <strong dir="ltr">{selectedSlot?.startLocal}</strong>
                          </div>
                          <div className="portal-appt-item">
                            <label>المدة</label>
                            <strong>{bookingService?.durationMinutes} دقيقة</strong>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button className="portal-btn-secondary" onClick={() => setBookingStep(3)} disabled={busy}>
                          ← تعديل التاريخ أو الوقت
                        </button>
                        <button
                          className="portal-submit-btn"
                          style={{ width: 'auto', margin: 0 }}
                          onClick={handleBook}
                          disabled={busy}
                        >
                          {busy ? 'جارٍ تسجيل الحجز…' : 'تأكيد الحجز النهائي'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Patient Profile */}
              {activeTab === 'profile' && (
                <div className="portal-card">
                  <h3 style={{ borderBottom: '1px solid #F1F5F9', paddingBottom: '0.75rem', margin: '0 0 1.25rem' }}>
                    بيانات الملف الشخصي
                  </h3>
                  <div className="portal-appt-grid">
                    <div className="portal-appt-item">
                      <label>الاسم الكامل</label>
                      <strong>{patient.fullName}</strong>
                    </div>
                    <div className="portal-appt-item">
                      <label>رقم الملف الطبي</label>
                      <strong dir="ltr">{patient.patientNumber}</strong>
                    </div>
                    <div className="portal-appt-item">
                      <label>رقم الهاتف المعتمد</label>
                      <strong dir="ltr">{patient.phone}</strong>
                    </div>
                    <div className="portal-appt-item">
                      <label>البريد الإلكتروني</label>
                      <span>{patient.email || 'غير مسجل'}</span>
                    </div>
                    <div className="portal-appt-item">
                      <label>تاريخ الميلاد</label>
                      <span dir="ltr">{patient.dateOfBirth || 'غير مسجل'}</span>
                    </div>
                    <div className="portal-appt-item">
                      <label>الجنس</label>
                      <span>{patient.gender === 'FEMALE' ? 'أنثى' : patient.gender === 'MALE' ? 'ذكر' : 'غير محدد'}</span>
                    </div>
                  </div>

                  <div
                    style={{
                      background: '#EFF6FF',
                      border: '1px solid #BFDBFE',
                      color: '#1E40AF',
                      padding: '0.85rem',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      marginTop: '1.5rem',
                    }}
                  >
                    🔒 بياناتك الطبية والشخصية مشفرة ومحمية وفق أعلى معايير أمان الرعاية الصحية والعزل التام بين العيادات.
                  </div>
                </div>
              )}

              {/* Tab 4: Consent Self-Service (Step 5.2) */}
              {activeTab === 'consents' && (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '1rem',
                    }}
                  >
                    <div>
                      <h2 style={{ margin: 0, fontSize: '1.3rem' }}>إقرارات الموافقة الطبية والتوثيق</h2>
                      <p style={{ margin: '0.25rem 0 0', color: '#64748B', fontSize: '0.9rem' }}>
                        مراجعة نماذج الموافقة المستنيرة والتوقيع الإلكتروني الذاتي
                      </p>
                    </div>
                  </div>

                  {consents.length === 0 ? (
                    <div className="portal-card portal-empty-state">
                      <p>لا توجد إقرارات موافقة مطلوبة أو مسجلة حاليًا.</p>
                    </div>
                  ) : (
                    consents.map((c) => (
                      <div key={c.id} className="portal-card">
                        <div className="portal-card-header">
                          <div>
                            <h3>{c.templateVersion.titleAr}</h3>
                            <small style={{ color: '#64748B' }}>
                              الغرض:{' '}
                              {c.purpose === 'PROCEDURE'
                                ? 'إجراء تجميلي / علاجي'
                                : c.purpose === 'CLINICAL_PHOTOGRAPHY'
                                ? 'تصوير سريري للتوثيق الطبي'
                                : 'تصوير للنشر والتسويق'}
                              {c.procedureCatalog ? ` · الإجراء: ${c.procedureCatalog.nameAr}` : ''}
                            </small>
                          </div>
                          <span className={`portal-status-badge status-${c.status}`}>
                            {c.status === 'DRAFT'
                              ? 'بانتظار توقيعك'
                              : c.status === 'PENDING_VERIFICATION'
                              ? 'بانتظار التحقق الطبي'
                              : c.status === 'ACTIVE'
                              ? 'سارٍ ومعتمد'
                              : c.status === 'REFUSED'
                              ? 'مرفوض'
                              : c.status === 'WITHDRAWN'
                              ? 'مسحوب'
                              : 'منتهي الصلاحية'}
                          </span>
                        </div>

                        <div className="portal-appt-grid">
                          <div className="portal-appt-item">
                            <label>تاريخ الإنشاء</label>
                            <span dir="ltr">{c.createdAt.slice(0, 10)}</span>
                          </div>
                          <div className="portal-appt-item">
                            <label>حالة التوثيق</label>
                            <strong>
                              {c.signatureEvidence
                                ? `تم التوقيع (${c.signatureEvidence.signerCapacity === 'PATIENT' ? 'المريض ذاتيًا' : c.signatureEvidence.signerCapacity})`
                                : 'غير موقع'}
                            </strong>
                          </div>
                          {c.verifiedAt && (
                            <div className="portal-appt-item">
                              <label>تاريخ التحقق الطبي</label>
                              <span dir="ltr">{c.verifiedAt.slice(0, 10)}</span>
                            </div>
                          )}
                          {c.signatureEvidence?.evidenceHashSha256 && (
                            <div className="portal-appt-item" style={{ gridColumn: 'span 2' }}>
                              <label>البصمة الرقمية للتوثيق (SHA-256)</label>
                              <code
                                dir="ltr"
                                style={{ fontSize: '0.75rem', background: '#F1F5F9', padding: '2px 6px', borderRadius: 4 }}
                              >
                                {c.signatureEvidence.evidenceHashSha256}
                              </code>
                            </div>
                          )}
                        </div>

                        <div className="portal-appt-actions">
                          <button
                            className="portal-btn-secondary"
                            onClick={() => {
                              setSelectedConsent(c);
                              setViewConsentModal(true);
                            }}
                          >
                            عرض نص الإقرار والشروط
                          </button>

                          {c.status === 'DRAFT' && (
                            <>
                              <button
                                className="portal-submit-btn"
                                style={{ width: 'auto', margin: 0, padding: '0.45rem 1rem' }}
                                onClick={() => {
                                  setSelectedConsent(c);
                                  setSignModal(true);
                                  setTypedName(patient.fullName);
                                }}
                              >
                                توقيع الإقرار الآن
                              </button>
                              <button
                                className="portal-btn-danger"
                                onClick={() => {
                                  setSelectedConsent(c);
                                  setRefuseModal(true);
                                }}
                              >
                                رفض الإقرار
                              </button>
                            </>
                          )}

                          {c.status === 'ACTIVE' && (
                            <button
                              className="portal-btn-danger"
                              onClick={() => {
                                setSelectedConsent(c);
                                setWithdrawModal(true);
                              }}
                            >
                              سحب الموافقة
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Tab 5: Recovery Check-ins & Follow-up (Step 5.2) */}
              {activeTab === 'recovery' && (
                <div>
                  {emergencyAlert && (
                    <div
                      className="portal-alert portal-alert-emergency"
                      style={{
                        background: '#FEF2F2',
                        border: '2px solid #EF4444',
                        color: '#991B1B',
                        padding: '1.25rem',
                        borderRadius: '8px',
                        marginBottom: '1.5rem',
                      }}
                    >
                      <h4 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem' }}>🚨 تنبيه سريري طارئ</h4>
                      <p style={{ margin: 0, lineHeight: 1.6, fontSize: '0.95rem' }}>{emergencyAlert}</p>
                      {clinic?.contactPhone && (
                        <p style={{ marginTop: '0.75rem', fontWeight: 700 }}>
                          هاتف طوارئ العيادة:{' '}
                          <a href={`tel:${clinic.contactPhone}`} dir="ltr" style={{ color: '#DC2626' }}>
                            {clinic.contactPhone}
                          </a>
                        </p>
                      )}
                    </div>
                  )}

                  <div
                    className="portal-disclaimer-banner"
                    style={{
                      background: '#FFFBEB',
                      border: '1px solid #FCD34D',
                      color: '#92400E',
                      padding: '1rem',
                      borderRadius: '8px',
                      marginBottom: '1.25rem',
                      fontSize: '0.9rem',
                      lineHeight: 1.6,
                    }}
                  >
                    <strong>تنبيه طبي:</strong> هذا النموذج مخصص للمتابعة الذاتية الروتينية ولا يخضع للمراقبة الطبية الفورية على مدار الساعة. في حال حدوث أي طارئ حاد أو مضاعفات مهددة، يرجى عدم الانتظار والتوجه فوراً إلى أقرب قسم طوارئ أو الاتصال بالإسعاف.
                  </div>

                  <div className="portal-card">
                    <h3 style={{ borderBottom: '1px solid #F1F5F9', paddingBottom: '0.75rem', margin: '0 0 1.25rem' }}>
                      تسجيل تقرير المتابعة الذاتية والتعافي
                    </h3>
                    <form onSubmit={handleSubmitCheckIn}>
                      {followUps.length > 0 && (
                        <div className="portal-form-group">
                          <label htmlFor="portal-checkin-fu">جلسة المتابعة المرتبطة (اختياري)</label>
                          <select
                            id="portal-checkin-fu"
                            value={selectedFollowUpId}
                            onChange={(e) => setSelectedFollowUpId(e.target.value)}
                          >
                            <option value="">متابعة عامة / غير مرتبطة بموعد محدد</option>
                            {followUps.map((fu) => (
                              <option key={fu.id} value={fu.id}>
                                {fu.reason} — موعد المتابعة: {fu.scheduledDate.slice(0, 10)}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* VAS Pain Slider */}
                      <div className="portal-form-group">
                        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>مستوى الألم الحالي (مقياس 0 - 10)</span>
                          <strong
                            style={{
                              fontSize: '1.2rem',
                              color: painScore >= 8 ? '#DC2626' : painScore >= 5 ? '#D97706' : '#059669',
                            }}
                          >
                            {painScore} / 10
                          </strong>
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="10"
                          step="1"
                          value={painScore}
                          onChange={(e) => setPainScore(parseInt(e.target.value, 10))}
                          style={{ width: '100%', margin: '0.75rem 0' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748B' }}>
                          <span>0: لا يوجد ألم إطلاقًا</span>
                          <span>5: ألم متوسط</span>
                          <span style={{ color: '#DC2626', fontWeight: 600 }}>10: ألم شديد للغاية وغير محتمل</span>
                        </div>
                        {painScore >= 8 && (
                          <div
                            style={{
                              marginTop: '0.5rem',
                              color: '#DC2626',
                              fontSize: '0.85rem',
                              fontWeight: 600,
                              background: '#FEE2E2',
                              padding: '0.5rem',
                              borderRadius: '6px',
                            }}
                          >
                            ⚠️ تنبيه: الألم الشديد (8 فأكثر) يتطلب تقييمًا طبيًا عاجلاً وتصعيدًا تلقائيًا لفريق العيادة.
                          </div>
                        )}
                      </div>

                      {/* Symptoms checklist */}
                      <div className="portal-form-group">
                        <label>الأعراض الملاحظة (اختر كل ما ينطبق)</label>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                            gap: '0.65rem',
                            marginTop: '0.5rem',
                          }}
                        >
                          {COMMON_SYMPTOMS.map((sym) => (
                            <label
                              key={sym.key}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.6rem 0.75rem',
                                background: selectedSymptoms[sym.key]
                                  ? sym.redFlag
                                    ? '#FEE2E2'
                                    : '#EFF6FF'
                                  : '#F8FAFC',
                                border: `1px solid ${
                                  selectedSymptoms[sym.key]
                                    ? sym.redFlag
                                      ? '#FCA5A5'
                                      : '#BFDBFE'
                                    : '#E2E8F0'
                                }`,
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '0.88rem',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={Boolean(selectedSymptoms[sym.key])}
                                onChange={(e) =>
                                  setSelectedSymptoms({
                                    ...selectedSymptoms,
                                    [sym.key]: e.target.checked,
                                  })
                                }
                              />
                              <span>{sym.label}</span>
                              {sym.redFlag && (
                                <span
                                  style={{
                                    marginRight: 'auto',
                                    color: '#DC2626',
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                  }}
                                >
                                  (عرض حرج)
                                </span>
                              )}
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="portal-form-group">
                        <label htmlFor="portal-checkin-notes">ملاحظات أو أسئلة إضافية للطبيب</label>
                        <textarea
                          id="portal-checkin-notes"
                          rows={3}
                          placeholder="صف أي ملاحظات أخرى بخصوص الشفاء أو الآثار الجانبية..."
                          value={recoveryNotes}
                          onChange={(e) => setRecoveryNotes(e.target.value)}
                        />
                      </div>

                      <button type="submit" className="portal-submit-btn" disabled={busy}>
                        {busy ? 'جارٍ إرسال التقرير…' : 'إرسال تقرير المتابعة'}
                      </button>
                    </form>
                  </div>

                  {/* Patient-Reported Outcome Form */}
                  <div className="portal-card" style={{ marginTop: '1.5rem' }}>
                    <h3 style={{ borderBottom: '1px solid #F1F5F9', paddingBottom: '0.75rem', margin: '0 0 1.25rem' }}>
                      تقييم رضاك عن النتيجة التجميلية والعلاجية (PRO)
                    </h3>
                    <form onSubmit={handleSubmitOutcome}>
                      <div className="portal-form-group">
                        <label>درجة الرضا عن النتيجة النهائية (1 إلى 5)</label>
                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                          {[1, 2, 3, 4, 5].map((val) => (
                            <button
                              key={val}
                              type="button"
                              className={`portal-slot-btn ${outcomeScore === val ? 'selected' : ''}`}
                              style={{ flex: 1, padding: '0.75rem 0.5rem' }}
                              onClick={() => setOutcomeScore(val)}
                            >
                              {val === 1
                                ? '1 (غير راضٍ)'
                                : val === 3
                                ? '3 (متوسط)'
                                : val === 5
                                ? '5 (راضٍ تمامًا)'
                                : String(val)}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="portal-form-group">
                        <label htmlFor="portal-outcome-notes">انطباعك حول النتيجة</label>
                        <textarea
                          id="portal-outcome-notes"
                          rows={2}
                          placeholder="أدخل أي ملاحظات حول مظهر النتيجة أو ملمسها..."
                          value={outcomeNotes}
                          onChange={(e) => setOutcomeNotes(e.target.value)}
                        />
                      </div>

                      <button
                        type="submit"
                        className="portal-btn-secondary"
                        style={{ width: 'auto', padding: '0.55rem 1.25rem' }}
                        disabled={busy}
                      >
                        {busy ? 'جارٍ الحفظ…' : 'حفظ تقييم النتيجة'}
                      </button>
                    </form>
                  </div>

                  {/* Previous Check-ins History */}
                  {checkIns.length > 0 && (
                    <div style={{ marginTop: '2rem' }}>
                      <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: '#334155' }}>
                        سجل تقارير المتابعة السابقة
                      </h3>
                      {checkIns.map((ci) => (
                        <div key={ci.id} className="portal-card">
                          <div className="portal-card-header">
                            <div>
                              <strong style={{ fontSize: '1rem' }}>
                                تقرير بتاريخ <span dir="ltr">{ci.checkInDate.slice(0, 10)}</span>
                              </strong>
                              {ci.followUp && (
                                <span style={{ marginRight: '0.75rem', color: '#64748B', fontSize: '0.85rem' }}>
                                  ({ci.followUp.reason})
                                </span>
                              )}
                            </div>
                            <span className={`portal-status-badge status-${ci.status}`}>
                              {ci.status === 'PENDING_REVIEW'
                                ? 'بانتظار مراجعة الطبيب'
                                : ci.status === 'REVIEWED'
                                ? 'تمت المراجعة الطبية'
                                : 'مُصعّد سريريًا'}
                            </span>
                          </div>

                          <div className="portal-appt-grid">
                            <div className="portal-appt-item">
                              <label>مستوى الألم</label>
                              <strong
                                style={{
                                  color: ci.painScore >= 8 ? '#DC2626' : ci.painScore >= 5 ? '#D97706' : '#059669',
                                }}
                              >
                                {ci.painScore} / 10
                              </strong>
                            </div>
                            <div className="portal-appt-item">
                              <label>التصعيد السريري</label>
                              <span>{ci.isEscalated ? `🚨 نعم (${ci.escalationReason || 'أعراض حرجة'})` : 'طبيعي'}</span>
                            </div>
                            {ci.reviewedAt && (
                              <div className="portal-appt-item" style={{ gridColumn: 'span 2' }}>
                                <label>توجيهات الطبيب المعالج ({ci.reviewedBy?.user.name || 'طبيب العيادة'})</label>
                                <div
                                  style={{
                                    background: '#F0FDF4',
                                    border: '1px solid #BBF7D0',
                                    padding: '0.5rem 0.75rem',
                                    borderRadius: '6px',
                                    color: '#166534',
                                    fontSize: '0.9rem',
                                  }}
                                >
                                  {ci.clinicianNotes || 'تمت المراجعة ولا توجد ملاحظات إضافية.'}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* View Consent Modal */}
      {viewConsentModal && selectedConsent && (
        <div className="portal-modal-backdrop" role="dialog" aria-modal="true">
          <div className="portal-modal" style={{ maxWidth: '650px', maxHeight: '85vh', overflowY: 'auto' }}>
            <h3>{selectedConsent.templateVersion.titleAr}</h3>
            <div style={{ color: '#64748B', fontSize: '0.85rem', marginBottom: '1rem' }}>
              الإصدار {selectedConsent.templateVersion.versionNumber} · البصمة المعتمدة:{' '}
              <code dir="ltr">{selectedConsent.templateVersion.contentDigestSha256.slice(0, 16)}…</code>
            </div>

            <div
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                padding: '1rem',
                borderRadius: '8px',
                fontSize: '0.9rem',
                lineHeight: 1.7,
                whiteSpace: 'pre-wrap',
                marginBottom: '1rem',
              }}
            >
              {selectedConsent.templateVersion.bodyAr}
            </div>

            <h4 style={{ margin: '1rem 0 0.5rem', color: '#DC2626' }}>المخاطر والمضاعفات المحتملة:</h4>
            <div
              style={{
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                padding: '0.75rem 1rem',
                borderRadius: '6px',
                fontSize: '0.85rem',
                color: '#991B1B',
                whiteSpace: 'pre-wrap',
              }}
            >
              {selectedConsent.templateVersion.risksTextAr}
            </div>

            <h4 style={{ margin: '1rem 0 0.5rem', color: '#1E293B' }}>البدائل العلاجية المتاحة:</h4>
            <div
              style={{
                background: '#F1F5F9',
                border: '1px solid #CBD5E1',
                padding: '0.75rem 1rem',
                borderRadius: '6px',
                fontSize: '0.85rem',
                color: '#334155',
                whiteSpace: 'pre-wrap',
              }}
            >
              {selectedConsent.templateVersion.alternativesTextAr}
            </div>

            <div className="portal-modal-actions">
              <button className="portal-btn-secondary" onClick={() => setViewConsentModal(false)}>
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sign Consent Modal */}
      {signModal && selectedConsent && patient && (
        <div className="portal-modal-backdrop" role="dialog" aria-modal="true">
          <div className="portal-modal" style={{ maxWidth: '540px' }}>
            <h3>توقيع إقرار الموافقة إلكترونيًا</h3>
            <p style={{ fontSize: '0.9rem', color: '#64748B' }}>
              بصفتك المريض صاحب العلاقة، يُلزمك هذا التوقيع بالموافقة الصريحة بعد فهمك للمخاطر والبدائل.
            </p>

            <div className="portal-auth-tabs" style={{ marginBottom: '1rem' }}>
              <button
                className={`portal-auth-tab ${signatureMode === 'TYPED_CONFIRMATION' ? 'active' : ''}`}
                onClick={() => setSignatureMode('TYPED_CONFIRMATION')}
              >
                تأكيد بكتابة الاسم الكامل
              </button>
              <button
                className={`portal-auth-tab ${signatureMode === 'DRAWN_BASE64' ? 'active' : ''}`}
                onClick={() => setSignatureMode('DRAWN_BASE64')}
              >
                رسم التوقيع بيدك
              </button>
            </div>

            {signatureMode === 'TYPED_CONFIRMATION' ? (
              <div className="portal-form-group">
                <label htmlFor="portal-sign-name">اكتب اسمك الكامل مطابقًا للملف الطبي</label>
                <input
                  id="portal-sign-name"
                  type="text"
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  placeholder="الاسم الكامل"
                />
              </div>
            ) : (
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                  ارسم توقيعك في المساحة أدناه:
                </label>
                <canvas
                  ref={canvasRef}
                  width={480}
                  height={150}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  style={{
                    border: '1px solid #CBD5E1',
                    borderRadius: '6px',
                    background: '#FFFFFF',
                    cursor: 'crosshair',
                    width: '100%',
                    touchAction: 'none',
                  }}
                />
                <button
                  type="button"
                  className="portal-btn-secondary"
                  style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem', marginTop: '0.25rem' }}
                  onClick={clearCanvas}
                >
                  مسح وإعادة الرسم
                </button>
              </div>
            )}

            <div
              style={{
                marginTop: '1rem',
                fontSize: '0.8rem',
                color: '#64748B',
                background: '#F8FAFC',
                padding: '0.5rem',
                borderRadius: '6px',
              }}
            >
              🔒 سيتم تسجيل بصمة التوثيق وتاريخ وتوقيت التوقيع بدقة وإرسال الإقرار للتحقق السريري.
            </div>

            <div className="portal-modal-actions">
              <button
                className="portal-btn-secondary"
                onClick={() => {
                  setSignModal(false);
                  setSelectedConsent(null);
                }}
                disabled={busy}
              >
                إلغاء
              </button>
              <button className="portal-submit-btn" style={{ width: 'auto', margin: 0 }} onClick={handleSignConsentConfirm} disabled={busy}>
                {busy ? 'جارٍ التوقيع…' : 'تأكيد التوقيع وإرسال الإقرار'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refuse Consent Modal */}
      {refuseModal && selectedConsent && (
        <div className="portal-modal-backdrop" role="dialog" aria-modal="true">
          <div className="portal-modal">
            <h3 style={{ color: '#DC2626' }}>رفض إقرار الموافقة</h3>
            <p style={{ fontSize: '0.9rem', color: '#64748B' }}>
              سيؤدي رفض الإقرار إلى إيقاف تنفيذ الإجراء الطبي المرتبط وإشعار الطبيب المختص.
            </p>
            <div className="portal-form-group">
              <label htmlFor="portal-refuse-reason">سبب الرفض (إلزامي)</label>
              <textarea
                id="portal-refuse-reason"
                rows={3}
                placeholder="أدخل سبب عدم الرغبة في التوقيع على هذا الإجراء..."
                value={refuseReason}
                onChange={(e) => setRefuseReason(e.target.value)}
                required
              />
            </div>
            <div className="portal-modal-actions">
              <button
                className="portal-btn-secondary"
                onClick={() => {
                  setRefuseModal(false);
                  setSelectedConsent(null);
                }}
                disabled={busy}
              >
                تراجع
              </button>
              <button className="portal-btn-danger" onClick={handleRefuseConsentConfirm} disabled={busy || !refuseReason.trim()}>
                {busy ? 'جارٍ المعالجة…' : 'تأكيد رفض الإقرار'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Withdraw Consent Modal */}
      {withdrawModal && selectedConsent && (
        <div className="portal-modal-backdrop" role="dialog" aria-modal="true">
          <div className="portal-modal">
            <h3 style={{ color: '#DC2626' }}>سحب الموافقة الطبية</h3>
            <p style={{ fontSize: '0.9rem', color: '#64748B' }}>
              يحق لك سحب موافقتك في أي وقت قبل مباشرة الإجراء. سيؤدي هذا السحب إلى إلغاء صلاحية الإقرار الطبية فورًا.
            </p>
            <div className="portal-form-group">
              <label htmlFor="portal-withdraw-reason">سبب سحب الموافقة (إلزامي)</label>
              <textarea
                id="portal-withdraw-reason"
                rows={3}
                placeholder="أدخل سبب سحب الموافقة..."
                value={withdrawReason}
                onChange={(e) => setWithdrawReason(e.target.value)}
                required
              />
            </div>
            <div className="portal-modal-actions">
              <button
                className="portal-btn-secondary"
                onClick={() => {
                  setWithdrawModal(false);
                  setSelectedConsent(null);
                }}
                disabled={busy}
              >
                تراجع
              </button>
              <button className="portal-btn-danger" onClick={handleWithdrawConsentConfirm} disabled={busy || !withdrawReason.trim()}>
                {busy ? 'جارٍ السحب…' : 'تأكيد سحب الموافقة'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {showCancelModal && selectedAppt && (
        <div className="portal-modal-backdrop" role="dialog" aria-modal="true">
          <div className="portal-modal">
            <h3>تأكيد إلغاء الموعد</h3>
            <p>
              هل أنت متأكد من رغبتك في إلغاء موعدك لخدمة <strong>{selectedAppt.service.name}</strong> في تاريخ{' '}
              <span dir="ltr">{selectedAppt.startLocal}</span>؟
            </p>
            <div className="portal-form-group">
              <label htmlFor="portal-cancel-reason">سبب الإلغاء (اختياري)</label>
              <input
                id="portal-cancel-reason"
                type="text"
                placeholder="أدخل سبب الإلغاء إن رغبت"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>
            <div className="portal-modal-actions">
              <button
                className="portal-btn-secondary"
                onClick={() => {
                  setShowCancelModal(false);
                  setSelectedAppt(null);
                }}
                disabled={busy}
              >
                تراجع
              </button>
              <button className="portal-btn-danger" onClick={handleCancelConfirm} disabled={busy}>
                {busy ? 'جارٍ الإلغاء…' : 'نعم، قم بإلغاء الموعد'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {showRescheduleModal && selectedAppt && (
        <div className="portal-modal-backdrop" role="dialog" aria-modal="true">
          <div className="portal-modal">
            <h3>تعديل موعد: {selectedAppt.service.name}</h3>
            <div className="portal-form-group">
              <label htmlFor="portal-reschedule-date">اختر التاريخ الجديد</label>
              <input
                id="portal-reschedule-date"
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                value={bookingDate}
                onChange={(e) => {
                  setBookingDate(e.target.value);
                  fetchAvailability({
                    date: e.target.value,
                    serviceId: selectedAppt.service.id,
                    doctorResourceId: selectedAppt.doctor.id,
                  }).then((r) => setSlots(r.slots));
                }}
              />
            </div>

            <label style={{ fontWeight: 600, color: '#334155' }}>الأوقات المتاحة</label>
            <div className="portal-slots-grid" style={{ maxHeight: '180px', overflowY: 'auto' }}>
              {slots.map((s) => (
                <button
                  key={s.startAt}
                  type="button"
                  className={`portal-slot-btn ${selectedSlot?.startAt === s.startAt ? 'selected' : ''}`}
                  onClick={() => setSelectedSlot(s)}
                  dir="ltr"
                >
                  {s.startLocal.slice(11, 16)}
                </button>
              ))}
            </div>

            <div className="portal-modal-actions">
              <button
                className="portal-btn-secondary"
                onClick={() => {
                  setShowRescheduleModal(false);
                  setSelectedAppt(null);
                  setSelectedSlot(null);
                }}
                disabled={busy}
              >
                إلغاء
              </button>
              <button
                className="portal-submit-btn"
                style={{ width: 'auto', margin: 0 }}
                onClick={handleRescheduleConfirm}
                disabled={!selectedSlot || busy}
              >
                {busy ? 'جارٍ الحفظ…' : 'تأكيد الموعد الجديد'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="portal-footer">
        جميع الحقوق محفوظة © {new Date().getFullYear()} {clinic?.displayName || 'لمسة'} · منصة إدارة العيادات التجميلية
      </footer>
    </div>
  );
}

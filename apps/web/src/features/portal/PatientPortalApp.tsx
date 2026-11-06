import { useCallback, useEffect, useMemo, useState } from 'react';
import { brandStyle, useDocumentIdentity } from '../settings/branding';
import {
  activatePatientAccount,
  bookPatientAppointment,
  cancelPatientAppointment,
  fetchAvailability,
  fetchBookableDoctors,
  fetchBookableServices,
  fetchPatientAppointments,
  fetchPatientProfile,
  fetchPublicClinic,
  patientLogin,
  patientLogout,
  requestPasswordReset,
  reschedulePatientAppointment,
  resetPassword,
  type BookableDoctor,
  type BookableService,
  type PatientUser,
  type PortalAppointment,
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

export function PatientPortalApp({ initialSlug }: { initialSlug?: string }) {
  const slug = initialSlug || getClinicSlugFromPath();
  const [clinic, setClinic] = useState<PublicClinic | null>(null);
  const [patient, setPatient] = useState<PatientUser | null>(null);
  const [csrfToken, setCsrfToken] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'appointments' | 'book' | 'profile'>('appointments');
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

  useEffect(() => {
    if (patient) reloadAppointments();
  }, [patient, reloadAppointments]);

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
            </div>
          </div>
        )}
      </main>

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

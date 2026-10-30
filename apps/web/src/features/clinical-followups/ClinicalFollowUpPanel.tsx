import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../auth/api';
import { Modal } from '../../components/ui';
import { RequestScope } from '../patients/request-scope';
import {
  type AdverseEventDto,
  type AdverseEventStatus,
  type ClinicalFollowUpDto,
  type FollowUpSeverity,
  type OutcomeMeasurementScale,
  type TreatmentOutcomeDto,
  followupApi,
} from './followup-api';
import {
  ADVERSE_EVENT_STATUS_META,
  FOLLOWUP_STATUS_META,
  MEASUREMENT_SCALES,
  SEVERITY_META,
  formatArabicDateTime,
  validateScoreForScale,
} from './followup-logic';
import './followups.css';

interface ClinicalFollowUpPanelProps {
  clinicId: string;
  patientId: string;
  patientName?: string;
  csrfToken: string;
  clinicPermissions: string[];
  onAuthError?: (err: unknown) => void;
}

export function ClinicalFollowUpPanel({
  clinicId,
  patientId,
  patientName,
  csrfToken,
  clinicPermissions,
  onAuthError,
}: ClinicalFollowUpPanelProps) {
  const client = useMemo(() => followupApi(clinicId), [clinicId]);
  const scope = useMemo(() => new RequestScope(), [clinicId, patientId]);

  // Permissions
  const canReadFollowUps = clinicPermissions.includes('clinical.follow-ups.read');
  const canSchedule = clinicPermissions.includes('clinical.follow-ups.create');
  const canUpdateStatus = clinicPermissions.includes('clinical.follow-ups.update');
  const canAssess = clinicPermissions.includes('clinical.follow-ups.assess');
  const canAmend = clinicPermissions.includes('clinical.follow-ups.amend');
  const canReadOutcomes = clinicPermissions.includes('clinical.outcomes.read');
  const canRecordOutcome = clinicPermissions.includes('clinical.outcomes.create');
  const canReadAE = clinicPermissions.includes('clinical.adverse-events.read');
  const canRecordAE = clinicPermissions.includes('clinical.adverse-events.create');
  const canUpdateAE = clinicPermissions.includes('clinical.adverse-events.update');

  // Active view tab
  const [activeTab, setActiveTab] = useState<'followups' | 'outcomes' | 'adverse-events'>('followups');

  // Data states
  const [followUps, setFollowUps] = useState<ClinicalFollowUpDto[]>([]);
  const [outcomes, setOutcomes] = useState<TreatmentOutcomeDto[]>([]);
  const [adverseEvents, setAdverseEvents] = useState<AdverseEventDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Modals
  const [modalMode, setModalMode] = useState<
    'schedule' | 'assess' | 'amend' | 'cancel' | 'outcome' | 'adverse-event' | 'update-ae' | null
  >(null);
  const [selectedFollowUp, setSelectedFollowUp] = useState<ClinicalFollowUpDto | null>(null);
  const [selectedAE, setSelectedAE] = useState<AdverseEventDto | null>(null);

  // Form states
  // Schedule Form
  const [scheduleDoctorId, setScheduleDoctorId] = useState('');
  const [scheduleReason, setScheduleReason] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleInstructions, setScheduleInstructions] = useState('');

  // Cancel Form
  const [cancelReason, setCancelReason] = useState('');

  // Assessment Form
  const [symptomsObserved, setSymptomsObserved] = useState('');
  const [healingProgress, setHealingProgress] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');

  // Amendment Form
  const [amendmentReason, setAmendmentReason] = useState('');
  const [amendedContent, setAmendedContent] = useState('');

  // Outcome Form
  const [outcomeScale, setOutcomeScale] = useState<OutcomeMeasurementScale>('VISUAL_ANALOG_SCALE_10');
  const [clinicianScore, setClinicianScore] = useState<string>('8');
  const [clinicianNotes, setClinicianNotes] = useState('');
  const [patientReportedScore, setPatientReportedScore] = useState<string>('8');
  const [patientReportedNotes, setPatientReportedNotes] = useState('');

  // Adverse Event Form
  const [aeType, setAeType] = useState('');
  const [aeSeverity, setAeSeverity] = useState<FollowUpSeverity>('MILD');
  const [aeObservationDate, setAeObservationDate] = useState('');
  const [aeFindings, setAeFindings] = useState('');
  const [aeEscalation, setAeEscalation] = useState('');

  // Update Adverse Event Form
  const [updateAeStatus, setUpdateAeStatus] = useState<AdverseEventStatus>('UNDER_EVALUATION');
  const [updateAeEscalation, setUpdateAeEscalation] = useState('');

  const handleError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401 && onAuthError) {
        onAuthError(e);
      }
      if (e instanceof ApiError) {
        if (e.status === 403) {
          setError('ليس لديك صلاحية سريرية لإتمام هذا الإجراء (متاح للأطباء المعتمدين فقط).');
          return;
        }
        if (e.status === 409) {
          setError('حدث تعارض مع حالة السجل الحالية. أعد تحميل السجلات وحاول مجدداً.');
          return;
        }
        if (e.message) {
          setError(e.message);
          return;
        }
      }
      setError('تعذّر إتمام الإجراء السريري. يرجى التحقق والمحاولة مجدداً.');
    },
    [onAuthError],
  );

  const loadData = useCallback(() => {
    const t = scope.start();
    setLoading(true);
    setError('');

    const promises: Promise<unknown>[] = [];

    if (canReadFollowUps) {
      promises.push(
        client.listFollowUps(patientId, undefined, t.signal).then((data) => {
          if (t.current()) setFollowUps(data?.items || []);
        }),
      );
    }
    if (canReadOutcomes) {
      promises.push(
        client.listOutcomes(patientId, t.signal).then((data) => {
          if (t.current()) setOutcomes(data?.items || []);
        }),
      );
    }
    if (canReadAE) {
      promises.push(
        client.listAdverseEvents(patientId, undefined, t.signal).then((data) => {
          if (t.current()) setAdverseEvents(data?.items || []);
        }),
      );
    }

    Promise.all(promises)
      .catch((e) => {
        if (t.current()) handleError(e);
      })
      .finally(() => {
        if (t.current()) setLoading(false);
      });
  }, [client, scope, patientId, canReadFollowUps, canReadOutcomes, canReadAE, handleError]);

  useEffect(() => {
    loadData();
    return () => scope.cancel();
  }, [loadData, scope]);

  const closeModal = () => {
    setModalMode(null);
    setSelectedFollowUp(null);
    setSelectedAE(null);
  };

  // 1. Schedule Follow-up
  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSchedule) return;
    setBusy(true);
    setError('');
    const t = scope.start();
    try {
      await client.scheduleFollowUp(
        {
          patientId,
          treatingDoctorMembershipId: scheduleDoctorId,
          reason: scheduleReason,
          scheduledDate: new Date(scheduleDate).toISOString(),
          recoveryInstructions: scheduleInstructions || undefined,
        },
        csrfToken,
        t.signal,
      );
      if (t.current()) {
        setNotice('تمت جدولة جلسة المتابعة السريرية بنجاح.');
        closeModal();
        loadData();
      }
    } catch (err) {
      if (t.current()) handleError(err);
    } finally {
      if (t.current()) setBusy(false);
    }
  };

  // 2. Start Follow-up (Change status to IN_PROGRESS)
  const handleStartFollowUp = async (fu: ClinicalFollowUpDto) => {
    if (!canUpdateStatus) return;
    setBusy(true);
    setError('');
    const t = scope.start();
    try {
      await client.updateStatus(
        fu.id,
        {
          status: 'IN_PROGRESS',
          expectedVersion: fu.version,
        },
        csrfToken,
        t.signal,
      );
      if (t.current()) {
        setNotice('تم بدء جلسة المتابعة السريرية بنجاح.');
        loadData();
      }
    } catch (err) {
      if (t.current()) handleError(err);
    } finally {
      if (t.current()) setBusy(false);
    }
  };

  // 3. Cancel Follow-up
  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canUpdateStatus || !selectedFollowUp) return;
    setBusy(true);
    setError('');
    const t = scope.start();
    try {
      await client.updateStatus(
        selectedFollowUp.id,
        {
          status: 'CANCELLED',
          cancelReason,
          expectedVersion: selectedFollowUp.version,
        },
        csrfToken,
        t.signal,
      );
      if (t.current()) {
        setNotice('تم إلغاء المتابعة السريرية وتوثيق سبب الإلغاء.');
        closeModal();
        loadData();
      }
    } catch (err) {
      if (t.current()) handleError(err);
    } finally {
      if (t.current()) setBusy(false);
    }
  };

  // 4. Complete Assessment
  const handleAssessSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAssess || !selectedFollowUp) return;
    setBusy(true);
    setError('');
    const t = scope.start();
    try {
      await client.completeAssessment(
        selectedFollowUp.id,
        {
          symptomsObserved,
          healingProgress,
          clinicalNotes,
          expectedVersion: selectedFollowUp.version,
        },
        csrfToken,
        t.signal,
      );
      if (t.current()) {
        setNotice('تم اعتماد التقييم وتوقيعه رقمياً بنجاح.');
        closeModal();
        loadData();
      }
    } catch (err) {
      if (t.current()) handleError(err);
    } finally {
      if (t.current()) setBusy(false);
    }
  };

  // 5. Amend Assessment
  const handleAmendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAmend || !selectedFollowUp?.assessment) return;
    setBusy(true);
    setError('');
    const t = scope.start();
    try {
      await client.amendAssessment(
        selectedFollowUp.assessment.id,
        {
          amendmentReason,
          amendedContent,
        },
        csrfToken,
        t.signal,
      );
      if (t.current()) {
        setNotice('تم توثيق التصويب الملحق وتوقيعه رقمياً بنجاح.');
        closeModal();
        loadData();
      }
    } catch (err) {
      if (t.current()) handleError(err);
    } finally {
      if (t.current()) setBusy(false);
    }
  };

  // 6. Record Outcome
  const handleOutcomeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canRecordOutcome) return;

    const scaleDef = MEASUREMENT_SCALES[outcomeScale];
    let parsedClinicianScore: number | undefined;
    let parsedPatientScore: number | undefined;

    if (scaleDef.hasScore) {
      parsedClinicianScore = clinicianScore ? parseFloat(clinicianScore) : undefined;
      const clinicianVal = validateScoreForScale(outcomeScale, parsedClinicianScore);
      if (!clinicianVal.valid) {
        setError(clinicianVal.error || 'خطأ في درجة الطبيب');
        return;
      }
      if (patientReportedScore) {
        parsedPatientScore = parseFloat(patientReportedScore);
        const patientVal = validateScoreForScale(outcomeScale, parsedPatientScore);
        if (!patientVal.valid) {
          setError(`درجة المريض: ${patientVal.error}`);
          return;
        }
      }
    }

    setBusy(true);
    setError('');
    const t = scope.start();
    try {
      await client.recordOutcome(
        {
          patientId,
          measurementScale: outcomeScale,
          clinicianScore: parsedClinicianScore,
          clinicianNotes: clinicianNotes || undefined,
          patientReportedScore: parsedPatientScore,
          patientReportedNotes: patientReportedNotes || undefined,
        },
        csrfToken,
        t.signal,
      );
      if (t.current()) {
        setNotice('تم توثيق نتيجة العلاج السريرية بنجاح.');
        closeModal();
        loadData();
      }
    } catch (err) {
      if (t.current()) handleError(err);
    } finally {
      if (t.current()) setBusy(false);
    }
  };

  // 7. Record Adverse Event
  const handleAdverseEventSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canRecordAE) return;
    setBusy(true);
    setError('');
    const t = scope.start();
    try {
      await client.recordAdverseEvent(
        {
          patientId,
          eventType: aeType,
          severity: aeSeverity,
          observationDate: new Date(aeObservationDate).toISOString(),
          documentedFindings: aeFindings,
          escalationNotes: aeEscalation || undefined,
        },
        csrfToken,
        t.signal,
      );
      if (t.current()) {
        setNotice('تم الإبلاغ عن الأثر الجانبي وتوثيقه بنجاح.');
        closeModal();
        loadData();
      }
    } catch (err) {
      if (t.current()) handleError(err);
    } finally {
      if (t.current()) setBusy(false);
    }
  };

  // 8. Update Adverse Event Status
  const handleUpdateAESubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canUpdateAE || !selectedAE) return;
    setBusy(true);
    setError('');
    const t = scope.start();
    try {
      await client.updateAdverseEvent(
        selectedAE.id,
        {
          status: updateAeStatus,
          escalationNotes: updateAeEscalation || undefined,
          expectedVersion: selectedAE.version,
        },
        csrfToken,
        t.signal,
      );
      if (t.current()) {
        setNotice('تم تحديث حالة الأثر الجانبي بنجاح.');
        closeModal();
        loadData();
      }
    } catch (err) {
      if (t.current()) handleError(err);
    } finally {
      if (t.current()) setBusy(false);
    }
  };

  if (!canReadFollowUps && !canReadOutcomes && !canReadAE) {
    return null;
  }

  return (
    <section className="clinical-followups-panel" dir="rtl">
      <header className="clinical-followups-header">
        <div>
          <h4>متابعة التعافي والنتائج السريرية</h4>
          <small style={{ color: '#64748b' }}>
            سجلات سريرية حساسة للمريض: {patientName || 'المحدد'} · للأطباء المعتمدين فقط
          </small>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {activeTab === 'followups' && canSchedule && (
            <button
              className="primary-btn"
              onClick={() => {
                setError('');
                setScheduleDoctorId('');
                setScheduleReason('');
                setScheduleDate(new Date(Date.now() + 86400000 * 7).toISOString().slice(0, 16));
                setScheduleInstructions('');
                setModalMode('schedule');
              }}
            >
              ＋ جدولة متابعة جديدة
            </button>
          )}
          {activeTab === 'outcomes' && canRecordOutcome && (
            <button
              className="primary-btn"
              onClick={() => {
                setError('');
                setOutcomeScale('VISUAL_ANALOG_SCALE_10');
                setClinicianScore('8');
                setClinicianNotes('');
                setPatientReportedScore('8');
                setPatientReportedNotes('');
                setModalMode('outcome');
              }}
            >
              ＋ تسجيل مقياس نتيجة سريرية
            </button>
          )}
          {activeTab === 'adverse-events' && canRecordAE && (
            <button
              className="primary-btn"
              onClick={() => {
                setError('');
                setAeType('');
                setAeSeverity('MILD');
                setAeObservationDate(new Date().toISOString().slice(0, 16));
                setAeFindings('');
                setAeEscalation('');
                setModalMode('adverse-event');
              }}
            >
              ＋ الإبلاغ عن أثر جانبي
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="followup-cancel-alert" role="alert">
          {error}
          <button className="table-btn" style={{ marginRight: '0.5rem' }} onClick={loadData}>
            إعادة المحاولة
          </button>
        </div>
      )}

      {notice && (
        <div className="notice" role="status">
          {notice}
          <button onClick={() => setNotice('')} aria-label="إغلاق التنبيه">
            ×
          </button>
        </div>
      )}

      {/* Tabs */}
      <nav className="clinical-followups-tabs">
        {canReadFollowUps && (
          <button
            className={`followup-tab-btn ${activeTab === 'followups' ? 'active' : ''}`}
            onClick={() => setActiveTab('followups')}
          >
            المتابعات السريرية ({(followUps?.length || 0).toLocaleString('ar')})
          </button>
        )}
        {canReadOutcomes && (
          <button
            className={`followup-tab-btn ${activeTab === 'outcomes' ? 'active' : ''}`}
            onClick={() => setActiveTab('outcomes')}
          >
            نتائج ومقاييس العلاج ({(outcomes?.length || 0).toLocaleString('ar')})
          </button>
        )}
        {canReadAE && (
          <button
            className={`followup-tab-btn ${activeTab === 'adverse-events' ? 'active' : ''}`}
            onClick={() => setActiveTab('adverse-events')}
          >
            الأحداث والآثار الجانبية ({(adverseEvents?.length || 0).toLocaleString('ar')})
          </button>
        )}
      </nav>

      {/* Loading */}
      {loading && <p className="empty" role="status">جارٍ تحميل السجلات السريرية…</p>}

      {/* Tab 1: Follow-ups */}
      {!loading && activeTab === 'followups' && (
        <div>
          {followUps.length === 0 ? (
            <p className="empty">لا توجد متابعات سريرية مسجلة لهذا المريض بعد.</p>
          ) : (
            followUps.map((fu) => {
              const statusMeta = FOLLOWUP_STATUS_META[fu.status];
              return (
                <article key={fu.id} className="followup-card">
                  <header className="followup-card-header">
                    <div>
                      <span className={`badge-status ${statusMeta.badgeClass}`}>
                        {statusMeta.label}
                      </span>
                      <span className="followup-reason" style={{ marginRight: '0.75rem' }}>
                        {fu.reason}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.375rem' }}>
                      {fu.status === 'SCHEDULED' && canUpdateStatus && (
                        <>
                          <button
                            className="primary-btn"
                            disabled={busy}
                            onClick={() => handleStartFollowUp(fu)}
                          >
                            بدء المتابعة
                          </button>
                          <button
                            className="table-btn"
                            disabled={busy}
                            onClick={() => {
                              setSelectedFollowUp(fu);
                              setCancelReason('');
                              setModalMode('cancel');
                            }}
                          >
                            إلغاء المتابعة
                          </button>
                        </>
                      )}
                      {fu.status === 'IN_PROGRESS' && (
                        <>
                          {canAssess && (
                            <button
                              className="primary-btn"
                              disabled={busy}
                              onClick={() => {
                                setSelectedFollowUp(fu);
                                setSymptomsObserved('');
                                setHealingProgress('');
                                setClinicalNotes('');
                                setModalMode('assess');
                              }}
                            >
                              إجراء التقييم وتوقيعه رقمياً
                            </button>
                          )}
                          {canUpdateStatus && (
                            <button
                              className="table-btn"
                              disabled={busy}
                              onClick={() => {
                                setSelectedFollowUp(fu);
                                setCancelReason('');
                                setModalMode('cancel');
                              }}
                            >
                              إلغاء المتابعة
                            </button>
                          )}
                        </>
                      )}
                      {fu.status === 'COMPLETED' && fu.assessment && canAmend && (
                        <button
                          className="table-btn"
                          disabled={busy}
                          onClick={() => {
                            setSelectedFollowUp(fu);
                            setAmendmentReason('');
                            setAmendedContent('');
                            setModalMode('amend');
                          }}
                        >
                          ＋ إضافة تصويب موثق
                        </button>
                      )}
                    </div>
                  </header>

                  <div className="followup-meta-grid">
                    <div>
                      <b>الطبيب المعالج:</b> {fu.treatingDoctor.user.name}
                    </div>
                    <div>
                      <b>الموعد المجدول:</b> {formatArabicDateTime(fu.scheduledDate)}
                    </div>
                    {fu.completedAt && (
                      <div>
                        <b>تاريخ الاكتمال والتوثيق:</b> {formatArabicDateTime(fu.completedAt)}
                      </div>
                    )}
                    {fu.cancelledAt && (
                      <div>
                        <b>تاريخ الإلغاء:</b> {formatArabicDateTime(fu.cancelledAt)}
                      </div>
                    )}
                  </div>

                  {fu.recoveryInstructions && (
                    <div className="followup-instructions">
                      <b>تعليمات التعافي للمريض:</b> {fu.recoveryInstructions}
                    </div>
                  )}

                  {fu.cancelReason && (
                    <div className="followup-cancel-alert">
                      <b>سبب الإلغاء الموثق:</b> {fu.cancelReason}
                    </div>
                  )}

                  {/* Signed Assessment Box */}
                  {fu.assessment && (
                    <div className="assessment-signed-box">
                      <div className="assessment-signature-badge">
                        <span>
                          ✓ تقييم سريري معتمد وموقع رقمياً بواسطة د. {fu.assessment.assessingDoctor.user.name} بتاريخ{' '}
                          {formatArabicDateTime(fu.assessment.signedAt)}
                        </span>
                        <span className="signature-hash" title="بصمة التوقيع الرقمي المشفرة SHA-256">
                          SHA-256: {fu.assessment.signatureSha256.slice(0, 16)}…
                        </span>
                      </div>

                      <div style={{ marginTop: '0.5rem' }}>
                        <b>الأعراض والعلامات الملاحظة:</b>
                        <p style={{ margin: '0.25rem 0 0.5rem' }}>{fu.assessment.symptomsObserved}</p>
                      </div>

                      <div>
                        <b>تقدم عملية الالتئام:</b>
                        <p style={{ margin: '0.25rem 0 0.5rem' }}>{fu.assessment.healingProgress}</p>
                      </div>

                      <div>
                        <b>الملاحظات والتوصيات السريرية:</b>
                        <p style={{ margin: '0.25rem 0 0.5rem' }}>{fu.assessment.clinicalNotes}</p>
                      </div>

                      {/* Amendments */}
                      {fu.assessment.amendments && fu.assessment.amendments.length > 0 && (
                        <div className="amendments-list">
                          <b style={{ fontSize: '0.9rem', color: '#92400e' }}>
                            التصويبات والملحقات التوثيقية المعتمدة ({fu.assessment.amendments.length.toLocaleString('ar')}):
                          </b>
                          {fu.assessment.amendments.map((am) => (
                            <div key={am.id} className="amendment-card">
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                <span>
                                  <b>تصويب بواسطة د. {am.author.user.name}</b> · {formatArabicDateTime(am.amendedAt)}
                                </span>
                                <span className="signature-hash" title="بصمة تصويب التوقيع الرقمي">
                                  SHA-256: {am.signatureSha256.slice(0, 16)}…
                                </span>
                              </div>
                              <p style={{ margin: '0.25rem 0' }}>
                                <b>سبب التصويب:</b> {am.amendmentReason}
                              </p>
                              <p style={{ margin: '0.25rem 0' }}>
                                <b>المحتوى المصوب:</b> {am.amendedContent}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      )}

      {/* Tab 2: Treatment Outcomes */}
      {!loading && activeTab === 'outcomes' && (
        <div>
          {outcomes.length === 0 ? (
            <p className="empty">لا توجد نتائج علاج مسجلة لهذا المريض بعد.</p>
          ) : (
            outcomes.map((out) => {
              const scaleDef = MEASUREMENT_SCALES[out.measurementScale];
              return (
                <article key={out.id} className="outcome-card">
                  <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <b style={{ fontSize: '1rem', color: '#0f172a' }}>{scaleDef.label}</b>
                    <small style={{ color: '#64748b' }}>
                      وثقها د. {out.recordingDoctor.user.name} في {formatArabicDateTime(out.recordedAt)}
                    </small>
                  </header>

                  <p style={{ fontSize: '0.85rem', color: '#475569', margin: 0 }}>{scaleDef.description}</p>

                  <div className="outcome-score-row">
                    {out.clinicianScore !== null && (
                      <div>
                        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>درجة تقييم الطبيب: </span>
                        <span className="score-badge">
                          {out.clinicianScore.toLocaleString('ar')}{scaleDef.max ? ` / ${scaleDef.max.toLocaleString('ar')}` : ''}
                        </span>
                        {scaleDef.scoreLabels?.[Math.round(out.clinicianScore)] && (
                          <span style={{ marginRight: '0.5rem', fontSize: '0.85rem', color: '#0369a1' }}>
                            ({scaleDef.scoreLabels[Math.round(out.clinicianScore)]})
                          </span>
                        )}
                      </div>
                    )}
                    {out.patientReportedScore !== null && (
                      <div style={{ borderRight: '1px solid #cbd5e1', paddingRight: '1.5rem' }}>
                        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>درجة رضا المريض: </span>
                        <span className="score-badge" style={{ color: '#15803d' }}>
                          {out.patientReportedScore.toLocaleString('ar')}{scaleDef.max ? ` / ${scaleDef.max.toLocaleString('ar')}` : ''}
                        </span>
                        {scaleDef.scoreLabels?.[Math.round(out.patientReportedScore)] && (
                          <span style={{ marginRight: '0.5rem', fontSize: '0.85rem', color: '#166534' }}>
                            ({scaleDef.scoreLabels[Math.round(out.patientReportedScore)]})
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {out.clinicianNotes && (
                    <div style={{ fontSize: '0.9rem' }}>
                      <b>ملاحظات الطبيب السريرية:</b> {out.clinicianNotes}
                    </div>
                  )}

                  {out.patientReportedNotes && (
                    <div style={{ fontSize: '0.9rem', color: '#166534' }}>
                      <b>انطباع وملاحظات المريض:</b> {out.patientReportedNotes}
                    </div>
                  )}

                  {out.photoComparisonGroup && (
                    <div style={{ fontSize: '0.85rem', color: '#0284c7' }}>
                      📷 مرتبطة بمجموعة مقارنة الصور السريرية: {out.photoComparisonGroup.title}
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      )}

      {/* Tab 3: Adverse Events */}
      {!loading && activeTab === 'adverse-events' && (
        <div>
          {adverseEvents.length === 0 ? (
            <p className="empty">لا توجد أحداث أو آثار جانبية مسجلة لهذا المريض.</p>
          ) : (
            adverseEvents.map((ae) => {
              const sev = SEVERITY_META[ae.severity];
              const st = ADVERSE_EVENT_STATUS_META[ae.status];
              return (
                <article key={ae.id} className="adverse-event-card">
                  <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className={`badge-status ${sev.badgeClass}`}>الشدة: {sev.label}</span>
                      <span className={`badge-status ${st.badgeClass}`}>الحالة: {st.label}</span>
                      <b style={{ fontSize: '1rem', color: '#0f172a', marginRight: '0.5rem' }}>{ae.eventType}</b>
                    </div>
                    {canUpdateAE && (
                      <button
                        className="table-btn"
                        disabled={busy}
                        onClick={() => {
                          setSelectedAE(ae);
                          setUpdateAeStatus(ae.status);
                          setUpdateAeEscalation(ae.escalationNotes || '');
                          setModalMode('update-ae');
                        }}
                      >
                        تحديث الحالة / المتابعة
                      </button>
                    )}
                  </header>

                  <div className="followup-meta-grid">
                    <div>
                      <b>تاريخ الملاحظة:</b> {formatArabicDateTime(ae.observationDate)}
                    </div>
                    <div>
                      <b>الطبيب المبلّغ:</b> د. {ae.reportingDoctor.user.name}
                    </div>
                    {ae.resolvedAt && (
                      <div>
                        <b>تاريخ التعامل / الاستقرار:</b> {formatArabicDateTime(ae.resolvedAt)}
                      </div>
                    )}
                  </div>

                  <div style={{ fontSize: '0.9rem' }}>
                    <b>الموجودات السريرية الموثقة:</b>
                    <p style={{ margin: '0.25rem 0' }}>{ae.documentedFindings}</p>
                  </div>

                  {ae.escalationNotes && (
                    <div className="followup-cancel-alert" style={{ margin: 0 }}>
                      <b>ملاحظات التصعيد / التدخل السريري:</b> {ae.escalationNotes}
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      )}

      {/* MODALS */}

      {/* 1. Schedule Follow-up Modal */}
      {modalMode === 'schedule' && (
        <Modal title="جدولة متابعة سريرية جديدة" onClose={closeModal}>
          <form className="followup-form" onSubmit={handleScheduleSubmit}>
            <label>
              معرف عضوية الطبيب المعالج *
              <input
                type="text"
                required
                value={scheduleDoctorId}
                onChange={(e) => setScheduleDoctorId(e.target.value)}
                placeholder="UUID لعضوية الطبيب"
              />
            </label>
            <label>
              سبب المتابعة السريرية *
              <input
                type="text"
                required
                minLength={3}
                maxLength={500}
                value={scheduleReason}
                onChange={(e) => setScheduleReason(e.target.value)}
                placeholder="مثال: متابعة ما بعد جلسة الفيلر والاطمئنان على انحسار التورم"
              />
            </label>
            <label>
              تاريخ وتوقيت المتابعة المجدول *
              <input
                type="datetime-local"
                required
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
              />
            </label>
            <label>
              تعليمات التعافي والعناية المنزلية
              <textarea
                rows={3}
                maxLength={2000}
                value={scheduleInstructions}
                onChange={(e) => setScheduleInstructions(e.target.value)}
                placeholder="مثال: كمادات باردة وتجنب التعرض للشمس المباشرة"
              />
            </label>
            <div className="followup-form-actions">
              <button type="button" className="table-btn" onClick={closeModal} disabled={busy}>
                إلغاء
              </button>
              <button type="submit" className="primary-btn" disabled={busy}>
                {busy ? 'جارٍ الحفظ…' : 'حفظ وجدولة المتابعة'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 2. Cancel Follow-up Modal */}
      {modalMode === 'cancel' && selectedFollowUp && (
        <Modal title="إلغاء المتابعة السريرية" onClose={closeModal}>
          <form className="followup-form" onSubmit={handleCancelSubmit}>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#b91c1c' }}>
              تنبيه: سيتم إلغاء المتابعة نهائياً ولن يمكن إعادة فتحها لاحقاً وفقاً للضوابط السريرية.
            </p>
            <label>
              سبب الإلغاء الموثق *
              <textarea
                rows={3}
                required
                minLength={3}
                maxLength={500}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="أدخل سبب إلغاء المتابعة بوضوح…"
              />
            </label>
            <div className="followup-form-actions">
              <button type="button" className="table-btn" onClick={closeModal} disabled={busy}>
                تراجع
              </button>
              <button type="submit" className="primary-btn" style={{ background: '#b91c1c' }} disabled={busy}>
                {busy ? 'جارٍ الإلغاء…' : 'تأكيد إلغاء المتابعة'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 3. Complete Assessment Modal */}
      {modalMode === 'assess' && selectedFollowUp && (
        <Modal title="توثيق التقييم السريري والتوقيع الرقمي" onClose={closeModal}>
          <form className="followup-form" onSubmit={handleAssessSubmit}>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#0369a1' }}>
              سيتم إنشاء توقيع رقمي مشفر (SHA-256) يحفظ سلامة التقييم ويمنع تعديله لاحقاً إلا عبر تصويب موثق.
            </p>
            <label>
              الأعراض والعلامات الملاحظة *
              <textarea
                rows={3}
                required
                minLength={2}
                maxLength={2000}
                value={symptomsObserved}
                onChange={(e) => setSymptomsObserved(e.target.value)}
                placeholder="أعراض الفحص السريري، التورم، التناسق، أو أي ملاحظات فورية…"
              />
            </label>
            <label>
              تقدم مرحلة الالتئام والتعافي *
              <textarea
                rows={2}
                required
                minLength={2}
                maxLength={1000}
                value={healingProgress}
                onChange={(e) => setHealingProgress(e.target.value)}
                placeholder="وصف مدى التئام الأنسجة وسلامة موضع الإجراء…"
              />
            </label>
            <label>
              الملاحظات والتوصيات السريرية الشاملة *
              <textarea
                rows={3}
                required
                minLength={2}
                maxLength={4000}
                value={clinicalNotes}
                onChange={(e) => setClinicalNotes(e.target.value)}
                placeholder="التوجيهات الطبية، الإرشادات اللاحقة وموعد الزيارة القادمة إن لزم…"
              />
            </label>
            <div className="followup-form-actions">
              <button type="button" className="table-btn" onClick={closeModal} disabled={busy}>
                إلغاء
              </button>
              <button type="submit" className="primary-btn" disabled={busy}>
                {busy ? 'جارٍ التوقيع…' : 'اعتماد التقييم وتوقيعه رقمياً'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 4. Amend Assessment Modal */}
      {modalMode === 'amend' && selectedFollowUp?.assessment && (
        <Modal title="إضافة تصويب موثق للتقييم السريري" onClose={closeModal}>
          <form className="followup-form" onSubmit={handleAmendSubmit}>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#92400e' }}>
              يحافظ النظام على التقييم الأصلي كما هو، ويتم تسجيل هذا التصويب بملحق مستقل يحمل اسمك وتاريخك وتوقيعاً رقمياً خاصاً.
            </p>
            <label>
              سبب التصويب أو الملحق التوثيقي *
              <input
                type="text"
                required
                minLength={5}
                maxLength={1000}
                value={amendmentReason}
                onChange={(e) => setAmendmentReason(e.target.value)}
                placeholder="مثال: تصويب ملحوظة خاصة بالجرعة أو إضافة توجيه منزلي"
              />
            </label>
            <label>
              المحتوى المصوب المعتمد *
              <textarea
                rows={4}
                required
                minLength={2}
                maxLength={4000}
                value={amendedContent}
                onChange={(e) => setAmendedContent(e.target.value)}
                placeholder="أدخل النص المصوب كاملاً…"
              />
            </label>
            <div className="followup-form-actions">
              <button type="button" className="table-btn" onClick={closeModal} disabled={busy}>
                إلغاء
              </button>
              <button type="submit" className="primary-btn" disabled={busy}>
                {busy ? 'جارٍ التوثيق…' : 'حفظ وتوقيع التصويب'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 5. Record Outcome Modal */}
      {modalMode === 'outcome' && (
        <Modal title="تسجيل مقياس نتيجة سريرية" onClose={closeModal}>
          <form className="followup-form" onSubmit={handleOutcomeSubmit}>
            <label>
              مقياس القياس السريري المعتمد *
              <select
                value={outcomeScale}
                onChange={(e) => setOutcomeScale(e.target.value as OutcomeMeasurementScale)}
              >
                {Object.entries(MEASUREMENT_SCALES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569' }}>
              {MEASUREMENT_SCALES[outcomeScale].description}
            </p>

            {MEASUREMENT_SCALES[outcomeScale].hasScore && (
              <>
                <label>
                  درجة تقييم الطبيب ({MEASUREMENT_SCALES[outcomeScale].min} إلى{' '}
                  {MEASUREMENT_SCALES[outcomeScale].max}) *
                  <input
                    type="number"
                    step={MEASUREMENT_SCALES[outcomeScale].step || 1}
                    min={MEASUREMENT_SCALES[outcomeScale].min}
                    max={MEASUREMENT_SCALES[outcomeScale].max}
                    value={clinicianScore}
                    onChange={(e) => setClinicianScore(e.target.value)}
                  />
                </label>
                <label>
                  درجة رضا المريض المعلنة (اختياري)
                  <input
                    type="number"
                    step={MEASUREMENT_SCALES[outcomeScale].step || 1}
                    min={MEASUREMENT_SCALES[outcomeScale].min}
                    max={MEASUREMENT_SCALES[outcomeScale].max}
                    value={patientReportedScore}
                    onChange={(e) => setPatientReportedScore(e.target.value)}
                  />
                </label>
              </>
            )}

            <label>
              ملاحظات الطبيب السريرية
              <textarea
                rows={3}
                maxLength={2000}
                value={clinicianNotes}
                onChange={(e) => setClinicianNotes(e.target.value)}
                placeholder="ملاحظات حول النتيجة وتناسق المظهر…"
              />
            </label>
            <label>
              ملاحظات وانطباع المريض الموثقة (اختياري)
              <textarea
                rows={2}
                maxLength={2000}
                value={patientReportedNotes}
                onChange={(e) => setPatientReportedNotes(e.target.value)}
                placeholder="ما صرح به المريض حول رضاه عن النتيجة…"
              />
            </label>

            <div className="followup-form-actions">
              <button type="button" className="table-btn" onClick={closeModal} disabled={busy}>
                إلغاء
              </button>
              <button type="submit" className="primary-btn" disabled={busy}>
                {busy ? 'جارٍ التوثيق…' : 'حفظ النتيجة السريرية'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 6. Record Adverse Event Modal */}
      {modalMode === 'adverse-event' && (
        <Modal title="الإبلاغ عن أثر جانبي أو حدث سريري" onClose={closeModal}>
          <form className="followup-form" onSubmit={handleAdverseEventSubmit}>
            <label>
              نوع الأثر أو الحدث السريري *
              <input
                type="text"
                required
                minLength={2}
                maxLength={100}
                value={aeType}
                onChange={(e) => setAeType(e.target.value)}
                placeholder="مثال: تورم موضعي حاد، احمرار مستمر، كدمة مفرطة"
              />
            </label>
            <label>
              مستوى الشدة السريرية *
              <select
                value={aeSeverity}
                onChange={(e) => setAeSeverity(e.target.value as FollowUpSeverity)}
              >
                {Object.entries(SEVERITY_META).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              تاريخ وتوقيت الملاحظة السريرية *
              <input
                type="datetime-local"
                required
                value={aeObservationDate}
                onChange={(e) => setAeObservationDate(e.target.value)}
              />
            </label>
            <label>
              الموجودات والفحص السريري الموثق *
              <textarea
                rows={3}
                required
                minLength={5}
                maxLength={4000}
                value={aeFindings}
                onChange={(e) => setAeFindings(e.target.value)}
                placeholder="تفاصيل الحالة السريرية، الأعراض، والموضع التشريحي…"
              />
            </label>
            <label>
              ملاحظات التدخل والتصعيد (اختياري)
              <textarea
                rows={2}
                maxLength={2000}
                value={aeEscalation}
                onChange={(e) => setAeEscalation(e.target.value)}
                placeholder="خطة التدخل الطبي أو الأدوية الموصوفة للتعامل مع العارض…"
              />
            </label>

            <div className="followup-form-actions">
              <button type="button" className="table-btn" onClick={closeModal} disabled={busy}>
                إلغاء
              </button>
              <button type="submit" className="primary-btn" disabled={busy}>
                {busy ? 'جارٍ الحفظ…' : 'توثيق الأثر الجانبي'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 7. Update Adverse Event Status Modal */}
      {modalMode === 'update-ae' && selectedAE && (
        <Modal title="تحديث حالة الأثر الجانبي" onClose={closeModal}>
          <form className="followup-form" onSubmit={handleUpdateAESubmit}>
            <label>
              الحالة السريرية للحدث *
              <select
                value={updateAeStatus}
                onChange={(e) => setUpdateAeStatus(e.target.value as AdverseEventStatus)}
              >
                {Object.entries(ADVERSE_EVENT_STATUS_META).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              ملاحظات المتابعة والتطور السريري
              <textarea
                rows={3}
                maxLength={2000}
                value={updateAeEscalation}
                onChange={(e) => setUpdateAeEscalation(e.target.value)}
                placeholder="سجل استجابة الحالة للتدخل أو تمام الاستقرار والتعافي…"
              />
            </label>

            <div className="followup-form-actions">
              <button type="button" className="table-btn" onClick={closeModal} disabled={busy}>
                إلغاء
              </button>
              <button type="submit" className="primary-btn" disabled={busy}>
                {busy ? 'جارٍ التحديث…' : 'حفظ التحديث السريري'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}

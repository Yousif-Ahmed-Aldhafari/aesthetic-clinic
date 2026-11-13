import React, { useState, useEffect } from 'react';
import type { ClinicContext } from '../auth/api';
import {
  listSpecialtiesCatalog,
  listClinicSpecialties,
  enableClinicSpecialty,
  disableClinicSpecialty,
  listBranchSpecialties,
  enableBranchSpecialty,
  disableBranchSpecialty,
  listPractitioners,
  upsertPractitionerProfile,
  designateMedicalDirector,
  addPractitionerQualification,
  verifyPractitionerQualification,
  rejectPractitionerQualification,
  requestClinicalPrivilege,
  approveClinicalPrivilege,
  revokeClinicalPrivilege,
  listApprovalQueue,
  type MedicalSpecialtyItem,
  type ClinicSpecialtyItem,
  type BranchSpecialtyItem,
  type PractitionerProfileItem,
  type ApprovalQueueResponse,
} from './specialty-api';
import { listBranches, type ClinicBranchItem } from '../branches/branch-api';

interface Props {
  clinic: ClinicContext;
  csrfToken?: string;
  onAuthError: (error: unknown) => void;
}

const PRIVILEGE_NAMES_AR: Record<string, string> = {
  CLINICAL_ENCOUNTER_DOCUMENT: 'توثيق الاستشارات السريرية',
  CLINICAL_NOTE_SIGN: 'التوقيع الرقمي للملاحظات الطبية',
  CLINICAL_DIAGNOSIS_RECORD: 'تسجيل التشخيص الطبي (ICD-10)',
  MEDICATION_PRESCRIBE: 'تحرير الوصفات الدوائية الإلكترونية',
  DIAGNOSTIC_LAB_ORDER: 'طلب الفحوصات والتحاليل المخبرية',
  DIAGNOSTIC_IMAGING_ORDER: 'طلب الفحوصات الإشعاعية والتصوير الطبي',
  CLINICAL_PROCEDURE_PERFORM: 'إجراء العمليات والإجراءات السريرية',
  MEDICATION_ADMINISTER: 'إعطاء الأدوية والمحاليل السريرية',
  SEDATION_ADMINISTER: 'إعطاء التخدير والتسكين الإجرائي',
};

const VERIFICATION_STATUS_AR: Record<string, { label: string; className: string }> = {
  SELF_REPORTED: { label: 'مُسجّل ذاتياً', className: 'status-tag pending' },
  PENDING_VERIFICATION: { label: 'بانتظار التحقق والاعتماد', className: 'status-tag warning' },
  VERIFIED: { label: 'مُعتمد ومُتحقق منه', className: 'status-tag success' },
  REJECTED: { label: 'مرفوض', className: 'status-tag danger' },
  EXPIRED: { label: 'منتهي الصلاحية', className: 'status-tag danger' },
  SUSPENDED: { label: 'مُعلّق', className: 'status-tag danger' },
};

export function SpecialtyAdministrationPanel({ clinic, csrfToken, onAuthError }: Props) {
  const [subTab, setSubTab] = useState<'specialties' | 'branches' | 'practitioners' | 'queue'>('specialties');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Data states
  const [catalog, setCatalog] = useState<MedicalSpecialtyItem[]>([]);
  const [clinicSpecialties, setClinicSpecialties] = useState<ClinicSpecialtyItem[]>([]);
  const [branches, setBranches] = useState<ClinicBranchItem[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [branchSpecialties, setBranchSpecialties] = useState<BranchSpecialtyItem[]>([]);
  const [practitioners, setPractitioners] = useState<PractitionerProfileItem[]>([]);
  const [approvalQueue, setApprovalQueue] = useState<ApprovalQueueResponse | null>(null);

  // Form states
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [selectedMembershipId, setSelectedMembershipId] = useState('');
  const [profTitleAr, setProfTitleAr] = useState('');
  const [profTitleEn, setProfTitleEn] = useState('');
  const [licNum, setLicNum] = useState('');
  const [licAuth, setLicAuth] = useState('');
  const [licJurisdiction, setLicJurisdiction] = useState('SA');
  const [licExpiry, setLicExpiry] = useState('');

  // Qualification form modal
  const [qualModalOpen, setQualModalOpen] = useState(false);
  const [qualSpecialtyCode, setQualSpecialtyCode] = useState('');
  const [qualTitle, setQualTitle] = useState('');
  const [qualLevel, setQualLevel] = useState('SPECIALIST');

  // Privilege form modal
  const [privModalOpen, setPrivModalOpen] = useState(false);
  const [privSpecialtyCode, setPrivSpecialtyCode] = useState('');
  const [privCode, setPrivCode] = useState<string>('CLINICAL_ENCOUNTER_DOCUMENT');
  const [privScope, setPrivScope] = useState<'CLINIC_WIDE' | 'BRANCH_SCOPED'>('CLINIC_WIDE');
  const [privBranchId, setPrivBranchId] = useState('');

  const isOwner = clinic.role === 'CLINIC_OWNER';
  const canManage = clinic.permissions.includes('specialties.manage');
  const clinicId = clinic.clinicId;

  async function loadData() {
    setBusy(true);
    setError('');
    try {
      const [catRes, clinicRes, branchesRes, practRes] = await Promise.all([
        listSpecialtiesCatalog(clinicId, csrfToken),
        listClinicSpecialties(clinicId, csrfToken),
        listBranches(clinicId, csrfToken),
        listPractitioners(clinicId, csrfToken),
      ]);
      setCatalog(catRes.items);
      setClinicSpecialties(clinicRes.items);
      setBranches(branchesRes.items);
      if (branchesRes.items.length > 0 && !selectedBranchId) {
        setSelectedBranchId(branchesRes.items[0].id);
      }
      setPractitioners(practRes.items);

      try {
        const queueRes = await listApprovalQueue(clinicId, csrfToken);
        setApprovalQueue(queueRes);
      } catch {
        // Queue is only accessible to staff.read
      }
    } catch (err: unknown) {
      onAuthError(err);
      setError('فشل في تحميل بيانات التخصصات والاعتماد السريري');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [clinicId]);

  useEffect(() => {
    if (selectedBranchId) {
      void listBranchSpecialties(clinicId, selectedBranchId, csrfToken)
        .then((res) => setBranchSpecialties(res.items))
        .catch(() => {});
    }
  }, [selectedBranchId, clinicId]);

  async function handleToggleClinicSpecialty(code: string, currentActive: boolean) {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      if (currentActive) {
        await disableClinicSpecialty(clinicId, code, csrfToken);
        setSuccess(`تم تعطيل تخصص ${code} للعيادة ولجميع الفروع التابعة`);
      } else {
        await enableClinicSpecialty(clinicId, code, csrfToken);
        setSuccess(`تم تفعيل تخصص ${code} بنجاح للعيادة`);
      }
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'تعذر تغيير حالة التخصص');
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleBranchSpecialty(code: string, currentActive: boolean) {
    if (!selectedBranchId) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      if (currentActive) {
        await disableBranchSpecialty(clinicId, selectedBranchId, code, csrfToken);
        setSuccess(`تم تعطيل التخصص في الفرع المحدد`);
      } else {
        await enableBranchSpecialty(clinicId, selectedBranchId, code, csrfToken);
        setSuccess(`تم تفعيل التخصص في الفرع المحدد بنجاح`);
      }
      const res = await listBranchSpecialties(clinicId, selectedBranchId, csrfToken);
      setBranchSpecialties(res.items);
    } catch (err: any) {
      setError(err?.message || 'تعذر تعديل تخصصات الفرع');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await upsertPractitionerProfile(
        clinicId,
        {
          membershipId: selectedMembershipId,
          professionalTitleAr: profTitleAr,
          professionalTitleEn: profTitleEn,
          licenseNumber: licNum || undefined,
          licensingAuthority: licAuth || undefined,
          licensingJurisdiction: licJurisdiction || undefined,
          licenseExpirationDate: licExpiry ? new Date(licExpiry).toISOString() : undefined,
        },
        csrfToken,
      );
      setSuccess('تم حفظ الملف المهني للممارس الصحي بنجاح');
      setProfileModalOpen(false);
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'فشل في حفظ الملف المهني');
    } finally {
      setBusy(false);
    }
  }

  async function handleDesignateDirector(membershipId: string) {
    if (!confirm('هل تؤكد تعيين هذا الممارس كمدير طبي للعيادة بصلاحيات اعتماد المؤهلات والصلاحيات السريرية؟')) return;
    setBusy(true);
    setError('');
    try {
      await designateMedicalDirector(clinicId, membershipId, csrfToken);
      setSuccess('تم تعيين المدير الطبي بنجاح وتسجيل الإجراء في سجل الرقابة');
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'تعذر تعيين المدير الطبي');
    } finally {
      setBusy(false);
    }
  }

  async function handleAddQualification(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await addPractitionerQualification(
        clinicId,
        selectedMembershipId,
        {
          specialtyCode: qualSpecialtyCode,
          qualificationTitle: qualTitle,
          qualificationLevel: qualLevel,
        },
        csrfToken,
      );
      setSuccess('تم تقديم المؤهل التخصصي للمراجعة والاعتماد');
      setQualModalOpen(false);
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'فشل في إضافة المؤهل');
    } finally {
      setBusy(false);
    }
  }

  async function handleRequestPrivilege(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await requestClinicalPrivilege(
        clinicId,
        selectedMembershipId,
        {
          specialtyCode: privSpecialtyCode,
          privilegeCode: privCode,
          scope: privScope,
          branchId: privScope === 'BRANCH_SCOPED' ? privBranchId : undefined,
        },
        csrfToken,
      );
      setSuccess('تم إرسال طلب الصلاحية السريرية إلى قائمة اعتماد المدير الطبي');
      setPrivModalOpen(false);
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'فشل في تقديم طلب الصلاحية السريرية');
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyQual(qualificationId: string) {
    setBusy(true);
    setError('');
    try {
      await verifyPractitionerQualification(clinicId, qualificationId, csrfToken);
      setSuccess('تم التحقق من المؤهل واعتماده سريرياً');
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'فشل في اعتماد المؤهل');
    } finally {
      setBusy(false);
    }
  }

  async function handleRejectQual(qualificationId: string) {
    const reason = prompt('أدخل سبب رفض المؤهل:');
    if (!reason) return;
    setBusy(true);
    setError('');
    try {
      await rejectPractitionerQualification(clinicId, qualificationId, reason, csrfToken);
      setSuccess('تم رفض المؤهل وتسجيل سبب الرفض');
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'فشل في رفض المؤهل');
    } finally {
      setBusy(false);
    }
  }

  async function handleApprovePriv(privilegeId: string) {
    setBusy(true);
    setError('');
    try {
      await approveClinicalPrivilege(clinicId, privilegeId, csrfToken);
      setSuccess('تم اعتماد الصلاحية السريرية للممارس بنجاح');
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'فشل في اعتماد الصلاحية السريرية');
    } finally {
      setBusy(false);
    }
  }

  async function handleRevokePriv(privilegeId: string) {
    const reason = prompt('أدخل سبب إلغاء أو تعليق الصلاحية:');
    if (!reason) return;
    setBusy(true);
    setError('');
    try {
      await revokeClinicalPrivilege(clinicId, privilegeId, reason, csrfToken);
      setSuccess('تم إلغاء الصلاحية السريرية بنجاح');
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'فشل في إلغاء الصلاحية');
    } finally {
      setBusy(false);
    }
  }

  const enabledSpecialtiesMap = new Map<string, ClinicSpecialtyItem>(
    clinicSpecialties.filter((cs) => cs.status === 'ACTIVE').map((cs) => [cs.specialty.code, cs]),
  );

  return (
    <div className="specialty-admin-panel" dir="rtl">
      <div className="section-header">
        <div>
          <h3>التخصصات الطبية والاعتماد السريري</h3>
          <p className="section-desc">
            إدارة التخصصات الطبية للعيادة والفروع، واعتماد تراخيص الممارسين الصحيين والصلاحيات السريرية الخاضعة للرقابة الطبية.
          </p>
        </div>
        <button type="button" className="table-btn" disabled={busy} onClick={() => void loadData()}>
          تحديث البيانات
        </button>
      </div>

      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {success && <div className="alert alert-success" role="status">{success}</div>}

      <nav className="settings-subtabs" aria-label="أقسام التخصصات والاعتماد">
        <button
          type="button"
          className={subTab === 'specialties' ? 'selected' : ''}
          onClick={() => setSubTab('specialties')}
        >
          التخصصات الطبية ({clinicSpecialties.filter((s) => s.status === 'ACTIVE').length})
        </button>
        <button
          type="button"
          className={subTab === 'branches' ? 'selected' : ''}
          onClick={() => setSubTab('branches')}
        >
          تخصصات الفروع
        </button>
        <button
          type="button"
          className={subTab === 'practitioners' ? 'selected' : ''}
          onClick={() => setSubTab('practitioners')}
        >
          الملفات المهنية والممارسون ({practitioners.length})
        </button>
        {approvalQueue && (
          <button
            type="button"
            className={subTab === 'queue' ? 'selected' : ''}
            onClick={() => setSubTab('queue')}
          >
            طلبات الاعتماد السريري (
            {approvalQueue.pendingQualifications.length + approvalQueue.pendingPrivileges.length}
            )
          </button>
        )}
      </nav>

      {/* 1. Medical Specialties Catalog & Clinic Configuration */}
      {subTab === 'specialties' && (
        <section className="tab-pane" aria-label="التخصصات الطبية للعيادة">
          <div className="table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>التخصص الطبي</th>
                  <th>الاسم بالإنجليزية</th>
                  <th>التصنيف</th>
                  <th>الحالة في العيادة</th>
                  <th>طبيعة التفعيل</th>
                  <th>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {catalog.map((spec) => {
                  const clinicSpec = enabledSpecialtiesMap.get(spec.code);
                  const isEnabled = !!clinicSpec;
                  return (
                    <tr key={spec.code}>
                      <td>
                        <strong>{spec.arabicName}</strong>
                        <small className="block text-muted">{spec.code}</small>
                      </td>
                      <td>{spec.englishName}</td>
                      <td><span className="badge">{spec.classification}</span></td>
                      <td>
                        {isEnabled ? (
                          <span className="status-tag success">مُفعّل بالعيادة</span>
                        ) : (
                          <span className="status-tag muted">غير مُفعّل</span>
                        )}
                      </td>
                      <td>
                        {clinicSpec?.isCompatibility ? (
                          <span className="badge info">توافقية تلقائية (أصيل)</span>
                        ) : isEnabled ? (
                          <span className="badge">تفعيل يدوي</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {canManage ? (
                          <button
                            type="button"
                            className={`table-btn ${isEnabled ? 'danger' : 'primary'}`}
                            disabled={busy}
                            onClick={() => void handleToggleClinicSpecialty(spec.code, isEnabled)}
                          >
                            {isEnabled ? 'تعطيل التخصص' : 'تفعيل التخصص'}
                          </button>
                        ) : (
                          <small className="text-muted">مقصور على الإدارة</small>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 2. Branch Specialties */}
      {subTab === 'branches' && (
        <section className="tab-pane" aria-label="تخصصات الفروع">
          <div className="branch-selector-bar">
            <label htmlFor="branch-select">اختر الفرع لإدارة تخصصاته المتاحة:</label>
            <select
              id="branch-select"
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              disabled={busy}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nameAr} ({b.code})
                </option>
              ))}
            </select>
          </div>

          <p className="info-banner">
            ملاحظة نظامية: لا يمكن تفعيل تخصص في الفرع ما لم يكن مفعّلاً في العيادة الأم أولاً.
          </p>

          <div className="table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>التخصص</th>
                  <th>الحالة في العيادة الأم</th>
                  <th>الحالة في هذا الفرع</th>
                  <th>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {catalog.map((spec) => {
                  const clinicEnabled = enabledSpecialtiesMap.has(spec.code);
                  const branchEnabled = branchSpecialties.some(
                    (bs) => bs.specialty.code === spec.code && bs.status === 'ACTIVE',
                  );
                  return (
                    <tr key={spec.code}>
                      <td>
                        <strong>{spec.arabicName}</strong> ({spec.code})
                      </td>
                      <td>
                        {clinicEnabled ? (
                          <span className="status-tag success">متاح للعيادة</span>
                        ) : (
                          <span className="status-tag danger">معطل بالعيادة</span>
                        )}
                      </td>
                      <td>
                        {branchEnabled ? (
                          <span className="status-tag success">مفعّل بالفرع</span>
                        ) : (
                          <span className="status-tag muted">غير متاح بالفرع</span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`table-btn ${branchEnabled ? 'danger' : 'primary'}`}
                          disabled={busy || !clinicEnabled || !canManage}
                          onClick={() => void handleToggleBranchSpecialty(spec.code, branchEnabled)}
                          title={!clinicEnabled ? 'يجب تفعيل التخصص في العيادة أولاً' : ''}
                        >
                          {branchEnabled ? 'إلغاء الإتاحة بالفرع' : 'إتاحة بالفرع'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 3. Practitioner Profiles & Qualifications */}
      {subTab === 'practitioners' && (
        <section className="tab-pane" aria-label="الملفات المهنية والممارسون">
          <div className="table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>اسم الممارس</th>
                  <th>المسمى المهني</th>
                  <th>رقم الترخيص والهيئة</th>
                  <th>حالة التحقق</th>
                  <th>المدير الطبي</th>
                  <th>المؤهلات والصلاحيات</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {practitioners.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center text-muted">
                      لم يتم إنشاء ملفات مهنية بعد. يمكن للأطباء أو الإدارة تسجيل الملفات والتراخيص.
                    </td>
                  </tr>
                ) : (
                  practitioners.map((doc) => {
                    const statusMeta = VERIFICATION_STATUS_AR[doc.verificationStatus] || {
                      label: doc.verificationStatus,
                      className: 'status-tag',
                    };
                    return (
                      <tr key={doc.id}>
                        <td>
                          <strong>{doc.membership?.user?.name || 'طبيب'}</strong>
                          <small className="block text-muted">{doc.membership?.user?.email}</small>
                        </td>
                        <td>
                          <div>{doc.professionalTitleAr}</div>
                          <small className="text-muted">{doc.professionalTitleEn}</small>
                        </td>
                        <td>
                          {doc.licenseNumber ? (
                            <div>
                              <code>{doc.licenseNumber}</code>
                              <small className="block text-muted">
                                {doc.licensingAuthority || 'الهيئة الصحية'} ({doc.licensingJurisdiction || 'SA'})
                              </small>
                            </div>
                          ) : (
                            <span className="text-muted">لم يُدخل ترخيص</span>
                          )}
                        </td>
                        <td>
                          <span className={statusMeta.className}>{statusMeta.label}</span>
                        </td>
                        <td>
                          {doc.isMedicalDirector ? (
                            <span className="status-tag success">مدير طبي معتمد</span>
                          ) : isOwner ? (
                            <button
                              type="button"
                              className="table-btn small"
                              disabled={busy || !doc.licenseNumber}
                              onClick={() => void handleDesignateDirector(doc.membershipId)}
                              title="تعيين كمدير طبي معتمد للعيادة"
                            >
                              تعيين كمدير طبي
                            </button>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          <div>
                            <small>المؤهلات: {doc.qualifications?.length || 0}</small>
                            <br />
                            <small>الصلاحيات: {doc.clinicalPrivileges?.filter((p) => p.status === 'APPROVED').length || 0}</small>
                          </div>
                        </td>
                        <td>
                          <div className="btn-group">
                            <button
                              type="button"
                              className="table-btn small"
                              onClick={() => {
                                setSelectedMembershipId(doc.membershipId);
                                setProfTitleAr(doc.professionalTitleAr);
                                setProfTitleEn(doc.professionalTitleEn);
                                setLicNum(doc.licenseNumber || '');
                                setLicAuth(doc.licensingAuthority || '');
                                setLicJurisdiction(doc.licensingJurisdiction || 'SA');
                                setLicExpiry(doc.licenseExpirationDate ? doc.licenseExpirationDate.split('T')[0] : '');
                                setProfileModalOpen(true);
                              }}
                            >
                              تعديل الترخيص
                            </button>
                            <button
                              type="button"
                              className="table-btn small"
                              onClick={() => {
                                setSelectedMembershipId(doc.membershipId);
                                setQualModalOpen(true);
                              }}
                            >
                              + مؤهل
                            </button>
                            <button
                              type="button"
                              className="table-btn small"
                              onClick={() => {
                                setSelectedMembershipId(doc.membershipId);
                                setPrivModalOpen(true);
                              }}
                            >
                              + صلاحية
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 4. Verification and Approval Queue (Medical Director) */}
      {subTab === 'queue' && approvalQueue && (
        <section className="tab-pane" aria-label="طلبات الاعتماد السريري">
          <h4>المؤهلات والتراخيص بانتظار الاعتماد ({approvalQueue.pendingQualifications.length})</h4>
          <div className="table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>الممارس</th>
                  <th>التخصص</th>
                  <th>المؤهل</th>
                  <th>المستوى</th>
                  <th>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {approvalQueue.pendingQualifications.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-muted">
                      لا توجد مؤهلات بانتظار الاعتماد حالياً.
                    </td>
                  </tr>
                ) : (
                  approvalQueue.pendingQualifications.map((q) => (
                    <tr key={q.id}>
                      <td>
                        <strong>{q.practitionerProfile?.membership?.user?.name || 'ممارس'}</strong>
                      </td>
                      <td>{q.specialty.arabicName}</td>
                      <td>{q.qualificationTitle}</td>
                      <td><span className="badge">{q.qualificationLevel}</span></td>
                      <td>
                        <div className="btn-group">
                          <button
                            type="button"
                            className="table-btn primary small"
                            disabled={busy}
                            onClick={() => void handleVerifyQual(q.id)}
                          >
                            اعتماد المؤهل
                          </button>
                          <button
                            type="button"
                            className="table-btn danger small"
                            disabled={busy}
                            onClick={() => void handleRejectQual(q.id)}
                          >
                            رفض
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <h4 style={{ marginTop: '2rem' }}>
            الصلاحيات السريرية بانتظار الاعتماد ({approvalQueue.pendingPrivileges.length})
          </h4>
          <div className="table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>الممارس</th>
                  <th>التخصص</th>
                  <th>نوع الصلاحية</th>
                  <th>النطاق</th>
                  <th>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {approvalQueue.pendingPrivileges.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-muted">
                      لا توجد صلاحيات سريرية بانتظار الاعتماد حالياً.
                    </td>
                  </tr>
                ) : (
                  approvalQueue.pendingPrivileges.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.practitionerProfile?.membership?.user?.name || 'ممارس'}</strong>
                      </td>
                      <td>{p.specialty.arabicName}</td>
                      <td>
                        <strong>{PRIVILEGE_NAMES_AR[p.privilegeCode] || p.privilegeCode}</strong>
                      </td>
                      <td>
                        {p.scope === 'CLINIC_WIDE' ? (
                          <span className="badge">على مستوى العيادة</span>
                        ) : (
                          <span className="badge info">فرع: {p.branch?.nameAr || 'محدد'}</span>
                        )}
                      </td>
                      <td>
                        <div className="btn-group">
                          <button
                            type="button"
                            className="table-btn primary small"
                            disabled={busy}
                            onClick={() => void handleApprovePriv(p.id)}
                          >
                            اعتماد الصلاحية
                          </button>
                          <button
                            type="button"
                            className="table-btn danger small"
                            disabled={busy}
                            onClick={() => void handleRevokePriv(p.id)}
                          >
                            رفض
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Modal: Edit Profile & License */}
      {profileModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h4>تعديل بيانات الملف المهني والترخيص</h4>
            <form onSubmit={handleSaveProfile}>
              <div className="form-group">
                <label>المسمى المهني (بالعربية):</label>
                <input
                  type="text"
                  placeholder="مثال: استشاري طب الأسرة"
                  value={profTitleAr}
                  onChange={(e) => setProfTitleAr(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>المسمى المهني (بالإنجليزية):</label>
                <input
                  type="text"
                  placeholder="e.g. Family Medicine Consultant"
                  value={profTitleEn}
                  onChange={(e) => setProfTitleEn(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>رقم الترخيص الصحي:</label>
                <input
                  type="text"
                  placeholder="رقم ترخيص المزاولة المهنية"
                  value={licNum}
                  onChange={(e) => setLicNum(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>الهيئة الصحية المصدرة:</label>
                <input
                  type="text"
                  placeholder="مثال: الهيئة السعودية للتخصصات الصحية"
                  value={licAuth}
                  onChange={(e) => setLicAuth(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>دولة الترخيص:</label>
                <select value={licJurisdiction} onChange={(e) => setLicJurisdiction(e.target.value)}>
                  <option value="SA">المملكة العربية السعودية (SA)</option>
                  <option value="AE">الإمارات العربية المتحدة (AE)</option>
                  <option value="OTHER">أخرى</option>
                </select>
              </div>
              <div className="form-group">
                <label>تاريخ انتهاء الترخيص:</label>
                <input
                  type="date"
                  value={licExpiry}
                  onChange={(e) => setLicExpiry(e.target.value)}
                />
              </div>
              <div className="modal-actions">
                <button type="submit" className="table-btn primary" disabled={busy}>
                  حفظ التعديلات
                </button>
                <button
                  type="button"
                  className="table-btn"
                  onClick={() => setProfileModalOpen(false)}
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Qualification */}
      {qualModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h4>إضافة مؤهل تخصصي للممارس</h4>
            <form onSubmit={handleAddQualification}>
              <div className="form-group">
                <label>التخصص الطبي المعتمد:</label>
                <select
                  value={qualSpecialtyCode}
                  onChange={(e) => setQualSpecialtyCode(e.target.value)}
                  required
                >
                  <option value="">-- اختر التخصص --</option>
                  {catalog.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.arabicName} ({s.code})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>مسمى المؤهل العلمي / الشهادة:</label>
                <input
                  type="text"
                  placeholder="مثال: البورد السعودي في طب الأسرة"
                  value={qualTitle}
                  onChange={(e) => setQualTitle(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>المستوى المهني:</label>
                <select value={qualLevel} onChange={(e) => setQualLevel(e.target.value)}>
                  <option value="GENERAL_PRACTITIONER">طبيب مقيم / عام</option>
                  <option value="SPECIALIST">نائب / أخصائي</option>
                  <option value="SENIOR_SPECIALIST">نائب أول / أخصائي أول</option>
                  <option value="CONSULTANT">استشاري</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="submit" className="table-btn primary" disabled={busy}>
                  إرسال للاعتماد
                </button>
                <button
                  type="button"
                  className="table-btn"
                  onClick={() => setQualModalOpen(false)}
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Request Privilege */}
      {privModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h4>طلب منح صلاحية سريرية</h4>
            <form onSubmit={handleRequestPrivilege}>
              <div className="form-group">
                <label>التخصص الطبي:</label>
                <select
                  value={privSpecialtyCode}
                  onChange={(e) => setPrivSpecialtyCode(e.target.value)}
                  required
                >
                  <option value="">-- اختر التخصص --</option>
                  {catalog.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.arabicName} ({s.code})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>نوع الصلاحية السريرية المطلوبة:</label>
                <select
                  value={privCode}
                  onChange={(e) => setPrivCode(e.target.value)}
                  required
                >
                  {Object.entries(PRIVILEGE_NAMES_AR).map(([code, name]) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>نطاق الصلاحية:</label>
                <select
                  value={privScope}
                  onChange={(e) => setPrivScope(e.target.value as any)}
                >
                  <option value="CLINIC_WIDE">على مستوى العيادة بكافة فروعها</option>
                  <option value="BRANCH_SCOPED">مقصورة على فرع محدد</option>
                </select>
              </div>
              {privScope === 'BRANCH_SCOPED' && (
                <div className="form-group">
                  <label>الفرع المصرح له:</label>
                  <select
                    value={privBranchId}
                    onChange={(e) => setPrivBranchId(e.target.value)}
                    required
                  >
                    <option value="">-- اختر الفرع --</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.nameAr}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="modal-actions">
                <button type="submit" className="table-btn primary" disabled={busy}>
                  تقديم الطلب للمدير الطبي
                </button>
                <button
                  type="button"
                  className="table-btn"
                  onClick={() => setPrivModalOpen(false)}
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

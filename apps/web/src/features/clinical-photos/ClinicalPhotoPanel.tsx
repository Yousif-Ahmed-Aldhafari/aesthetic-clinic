import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './clinical-photos.css';
import {
  type ClinicalPhotoDto,
  type ClinicalPhotoSessionDto,
  type PhotoCategory,
  type PhotoComparisonGroupDto,
  PhotoApi,
} from './photo-api';

interface ClinicalPhotoPanelProps {
  clinicId: string;
  patientId: string;
  csrfToken: string;
  clinicPermissions: string[];
  onAuthError?: (err: unknown) => void;
}

export const BODY_AREAS = [
  'كامل الوجه (أمامي)',
  'الوجه (جانبي أيمن)',
  'الوجه (جانبي أيسر)',
  'الجبهة والمنطقة المقطبية',
  'محيط العينين (الجفون)',
  'الأنف ومحيطه',
  'الخدين والوجنتين',
  'الشفاه ومنطقة الفم',
  'الفك والذقن واللغلوغ',
  'الرقبة والصدر العلوي',
  'اليدين',
  'منطقة أخرى',
];

export function ClinicalPhotoPanel({
  clinicId,
  patientId,
  csrfToken,
  clinicPermissions,
  onAuthError,
}: ClinicalPhotoPanelProps) {
  const api = useMemo(() => new PhotoApi(clinicId, csrfToken, onAuthError), [clinicId, csrfToken, onAuthError]);

  const canUpload = clinicPermissions.includes('clinical.photos.upload');
  const canAnnotate = clinicPermissions.includes('clinical.photos.annotate');
  const canCompare = clinicPermissions.includes('clinical.photos.compare');
  const canManage = clinicPermissions.includes('clinical.photos.manage');

  // State
  const [activeTab, setActiveTab] = useState<'gallery' | 'comparisons'>('gallery');
  const [sessions, setSessions] = useState<ClinicalPhotoSessionDto[]>([]);
  const [comparisons, setComparisons] = useState<PhotoComparisonGroupDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [notice, setNotice] = useState<string>('');

  // Consent status
  const [activeConsent, setActiveConsent] = useState<{ id: string; expiresAt: string | null } | null>(null);

  // Modals
  const [showSessionModal, setShowSessionModal] = useState<boolean>(false);
  const [sessionNotes, setSessionNotes] = useState<string>('');
  const [sessionDate, setSessionDate] = useState<string>(new Date().toISOString().slice(0, 10));

  const [uploadTargetSessionId, setUploadTargetSessionId] = useState<string | null>(null);
  const [uploadCategory, setUploadCategory] = useState<PhotoCategory>('BEFORE');
  const [uploadBodyArea, setUploadBodyArea] = useState<string>(BODY_AREAS[0]);
  const [uploadCaption, setUploadCaption] = useState<string>('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);

  // Lightbox & Annotations
  const [lightboxPhoto, setLightboxPhoto] = useState<ClinicalPhotoDto | null>(null);
  const [lightboxOriginalUrl, setLightboxOriginalUrl] = useState<string | null>(null);
  const [lightboxAnnotations, setLightboxAnnotations] = useState<any[]>([]);
  const [newAnnotationComment, setNewAnnotationComment] = useState<string>('');
  const [annotating, setAnnotating] = useState<boolean>(false);

  // Archival modal
  const [archiveTargetPhoto, setArchiveTargetPhoto] = useState<ClinicalPhotoDto | null>(null);
  const [archiveReason, setArchiveReason] = useState<string>('');
  const [archiving, setArchiving] = useState<boolean>(false);

  // New comparison modal
  const [showComparisonModal, setShowComparisonModal] = useState<boolean>(false);
  const [compTitle, setCompTitle] = useState<string>('');
  const [compBeforeId, setCompBeforeId] = useState<string>('');
  const [compAfterId, setCompAfterId] = useState<string>('');
  const [compNotes, setCompNotes] = useState<string>('');

  // Split slider preview modal
  const [activeSliderGroup, setActiveSliderGroup] = useState<PhotoComparisonGroupDto | null>(null);
  const [sliderPos, setSliderPos] = useState<number>(50);
  const [sliderBeforeUrl, setSliderBeforeUrl] = useState<string | null>(null);
  const [sliderAfterUrl, setSliderAfterUrl] = useState<string | null>(null);

  // Memory safety: track created Object URLs to revoke on unmount or cleanup
  const blobUrlsRef = useRef<Map<string, string>>(new Map());

  const getOrCreateBlobUrl = useCallback(
    async (photoId: string, variant: 'thumbnail' | 'original'): Promise<string> => {
      const key = `${photoId}_${variant}`;
      const existing = blobUrlsRef.current.get(key);
      if (existing) return existing;

      const blob = await api.fetchDecryptedBlob(photoId, variant);
      const url = URL.createObjectURL(blob);
      blobUrlsRef.current.set(key, url);
      return url;
    },
    [api],
  );

  // Revoke all blob URLs when panel unmounts
  useEffect(() => {
    const urls = blobUrlsRef.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  // Thumbnail subcomponent with automatic blob fetching
  const PhotoThumbnail = ({ photo, onClick }: { photo: ClinicalPhotoDto; onClick: () => void }) => {
    const [thumbUrl, setThumbUrl] = useState<string | null>(null);

    useEffect(() => {
      let active = true;
      getOrCreateBlobUrl(photo.id, 'thumbnail')
        .then((url) => {
          if (active) setThumbUrl(url);
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, [photo.id]);

    const badgeClass =
      photo.category === 'BEFORE' ? 'badge-before' : photo.category === 'AFTER' ? 'badge-after' : 'badge-followup';
    const badgeText =
      photo.category === 'BEFORE' ? 'قبل الإجراء' : photo.category === 'AFTER' ? 'بعد الإجراء' : 'متابعة دورية';

    return (
      <div className="photo-card">
        <span className={`photo-badge ${badgeClass}`}>{badgeText}</span>
        <div className="photo-thumb-wrap" onClick={onClick} role="button" tabIndex={0} aria-label={`عرض صورة ${photo.bodyArea}`}>
          {thumbUrl ? (
            <img src={thumbUrl} alt={photo.caption || photo.bodyArea} className="photo-thumb-img" />
          ) : (
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>جارٍ فك التشفير…</span>
          )}
        </div>
        <div className="photo-card-info">
          <span className="photo-body-area">{photo.bodyArea}</span>
          {photo.caption && <span className="photo-caption">{photo.caption}</span>}
          <div className="photo-actions">
            <button type="button" className="table-btn" onClick={onClick}>
              معاينة وتكبير
            </button>
            {canManage && !photo.isArchived && (
              <button
                type="button"
                className="table-btn"
                style={{ color: '#dc2626' }}
                onClick={(e) => {
                  e.stopPropagation();
                  setArchiveTargetPhoto(photo);
                  setArchiveReason('');
                }}
              >
                أرشفة
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [sessList, compList, consents] = await Promise.all([
        api.listSessions(patientId),
        api.listComparisons(patientId),
        api.listConsents(patientId),
      ]);

      setSessions(sessList);
      setComparisons(compList);

      const photoConsent = consents.find((c) => c.purpose === 'CLINICAL_PHOTOGRAPHY' && c.status === 'ACTIVE');
      if (photoConsent) {
        setActiveConsent({ id: photoConsent.id, expiresAt: photoConsent.expiresAt || null });
      } else {
        setActiveConsent(null);
      }
    } catch (err: any) {
      setError(err?.message || 'تعذر تحميل بيانات التوثيق الفوتوغرافي');
    } finally {
      setLoading(false);
    }
  }, [api, patientId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Create Session
  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConsent) {
      setError('مطلوب موافقة تصوير سريري طبية معتمدة لإنشاء جلسة تصوير جديدة');
      return;
    }
    try {
      await api.createSession({
        patientId,
        consentId: activeConsent.id,
        sessionDate: new Date(sessionDate).toISOString(),
        notes: sessionNotes.trim() || undefined,
      });
      setShowSessionModal(false);
      setSessionNotes('');
      setNotice('تم إنشاء جلسة التصوير بنجاح');
      void loadData();
    } catch (err: any) {
      setError(err?.message || 'فشل إنشاء جلسة التصوير');
    }
  };

  // Upload Photo
  const handleUploadPhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadTargetSessionId || !uploadFile) {
      setError('يرجى اختيار ملف الصورة وجلسة التصوير');
      return;
    }
    setUploading(true);
    setError('');
    try {
      await api.uploadPhoto(
        uploadTargetSessionId,
        uploadFile,
        uploadCategory,
        uploadBodyArea.trim(),
        uploadCaption.trim() || undefined,
      );
      setUploadTargetSessionId(null);
      setUploadFile(null);
      setUploadCaption('');
      setNotice('تمت معالجة وتشفير الصورة السريرية بنجاح وحفظها بالسجل الطبي');
      void loadData();
    } catch (err: any) {
      setError(err?.message || 'تعذر رفع الصورة ومعالجتها');
    } finally {
      setUploading(false);
    }
  };

  // Open Lightbox
  const openLightbox = async (photo: ClinicalPhotoDto) => {
    setLightboxPhoto(photo);
    try {
      const origUrl = await getOrCreateBlobUrl(photo.id, 'original');
      setLightboxOriginalUrl(origUrl);
      const annots = await api.listAnnotations(photo.id);
      setLightboxAnnotations(annots);
    } catch (err: any) {
      setError(err?.message || 'تعذر تحميل النسخة الكاملة أو الملاحظات');
    }
  };

  // Add Annotation
  const handleAddAnnotation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lightboxPhoto || !newAnnotationComment.trim()) return;
    setAnnotating(true);
    try {
      const newAnnot = await api.addAnnotation(lightboxPhoto.id, {
        annotationType: 'TEXT',
        comment: newAnnotationComment.trim(),
      });
      setLightboxAnnotations((prev) => [...prev, newAnnot]);
      setNewAnnotationComment('');
      setNotice('تم حفظ الملاحظة السريرية التوضيحية');
    } catch (err: any) {
      setError(err?.message || 'تعذر إضافة الملاحظة');
    } finally {
      setAnnotating(false);
    }
  };

  // Archive photo
  const handleArchivePhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!archiveTargetPhoto || archiveReason.trim().length < 3) {
      setError('يرجى توضيح سبب أرشفة الصورة (٣ أحرف على الأقل)');
      return;
    }
    setArchiving(true);
    try {
      await api.archivePhoto(archiveTargetPhoto.id, {
        expectedVersion: archiveTargetPhoto.version || 1,
        reason: archiveReason.trim(),
      });
      setArchiveTargetPhoto(null);
      setArchiveReason('');
      setNotice('تمت أرشفة الصورة السريرية بنجاح');
      void loadData();
    } catch (err: any) {
      setError(err?.message || 'تعذر إتمام أرشفة الصورة');
    } finally {
      setArchiving(false);
    }
  };

  // Create comparison
  const handleCreateComparison = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compTitle.trim() || !compBeforeId || !compAfterId) {
      setError('يرجى تحديد عنوان المقارنة وصورتي قبل وبعد');
      return;
    }
    try {
      await api.createComparison(patientId, {
        title: compTitle.trim(),
        beforePhotoId: compBeforeId,
        afterPhotoId: compAfterId,
        notes: compNotes.trim() || undefined,
      });
      setShowComparisonModal(false);
      setCompTitle('');
      setCompBeforeId('');
      setCompAfterId('');
      setCompNotes('');
      setNotice('تم إنشاء مجموعة المقارنة السريرية');
      void loadData();
    } catch (err: any) {
      setError(err?.message || 'تعذر إنشاء مجموعة المقارنة');
    }
  };

  // Open Slider
  const openSlider = async (group: PhotoComparisonGroupDto) => {
    setActiveSliderGroup(group);
    setSliderPos(50);
    try {
      const [beforeUrl, afterUrl] = await Promise.all([
        getOrCreateBlobUrl(group.beforePhoto.id, 'original'),
        getOrCreateBlobUrl(group.afterPhoto.id, 'original'),
      ]);
      setSliderBeforeUrl(beforeUrl);
      setSliderAfterUrl(afterUrl);
    } catch (err: any) {
      setError(err?.message || 'تعذر تحميل صور المقارنة التفاعلية');
    }
  };

  // Flat list of unarchived photos for comparison selector
  const allPhotos = useMemo(() => {
    return sessions.flatMap((s) => s.photos);
  }, [sessions]);

  return (
    <div className="clinical-photos-panel">
      <div className="clinical-photos-header">
        <div>
          <h4>التوثيق الفوتوغرافي السريري الطبي (Before & After)</h4>
          <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
            الصور مشفرة ومحمية بالكامل بموجب إقرار الموافقة المستنيرة ومعايير الخصوصية السريرية.
          </span>
        </div>
        {canUpload && activeConsent && (
          <button type="button" className="primary-btn" onClick={() => setShowSessionModal(true)}>
            ＋ جلسة تصوير جديدة
          </button>
        )}
      </div>

      {/* Consent Status Notification Banner */}
      <div className={`clinical-photos-consent-banner ${activeConsent ? 'consent-active' : 'consent-missing'}`}>
        {activeConsent ? (
          <div>
            <b>✓ موافقة تصوير سريري معتمدة وسارية:</b> تم توثيق إقرار المريض بالموافقة على التقاط الصور الطبية لمتابعة
            العلاج. (الصور سرية ولا تُنشر إعلانيًا).
          </div>
        ) : (
          <div>
            <b>⚠️ مطلوب إقرار موافقة على التصوير السريري:</b> لا يمكن التقاط أو رفع صور طبية للمريض دون توقيع واعتماد
            إقرار "موافقة التصوير السريري" في قسم الموافقات المستنيرة.
          </div>
        )}
      </div>

      {notice && (
        <div className="notice" role="status">
          {notice}
          <button type="button" onClick={() => setNotice('')}>
            ×
          </button>
        </div>
      )}

      {error && (
        <div className="patient-error" role="alert">
          {error}
          <button type="button" className="table-btn" onClick={() => setError('')}>
            إغلاق
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="photo-tabs">
        <button
          type="button"
          className={`photo-tab-btn ${activeTab === 'gallery' ? 'active' : ''}`}
          onClick={() => setActiveTab('gallery')}
        >
          معرض الصور والجلسات ({sessions.reduce((acc, s) => acc + s.photos.length, 0)})
        </button>
        {canCompare && (
          <button
            type="button"
            className={`photo-tab-btn ${activeTab === 'comparisons' ? 'active' : ''}`}
            onClick={() => setActiveTab('comparisons')}
          >
            مقارنات قبل وبعد ({comparisons.length})
          </button>
        )}
      </div>

      {loading ? (
        <p className="empty">جارٍ فك تشفير وتحديث بيانات التوثيق الفوتوغرافي…</p>
      ) : activeTab === 'gallery' ? (
        <div>
          {sessions.length === 0 ? (
            <p className="empty">لا توجد جلسات تصوير مسجلة لهذا المريض حتى الآن.</p>
          ) : (
            sessions.map((session) => (
              <div key={session.id} className="photo-session-card">
                <div className="session-header">
                  <div>
                    <b>جلسة بتاريخ:</b> {new Date(session.sessionDate).toLocaleDateString('ar-EG')} ·{' '}
                    <span>الطبيب: {session.clinician?.user?.name}</span>
                    {session.notes && <p style={{ margin: '0.25rem 0', color: '#334155' }}>{session.notes}</p>}
                  </div>
                  {canUpload && activeConsent && (
                    <button
                      type="button"
                      className="table-btn"
                      onClick={() => {
                        setUploadTargetSessionId(session.id);
                        setUploadFile(null);
                        setUploadCaption('');
                      }}
                    >
                      ＋ إضافة صورة للجلسة
                    </button>
                  )}
                </div>

                {session.photos.length === 0 ? (
                  <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0.5rem 0' }}>
                    لم يتم رفع صور في هذه الجلسة بعد.
                  </p>
                ) : (
                  <div className="photo-grid">
                    {session.photos.map((photo) => (
                      <PhotoThumbnail key={photo.id} photo={photo} onClick={() => void openLightbox(photo)} />
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        /* Comparisons Tab */
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
            <button
              type="button"
              className="primary-btn"
              disabled={allPhotos.length < 2}
              onClick={() => setShowComparisonModal(true)}
            >
              ＋ إنشاء مقارنة جديدة
            </button>
          </div>

          {comparisons.length === 0 ? (
            <p className="empty">لا توجد مجموعات مقارنة مجهزة. يمكنك إنشاء مقارنة تفاعلية بين صورتين.</p>
          ) : (
            comparisons.map((comp) => (
              <div key={comp.id} className="comparison-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h5 style={{ margin: '0 0 0.25rem 0', fontSize: '1rem' }}>{comp.title}</h5>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      أنشئت بواسطة د. {comp.clinician?.user?.name} بتاريخ{' '}
                      {new Date(comp.createdAt).toLocaleDateString('ar-EG')}
                    </span>
                  </div>
                  <button type="button" className="primary-btn" onClick={() => void openSlider(comp)}>
                    عرض المقارنة التفاعلية (Split-Slider)
                  </button>
                </div>
                {comp.notes && <p style={{ fontSize: '0.85rem', color: '#334155', margin: '0.5rem 0' }}>{comp.notes}</p>}
              </div>
            ))
          )}
        </div>
      )}

      {/* Modal: Create Session */}
      {showSessionModal && (
        <div className="photo-lightbox-modal">
          <div className="photo-lightbox-content" style={{ maxWidth: '500px', flexDirection: 'column', padding: '1.5rem' }}>
            <h4 style={{ margin: '0 0 1rem 0' }}>إنشاء جلسة تصوير سريري جديدة</h4>
            <form onSubmit={(e) => void handleCreateSession(e)}>
              <label style={{ display: 'block', marginBottom: '0.75rem' }}>
                تاريخ الجلسة:
                <input
                  type="date"
                  required
                  value={sessionDate}
                  onChange={(e) => setSessionDate(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
                />
              </label>
              <label style={{ display: 'block', marginBottom: '1rem' }}>
                ملاحظات أو سياق الجلسة:
                <textarea
                  rows={3}
                  value={sessionNotes}
                  onChange={(e) => setSessionNotes(e.target.value)}
                  placeholder="مثال: توثيق ما قبل جلسة الفيلر للوجنتين بالإضاءة المعيارية"
                  style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
                />
              </label>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" className="table-btn" onClick={() => setShowSessionModal(false)}>
                  إلغاء
                </button>
                <button type="submit" className="primary-btn">
                  حفظ الجلسة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Upload Photo */}
      {uploadTargetSessionId && (
        <div className="photo-lightbox-modal">
          <div className="photo-lightbox-content" style={{ maxWidth: '550px', flexDirection: 'column', padding: '1.5rem' }}>
            <h4 style={{ margin: '0 0 1rem 0' }}>رفع وتشفير صورة سريرية</h4>
            <form onSubmit={(e) => void handleUploadPhoto(e)}>
              <label style={{ display: 'block', marginBottom: '0.75rem' }}>
                تصنيف الصورة:
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value as PhotoCategory)}
                  style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
                >
                  <option value="BEFORE">قبل الإجراء (BEFORE)</option>
                  <option value="AFTER">بعد الإجراء (AFTER)</option>
                  <option value="FOLLOW_UP">متابعة دورية (FOLLOW_UP)</option>
                </select>
              </label>
              <label style={{ display: 'block', marginBottom: '0.75rem' }}>
                المنطقة التشريحية المستهدفة:
                <select
                  value={uploadBodyArea}
                  onChange={(e) => setUploadBodyArea(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
                >
                  {BODY_AREAS.map((area) => (
                    <option key={area} value={area}>
                      {area}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'block', marginBottom: '0.75rem' }}>
                وصف توضيحي أو زاوية التقاط:
                <input
                  type="text"
                  maxLength={500}
                  value={uploadCaption}
                  onChange={(e) => setUploadCaption(e.target.value)}
                  placeholder="مثال: إضاءة أمامية معيارية بوضعية الاسترخاء"
                  style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
                />
              </label>
              <label style={{ display: 'block', marginBottom: '1.25rem' }}>
                اختر ملف الصورة (JPEG, PNG, WebP حتى 15 ميجابايت):
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  required
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  style={{ width: '100%', marginTop: '0.25rem' }}
                />
              </label>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="table-btn"
                  disabled={uploading}
                  onClick={() => setUploadTargetSessionId(null)}
                >
                  إلغاء
                </button>
                <button type="submit" className="primary-btn" disabled={uploading}>
                  {uploading ? 'جارٍ المعالجة والتشفير…' : 'رفع وتأمين الصورة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Lightbox & Annotations */}
      {lightboxPhoto && (
        <div className="photo-lightbox-modal" onClick={() => setLightboxPhoto(null)}>
          <div className="photo-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <div className="lightbox-image-pane">
              {lightboxOriginalUrl ? (
                <img
                  src={lightboxOriginalUrl}
                  alt={lightboxPhoto.caption || lightboxPhoto.bodyArea}
                  className="lightbox-main-img"
                />
              ) : (
                <span style={{ color: '#fff' }}>جارٍ فك تشفير النسخة عالية الدقة…</span>
              )}
            </div>
            <div className="lightbox-sidebar">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h5 style={{ margin: 0, fontSize: '1.05rem' }}>{lightboxPhoto.bodyArea}</h5>
                <button type="button" className="table-btn" onClick={() => setLightboxPhoto(null)}>
                  ✕ إغلاق
                </button>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                <span>التصنيف: {lightboxPhoto.category}</span> ·{' '}
                <span>الأبعاد: {lightboxPhoto.width}×{lightboxPhoto.height}</span>
                {lightboxPhoto.caption && <p style={{ margin: '0.25rem 0', color: '#1e293b' }}>{lightboxPhoto.caption}</p>}
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <b style={{ fontSize: '0.9rem' }}>الملاحظات السريرية التوضيحية ({lightboxAnnotations.length}):</b>
                {lightboxAnnotations.length === 0 ? (
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>لا توجد ملاحظات على هذه الصورة.</span>
                ) : (
                  lightboxAnnotations.map((annot, i) => (
                    <div key={annot.id || i} className="annotation-item">
                      <div className="annotation-author">{annot.author?.user?.name || 'طبيب معالج'}</div>
                      <div style={{ color: '#334155' }}>{annot.comment}</div>
                      <div className="annotation-date">{new Date(annot.createdAt).toLocaleString('ar-EG')}</div>
                    </div>
                  ))
                )}
              </div>

              {canAnnotate && (
                <form onSubmit={(e) => void handleAddAnnotation(e)}>
                  <textarea
                    rows={2}
                    required
                    maxLength={1000}
                    value={newAnnotationComment}
                    onChange={(e) => setNewAnnotationComment(e.target.value)}
                    placeholder="أضف ملاحظة سريرية توضيحية على الصورة…"
                    style={{ width: '100%', padding: '0.5rem', fontSize: '0.85rem' }}
                  />
                  <button type="submit" className="primary-btn" style={{ width: '100%', marginTop: '0.5rem' }} disabled={annotating}>
                    {annotating ? 'جارٍ الحفظ…' : 'حفظ الملاحظة'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Interactive Split Slider Comparison */}
      {activeSliderGroup && (
        <div className="photo-lightbox-modal" onClick={() => setActiveSliderGroup(null)}>
          <div
            className="photo-lightbox-content"
            style={{ maxWidth: '850px', flexDirection: 'column', padding: '1.25rem' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h5 style={{ margin: 0 }}>{activeSliderGroup.title}</h5>
              <button type="button" className="table-btn" onClick={() => setActiveSliderGroup(null)}>
                ✕ إغلاق
              </button>
            </div>

            <div className="split-slider-container">
              {sliderAfterUrl && <img src={sliderAfterUrl} alt="بعد الإجراء" className="split-slider-img" />}
              {sliderBeforeUrl && (
                <div className="split-slider-before" style={{ width: `${sliderPos}%` }}>
                  <img
                    src={sliderBeforeUrl}
                    alt="قبل الإجراء"
                    style={{ width: '600px', height: '400px', objectFit: 'contain' }}
                  />
                </div>
              )}
              <div className="split-slider-divider" style={{ left: `${sliderPos}%` }}>
                <div className="split-slider-handle">↔</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
              <span>قبل الإجراء (يمين)</span>
              <input
                type="range"
                min="0"
                max="100"
                value={sliderPos}
                onChange={(e) => setSliderPos(Number(e.target.value))}
                style={{ flex: 1 }}
              />
              <span>بعد الإجراء (يسار)</span>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create Comparison Group */}
      {showComparisonModal && (
        <div className="photo-lightbox-modal">
          <div className="photo-lightbox-content" style={{ maxWidth: '550px', flexDirection: 'column', padding: '1.5rem' }}>
            <h4 style={{ margin: '0 0 1rem 0' }}>إنشاء مجموعة مقارنة قبل وبعد</h4>
            <form onSubmit={(e) => void handleCreateComparison(e)}>
              <label style={{ display: 'block', marginBottom: '0.75rem' }}>
                عنوان المقارنة:
                <input
                  type="text"
                  required
                  maxLength={200}
                  value={compTitle}
                  onChange={(e) => setCompTitle(e.target.value)}
                  placeholder="مثال: مقارنة نتائج حقن الفيلر للوجنتين بعد أسبوعين"
                  style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
                />
              </label>
              <label style={{ display: 'block', marginBottom: '0.75rem' }}>
                صورة (قبل الإجراء):
                <select
                  required
                  value={compBeforeId}
                  onChange={(e) => setCompBeforeId(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
                >
                  <option value="">-- اختر صورة قبل الإجراء --</option>
                  {allPhotos
                    .filter((p) => p.category === 'BEFORE' || p.category === 'FOLLOW_UP')
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.bodyArea} ({new Date(p.takenAt).toLocaleDateString('ar-EG')}) - {p.caption || p.id.slice(0, 8)}
                      </option>
                    ))}
                </select>
              </label>
              <label style={{ display: 'block', marginBottom: '0.75rem' }}>
                صورة (بعد الإجراء):
                <select
                  required
                  value={compAfterId}
                  onChange={(e) => setCompAfterId(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
                >
                  <option value="">-- اختر صورة بعد الإجراء --</option>
                  {allPhotos
                    .filter((p) => (p.category === 'AFTER' || p.category === 'FOLLOW_UP') && p.id !== compBeforeId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.bodyArea} ({new Date(p.takenAt).toLocaleDateString('ar-EG')}) - {p.caption || p.id.slice(0, 8)}
                      </option>
                    ))}
                </select>
              </label>
              <label style={{ display: 'block', marginBottom: '1.25rem' }}>
                ملاحظات الطبيب:
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={compNotes}
                  onChange={(e) => setCompNotes(e.target.value)}
                  placeholder="ملاحظات سريرية حول الفرق والتحسن الملحوظ"
                  style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
                />
              </label>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" className="table-btn" onClick={() => setShowComparisonModal(false)}>
                  إلغاء
                </button>
                <button type="submit" className="primary-btn">
                  إنشاء المقارنة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Archive Photo */}
      {archiveTargetPhoto && (
        <div className="photo-lightbox-modal">
          <div className="photo-lightbox-content" style={{ maxWidth: '480px', flexDirection: 'column', padding: '1.5rem' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', color: '#dc2626' }}>تأكيد أرشفة الصورة السريرية</h4>
            <p style={{ fontSize: '0.85rem', color: '#475569', margin: '0 0 1rem 0' }}>
              لا تُحذف الصور السريرية من قاعدة البيانات لضمان الموثوقية الطبية والمسؤولية القانونية، بل تُؤرشف مع توثيق سبب
              الأرشفة في سجل التدقيق المالي والطبي.
            </p>
            <form onSubmit={(e) => void handleArchivePhoto(e)}>
              <label style={{ display: 'block', marginBottom: '1rem' }}>
                سبب الأرشفة الإلزامي *:
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={500}
                  value={archiveReason}
                  onChange={(e) => setArchiveReason(e.target.value)}
                  placeholder="مثال: تم التقاط صورة بديلة أكثر وضوحاً ودقة"
                  style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
                />
              </label>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="table-btn"
                  disabled={archiving}
                  onClick={() => setArchiveTargetPhoto(null)}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="primary-btn"
                  style={{ background: '#dc2626' }}
                  disabled={archiving || archiveReason.trim().length < 3}
                >
                  {archiving ? 'جارٍ الأرشفة…' : 'تأكيد الأرشفة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

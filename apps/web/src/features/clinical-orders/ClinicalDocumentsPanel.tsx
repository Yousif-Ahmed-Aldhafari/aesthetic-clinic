import React, { useState, useEffect, useCallback } from 'react';
import {
  listClinicalDocuments,
  uploadClinicalDocument,
  updateClinicalDocument,
  getClinicalDocumentDownloadUrl,
  type ClinicalDocument,
  type ClinicalDocumentType,
} from './clinical-orders-api';

export interface ClinicalDocumentsPanelProps {
  clinicId: string;
  patientId?: string;
  encounterId?: string;
  orderId?: string;
  resultId?: string;
  csrfToken?: string;
  readOnly?: boolean;
}

const documentTypeLabels: Record<ClinicalDocumentType, string> = {
  LAB_REPORT: 'تقرير مخبري (Lab Report)',
  IMAGING_REPORT: 'تقرير أشعة وتصوير (Imaging Report)',
  REFERRAL_LETTER: 'خطاب إحالة طبية (Referral Letter)',
  DISCHARGE_SUMMARY: 'ملخص خروج سريري (Discharge Summary)',
  EXTERNAL_REPORT: 'تقرير طبي خارجي (External Report)',
  CONSENT_RECORD: 'إقرار وموافقة مستنيرة (Consent)',
  CLINICAL_SUMMARY: 'ملخص سريري شامل (Clinical Summary)',
  OTHER: 'مستند سريري آخر (Other Document)',
};

export const ClinicalDocumentsPanel: React.FC<ClinicalDocumentsPanelProps> = ({
  clinicId,
  patientId,
  encounterId,
  orderId,
  resultId,
  readOnly = false,
}) => {
  const [documents, setDocuments] = useState<ClinicalDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filter
  const [filterType, setFilterType] = useState<ClinicalDocumentType | ''>('');
  const [filterLegalHold, setFilterLegalHold] = useState<boolean | undefined>(undefined);

  // Upload Form State
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadType, setUploadType] = useState<ClinicalDocumentType>('LAB_REPORT');
  const [uploadConfidential, setUploadConfidential] = useState(false);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listClinicalDocuments(clinicId, {
        patientId,
        encounterId,
        orderId,
        resultId,
        documentType: filterType || undefined,
        isLegalHold: filterLegalHold,
        pageSize: 50,
      });
      setDocuments(res.items);
    } catch (err: unknown) {
      setError((err as Error).message ?? 'خطأ في تحميل المستندات الطبية');
    } finally {
      setLoading(false);
    }
  }, [clinicId, patientId, encounterId, orderId, resultId, filterType, filterLegalHold]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId) {
      setError('معرّف المريض مطلوب لرفع المستند السريري');
      return;
    }
    if (!selectedFile) {
      setError('يرجى تحديد ملف لرفعه');
      return;
    }
    if (!uploadTitle.trim()) {
      setError('عنوان المستند مطلوب');
      return;
    }

    setUploading(true);
    setError(null);
    try {
      await uploadClinicalDocument(clinicId, selectedFile, {
        patientId,
        encounterId: encounterId || undefined,
        orderId: orderId || undefined,
        resultId: resultId || undefined,
        documentType: uploadType,
        title: uploadTitle.trim(),
        isConfidential: uploadConfidential,
      });

      setSuccessMessage('تم رفع المستند وتشفيره بنجاح بنظام AES-256-GCM');
      setSelectedFile(null);
      setUploadTitle('');
      setShowUploadForm(false);
      await loadDocuments();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'فشل في رفع وتشفير المستند');
    } finally {
      setUploading(false);
    }
  };

  const handleToggleLegalHold = async (doc: ClinicalDocument) => {
    if (doc.isLegalHold) {
      const confirmRemove = window.confirm(
        'هل أنت متأكد من فك الحجز القانوني عن هذا المستند السريري؟ سيتاح تعديله أو أرشفته وفق السياسات المعتادة.'
      );
      if (!confirmRemove) return;
      try {
        await updateClinicalDocument(clinicId, doc.id, {
          isLegalHold: false,
          legalHoldReason: '',
        });
        setSuccessMessage('تم إلغاء الحجز القانوني عن المستند');
        await loadDocuments();
      } catch (err: unknown) {
        setError((err as Error).message ?? 'فشل في تعديل الحجز القانوني');
      }
    } else {
      const reason = window.prompt(
        'يرجى إدخال سبب الحجز القانوني (Legal Hold Reason) - يمنع هذا الإجراء أي حذف أو تغيير للمستند:'
      );
      if (!reason || !reason.trim()) return;
      try {
        await updateClinicalDocument(clinicId, doc.id, {
          isLegalHold: true,
          legalHoldReason: reason.trim(),
        });
        setSuccessMessage('تم تفعيل الحجز القانوني الصارم على المستند بنجاح');
        await loadDocuments();
      } catch (err: unknown) {
        setError((err as Error).message ?? 'فشل في تفعيل الحجز القانوني');
      }
    }
  };

  const handleToggleConfidential = async (doc: ClinicalDocument) => {
    try {
      await updateClinicalDocument(clinicId, doc.id, {
        isConfidential: !doc.isConfidential,
      });
      setSuccessMessage(`تم ${!doc.isConfidential ? 'تقييد سرية' : 'إلغاء تقييد سرية'} المستند`);
      await loadDocuments();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'فشل في تحديث سرية المستند');
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div
      dir="rtl"
      style={{
        background: '#ffffff',
        borderRadius: 12,
        padding: '1.5rem',
        border: '1px solid #e2e8f0',
        fontFamily: 'Tajawal, sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.25rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <h3 style={{ margin: 0, color: '#1e293b', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>🔒</span> المستندات والتقارير الطبية المشفرة
          </h3>
          <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
            تشفير بنكي معزول (AES-256-GCM) مع التحقق من سلامة البصمة الرقمية وحماية السجلات
          </span>
        </div>
        {!readOnly && patientId && (
          <button
            type="button"
            onClick={() => setShowUploadForm(!showUploadForm)}
            style={{
              background: showUploadForm ? '#64748b' : '#0284c7',
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              padding: '0.5rem 1rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            {showUploadForm ? '✕ إلغاء' : '＋ رفع مستند طبي مشفر'}
          </button>
        )}
      </div>

      {/* Notifications */}
      {error && (
        <div
          role="alert"
          style={{
            background: '#fee2e2',
            color: '#b91c1c',
            padding: '0.75rem 1rem',
            borderRadius: 8,
            marginBottom: '1rem',
            fontSize: '0.9rem',
          }}
        >
          {error}
        </div>
      )}
      {successMessage && (
        <div
          role="status"
          style={{
            background: '#dcfce7',
            color: '#15803d',
            padding: '0.75rem 1rem',
            borderRadius: 8,
            marginBottom: '1rem',
            fontSize: '0.9rem',
          }}
        >
          {successMessage}
        </div>
      )}

      {/* Upload Form */}
      {showUploadForm && !readOnly && (
        <form
          onSubmit={handleUpload}
          style={{
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: 10,
            padding: '1.25rem',
            marginBottom: '1.5rem',
          }}
        >
          <h4 style={{ margin: '0 0 1rem 0', color: '#334155' }}>رفع مستند سريري جديد مشفر في الخادم</h4>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '1rem',
            }}
          >
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem', color: '#475569' }}>
                عنوان المستند *
              </label>
              <input
                type="text"
                required
                value={uploadTitle}
                onChange={e => setUploadTitle(e.target.value)}
                placeholder="مثال: نتيجة تحليل صورة الدم الكاملة CBC"
                style={{
                  width: '100%',
                  padding: '0.45rem 0.6rem',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem', color: '#475569' }}>
                نوع المستند *
              </label>
              <select
                value={uploadType}
                onChange={e => setUploadType(e.target.value as ClinicalDocumentType)}
                style={{
                  width: '100%',
                  padding: '0.45rem 0.6rem',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  boxSizing: 'border-box',
                }}
              >
                {Object.entries(documentTypeLabels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem', color: '#475569' }}>
                الملف (PDF, صور, DICOM, نصوص) *
              </label>
              <input
                type="file"
                required
                accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.dcm"
                onChange={e => {
                  if (e.target.files && e.target.files[0]) {
                    setSelectedFile(e.target.files[0]);
                  }
                }}
                style={{
                  width: '100%',
                  padding: '0.35rem 0.6rem',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  boxSizing: 'border-box',
                  fontSize: '0.8rem',
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginTop: '1rem' }}>
                <input
                  type="checkbox"
                  checked={uploadConfidential}
                  onChange={e => setUploadConfidential(e.target.checked)}
                />
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#b45309' }}>
                  🛡️ تصنيف المستند كسري للغاية (Confidential)
                </span>
              </label>
            </div>
          </div>

          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => setShowUploadForm(false)}
              style={{
                background: '#e2e8f0',
                color: '#334155',
                border: 'none',
                borderRadius: 6,
                padding: '0.45rem 1rem',
                cursor: 'pointer',
              }}
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={uploading}
              style={{
                background: '#0284c7',
                color: '#ffffff',
                border: 'none',
                borderRadius: 6,
                padding: '0.45rem 1.25rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {uploading ? 'جارٍ الرفع والتشفير...' : 'تشفير وحفظ المستند'}
            </button>
          </div>
        </form>
      )}

      {/* Filter Bar */}
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          marginBottom: '1rem',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value as ClinicalDocumentType | '')}
          style={{
            padding: '0.4rem 0.75rem',
            borderRadius: 6,
            border: '1px solid #cbd5e1',
            fontSize: '0.85rem',
          }}
        >
          <option value="">جميع أنواع المستندات</option>
          {Object.entries(documentTypeLabels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>

        <select
          value={filterLegalHold === undefined ? '' : String(filterLegalHold)}
          onChange={e => {
            const v = e.target.value;
            setFilterLegalHold(v === '' ? undefined : v === 'true');
          }}
          style={{
            padding: '0.4rem 0.75rem',
            borderRadius: 6,
            border: '1px solid #cbd5e1',
            fontSize: '0.85rem',
          }}
        >
          <option value="">كل حالات الحجز القانوني</option>
          <option value="true">تحت الحجز القانوني فقط ⚖️</option>
          <option value="false">بدون حجز قانوني</option>
        </select>

        <button
          type="button"
          onClick={loadDocuments}
          style={{
            background: '#3b82f6',
            color: '#ffffff',
            border: 'none',
            borderRadius: 6,
            padding: '0.4rem 0.75rem',
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          🔄 تحديث
        </button>
      </div>

      {/* Documents List */}
      {loading ? (
        <p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>
          جارٍ تحميل المستندات الطبية المشفرة...
        </p>
      ) : documents.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            color: '#94a3b8',
            padding: '2.5rem',
            background: '#f8fafc',
            borderRadius: 12,
            border: '1px dashed #cbd5e1',
          }}
        >
          <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📁</p>
          <p>لا توجد مستندات طبية مرفوعة لهذا السجل</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {documents.map(doc => (
            <div
              key={doc.id}
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '1rem',
                background: doc.isLegalHold ? '#fffbeb' : '#ffffff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '1rem' }}>
                    {doc.title}
                  </span>
                  <span
                    style={{
                      background: '#e0f2fe',
                      color: '#0369a1',
                      padding: '0.15rem 0.5rem',
                      borderRadius: 4,
                      fontSize: '0.75rem',
                    }}
                  >
                    {documentTypeLabels[doc.documentType] ?? doc.documentType}
                  </span>
                  <span
                    style={{
                      background: '#dcfce7',
                      color: '#15803d',
                      padding: '0.15rem 0.5rem',
                      borderRadius: 4,
                      fontSize: '0.75rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                    }}
                  >
                    🔒 AES-256-GCM
                  </span>
                  {doc.isConfidential && (
                    <span
                      style={{
                        background: '#fef3c7',
                        color: '#b45309',
                        padding: '0.15rem 0.5rem',
                        borderRadius: 4,
                        fontSize: '0.75rem',
                      }}
                    >
                      🛡️ سري
                    </span>
                  )}
                  {doc.isLegalHold && (
                    <span
                      style={{
                        background: '#fee2e2',
                        color: '#b91c1c',
                        padding: '0.15rem 0.5rem',
                        borderRadius: 4,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                      }}
                      title={doc.legalHoldReason ?? 'حجز قانوني نشط'}
                    >
                      ⚖️ حجز قانوني: {doc.legalHoldReason || 'سارٍ'}
                    </span>
                  )}
                </div>

                <div
                  style={{
                    fontSize: '0.8rem',
                    color: '#64748b',
                    marginTop: '0.4rem',
                    display: 'flex',
                    gap: '1rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <span>اسم الملف: <code>{doc.fileName}</code></span>
                  <span>النوع: {doc.mimeType}</span>
                  <span>الحجم: {formatFileSize(doc.fileSizeBytes)}</span>
                  <span>التاريخ: {new Date(doc.createdAt).toLocaleString('ar')}</span>
                  {doc.uploadedBy && <span>المسؤول: {doc.uploadedBy.user.name}</span>}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <a
                  href={getClinicalDocumentDownloadUrl(clinicId, doc.id)}
                  download={doc.fileName}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    background: '#0284c7',
                    color: '#ffffff',
                    padding: '0.4rem 0.8rem',
                    borderRadius: 6,
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                  }}
                >
                  ⬇️ تنزيل وفك التشفير
                </a>

                {!readOnly && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleToggleConfidential(doc)}
                      style={{
                        background: doc.isConfidential ? '#fef3c7' : '#f1f5f9',
                        color: doc.isConfidential ? '#b45309' : '#475569',
                        border: '1px solid #cbd5e1',
                        borderRadius: 6,
                        padding: '0.4rem 0.7rem',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                      }}
                      title={doc.isConfidential ? 'إلغاء وسم السري' : 'وسم كسري'}
                    >
                      {doc.isConfidential ? '🛡️ سري' : 'عام'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleLegalHold(doc)}
                      style={{
                        background: doc.isLegalHold ? '#fee2e2' : '#f1f5f9',
                        color: doc.isLegalHold ? '#b91c1c' : '#475569',
                        border: '1px solid #cbd5e1',
                        borderRadius: 6,
                        padding: '0.4rem 0.7rem',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                      }}
                      title="تبديل الحجز القانوني الصارم"
                    >
                      {doc.isLegalHold ? '⚖️ فك الحجز' : '⚖️ حجز قانوني'}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useCallback } from 'react';
import {
  listGeneralClinicalServices,
  createGeneralClinicalService,
  updateGeneralClinicalService,
  type GeneralClinicalService,
  type ClinicalServiceCategory,
} from './clinical-orders-api';

export interface GeneralClinicalServicesPanelProps {
  clinicId: string;
  onSelectService?: (service: GeneralClinicalService) => void;
  readOnly?: boolean;
}

const categoryLabels: Record<ClinicalServiceCategory, string> = {
  GENERAL_CONSULTATION: 'استشارة طبية عامة (General Consultation)',
  SPECIALIST_CONSULTATION: 'استشارة أخصائي (Specialist Consultation)',
  FOLLOW_UP_CONSULTATION: 'متابعة دورية (Follow-up Consultation)',
  LABORATORY_TEST: 'فحوصات مخبرية (Laboratory Test)',
  DIAGNOSTIC_IMAGING: 'تصوير تشخيصي (Diagnostic Imaging)',
  REFERRAL: 'إحالة استشارية (Referral)',
  MINOR_PROCEDURE: 'إجراء طبي بسيط (Minor Procedure)',
  OTHER_OUTPATIENT_SERVICE: 'خدمة خارجية أخرى (Other Outpatient Service)',
};

export const GeneralClinicalServicesPanel: React.FC<GeneralClinicalServicesPanelProps> = ({
  clinicId,
  onSelectService,
  readOnly = false,
}) => {
  const [services, setServices] = useState<GeneralClinicalService[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [filterCategory, setFilterCategory] = useState<ClinicalServiceCategory | ''>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterActive, setFilterActive] = useState<boolean | undefined>(true);

  // Create/Edit form state
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingService, setEditingService] = useState<GeneralClinicalService | null>(null);

  const [formCode, setFormCode] = useState('');
  const [formNameAr, setFormNameAr] = useState('');
  const [formNameEn, setFormNameEn] = useState('');
  const [formCategory, setFormCategory] = useState<ClinicalServiceCategory>('GENERAL_CONSULTATION');
  const [formDescription, setFormDescription] = useState('');
  const [formDuration, setFormDuration] = useState(20);
  const [formPrivilege, setFormPrivilege] = useState('');
  const [formBasePriceMinor, setFormBasePriceMinor] = useState(15000); // 150.00 SAR
  const [formIsActive, setFormIsActive] = useState(true);

  const loadServices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listGeneralClinicalServices(clinicId, {
        category: filterCategory || undefined,
        search: searchQuery.trim() || undefined,
        isActive: filterActive,
        pageSize: 50,
      });
      setServices(res.items);
    } catch (err: unknown) {
      setError((err as Error).message ?? 'خطأ في استرجاع دليل الخدمات السريرية العامة');
    } finally {
      setLoading(false);
    }
  }, [clinicId, filterCategory, searchQuery, filterActive]);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  const resetForm = () => {
    setEditingService(null);
    setFormCode('');
    setFormNameAr('');
    setFormNameEn('');
    setFormCategory('GENERAL_CONSULTATION');
    setFormDescription('');
    setFormDuration(20);
    setFormPrivilege('');
    setFormBasePriceMinor(15000);
    setFormIsActive(true);
    setShowForm(false);
  };

  const handleOpenEdit = (svc: GeneralClinicalService) => {
    setEditingService(svc);
    setFormCode(svc.serviceCode);
    setFormNameAr(svc.nameAr);
    setFormNameEn(svc.nameEn ?? '');
    setFormCategory(svc.category);
    setFormDescription(svc.description ?? '');
    setFormDuration(svc.defaultDurationMinutes);
    setFormPrivilege(svc.requiredPrivilege ?? '');
    setFormBasePriceMinor(svc.basePriceMinor);
    setFormIsActive(svc.isActive);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNameAr.trim()) {
      setError('اسم الخدمة بالعربية مطلوب');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (editingService) {
        await updateGeneralClinicalService(clinicId, editingService.id, {
          nameAr: formNameAr.trim(),
          nameEn: formNameEn.trim() || undefined,
          category: formCategory,
          description: formDescription.trim() || undefined,
          defaultDurationMinutes: formDuration,
          requiredPrivilege: formPrivilege.trim() || null,
          basePriceMinor: formBasePriceMinor,
          isActive: formIsActive,
        });
        setSuccessMessage('تم تحديث الخدمة السريرية بنجاح');
      } else {
        if (!formCode.trim()) {
          setError('رمز الخدمة الفريد مطلوب');
          setSubmitting(false);
          return;
        }
        await createGeneralClinicalService(clinicId, {
          serviceCode: formCode.trim().toUpperCase(),
          nameAr: formNameAr.trim(),
          nameEn: formNameEn.trim() || undefined,
          category: formCategory,
          description: formDescription.trim() || undefined,
          defaultDurationMinutes: formDuration,
          requiredPrivilege: formPrivilege.trim() || undefined,
          basePriceMinor: formBasePriceMinor,
          isActive: formIsActive,
        });
        setSuccessMessage('تمت إضافة الخدمة السريرية بنجاح');
      }
      resetForm();
      await loadServices();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'فشل في حفظ الخدمة');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (svc: GeneralClinicalService) => {
    try {
      await updateGeneralClinicalService(clinicId, svc.id, {
        isActive: !svc.isActive,
      });
      setSuccessMessage(`تم ${!svc.isActive ? 'تفعيل' : 'تعطيل'} الخدمة بنجاح`);
      await loadServices();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'فشل في تعديل حالة الخدمة');
    }
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
            <span>🩺</span> دليل الخدمات السريرية العامة
          </h3>
          <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
            الاستشارات، الفحوصات التشخيصية، والخدمات الطبية غير التجميلية
          </span>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={() => {
              if (showForm) {
                resetForm();
              } else {
                resetForm();
                setShowForm(true);
              }
            }}
            style={{
              background: showForm ? '#64748b' : '#059669',
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
            {showForm ? '✕ إلغاء' : '＋ إضافة خدمة طبية جديدة'}
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

      {/* Create / Edit Form */}
      {showForm && !readOnly && (
        <form
          onSubmit={handleSubmit}
          style={{
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: 10,
            padding: '1.25rem',
            marginBottom: '1.5rem',
          }}
        >
          <h4 style={{ margin: '0 0 1rem 0', color: '#334155' }}>
            {editingService ? `تعديل الخدمة: ${editingService.serviceCode}` : 'إضافة خدمة سريرية عامة جديدة'}
          </h4>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '1rem',
            }}
          >
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem', color: '#475569' }}>
                رمز الخدمة (الكود) *
              </label>
              <input
                type="text"
                required
                disabled={Boolean(editingService)}
                value={formCode}
                onChange={e => setFormCode(e.target.value)}
                placeholder="مثال: CONS-GEN-001"
                style={{
                  width: '100%',
                  padding: '0.45rem 0.6rem',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  background: editingService ? '#e2e8f0' : '#ffffff',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem', color: '#475569' }}>
                اسم الخدمة (عربي) *
              </label>
              <input
                type="text"
                required
                value={formNameAr}
                onChange={e => setFormNameAr(e.target.value)}
                placeholder="مثال: استشارة طبيب عام أولى"
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
                اسم الخدمة (إنجليزي)
              </label>
              <input
                type="text"
                value={formNameEn}
                onChange={e => setFormNameEn(e.target.value)}
                placeholder="e.g. General Consultation"
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
                التصنيف السريري *
              </label>
              <select
                value={formCategory}
                onChange={e => setFormCategory(e.target.value as ClinicalServiceCategory)}
                style={{
                  width: '100%',
                  padding: '0.45rem 0.6rem',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  boxSizing: 'border-box',
                }}
              >
                {Object.entries(categoryLabels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem', color: '#475569' }}>
                المدة التقريبية (بالدقائق)
              </label>
              <input
                type="number"
                min={5}
                max={480}
                value={formDuration}
                onChange={e => setFormDuration(Number(e.target.value))}
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
                السعر الأساسي (بالهللة / Minor Units)
              </label>
              <input
                type="number"
                min={0}
                step={100}
                value={formBasePriceMinor}
                onChange={e => setFormBasePriceMinor(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '0.45rem 0.6rem',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  boxSizing: 'border-box',
                }}
              />
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                يعادل: {(formBasePriceMinor / 100).toFixed(2)} ر.س
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem', color: '#475569' }}>
                الصلاحية المهنية المطلوبة
              </label>
              <input
                type="text"
                value={formPrivilege}
                onChange={e => setFormPrivilege(e.target.value)}
                placeholder="مثال: GENERAL_MEDICINE"
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
                الحالة التشغيلية
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formIsActive}
                  onChange={e => setFormIsActive(e.target.checked)}
                />
                <span style={{ fontSize: '0.85rem' }}>نشط ومتاح للطلب والحجز</span>
              </label>
            </div>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem', color: '#475569' }}>
              الوصف السريري والإرشادات
            </label>
            <textarea
              rows={2}
              value={formDescription}
              onChange={e => setFormDescription(e.target.value)}
              placeholder="وصف موجز لطبيعة الخدمة، متطلبات التحضير، أو نطاق التطبيق..."
              style={{
                width: '100%',
                padding: '0.45rem 0.6rem',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={resetForm}
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
              disabled={submitting}
              style={{
                background: '#059669',
                color: '#ffffff',
                border: 'none',
                borderRadius: 6,
                padding: '0.45rem 1.25rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {submitting ? 'جارٍ الحفظ...' : editingService ? 'تحديث الخدمة' : 'إنشاء الخدمة'}
            </button>
          </div>
        </form>
      )}

      {/* Filter and Search Bar */}
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          marginBottom: '1rem',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="بحث بالاسم أو الكود..."
          style={{
            padding: '0.4rem 0.75rem',
            borderRadius: 6,
            border: '1px solid #cbd5e1',
            fontSize: '0.85rem',
            minWidth: 200,
          }}
        />

        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value as ClinicalServiceCategory | '')}
          style={{
            padding: '0.4rem 0.75rem',
            borderRadius: 6,
            border: '1px solid #cbd5e1',
            fontSize: '0.85rem',
          }}
        >
          <option value="">جميع التصنيفات</option>
          {Object.entries(categoryLabels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>

        <select
          value={filterActive === undefined ? '' : String(filterActive)}
          onChange={e => {
            const v = e.target.value;
            setFilterActive(v === '' ? undefined : v === 'true');
          }}
          style={{
            padding: '0.4rem 0.75rem',
            borderRadius: 6,
            border: '1px solid #cbd5e1',
            fontSize: '0.85rem',
          }}
        >
          <option value="true">الخدمات النشطة فقط</option>
          <option value="">جميع الحالات</option>
          <option value="false">الخدمات المعطلة</option>
        </select>

        <button
          type="button"
          onClick={loadServices}
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

      {/* Services Table / Grid */}
      {loading ? (
        <p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>
          جارٍ تحميل دليل الخدمات السريرية...
        </p>
      ) : services.length === 0 ? (
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
          <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🩺</p>
          <p>لا توجد خدمات سريرية عامة مطابقة لمعايير البحث</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.875rem',
            }}
          >
            <thead>
              <tr style={{ background: '#f1f5f9', color: '#475569', textAlign: 'right' }}>
                <th style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid #e2e8f0' }}>الكود</th>
                <th style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid #e2e8f0' }}>اسم الخدمة</th>
                <th style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid #e2e8f0' }}>التصنيف</th>
                <th style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid #e2e8f0' }}>المدة</th>
                <th style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid #e2e8f0' }}>السعر الأساسي</th>
                <th style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid #e2e8f0' }}>الحالة</th>
                <th style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {services.map(svc => (
                <tr
                  key={svc.id}
                  style={{
                    borderBottom: '1px solid #f1f5f9',
                    background: svc.isActive ? '#ffffff' : '#f8fafc',
                  }}
                >
                  <td style={{ padding: '0.6rem 0.75rem', fontWeight: 600, color: '#334155' }}>
                    <code>{svc.serviceCode}</code>
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem' }}>
                    <div style={{ fontWeight: 600, color: '#1e293b' }}>{svc.nameAr}</div>
                    {svc.nameEn && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{svc.nameEn}</div>}
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '0.2rem 0.5rem',
                        borderRadius: 4,
                        fontSize: '0.75rem',
                        background: '#e0f2fe',
                        color: '#0369a1',
                      }}
                    >
                      {categoryLabels[svc.category] ?? svc.category}
                    </span>
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem', color: '#475569' }}>
                    {svc.defaultDurationMinutes} دقيقة
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem', fontWeight: 600, color: '#059669' }}>
                    {(svc.basePriceMinor / 100).toFixed(2)} ر.س
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '0.2rem 0.5rem',
                        borderRadius: 4,
                        fontSize: '0.75rem',
                        background: svc.isActive ? '#dcfce7' : '#fee2e2',
                        color: svc.isActive ? '#15803d' : '#b91c1c',
                      }}
                    >
                      {svc.isActive ? 'نشط' : 'معطل'}
                    </span>
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem', textAlign: 'left' }}>
                    <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                      {onSelectService && (
                        <button
                          type="button"
                          onClick={() => onSelectService(svc)}
                          style={{
                            background: '#0284c7',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: 4,
                            padding: '0.3rem 0.6rem',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                          }}
                        >
                          اختيار
                        </button>
                      )}
                      {!readOnly && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(svc)}
                            style={{
                              background: '#f1f5f9',
                              color: '#334155',
                              border: '1px solid #cbd5e1',
                              borderRadius: 4,
                              padding: '0.3rem 0.6rem',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                            }}
                          >
                            تعديل
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(svc)}
                            style={{
                              background: svc.isActive ? '#fee2e2' : '#dcfce7',
                              color: svc.isActive ? '#b91c1c' : '#15803d',
                              border: 'none',
                              borderRadius: 4,
                              padding: '0.3rem 0.6rem',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                            }}
                          >
                            {svc.isActive ? 'تعطيل' : 'تفعيل'}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

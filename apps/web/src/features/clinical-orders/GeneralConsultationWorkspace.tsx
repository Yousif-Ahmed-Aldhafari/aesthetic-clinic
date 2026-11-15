import React, { useState } from 'react';
import { VitalSignsObservationPanel } from '../clinical-foundation/VitalSignsObservationPanel';
import { DiagnosesProblemsPanel } from '../clinical-foundation/DiagnosesProblemsPanel';
import { ClinicalOrdersPanel } from './ClinicalOrdersPanel';
import { ClinicalDocumentsPanel } from './ClinicalDocumentsPanel';
import { GeneralClinicalServicesPanel } from './GeneralClinicalServicesPanel';
import {
  createDraftInvoiceForService,
  createDraftInvoiceForOrder,
  type GeneralClinicalService,
} from './clinical-orders-api';

export interface GeneralConsultationWorkspaceProps {
  clinicId: string;
  patientId: string;
  encounterId?: string;
  csrfToken?: string;
  onAuthError?: (e: unknown) => void;
}

export type ConsultationStep =
  | 'services'
  | 'vitals'
  | 'diagnoses'
  | 'orders'
  | 'documents'
  | 'billing';

export const GeneralConsultationWorkspace: React.FC<GeneralConsultationWorkspaceProps> = ({
  clinicId,
  patientId,
  encounterId,
  csrfToken,
}) => {
  const [activeStep, setActiveStep] = useState<ConsultationStep>('services');
  const [selectedService, setSelectedService] = useState<GeneralClinicalService | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingSuccess, setBillingSuccess] = useState<string | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [orderIdForBilling, setOrderIdForBilling] = useState('');

  const handleCreateServiceInvoice = async () => {
    if (!selectedService) {
      setBillingError('يرجى اختيار خدمة سريرية عامة أولاً');
      return;
    }
    setBillingLoading(true);
    setBillingError(null);
    setBillingSuccess(null);
    try {
      const requestKey = crypto.randomUUID();
      await createDraftInvoiceForService(clinicId, {
        patientId,
        generalClinicalServiceId: selectedService.id,
        requestKey,
      }, csrfToken);
      setBillingSuccess(`تم إصدار مسودة فاتورة بنجاح للخدمة: ${selectedService.nameAr} (${(selectedService.basePriceMinor / 100).toFixed(2)} ر.س)`);
    } catch (err: unknown) {
      setBillingError((err as Error).message ?? 'فشل في إنشاء مسودة الفاتورة للخدمة');
    } finally {
      setBillingLoading(false);
    }
  };

  const handleCreateOrderInvoice = async () => {
    if (!orderIdForBilling.trim()) {
      setBillingError('يرجى إدخال معرّف الأمر الطبي (Order ID)');
      return;
    }
    setBillingLoading(true);
    setBillingError(null);
    setBillingSuccess(null);
    try {
      const requestKey = crypto.randomUUID();
      await createDraftInvoiceForOrder(clinicId, {
        orderId: orderIdForBilling.trim(),
        requestKey,
      }, csrfToken);
      setBillingSuccess('تم إصدار مسودة فاتورة بنجاح للأمر التشخيصي');
      setOrderIdForBilling('');
    } catch (err: unknown) {
      setBillingError((err as Error).message ?? 'فشل في إنشاء مسودة الفاتورة للأمر الطبي');
    } finally {
      setBillingLoading(false);
    }
  };

  return (
    <div
      className="general-consultation-workspace"
      dir="rtl"
      style={{
        background: '#ffffff',
        borderRadius: 12,
        padding: '1.5rem',
        border: '1px solid #e2e8f0',
        fontFamily: 'Tajawal, sans-serif',
      }}
    >
      {/* Specialty Independence Notice */}
      <div
        style={{
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: 8,
          padding: '0.75rem 1rem',
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          fontSize: '0.875rem',
          color: '#1e40af',
        }}
      >
        <span style={{ fontSize: '1.25rem' }}>🩺</span>
        <div>
          <strong>بيئة الاستشارة الطبية العامة المستقلة:</strong> مسار سريري متعدد التخصصات متكامل
          (خدمات عامة، فحوصات حيوية، تشخيصات، أوامر مخبرية وشعاعية، مستندات مشفرة، وفوترة مباشرة) دون
          الحاجة لإنشاء خطط علاج أو إجراءات تجميلية.
        </div>
      </div>

      {/* Step Navigator */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1.5rem',
          borderBottom: '2px solid #f1f5f9',
          paddingBottom: '0.75rem',
          overflowX: 'auto',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveStep('services')}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 600,
            background: activeStep === 'services' ? '#0284c7' : '#f1f5f9',
            color: activeStep === 'services' ? '#ffffff' : '#475569',
          }}
        >
          1. الخدمة العامة {selectedService ? `(${selectedService.nameAr})` : ''}
        </button>

        <button
          type="button"
          onClick={() => setActiveStep('vitals')}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 600,
            background: activeStep === 'vitals' ? '#0284c7' : '#f1f5f9',
            color: activeStep === 'vitals' ? '#ffffff' : '#475569',
          }}
        >
          2. العلامات الحيوية
        </button>

        <button
          type="button"
          onClick={() => setActiveStep('diagnoses')}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 600,
            background: activeStep === 'diagnoses' ? '#0284c7' : '#f1f5f9',
            color: activeStep === 'diagnoses' ? '#ffffff' : '#475569',
          }}
        >
          3. التشخيصات
        </button>

        <button
          type="button"
          onClick={() => setActiveStep('orders')}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 600,
            background: activeStep === 'orders' ? '#0284c7' : '#f1f5f9',
            color: activeStep === 'orders' ? '#ffffff' : '#475569',
          }}
        >
          4. الفحوصات والأوامر
        </button>

        <button
          type="button"
          onClick={() => setActiveStep('documents')}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 600,
            background: activeStep === 'documents' ? '#0284c7' : '#f1f5f9',
            color: activeStep === 'documents' ? '#ffffff' : '#475569',
          }}
        >
          5. المستندات المشفرة
        </button>

        <button
          type="button"
          onClick={() => setActiveStep('billing')}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 600,
            background: activeStep === 'billing' ? '#059669' : '#f1f5f9',
            color: activeStep === 'billing' ? '#ffffff' : '#475569',
          }}
        >
          6. الفوترة السريرية 💳
        </button>
      </div>

      {/* Step Contents */}
      {activeStep === 'services' && (
        <div>
          {selectedService && (
            <div
              style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: 8,
                padding: '0.75rem 1rem',
                marginBottom: '1rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <span style={{ fontWeight: 600, color: '#166534' }}>
                  الخدمة السريرية المحددة للاستشارة:{' '}
                </span>
                <strong>{selectedService.nameAr}</strong> ({selectedService.serviceCode}) —{' '}
                <span style={{ color: '#15803d', fontWeight: 600 }}>
                  {(selectedService.basePriceMinor / 100).toFixed(2)} ر.س
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedService(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#dc2626',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                ✕ تغيير
              </button>
            </div>
          )}
          <GeneralClinicalServicesPanel
            clinicId={clinicId}
            onSelectService={svc => {
              setSelectedService(svc);
            }}
          />
        </div>
      )}

      {activeStep === 'vitals' && (
        <VitalSignsObservationPanel
          clinicId={clinicId}
          patientId={patientId}
          encounterId={encounterId}
          csrfToken={csrfToken}
        />
      )}

      {activeStep === 'diagnoses' && (
        <DiagnosesProblemsPanel
          clinicId={clinicId}
          patientId={patientId}
          encounterId={encounterId || '00000000-0000-0000-0000-000000000000'}
          csrfToken={csrfToken}
        />
      )}

      {activeStep === 'orders' && (
        <ClinicalOrdersPanel
          clinicId={clinicId}
          patientId={patientId}
          encounterId={encounterId}
          csrfToken={csrfToken}
        />
      )}

      {activeStep === 'documents' && (
        <ClinicalDocumentsPanel
          clinicId={clinicId}
          patientId={patientId}
          encounterId={encounterId}
          csrfToken={csrfToken}
        />
      )}

      {activeStep === 'billing' && (
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            padding: '1.5rem',
          }}
        >
          <h4 style={{ margin: '0 0 1rem 0', color: '#1e293b' }}>
            💳 إصدار مسودة الفاتورة السريرية (Clinical Billing)
          </h4>
          <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1.5rem' }}>
            تحويل الخدمات السريرية العامة أو الفحوصات التشخيصية مباشرة إلى مسودة فاتورة رسمية في
            نظام الفوترة المالي، مع ضمان منع الفوترة المزدوجة التلقائية.
          </p>

          {billingError && (
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
              {billingError}
            </div>
          )}
          {billingSuccess && (
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
              {billingSuccess}
            </div>
          )}

          {/* Service Billing Card */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              padding: '1.25rem',
              marginBottom: '1.5rem',
            }}
          >
            <h5 style={{ margin: '0 0 0.5rem 0', color: '#334155' }}>
              أ) فوترة الخدمة السريرية المحددة
            </h5>
            {selectedService ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{selectedService.nameAr}</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                    الكود: {selectedService.serviceCode} · السعر الأساسي:{' '}
                    {(selectedService.basePriceMinor / 100).toFixed(2)} ر.س
                  </div>
                </div>
                <button
                  type="button"
                  disabled={billingLoading}
                  onClick={handleCreateServiceInvoice}
                  style={{
                    background: '#059669',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 6,
                    padding: '0.5rem 1.25rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {billingLoading ? 'جارٍ إصدار الفاتورة...' : 'إصدار مسودة فاتورة للخدمة'}
                </button>
              </div>
            ) : (
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: 0 }}>
                لم يتم تحديد خدمة سريرية. يرجى العودة لخطوة (1. الخدمة العامة) واختيار خدمة لفوترتها.
              </p>
            )}
          </div>

          {/* Order Billing Card */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              padding: '1.25rem',
            }}
          >
            <h5 style={{ margin: '0 0 0.5rem 0', color: '#334155' }}>
              ب) فوترة أمر طبي تشخيصي (مخبري / شعاعي)
            </h5>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="معرّف الأمر الطبي (Order UUID)..."
                value={orderIdForBilling}
                onChange={e => setOrderIdForBilling(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: 260,
                  padding: '0.45rem 0.75rem',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  fontSize: '0.85rem',
                }}
              />
              <button
                type="button"
                disabled={billingLoading || !orderIdForBilling.trim()}
                onClick={handleCreateOrderInvoice}
                style={{
                  background: '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '0.5rem 1.25rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {billingLoading ? 'جارٍ الإصدار...' : 'إصدار مسودة فاتورة للأمر'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

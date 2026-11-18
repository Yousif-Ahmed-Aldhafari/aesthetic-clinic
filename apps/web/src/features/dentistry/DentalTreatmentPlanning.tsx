import React, { useState } from 'react';
import type {
  DentalTreatmentStageItem,
  DentalTreatmentStageStatus,
  ToothSurface,
} from './types';

export interface DentalTreatmentPlanningProps {
  stages: DentalTreatmentStageItem[];
  clinicId: string;
  patientId: string;
  encounterId: string;
  readOnly?: boolean;
  onPlanStage?: (input: {
    serviceId: string;
    toothNumberFdi?: number;
    surfaces?: ToothSurface[];
    stageOrder: number;
    clinicalIndication: string;
    procedureNotes?: string;
    estimatedCost: number;
  }) => Promise<void>;
  onApproveStage?: (stageId: string, version: number) => Promise<void>;
  onCompleteStage?: (stageId: string, version: number, consentId?: string, notes?: string) => Promise<void>;
  onCancelStage?: (stageId: string, version: number, reason: string) => Promise<void>;
  onBillStage?: (stageId: string) => Promise<void>;
  onConsumeMaterials?: (
    stageId: string,
    items: Array<{ productId: string; locationId: string; batchId: string; quantity: number }>,
  ) => Promise<void>;
}

const STATUS_LABELS: Record<DentalTreatmentStageStatus, { labelAr: string; color: string; bg: string }> = {
  DRAFT: { labelAr: 'مسودة', color: '#475569', bg: '#f1f5f9' },
  PROPOSED: { labelAr: 'مقترحة', color: '#1d4ed8', bg: '#dbeafe' },
  APPROVED: { labelAr: 'معتمدة سريرياً', color: '#15803d', bg: '#dcfce7' },
  IN_PROGRESS: { labelAr: 'قيد التنفيذ', color: '#b45309', bg: '#fef3c7' },
  COMPLETED: { labelAr: 'مكتملة وموثقة', color: '#047857', bg: '#d1fae5' },
  CANCELLED: { labelAr: 'ملغاة', color: '#b91c1c', bg: '#fee2e2' },
  SUPERSEDED: { labelAr: 'مستبدلة', color: '#64748b', bg: '#f8fafc' },
};

export const DentalTreatmentPlanning: React.FC<DentalTreatmentPlanningProps> = ({
  stages,
  readOnly = false,
  onPlanStage,
  onApproveStage,
  onCompleteStage,
  onCancelStage,
  onBillStage,
}) => {
  const [showNewModal, setShowNewModal] = useState(false);
  const [serviceId, setServiceId] = useState('');
  const [toothNumber, setToothNumber] = useState<number | ''>('');
  const [clinicalIndication, setClinicalIndication] = useState('');
  const [procedureNotes, setProcedureNotes] = useState('');
  const [estimatedCost, setEstimatedCost] = useState<number>(350);
  const [stageOrder, setStageOrder] = useState<number>(stages.length + 1);
  const [busyStageId, setBusyStageId] = useState<string | null>(null);

  const sortedStages = [...stages].sort((a, b) => a.stageOrder - b.stageOrder);

  const handleCreateStage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onPlanStage || !serviceId || !clinicalIndication) return;
    try {
      await onPlanStage({
        serviceId,
        toothNumberFdi: toothNumber ? Number(toothNumber) : undefined,
        stageOrder: Number(stageOrder),
        clinicalIndication,
        procedureNotes,
        estimatedCost: Number(estimatedCost),
      });
      setShowNewModal(false);
      setToothNumber('');
      setClinicalIndication('');
      setProcedureNotes('');
      setStageOrder(stages.length + 2);
    } catch {
      // error handled in parent
    }
  };

  const handleApprove = async (stage: DentalTreatmentStageItem) => {
    if (!onApproveStage) return;
    setBusyStageId(stage.id);
    try {
      await onApproveStage(stage.id, stage.version);
    } finally {
      setBusyStageId(null);
    }
  };

  const handleComplete = async (stage: DentalTreatmentStageItem) => {
    if (!onCompleteStage) return;
    const notes = prompt('ملاحظات إتمام الإجراء السريري:') ?? '';
    setBusyStageId(stage.id);
    try {
      await onCompleteStage(stage.id, stage.version, stage.patientConsentId ?? undefined, notes);
    } finally {
      setBusyStageId(null);
    }
  };

  const handleCancel = async (stage: DentalTreatmentStageItem) => {
    if (!onCancelStage) return;
    const reason = prompt('سبب إلغاء مرحلة العلاج:');
    if (!reason) return;
    setBusyStageId(stage.id);
    try {
      await onCancelStage(stage.id, stage.version, reason);
    } finally {
      setBusyStageId(null);
    }
  };

  const handleBill = async (stage: DentalTreatmentStageItem) => {
    if (!onBillStage) return;
    setBusyStageId(stage.id);
    try {
      await onBillStage(stage.id);
    } finally {
      setBusyStageId(null);
    }
  };

  return (
    <div className="dental-treatment-planning" style={{ direction: 'rtl' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
          padding: '8px 12px',
          background: '#f8fafc',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
        }}
      >
        <div>
          <h4 style={{ margin: 0, color: '#1e293b' }}>
            📋 خطة المعالجة السنية المتعددة المراحل (Staged Dental Treatment Plan)
          </h4>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
            جدولة الإجراءات السنية، التحقق من الموافقة المستنيرة، وإصدار الفواتير واستهلاك المواد.
          </p>
        </div>

        {!readOnly && (
          <button
            type="button"
            className="primary-btn"
            onClick={() => setShowNewModal(true)}
          >
            ＋ إضافة مرحلة علاجية
          </button>
        )}
      </div>

      {/* Stages List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {sortedStages.length === 0 ? (
          <div
            style={{
              padding: '24px',
              textAlign: 'center',
              background: '#ffffff',
              border: '1px dashed #cbd5e1',
              borderRadius: '8px',
              color: '#64748b',
            }}
          >
            لا توجد مراحل علاجية مخططة حتى الآن لهذا المريض.
          </div>
        ) : (
          sortedStages.map((stage) => {
            const stConf = STATUS_LABELS[stage.status];
            const isBusy = busyStageId === stage.id;

            return (
              <div
                key={stage.id}
                style={{
                  padding: '16px',
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        background: '#e0e7ff',
                        color: '#3730a3',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                      }}
                    >
                      المرحلة {stage.stageOrder}
                    </span>

                    <span
                      style={{
                        padding: '2px 8px',
                        background: stConf.bg,
                        color: stConf.color,
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                      }}
                    >
                      {stConf.labelAr}
                    </span>

                    {stage.toothNumberFdi && (
                      <span
                        style={{
                          padding: '2px 8px',
                          background: '#f1f5f9',
                          color: '#334155',
                          borderRadius: '4px',
                          fontSize: '12px',
                        }}
                      >
                        السن: <b>{stage.toothNumberFdi}</b>
                      </span>
                    )}

                    {stage.patientConsentId ? (
                      <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: 'bold' }}>
                        ✓ موافقة مستنيرة معتمدة
                      </span>
                    ) : (
                      <span style={{ fontSize: '12px', color: '#d97706' }}>
                        ⚠️ بانتظار توثيق الموافقة
                      </span>
                    )}

                    {stage.invoiceLineId && (
                      <span style={{ fontSize: '12px', color: '#2563eb', fontWeight: 'bold' }}>
                        💳 تمت الفوترة (INV-LINE)
                      </span>
                    )}
                  </div>

                  <h5 style={{ margin: '0 0 4px', fontSize: '15px', color: '#0f172a' }}>
                    {stage.service?.nameAr ?? `خدمة سريرية (${stage.serviceId})`}
                  </h5>

                  <p style={{ margin: '0 0 4px', fontSize: '13px', color: '#475569' }}>
                    <b>دواعي الإجراء:</b> {stage.clinicalIndication}
                  </p>

                  {stage.procedureNotes && (
                    <p style={{ margin: '0 0 4px', fontSize: '13px', color: '#64748b' }}>
                      <b>ملاحظات الإجراء:</b> {stage.procedureNotes}
                    </p>
                  )}

                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    التكلفة التقديرية: <b>{Number(stage.estimatedCost).toLocaleString('ar')} {stage.currency}</b> ·
                    الطبيب المخطط: <b>{stage.plannedDentist?.user?.name ?? 'طبيب الأسنان'}</b>
                  </div>
                </div>

                {/* Stage Actions */}
                {!readOnly && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '130px' }}>
                    {(stage.status === 'PROPOSED' || stage.status === 'DRAFT') && (
                      <button
                        type="button"
                        className="primary-btn"
                        style={{ fontSize: '12px', padding: '4px 8px' }}
                        disabled={isBusy}
                        onClick={() => handleApprove(stage)}
                      >
                        ✓ اعتماد الخطة
                      </button>
                    )}

                    {stage.status === 'APPROVED' && (
                      <button
                        type="button"
                        className="primary-btn"
                        style={{ fontSize: '12px', padding: '4px 8px', background: '#059669' }}
                        disabled={isBusy}
                        onClick={() => handleComplete(stage)}
                      >
                        ✓ إتمام الإجراء
                      </button>
                    )}

                    {stage.status === 'COMPLETED' && !stage.invoiceLineId && (
                      <button
                        type="button"
                        className="table-btn"
                        style={{ fontSize: '12px', padding: '4px 8px', color: '#1d4ed8', borderColor: '#93c5fd' }}
                        disabled={isBusy}
                        onClick={() => handleBill(stage)}
                      >
                        💳 فوترة الإجراء
                      </button>
                    )}

                    {['DRAFT', 'PROPOSED', 'APPROVED'].includes(stage.status) && (
                      <button
                        type="button"
                        className="table-btn"
                        style={{ fontSize: '12px', padding: '4px 8px', color: '#dc2626' }}
                        disabled={isBusy}
                        onClick={() => handleCancel(stage)}
                      >
                        إلغاء المرحلة
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* New Stage Modal */}
      {showNewModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: '#ffffff',
              padding: '24px',
              borderRadius: '8px',
              maxWidth: '500px',
              width: '100%',
              direction: 'rtl',
            }}
          >
            <h4 style={{ margin: '0 0 16px', color: '#1e293b' }}>
              إضافة مرحلة جديدة لخطة العلاج
            </h4>

            <form onSubmit={handleCreateStage}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
                  معرف الخدمة السريرية (Service ID) *
                </label>
                <input
                  type="text"
                  required
                  value={serviceId}
                  onChange={(e) => setServiceId(e.target.value)}
                  placeholder="رمز أو معرف الخدمة السريرية..."
                  style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
                    رقم السن (اختياري)
                  </label>
                  <input
                    type="number"
                    min={11}
                    max={85}
                    value={toothNumber}
                    onChange={(e) => setToothNumber(e.target.value ? parseInt(e.target.value) : '')}
                    placeholder="مثال: 16"
                    style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
                    ترتيب المرحلة
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={stageOrder}
                    onChange={(e) => setStageOrder(parseInt(e.target.value) || 1)}
                    style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
                  دواعي الإجراء السريري *
                </label>
                <input
                  type="text"
                  required
                  value={clinicalIndication}
                  onChange={(e) => setClinicalIndication(e.target.value)}
                  placeholder="مثال: نخر عاجي عميق يحتاج ترميم تجميلي..."
                  style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
                  التكلفة التقديرية (ريال)
                </label>
                <input
                  type="number"
                  min={0}
                  value={estimatedCost}
                  onChange={(e) => setEstimatedCost(parseFloat(e.target.value) || 0)}
                  style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                <button
                  type="button"
                  className="table-btn"
                  onClick={() => setShowNewModal(false)}
                >
                  إلغاء
                </button>
                <button type="submit" className="primary-btn">
                  إضافة المرحلة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

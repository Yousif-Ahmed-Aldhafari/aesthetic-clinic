import React, { useEffect, useState, useCallback } from 'react';
import type {
  DentalOdontogramItem,
  DentalToothFindingItem,
  DentalPeriodontalRecordItem,
  DentalTreatmentStageItem,
  ToothNumberingSystem,
  ToothSurface,
} from './types';
import {
  listPatientOdontograms,
  getOdontogramById,
  createOdontogramDraft,
  finalizeOdontogram,
  amendOdontogram,
  enterInErrorOdontogram,
  upsertToothFindings,
  recordPeriodontalRecord,
  listTreatmentStages,
  createTreatmentStage,
  approveTreatmentStage,
  completeTreatmentStage,
  cancelTreatmentStage,
  billTreatmentStage,
  consumeStageMaterials,
} from './dentistry-api';
import { clinicalApi } from '../clinical/clinical-api';
import { InteractiveOdontogram } from './InteractiveOdontogram';
import { PeriodontalGrid } from './PeriodontalGrid';
import { DentalTreatmentPlanning } from './DentalTreatmentPlanning';
import { AccessibleOdontogramTable } from './AccessibleOdontogramTable';

export interface DentalWorkspaceProps {
  clinicId: string;
  patientId: string;
  encounterId?: string;
  csrfToken?: string;
  onAuthError?: (e: unknown) => void;
}

export type DentalTab = 'chart' | 'periodontal' | 'treatment' | 'accessible';

export const DentalWorkspace: React.FC<DentalWorkspaceProps> = ({
  clinicId,
  patientId,
  encounterId,
  csrfToken,
  onAuthError,
}) => {
  const [odontograms, setOdontograms] = useState<DentalOdontogramItem[]>([]);
  const [selectedChart, setSelectedChart] = useState<DentalOdontogramItem | null>(null);
  const [activeTab, setActiveTab] = useState<DentalTab>('chart');
  const [numberingSystem, setNumberingSystem] = useState<ToothNumberingSystem>('FDI_ISO_3950');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadCharts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listPatientOdontograms(clinicId, patientId, csrfToken);
      const items = res?.items ?? [];
      setOdontograms(items);

      if (items.length > 0) {
        // Load full details of the latest chart or the one matching current encounter
        const target =
          (encounterId ? items.find((c) => c.encounterId === encounterId) : null) ??
          items[0];
        const detailed = await getOdontogramById(clinicId, target.id, csrfToken);

        // Also fetch treatment stages
        let stages: DentalTreatmentStageItem[] = detailed.treatmentStages ?? [];
        try {
          const stagesRes = await listTreatmentStages(clinicId, patientId, csrfToken);
          if (stagesRes?.items) stages = stagesRes.items;
        } catch {}

        setSelectedChart({
          ...detailed,
          treatmentStages: stages,
        });
      } else {
        setSelectedChart(null);
      }
    } catch (err: unknown) {
      setError('تعذّر تحميل مخطط الأسنان وسجلات طب الأسنان.');
      if (onAuthError) onAuthError(err);
    } finally {
      setLoading(false);
    }
  }, [clinicId, patientId, encounterId, csrfToken, onAuthError]);

  useEffect(() => {
    void loadCharts();
  }, [loadCharts]);

  const handleCreateDraft = async () => {
    let targetEncounterId = encounterId;
    if (!targetEncounterId) {
      try {
        const encList = await clinicalApi(clinicId).list(patientId, new AbortController().signal);
        targetEncounterId = encList.items[0]?.id;
      } catch {}
    }
    if (!targetEncounterId) {
      setError('يتطلب إنشاء مخطط أسنان وجود استشارة سريرية مسجلة للمريض.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const created = await createOdontogramDraft(
        clinicId,
        {
          patientId,
          encounterId: targetEncounterId,
          dentitionType: 'PERMANENT',
          numberingSystem,
          chartType: 'BASELINE',
          generalOralCondition: 'فحص سريري أولي للأسنان والأنسجة الفموية',
        },
        csrfToken,
      );
      setNotice('تم إنشاء مسودة مخطط الأسنان بنجاح.');
      const detailed = await getOdontogramById(clinicId, created.id, csrfToken);
      setSelectedChart({
        ...detailed,
        treatmentStages: detailed.treatmentStages ?? [],
      });
      await loadCharts();
    } catch (err: unknown) {
      setError('فشل إنشاء مسودة مخطط الأسنان. تحقق من الصلاحيات السريرية وتفاصيل الزيارة.');
    } finally {
      setLoading(false);
    }
  };

  const handleFinalizeChart = async () => {
    if (!selectedChart) return;
    if (!confirm('هل أنت متأكد من توقيع واعتماد مخطط الأسنان؟ سيتم إغلاقه كنسخة نهائية غير قابلة للتعديل وختمه رقمياً (SHA-256).')) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const finalized = await finalizeOdontogram(clinicId, selectedChart.id, selectedChart.version, csrfToken);
      setNotice(`تم اعتماد وتوقيع مخطط الأسنان وختمه رقمياً: ${finalized.contentDigest?.slice(0, 16)}...`);
      await loadCharts();
    } catch {
      setError('تعذّر توقيع واعتماد مخطط الأسنان.');
    } finally {
      setLoading(false);
    }
  };

  const handleAmendChart = async () => {
    if (!selectedChart) return;
    const reason = prompt('يرجى إدخال سبب التعديل السريري للمخطط المعتمد:');
    if (!reason || reason.trim().length < 3) return;

    setLoading(true);
    setError(null);
    try {
      const amended = await amendOdontogram(clinicId, selectedChart.id, { amendmentReason: reason }, csrfToken);
      setNotice('تم إنشاء مسودة ملحقة جديدة بنجاح مع الحفاظ على النسخة السابقة وسجل التدقيق.');
      await loadCharts();
      setSelectedChart(amended);
    } catch {
      setError('تعذّر تعديل المخطط.');
    } finally {
      setLoading(false);
    }
  };

  const handleEnterInError = async () => {
    if (!selectedChart) return;
    const reason = prompt('يرجى تحديد سبب وسم المخطط كمدخل بالخطأ (Enter-in-error):');
    if (!reason || reason.trim().length < 3) return;

    setLoading(true);
    setError(null);
    try {
      await enterInErrorOdontogram(clinicId, selectedChart.id, reason, csrfToken);
      setNotice('تم وسم المخطط كمدخل بالخطأ بنجاح وإلغاء فاعليته.');
      await loadCharts();
    } catch {
      setError('تعذّر وسم المخطط كمدخل بالخطأ.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveFinding = async (finding: DentalToothFindingItem) => {
    if (!selectedChart) return;
    try {
      await upsertToothFindings(clinicId, selectedChart.id, [finding], csrfToken);
      setNotice(`تم حفظ حالة السن ${finding.toothNumberFdi} بنجاح.`);
      // Reload chart
      const updated = await getOdontogramById(clinicId, selectedChart.id, csrfToken);
      setSelectedChart((prev) => (prev ? { ...prev, findings: updated.findings } : updated));
    } catch {
      setError('تعذّر حفظ حالة السن. تأكد من أن المخطط لا يزال في حالة مسودة.');
    }
  };

  const handleSavePeriodontal = async (record: DentalPeriodontalRecordItem) => {
    if (!selectedChart) return;
    try {
      await recordPeriodontalRecord(
        clinicId,
        selectedChart.id,
        {
          toothNumberFdi: record.toothNumberFdi,
          probingDepthsMm: record.probingDepthsMm,
          gingivalMarginMm: record.gingivalMarginMm,
          bleedingOnProbing: record.bleedingOnProbing,
          suppuration: record.suppuration,
          furcationGrade: record.furcationGrade,
          mobilityGrade: record.mobilityGrade,
          plaquePresent: record.plaquePresent,
          notes: record.notes ?? undefined,
        },
        csrfToken,
      );
      setNotice(`تم حفظ قياسات اللثة للسن ${record.toothNumberFdi} بنجاح.`);
      const updated = await getOdontogramById(clinicId, selectedChart.id, csrfToken);
      setSelectedChart((prev) =>
        prev ? { ...prev, periodontalRecords: updated.periodontalRecords } : updated,
      );
    } catch {
      setError('تعذّر حفظ قياسات فحص دواعم السن.');
    }
  };

  const handlePlanStage = async (input: {
    serviceId: string;
    toothNumberFdi?: number;
    surfaces?: ToothSurface[];
    stageOrder: number;
    clinicalIndication: string;
    procedureNotes?: string;
    estimatedCost: number;
  }) => {
    if (!selectedChart || !encounterId) return;
    try {
      await createTreatmentStage(
        clinicId,
        {
          odontogramId: selectedChart.id,
          patientId,
          encounterId,
          serviceId: input.serviceId,
          toothNumberFdi: input.toothNumberFdi,
          surfaces: input.surfaces,
          stageOrder: input.stageOrder,
          clinicalIndication: input.clinicalIndication,
          procedureNotes: input.procedureNotes,
          estimatedCost: input.estimatedCost,
        },
        csrfToken,
      );
      setNotice('تمت إضافة مرحلة العلاج بنجاح.');
      const stagesRes = await listTreatmentStages(clinicId, patientId, csrfToken);
      setSelectedChart((prev) => (prev ? { ...prev, treatmentStages: stagesRes.items } : null));
    } catch {
      setError('تعذّر إنشاء مرحلة العلاج.');
    }
  };

  const handleApproveStage = async (stageId: string, version: number) => {
    try {
      await approveTreatmentStage(clinicId, stageId, version, csrfToken);
      setNotice('تم اعتماد مرحلة العلاج بنجاح.');
      const stagesRes = await listTreatmentStages(clinicId, patientId, csrfToken);
      setSelectedChart((prev) => (prev ? { ...prev, treatmentStages: stagesRes.items } : null));
    } catch {
      setError('فشل اعتماد المرحلة. تحقق من صلاحية DENTAL_PROCEDURE_APPROVE.');
    }
  };

  const handleCompleteStage = async (
    stageId: string,
    version: number,
    consentId?: string,
    notes?: string,
  ) => {
    try {
      await completeTreatmentStage(
        clinicId,
        stageId,
        {
          expectedVersion: version,
          patientConsentId: consentId,
          completionNotes: notes,
        },
        csrfToken,
      );
      setNotice('تم توثيق إتمام الإجراء بنجاح.');
      const stagesRes = await listTreatmentStages(clinicId, patientId, csrfToken);
      setSelectedChart((prev) => (prev ? { ...prev, treatmentStages: stagesRes.items } : null));
    } catch {
      setError('تعذّر إتمام الإجراء. تأكد من وجود موافقة مستنيرة موثقة للمريض.');
    }
  };

  const handleCancelStage = async (stageId: string, version: number, reason: string) => {
    try {
      await cancelTreatmentStage(clinicId, stageId, { expectedVersion: version, cancellationReason: reason }, csrfToken);
      setNotice('تم إلغاء مرحلة العلاج.');
      const stagesRes = await listTreatmentStages(clinicId, patientId, csrfToken);
      setSelectedChart((prev) => (prev ? { ...prev, treatmentStages: stagesRes.items } : null));
    } catch {
      setError('تعذّر إلغاء مرحلة العلاج.');
    }
  };

  const handleBillStage = async (stageId: string) => {
    try {
      const res = await billTreatmentStage(clinicId, stageId, undefined, csrfToken);
      setNotice(`تم إصدار بند الفاتورة بنجاح وربطه بالفاتورة ${res.invoiceId.slice(0, 8)}.`);
      const stagesRes = await listTreatmentStages(clinicId, patientId, csrfToken);
      setSelectedChart((prev) => (prev ? { ...prev, treatmentStages: stagesRes.items } : null));
    } catch {
      setError('تعذّر فوترة الإجراء. تحقق من صلاحيات الفوترة.');
    }
  };

  const handleConsumeMaterials = async (
    stageId: string,
    items: Array<{ productId: string; locationId: string; batchId: string; quantity: number }>,
  ) => {
    try {
      await consumeStageMaterials(clinicId, stageId, items, csrfToken);
      setNotice('تم توثيق استهلاك المواد وخصمها من المستودع بنجاح.');
    } catch {
      setError('تعذّر تسجيل استهلاك المواد.');
    }
  };

  if (loading && !selectedChart) {
    return (
      <div className="dental-workspace" style={{ padding: '24px', textAlign: 'center', direction: 'rtl' }}>
        <p>جارٍ تحميل ملف طب وجراحة الفم والأسنان...</p>
      </div>
    );
  }

  const isReadOnly = selectedChart ? selectedChart.status !== 'DRAFT' : true;

  return (
    <div className="dental-workspace" style={{ direction: 'rtl', marginTop: '1rem' }}>
      {/* Notifications */}
      {error && (
        <div className="clinical-error" role="alert" style={{ marginBottom: '12px' }}>
          {error}
        </div>
      )}
      {notice && (
        <div className="clinical-notice" role="status" style={{ marginBottom: '12px' }}>
          {notice}
        </div>
      )}

      {/* Header Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          background: '#ffffff',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
          marginBottom: '1rem',
        }}
      >
        <div>
          <h3 style={{ margin: '0 0 4px', fontSize: '18px', color: '#0f172a' }}>
            🦷 ملف طب وجراحة الفم والأسنان (Dentistry & Oral Health)
          </h3>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px', color: '#64748b' }}>
            {selectedChart ? (
              <>
                <span>
                  الحالة:{' '}
                  <b
                    style={{
                      color:
                        selectedChart.status === 'FINALIZED'
                          ? '#15803d'
                          : selectedChart.status === 'SUPERSEDED'
                          ? '#64748b'
                          : selectedChart.status === 'ENTERED_IN_ERROR'
                          ? '#b91c1c'
                          : '#2563eb',
                    }}
                  >
                    {selectedChart.status === 'FINALIZED'
                      ? 'موقّع ونهائي (Finalized)'
                      : selectedChart.status === 'SUPERSEDED'
                      ? 'مستبدل بنسخة أحدث (Superseded)'
                      : selectedChart.status === 'ENTERED_IN_ERROR'
                      ? 'مدخل بالخطأ'
                      : 'مسودة قيد التحرير (Draft)'}
                  </b>
                </span>
                <span>·</span>
                <span>الإصدار: <b>v{selectedChart.version}</b></span>
                {selectedChart.contentDigest && (
                  <>
                    <span>·</span>
                    <span title={selectedChart.contentDigest} style={{ fontFamily: 'monospace' }}>
                      الختم الرقمي: <b>{selectedChart.contentDigest.slice(0, 12)}…</b>
                    </span>
                  </>
                )}
              </>
            ) : (
              <span>لا يوجد مخطط أسنان مسجل بعد للمريض</span>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Chart selector if multiple charts */}
          {odontograms.length > 1 && (
            <select
              value={selectedChart?.id}
              onChange={async (e) => {
                const detailed = await getOdontogramById(clinicId, e.target.value, csrfToken);
                const stagesRes = await listTreatmentStages(clinicId, patientId, csrfToken);
                setSelectedChart({ ...detailed, treatmentStages: stagesRes.items });
              }}
              style={{ padding: '6px', fontSize: '12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
            >
              {odontograms.map((o) => (
                <option key={o.id} value={o.id}>
                  مخطط v{o.version} ({o.status}) - {new Date(o.createdAt).toLocaleDateString('ar')}
                </option>
              ))}
            </select>
          )}

          {/* Numbering system select */}
          <select
            value={numberingSystem}
            onChange={(e) => setNumberingSystem(e.target.value as ToothNumberingSystem)}
            style={{ padding: '6px', fontSize: '12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
          >
            <option value="FDI_ISO_3950">نظام FDI العالمي (11-48)</option>
            <option value="UNIVERSAL">النظام الأمريكي Universal (1-32)</option>
            <option value="PALMER">نظام بالمر Palmer</option>
          </select>

          {!selectedChart ? (
            <button type="button" className="primary-btn" onClick={handleCreateDraft}>
              ＋ إنشاء مخطط أسنان جديد
            </button>
          ) : (
            <>
              {selectedChart.status === 'DRAFT' && (
                <button
                  type="button"
                  className="primary-btn"
                  onClick={handleFinalizeChart}
                  style={{ background: '#059669' }}
                >
                  ✓ توقيع وختم المخطط
                </button>
              )}

              {selectedChart.status === 'FINALIZED' && (
                <>
                  <button type="button" className="table-btn" onClick={handleAmendChart}>
                    📝 تعديل ملحق (Amend)
                  </button>
                  <button
                    type="button"
                    className="table-btn"
                    style={{ color: '#dc2626' }}
                    onClick={handleEnterInError}
                  >
                    وسم كمدخل بالخطأ
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {selectedChart && (
        <>
          {/* Subtabs Navigation */}
          <nav className="cf-tabs" aria-label="Dental Workspace Tabs" style={{ marginBottom: '1rem' }}>
            <button
              type="button"
              className={`cf-tab-button ${activeTab === 'chart' ? 'active' : ''}`}
              onClick={() => setActiveTab('chart')}
            >
              🦷 مخطط الأسنان التفاعلي (Odontogram)
            </button>
            <button
              type="button"
              className={`cf-tab-button ${activeTab === 'periodontal' ? 'active' : ''}`}
              onClick={() => setActiveTab('periodontal')}
            >
              📐 مخطط فحص دواعم السن (6-Site Perio)
            </button>
            <button
              type="button"
              className={`cf-tab-button ${activeTab === 'treatment' ? 'active' : ''}`}
              onClick={() => setActiveTab('treatment')}
            >
              📋 خطة المعالجة السنية والمراحل (Stages)
            </button>
            <button
              type="button"
              className={`cf-tab-button ${activeTab === 'accessible' ? 'active' : ''}`}
              onClick={() => setActiveTab('accessible')}
            >
              ♿ الجدول السني الميسّر (WCAG Table)
            </button>
          </nav>

          {/* Tab Content */}
          <div style={{ background: '#ffffff', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            {activeTab === 'chart' && (
              <InteractiveOdontogram
                odontogram={selectedChart}
                readOnly={isReadOnly}
                onSaveFinding={handleSaveFinding}
                numberingSystem={numberingSystem}
              />
            )}

            {activeTab === 'periodontal' && (
              <PeriodontalGrid
                odontogram={selectedChart}
                readOnly={isReadOnly}
                onSaveRecord={handleSavePeriodontal}
              />
            )}

            {activeTab === 'treatment' && (
              <DentalTreatmentPlanning
                stages={selectedChart.treatmentStages ?? []}
                clinicId={clinicId}
                patientId={patientId}
                encounterId={encounterId ?? ''}
                readOnly={isReadOnly && selectedChart.status !== 'FINALIZED'}
                onPlanStage={handlePlanStage}
                onApproveStage={handleApproveStage}
                onCompleteStage={handleCompleteStage}
                onCancelStage={handleCancelStage}
                onBillStage={handleBillStage}
                onConsumeMaterials={handleConsumeMaterials}
              />
            )}

            {activeTab === 'accessible' && (
              <AccessibleOdontogramTable
                odontogram={selectedChart}
                numberingSystem={numberingSystem}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
};

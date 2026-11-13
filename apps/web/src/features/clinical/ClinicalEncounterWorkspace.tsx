import React, { useState } from 'react';
import { VitalSignsObservationPanel } from '../clinical-foundation/VitalSignsObservationPanel';
import { DiagnosesProblemsPanel } from '../clinical-foundation/DiagnosesProblemsPanel';
import { AllergyRegisterPanel } from '../clinical-foundation/AllergyRegisterPanel';
import { MedicationReconciliationPanel } from '../clinical-foundation/MedicationReconciliationPanel';
import { PrescriptionManagementPanel } from '../clinical-foundation/PrescriptionManagementPanel';
import { ClinicalSummaryView } from '../clinical-foundation/ClinicalSummaryView';
import '../clinical-foundation/clinical-foundation.css';

export interface ClinicalEncounterWorkspaceProps {
  clinicId: string;
  patientId: string;
  encounterId?: string;
  csrfToken?: string;
  onAuthError?: (e: unknown) => void;
}

export type ClinicalWorkspaceTab =
  | 'summary'
  | 'vitals'
  | 'diagnoses'
  | 'allergies'
  | 'medications'
  | 'prescriptions';

export const ClinicalEncounterWorkspace: React.FC<ClinicalEncounterWorkspaceProps> = ({
  clinicId,
  patientId,
  encounterId,
  csrfToken,
}) => {
  const [activeTab, setActiveTab] = useState<ClinicalWorkspaceTab>('summary');
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  const handleRefreshSummary = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="clinical-foundation-container" style={{ marginTop: '1rem' }}>
      {/* Tab Navigation */}
      <nav className="cf-tabs" aria-label="Clinical workspace tabs">
        <button
          type="button"
          className={`cf-tab-button ${activeTab === 'summary' ? 'active' : ''}`}
          onClick={() => setActiveTab('summary')}
        >
          📋 الملخص السريري الشامل
        </button>
        <button
          type="button"
          className={`cf-tab-button ${activeTab === 'vitals' ? 'active' : ''}`}
          onClick={() => setActiveTab('vitals')}
        >
          ❤️ العلامات الحيوية والقياسات
        </button>
        <button
          type="button"
          className={`cf-tab-button ${activeTab === 'diagnoses' ? 'active' : ''}`}
          onClick={() => setActiveTab('diagnoses')}
        >
          🩺 التشخيصات وقائمة المشكلات
        </button>
        <button
          type="button"
          className={`cf-tab-button ${activeTab === 'allergies' ? 'active' : ''}`}
          onClick={() => setActiveTab('allergies')}
        >
          ⚠️ سجل الحساسيات
        </button>
        <button
          type="button"
          className={`cf-tab-button ${activeTab === 'medications' ? 'active' : ''}`}
          onClick={() => setActiveTab('medications')}
        >
          💊 الأدوية والمطابقة الدوائية
        </button>
        <button
          type="button"
          className={`cf-tab-button ${activeTab === 'prescriptions' ? 'active' : ''}`}
          onClick={() => setActiveTab('prescriptions')}
        >
          📝 الوصفات الطبية المعتمدة
        </button>
      </nav>

      {/* Tab Panels */}
      {activeTab === 'summary' && (
        <ClinicalSummaryView
          key={`summary-${refreshTrigger}`}
          clinicId={clinicId}
          patientId={patientId}
          csrfToken={csrfToken}
          onNavigateTab={tab => setActiveTab(tab as ClinicalWorkspaceTab)}
        />
      )}

      {activeTab === 'vitals' && (
        <VitalSignsObservationPanel
          clinicId={clinicId}
          patientId={patientId}
          encounterId={encounterId}
          csrfToken={csrfToken}
          onRefreshSummary={handleRefreshSummary}
        />
      )}

      {activeTab === 'diagnoses' && (
        <DiagnosesProblemsPanel
          clinicId={clinicId}
          patientId={patientId}
          encounterId={encounterId || '00000000-0000-0000-0000-000000000000'}
          csrfToken={csrfToken}
          onRefreshSummary={handleRefreshSummary}
        />
      )}

      {activeTab === 'allergies' && (
        <AllergyRegisterPanel
          clinicId={clinicId}
          patientId={patientId}
          encounterId={encounterId}
          csrfToken={csrfToken}
          onRefreshSummary={handleRefreshSummary}
        />
      )}

      {activeTab === 'medications' && (
        <MedicationReconciliationPanel
          clinicId={clinicId}
          patientId={patientId}
          encounterId={encounterId}
          csrfToken={csrfToken}
          onRefreshSummary={handleRefreshSummary}
        />
      )}

      {activeTab === 'prescriptions' && (
        <PrescriptionManagementPanel
          clinicId={clinicId}
          patientId={patientId}
          encounterId={encounterId || '00000000-0000-0000-0000-000000000000'}
          csrfToken={csrfToken}
          onRefreshSummary={handleRefreshSummary}
        />
      )}
    </div>
  );
};

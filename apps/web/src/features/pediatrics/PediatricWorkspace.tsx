import React, { useState, useEffect, useCallback } from 'react';
import type {
  PediatricBirthHistoryItem,
  PatientCaregiverItem,
  PediatricGrowthRecordItem,
} from './types.js';
import { getBirthHistory, listCaregivers, listGrowthRecords } from './pediatrics-api.js';
import { BirthHistorySection } from './BirthHistorySection.js';
import { CaregiverAuthorizationSection } from './CaregiverAuthorizationSection.js';
import { GrowthRecordsSection } from './GrowthRecordsSection.js';
import { GrowthChartsSection } from './GrowthChartsSection.js';
import { AccessibleGrowthTable } from './AccessibleGrowthTable.js';
import { PediatricMedicationPreflight } from './PediatricMedicationPreflight.js';

interface PediatricWorkspaceProps {
  clinicId: string;
  patientId: string;
  patientGender?: 'MALE' | 'FEMALE';
  patientDob?: string;
  csrfToken?: string;
  onAuthError?: (e?: unknown) => void;
}

type ActiveTab = 'BIRTH_HISTORY' | 'CAREGIVERS' | 'GROWTH_RECORDS' | 'GROWTH_CHARTS' | 'ACCESSIBLE_TABLE' | 'MED_SAFETY';

export const PediatricWorkspace: React.FC<PediatricWorkspaceProps> = ({
  clinicId,
  patientId,
  patientGender = 'MALE',
  patientDob,
  csrfToken,
  onAuthError,
}) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('GROWTH_RECORDS');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [birthHistory, setBirthHistory] = useState<PediatricBirthHistoryItem | null>(null);
  const [caregivers, setCaregivers] = useState<PatientCaregiverItem[]>([]);
  const [growthRecords, setGrowthRecords] = useState<PediatricGrowthRecordItem[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bh, cg, gr] = await Promise.all([
        getBirthHistory(clinicId, patientId, csrfToken, onAuthError),
        listCaregivers(clinicId, patientId, csrfToken, onAuthError),
        listGrowthRecords(clinicId, patientId, csrfToken, onAuthError),
      ]);
      setBirthHistory(bh ?? null);
      setCaregivers(Array.isArray(cg) ? cg : []);
      setGrowthRecords(Array.isArray(gr) ? gr : []);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [clinicId, patientId, csrfToken, onAuthError]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <div className="pediatric-workspace" data-testid="pediatric-workspace" dir="rtl" style={{ marginTop: '1rem', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '1.25rem', backgroundColor: '#ffffff' }}>
      <div className="workspace-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a' }}>
            👶 عيادة طب الأطفال وصحة الطفل (Pediatrics & Child Health)
          </h2>
          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.2rem' }}>
            ملف صحة ونمو الطفل، التاريخ المحيط بالولادة، الرعاية القانونية، وتدقيق السلامة الدوائية.
          </div>
        </div>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => void loadData()}
          disabled={loading}
          data-testid="refresh-pediatrics-btn"
        >
          {loading ? 'جارٍ التحديث...' : '🔄 تحديث'}
        </button>
      </div>

      {error && (
        <div className="clinical-notice clinical-notice-error" style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '4px' }}>
          ⚠️ {error}
        </div>
      )}

      {/* TABS NAVIGATION */}
      <div className="workspace-tabs" style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid #e2e8f0', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'GROWTH_RECORDS' ? 'active' : ''}`}
          onClick={() => setActiveTab('GROWTH_RECORDS')}
          style={{
            padding: '0.5rem 1rem',
            border: 'none',
            borderBottom: activeTab === 'GROWTH_RECORDS' ? '3px solid #2563eb' : '3px solid transparent',
            background: 'none',
            fontWeight: activeTab === 'GROWTH_RECORDS' ? 600 : 400,
            color: activeTab === 'GROWTH_RECORDS' ? '#1d4ed8' : '#64748b',
            cursor: 'pointer',
          }}
          data-testid="tab-growth-records"
        >
          📏 القياسات والنمو ({(growthRecords || []).filter((r) => r.status !== 'ENTERED_IN_ERROR').length})
        </button>

        <button
          type="button"
          className={`tab-btn ${activeTab === 'GROWTH_CHARTS' ? 'active' : ''}`}
          onClick={() => setActiveTab('GROWTH_CHARTS')}
          style={{
            padding: '0.5rem 1rem',
            border: 'none',
            borderBottom: activeTab === 'GROWTH_CHARTS' ? '3px solid #2563eb' : '3px solid transparent',
            background: 'none',
            fontWeight: activeTab === 'GROWTH_CHARTS' ? 600 : 400,
            color: activeTab === 'GROWTH_CHARTS' ? '#1d4ed8' : '#64748b',
            cursor: 'pointer',
          }}
          data-testid="tab-growth-charts"
        >
          📈 مخططات النمو (WHO)
        </button>

        <button
          type="button"
          className={`tab-btn ${activeTab === 'ACCESSIBLE_TABLE' ? 'active' : ''}`}
          onClick={() => setActiveTab('ACCESSIBLE_TABLE')}
          style={{
            padding: '0.5rem 1rem',
            border: 'none',
            borderBottom: activeTab === 'ACCESSIBLE_TABLE' ? '3px solid #2563eb' : '3px solid transparent',
            background: 'none',
            fontWeight: activeTab === 'ACCESSIBLE_TABLE' ? 600 : 400,
            color: activeTab === 'ACCESSIBLE_TABLE' ? '#1d4ed8' : '#64748b',
            cursor: 'pointer',
          }}
          data-testid="tab-accessible-table"
        >
          📊 جدول القياسات المتاح
        </button>

        <button
          type="button"
          className={`tab-btn ${activeTab === 'BIRTH_HISTORY' ? 'active' : ''}`}
          onClick={() => setActiveTab('BIRTH_HISTORY')}
          style={{
            padding: '0.5rem 1rem',
            border: 'none',
            borderBottom: activeTab === 'BIRTH_HISTORY' ? '3px solid #2563eb' : '3px solid transparent',
            background: 'none',
            fontWeight: activeTab === 'BIRTH_HISTORY' ? 600 : 400,
            color: activeTab === 'BIRTH_HISTORY' ? '#1d4ed8' : '#64748b',
            cursor: 'pointer',
          }}
          data-testid="tab-birth-history"
        >
          📋 التاريخ الولادي {birthHistory ? '✅' : '⚪'}
        </button>

        <button
          type="button"
          className={`tab-btn ${activeTab === 'CAREGIVERS' ? 'active' : ''}`}
          onClick={() => setActiveTab('CAREGIVERS')}
          style={{
            padding: '0.5rem 1rem',
            border: 'none',
            borderBottom: activeTab === 'CAREGIVERS' ? '3px solid #2563eb' : '3px solid transparent',
            background: 'none',
            fontWeight: activeTab === 'CAREGIVERS' ? 600 : 400,
            color: activeTab === 'CAREGIVERS' ? '#1d4ed8' : '#64748b',
            cursor: 'pointer',
          }}
          data-testid="tab-caregivers"
        >
          🛡️ أولياء الأمور والمفوضون ({(caregivers || []).filter((c) => !c.isRevoked).length})
        </button>

        <button
          type="button"
          className={`tab-btn ${activeTab === 'MED_SAFETY' ? 'active' : ''}`}
          onClick={() => setActiveTab('MED_SAFETY')}
          style={{
            padding: '0.5rem 1rem',
            border: 'none',
            borderBottom: activeTab === 'MED_SAFETY' ? '3px solid #2563eb' : '3px solid transparent',
            background: 'none',
            fontWeight: activeTab === 'MED_SAFETY' ? 600 : 400,
            color: activeTab === 'MED_SAFETY' ? '#1d4ed8' : '#64748b',
            cursor: 'pointer',
          }}
          data-testid="tab-med-safety"
        >
          💊 تدقيق الأمان الدوائي
        </button>
      </div>

      {/* TAB CONTENTS */}
      <div className="workspace-tab-content">
        {activeTab === 'GROWTH_RECORDS' && (
          <GrowthRecordsSection
            clinicId={clinicId}
            patientId={patientId}
            birthHistory={birthHistory}
            patientDob={patientDob}
            records={growthRecords}
            onRefresh={loadData}
            csrfToken={csrfToken}
            onAuthError={onAuthError}
          />
        )}

        {activeTab === 'GROWTH_CHARTS' && (
          <GrowthChartsSection
            gender={patientGender}
            birthHistory={birthHistory}
            records={growthRecords}
          />
        )}

        {activeTab === 'ACCESSIBLE_TABLE' && (
          <AccessibleGrowthTable records={growthRecords} />
        )}

        {activeTab === 'BIRTH_HISTORY' && (
          <BirthHistorySection
            clinicId={clinicId}
            patientId={patientId}
            history={birthHistory}
            onRefresh={loadData}
            csrfToken={csrfToken}
            onAuthError={onAuthError}
          />
        )}

        {activeTab === 'CAREGIVERS' && (
          <CaregiverAuthorizationSection
            clinicId={clinicId}
            patientId={patientId}
            caregivers={caregivers}
            onRefresh={loadData}
            csrfToken={csrfToken}
            onAuthError={onAuthError}
          />
        )}

        {activeTab === 'MED_SAFETY' && (
          <PediatricMedicationPreflight
            clinicId={clinicId}
            patientId={patientId}
            birthHistory={birthHistory}
            records={growthRecords}
            csrfToken={csrfToken}
            onAuthError={onAuthError}
          />
        )}
      </div>
    </div>
  );
};

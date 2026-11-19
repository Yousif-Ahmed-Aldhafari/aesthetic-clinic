import React, { useState, useEffect, useCallback } from 'react';
import type {
  PregnancyEpisodeItem,
  AntenatalVisitRecordItem,
  ObstetricHistoryItem,
  GynecologicalExaminationItem,
} from './types.js';
import {
  getActivePregnancyEpisode,
  createPregnancyEpisode,
  listAntenatalVisits,
  listObstetricHistory,
  listGynecologicalExams,
} from './obgyn-api.js';
import { PregnancyEpisodeHeader } from './PregnancyEpisodeHeader.js';
import { PregnancyDatingSection } from './PregnancyDatingSection.js';
import { AntenatalFlowsheetSection } from './AntenatalFlowsheetSection.js';
import { ObstetricHistorySection } from './ObstetricHistorySection.js';
import { ConfidentialGynecologicalSection } from './ConfidentialGynecologicalSection.js';

interface ObGynWorkspaceProps {
  clinicId: string;
  patientId: string;
  csrfToken?: string;
  onAuthError?: (e?: unknown) => void;
}

type ActiveTab = 'PREGNANCY_EPISODE' | 'DATING_REVIEW' | 'OBSTETRIC_HISTORY' | 'GYNECOLOGY';

export const ObGynWorkspace: React.FC<ObGynWorkspaceProps> = ({
  clinicId,
  patientId,
  csrfToken,
  onAuthError,
}) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('PREGNANCY_EPISODE');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeEpisode, setActiveEpisode] = useState<PregnancyEpisodeItem | null>(null);
  const [visits, setVisits] = useState<AntenatalVisitRecordItem[]>([]);
  const [history, setHistory] = useState<ObstetricHistoryItem[]>([]);
  const [exams, setExams] = useState<GynecologicalExaminationItem[]>([]);

  // New episode creation form state
  const [showNewEpisodeForm, setShowNewEpisodeForm] = useState(false);
  const [gravidity, setGravidity] = useState(1);
  const [parity, setParity] = useState(0);
  const [lmpDate, setLmpDate] = useState('');
  const [lmpCertainty, setLmpCertainty] = useState(true);
  const [bloodType, setBloodType] = useState('O_POSITIVE');
  const [highRisk, setHighRisk] = useState(false);
  const [highRiskReason, setHighRiskReason] = useState('');
  const [creatingEpisode, setCreatingEpisode] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [episodeData, histData, examData] = await Promise.all([
        getActivePregnancyEpisode(clinicId, patientId, csrfToken, onAuthError),
        listObstetricHistory(clinicId, patientId, csrfToken, onAuthError),
        listGynecologicalExams(clinicId, patientId, csrfToken, onAuthError),
      ]);

      setActiveEpisode(episodeData ?? null);
      setHistory(Array.isArray(histData) ? histData : []);
      setExams(Array.isArray(examData) ? examData : []);

      if (episodeData?.id) {
        const visitData = await listAntenatalVisits(clinicId, episodeData.id, csrfToken, onAuthError);
        setVisits(Array.isArray(visitData) ? visitData : []);
      } else {
        setVisits([]);
      }
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [clinicId, patientId, csrfToken, onAuthError]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const refreshVisits = useCallback(async () => {
    if (!activeEpisode?.id) return;
    try {
      const v = await listAntenatalVisits(clinicId, activeEpisode.id, csrfToken, onAuthError);
      setVisits(Array.isArray(v) ? v : []);
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  }, [clinicId, activeEpisode?.id, csrfToken, onAuthError]);

  const refreshHistory = useCallback(async () => {
    try {
      const h = await listObstetricHistory(clinicId, patientId, csrfToken, onAuthError);
      setHistory(Array.isArray(h) ? h : []);
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  }, [clinicId, patientId, csrfToken, onAuthError]);

  const refreshExams = useCallback(async () => {
    try {
      const ex = await listGynecologicalExams(clinicId, patientId, csrfToken, onAuthError);
      setExams(Array.isArray(ex) ? ex : []);
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  }, [clinicId, patientId, csrfToken, onAuthError]);

  const handleCreateEpisode = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingEpisode(true);
    setError(null);

    try {
      const created = await createPregnancyEpisode(
        clinicId,
        {
          patientId,
          gravidity: Number(gravidity),
          parity: Number(parity),
          lastMenstrualPeriodDate: lmpDate || undefined,
          lmpCertainty,
          bloodGroupRh: bloodType,
          highRiskFlag: highRisk,
          highRiskJustification: highRisk ? highRiskReason.trim() : undefined,
        },
        csrfToken,
        onAuthError,
      );

      setActiveEpisode(created);
      setShowNewEpisodeForm(false);
      void loadData();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setCreatingEpisode(false);
    }
  };

  return (
    <div
      className="obgyn-workspace"
      data-testid="obgyn-workspace"
      dir="rtl"
      style={{
        marginTop: '1rem',
        border: '1px solid #cbd5e1',
        borderRadius: '8px',
        padding: '1.25rem',
        backgroundColor: '#ffffff',
      }}
    >
      {/* HEADER */}
      <div
        className="workspace-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '2px solid #e2e8f0',
          paddingBottom: '0.75rem',
          marginBottom: '1rem',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a' }}>
            🌸 عيادة التوليد وأمراض النساء (Obstetrics & Gynecology)
          </h2>
          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.2rem' }}>
            رعاية الأمومة، متابعة الحمل الدورية، تدقيق السونار وموعد الولادة، وسجلات الفحص النسائي المحمية.
          </div>
        </div>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => void loadData()}
          disabled={loading}
          data-testid="refresh-obgyn-btn"
          style={{
            padding: '0.35rem 0.75rem',
            borderRadius: '4px',
            border: '1px solid #cbd5e1',
            background: '#f8fafc',
            cursor: 'pointer',
          }}
        >
          {loading ? 'جارٍ التحديث...' : '🔄 تحديث'}
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '4px' }}>
          ⚠️ {error}
        </div>
      )}

      {/* ACTIVE PREGNANCY EPISODE HEADER */}
      {activeEpisode ? (
        <PregnancyEpisodeHeader episode={activeEpisode} onRefresh={loadData} />
      ) : (
        <div
          style={{
            backgroundColor: '#f8fafc',
            border: '1px dashed #cbd5e1',
            borderRadius: '8px',
            padding: '1rem',
            textAlign: 'center',
            marginBottom: '1rem',
          }}
        >
          <div style={{ color: '#64748b', marginBottom: '0.5rem' }}>
            لا يوجد ملف متابعة حمل نشط حالياً لهذه المريضة.
          </div>
          <button
            type="button"
            onClick={() => setShowNewEpisodeForm(!showNewEpisodeForm)}
            style={{
              padding: '0.45rem 1rem',
              backgroundColor: '#be185d',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {showNewEpisodeForm ? 'إلغاء ✖' : '+ بدء دورة متابعة حمل جديدة (New Pregnancy Episode)'}
          </button>

          {showNewEpisodeForm && (
            <form onSubmit={handleCreateEpisode} style={{ marginTop: '1rem', textAlign: 'right', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>مرات الحمل (Gravidity) *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={gravidity}
                    onChange={(e) => setGravidity(parseInt(e.target.value, 10))}
                    style={{ width: '100%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>مرات الولادة (Parity) *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={parity}
                    onChange={(e) => setParity(parseInt(e.target.value, 10))}
                    style={{ width: '100%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>تاريخ أول يوم لآخر دورة (LMP)</label>
                  <input
                    type="date"
                    value={lmpDate}
                    onChange={(e) => setLmpDate(e.target.value)}
                    style={{ width: '100%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', marginTop: '0.25rem', color: '#64748b', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={lmpCertainty}
                      onChange={(e) => setLmpCertainty(e.target.checked)}
                    />
                    تاريخ مؤكد ومنتظم (Certain)
                  </label>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>فصيلة الدم وعامل ريزوس</label>
                  <select
                    value={bloodType}
                    onChange={(e) => setBloodType(e.target.value)}
                    style={{ width: '100%', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  >
                    <option value="A_POSITIVE">A موجب (+A)</option>
                    <option value="A_NEGATIVE">A سالب (-A)</option>
                    <option value="B_POSITIVE">B موجب (+B)</option>
                    <option value="B_NEGATIVE">B سالب (-B)</option>
                    <option value="O_POSITIVE">O موجب (+O)</option>
                    <option value="O_NEGATIVE">O سالب (-O)</option>
                    <option value="AB_POSITIVE">AB موجب (+AB)</option>
                    <option value="AB_NEGATIVE">AB سالب (-AB)</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 600, color: '#991b1b', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={highRisk}
                    onChange={(e) => setHighRisk(e.target.checked)}
                  />
                  تصنيف الحمل كحمل عالي الخطورة (High-Risk Pregnancy)
                </label>
                {highRisk && (
                  <input
                    type="text"
                    required
                    value={highRiskReason}
                    onChange={(e) => setHighRiskReason(e.target.value)}
                    placeholder="مبرر الخطورة العالية (سكري حملي، سوابق تسمم حمل، عمر الأم...)"
                    style={{ width: '100%', marginTop: '0.4rem', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  />
                )}
              </div>

              <button
                type="submit"
                disabled={creatingEpisode}
                style={{
                  padding: '0.45rem 1.25rem',
                  backgroundColor: '#be185d',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  fontWeight: 600,
                  cursor: creatingEpisode ? 'not-allowed' : 'pointer',
                }}
              >
                {creatingEpisode ? 'جارٍ الإنشاء...' : 'بدء متابعة الحمل (حساب EDD بقاعدة نايغل) ✓'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* WORKSPACE TABS */}
      <div
        className="workspace-tabs"
        style={{
          display: 'flex',
          gap: '0.5rem',
          borderBottom: '1px solid #e2e8f0',
          marginBottom: '1.25rem',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('PREGNANCY_EPISODE')}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: activeTab === 'PREGNANCY_EPISODE' ? '#be185d' : '#f1f5f9',
            color: activeTab === 'PREGNANCY_EPISODE' ? '#ffffff' : '#334155',
            border: 'none',
            borderRadius: '6px 6px 0 0',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          📋 متابعة الحمل والزيارات ({visits.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('DATING_REVIEW')}
          disabled={!activeEpisode}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: activeTab === 'DATING_REVIEW' ? '#be185d' : '#f1f5f9',
            color: activeTab === 'DATING_REVIEW' ? '#ffffff' : '#334155',
            border: 'none',
            borderRadius: '6px 6px 0 0',
            fontWeight: 600,
            opacity: activeEpisode ? 1 : 0.5,
            cursor: activeEpisode ? 'pointer' : 'not-allowed',
          }}
        >
          🩺 تدقيق عمر الحمل والسونار
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('OBSTETRIC_HISTORY')}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: activeTab === 'OBSTETRIC_HISTORY' ? '#be185d' : '#f1f5f9',
            color: activeTab === 'OBSTETRIC_HISTORY' ? '#ffffff' : '#334155',
            border: 'none',
            borderRadius: '6px 6px 0 0',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          📜 التاريخ التوليدي والولادات السابقة ({history.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('GYNECOLOGY')}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: activeTab === 'GYNECOLOGY' ? '#be185d' : '#f1f5f9',
            color: activeTab === 'GYNECOLOGY' ? '#ffffff' : '#334155',
            border: 'none',
            borderRadius: '6px 6px 0 0',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          🔒 الفحوصات النسائية السرية ({exams.length})
        </button>
      </div>

      {/* TAB CONTENT */}
      {activeTab === 'PREGNANCY_EPISODE' && (
        activeEpisode ? (
          <AntenatalFlowsheetSection
            clinicId={clinicId}
            episode={activeEpisode}
            visits={visits}
            csrfToken={csrfToken}
            onRefreshVisits={refreshVisits}
            onAuthError={onAuthError}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
            يرجى بدء دورة متابعة حمل لتسجيل زيارات الحمل ومتابعة مخطط نمو الجنين والفحوصات الدورية.
          </div>
        )
      )}

      {activeTab === 'DATING_REVIEW' && activeEpisode && (
        <PregnancyDatingSection
          clinicId={clinicId}
          episode={activeEpisode}
          csrfToken={csrfToken}
          onUpdated={(up) => setActiveEpisode(up)}
          onAuthError={onAuthError}
        />
      )}

      {activeTab === 'OBSTETRIC_HISTORY' && (
        <ObstetricHistorySection
          clinicId={clinicId}
          patientId={patientId}
          history={history}
          csrfToken={csrfToken}
          onRefreshHistory={refreshHistory}
          onAuthError={onAuthError}
        />
      )}

      {activeTab === 'GYNECOLOGY' && (
        <ConfidentialGynecologicalSection
          clinicId={clinicId}
          patientId={patientId}
          exams={exams}
          csrfToken={csrfToken}
          onRefreshExams={refreshExams}
          onAuthError={onAuthError}
        />
      )}
    </div>
  );
};

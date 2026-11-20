import React, { useState, useEffect } from 'react';
import { MusculoskeletalExamSection } from './MusculoskeletalExamSection';
import { JointRomSection } from './JointRomSection';
import { RehabilitationPlanSection } from './RehabilitationPlanSection';
import { PhysiotherapySessionSection } from './PhysiotherapySessionSection';
import { FunctionalScalesSection } from './FunctionalScalesSection';
import { clinicalApi, blankClinical } from '../clinical/clinical-api';

export interface OrthopedicsPhysiotherapyWorkspaceProps {
  clinicId: string;
  patientId: string;
  encounterId?: string;
  csrfToken?: string;
}

type ActiveTab = 'musculoskeletal' | 'joint-rom' | 'rehabilitation' | 'physiotherapy' | 'functional-scales';

export const OrthopedicsPhysiotherapyWorkspace: React.FC<OrthopedicsPhysiotherapyWorkspaceProps> = ({
  clinicId,
  patientId,
  encounterId,
  csrfToken,
}) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('musculoskeletal');
  const [resolvedEncounterId, setResolvedEncounterId] = useState<string>(encounterId || '');

  useEffect(() => {
    let active = true;
    const resolveEncounter = async () => {
      if (encounterId && encounterId !== 'default-encounter') {
        setResolvedEncounterId(encounterId);
        return;
      }
      try {
        const res = await clinicalApi(clinicId).list(patientId, new AbortController().signal);
        if (!active) return;
        if (res.items && res.items.length > 0) {
          setResolvedEncounterId(res.items[0].id);
        } else if (csrfToken) {
          const created = await clinicalApi(clinicId).create(
            patientId,
            blankClinical(),
            csrfToken,
            new AbortController().signal,
          );
          if (!active) return;
          setResolvedEncounterId(created.id);
        }
      } catch (e) {
        console.warn('Failed to resolve or create encounter for orthopedics/PT workspace:', e);
      }
    };

    resolveEncounter();
    return () => {
      active = false;
    };
  }, [clinicId, patientId, encounterId, csrfToken]);

  return (
    <div className="orthopedics-physiotherapy-workspace bg-gray-50/50 p-4 rounded-2xl border border-gray-200 space-y-6" dir="rtl">
      {/* Workspace Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div>
          <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
            <span>🦴🏃</span>
            <span>ملف جراحة العظام والتأهيل الحركي والعلاج الطبيعي</span>
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            فحص الجهاز العضلي الهيكلي، قياس زوايا المدى الحركي (AAOS)، خطط التأهيل الحركي، وجلسات العلاج الطبيعي.
          </p>
        </div>

        {resolvedEncounterId && (
          <div className="text-xs bg-blue-50 text-blue-800 px-3 py-1.5 rounded-lg border border-blue-200 font-mono">
            الزيارة السريرية: {resolvedEncounterId.slice(0, 8)}...
          </div>
        )}
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-gray-200 overflow-x-auto gap-2 bg-white px-3 pt-2 rounded-t-xl border-t border-r border-l">
        <button
          type="button"
          onClick={() => setActiveTab('musculoskeletal')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'musculoskeletal'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          فحص الجهاز العضلي الهيكلي
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('joint-rom')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'joint-rom'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          قياس مدى حركة المفاصل (ROM)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('rehabilitation')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'rehabilitation'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          خطط وبرامج التأهيل الحركي
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('physiotherapy')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'physiotherapy'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          جلسات العلاج الطبيعي
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('functional-scales')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'functional-scales'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          مقاييس التقييم الوظيفي (ODI, QuickDASH, Lysholm)
        </button>
      </div>

      {/* Tab Panels */}
      <div className="tab-content">
        {activeTab === 'musculoskeletal' && (
          <MusculoskeletalExamSection
            clinicId={clinicId}
            patientId={patientId}
            encounterId={resolvedEncounterId}
            csrfToken={csrfToken}
          />
        )}

        {activeTab === 'joint-rom' && (
          <JointRomSection
            clinicId={clinicId}
            patientId={patientId}
            encounterId={resolvedEncounterId}
            csrfToken={csrfToken}
          />
        )}

        {activeTab === 'rehabilitation' && (
          <RehabilitationPlanSection
            clinicId={clinicId}
            patientId={patientId}
            csrfToken={csrfToken}
          />
        )}

        {activeTab === 'physiotherapy' && (
          <PhysiotherapySessionSection
            clinicId={clinicId}
            patientId={patientId}
            encounterId={resolvedEncounterId}
            csrfToken={csrfToken}
          />
        )}

        {activeTab === 'functional-scales' && (
          <FunctionalScalesSection />
        )}
      </div>
    </div>
  );
};

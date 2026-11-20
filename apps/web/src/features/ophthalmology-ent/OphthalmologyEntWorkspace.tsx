import React, { useState, useEffect } from 'react';
import { OphthalmicRefractionSection } from './OphthalmicRefractionSection';
import { OphthalmicExaminationSection } from './OphthalmicExaminationSection';
import { EntExaminationSection } from './EntExaminationSection';
import { AudiometrySection } from './AudiometrySection';
import { clinicalApi, blankClinical } from '../clinical/clinical-api';

export interface OphthalmologyEntWorkspaceProps {
  clinicId: string;
  patientId: string;
  encounterId?: string;
  csrfToken?: string;
  userPrivileges?: string[];
}

type ActiveTab = 'refraction' | 'ophthalmic-exam' | 'ent-exam' | 'audiometry';

export const OphthalmologyEntWorkspace: React.FC<OphthalmologyEntWorkspaceProps> = ({
  clinicId,
  patientId,
  encounterId,
  csrfToken,
  userPrivileges = [
    'REFRACTION_MEASURE',
    'OPHTHALMIC_EXAM_DOCUMENT',
    'OPHTHALMIC_RECORD_FINALIZE',
    'ENT_EXAM_DOCUMENT',
    'AUDIOMETRY_RECORD',
    'ENT_PROCEDURE_PERFORM',
  ],
}) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('refraction');
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
      } catch (err) {
        console.error('Failed to resolve clinical encounter:', err);
      }
    };
    resolveEncounter();
    return () => {
      active = false;
    };
  }, [clinicId, patientId, encounterId, csrfToken]);

  const hasRefractionPrivilege = userPrivileges.includes('REFRACTION_MEASURE');
  const hasOphthExamPrivilege = userPrivileges.includes('OPHTHALMIC_EXAM_DOCUMENT');
  const hasEntExamPrivilege = userPrivileges.includes('ENT_EXAM_DOCUMENT');
  const hasAudiometryPrivilege = userPrivileges.includes('AUDIOMETRY_RECORD');

  return (
    <div className="ophthalmology-ent-workspace space-y-5" dir="rtl">
      {/* Header and Clinical Disclaimer */}
      <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-5 rounded-xl shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <span>👁️ 👂</span>
              <span>عيادة طب وجراحة العيون والأنف والأذن والحنجرة</span>
            </h2>
            <p className="text-xs text-blue-200 mt-1">
              الملف السريري المتخصص لقياس البصر، ضغط العين، فحص الأنف والأذن، وتخطيط السمع النغمي
            </p>
          </div>
          <div className="bg-blue-800/60 border border-blue-400/30 px-3 py-1.5 rounded-lg text-xs font-medium text-blue-100">
            جلسة سريرية نشطة
          </div>
        </div>

        {/* Advisory Banner */}
        <div className="mt-4 p-3 bg-blue-950/70 border border-blue-700/50 rounded-lg text-xs text-blue-200 space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-amber-300">
            <span>🛡️</span>
            <span>تنبيه سريري وقانوني معتمد (Clinical & Legal Advisory):</span>
          </div>
          <p>
            هذه الأدوات التحليلية السريرية (تنبيهات ضغط العين، تصنيف السمع حسب منظمة الصحة العالمية WHO 2021، وحساب المكافئ الكروي) هي أدوات مساندة استرشادية فقط، ولا تحل محل الفحص السريري المباشر والقرار الطبي المستقل للطبيب المرخص.
          </p>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-gray-200 bg-white rounded-t-lg px-2 pt-2 gap-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('refraction')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-lg transition-colors border-b-2 whitespace-nowrap ${
            activeTab === 'refraction'
              ? 'border-blue-600 text-blue-700 bg-blue-50/50'
              : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <span>👓</span>
          <span>انكسار وحدة البصر (Refraction)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ophthalmic-exam')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-lg transition-colors border-b-2 whitespace-nowrap ${
            activeTab === 'ophthalmic-exam'
              ? 'border-blue-600 text-blue-700 bg-blue-50/50'
              : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <span>🔬</span>
          <span>فحص العين وضغط العين (Tonometry)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ent-exam')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-lg transition-colors border-b-2 whitespace-nowrap ${
            activeTab === 'ent-exam'
              ? 'border-blue-600 text-blue-700 bg-blue-50/50'
              : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <span>👂👃</span>
          <span>فحص الأنف والأذن والحنجرة (ENT Exam)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('audiometry')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-lg transition-colors border-b-2 whitespace-nowrap ${
            activeTab === 'audiometry'
              ? 'border-blue-600 text-blue-700 bg-blue-50/50'
              : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <span>📊</span>
          <span>تخطيط وقياس السمع (Audiometry)</span>
        </button>
      </div>

      {/* Tab Panels */}
      <div className="tab-content">
        {activeTab === 'refraction' && (
          <OphthalmicRefractionSection
            clinicId={clinicId}
            patientId={patientId}
            encounterId={resolvedEncounterId}
            csrfToken={csrfToken}
            hasPrivilege={hasRefractionPrivilege}
          />
        )}

        {activeTab === 'ophthalmic-exam' && (
          <OphthalmicExaminationSection
            clinicId={clinicId}
            patientId={patientId}
            encounterId={resolvedEncounterId}
            csrfToken={csrfToken}
            hasPrivilege={hasOphthExamPrivilege}
          />
        )}

        {activeTab === 'ent-exam' && (
          <EntExaminationSection
            clinicId={clinicId}
            patientId={patientId}
            encounterId={resolvedEncounterId}
            csrfToken={csrfToken}
            hasPrivilege={hasEntExamPrivilege}
          />
        )}

        {activeTab === 'audiometry' && (
          <AudiometrySection
            clinicId={clinicId}
            patientId={patientId}
            encounterId={resolvedEncounterId}
            csrfToken={csrfToken}
            hasPrivilege={hasAudiometryPrivilege}
          />
        )}
      </div>
    </div>
  );
};

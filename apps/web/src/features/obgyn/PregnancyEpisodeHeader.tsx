import React from 'react';
import type { PregnancyEpisodeItem } from './types.js';

interface PregnancyEpisodeHeaderProps {
  episode: PregnancyEpisodeItem;
  onRefresh?: () => void;
}

export const PregnancyEpisodeHeader: React.FC<PregnancyEpisodeHeaderProps> = ({ episode }) => {
  // Compute current gestational age from EDD (EDD = LMP + 280 days)
  const computeCurrentGa = () => {
    if (!episode.estimatedDueDate) return null;
    const eddUtc = new Date(episode.estimatedDueDate + 'T00:00:00Z').getTime();
    const todayUtc = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
    const daysUntilEdd = Math.round((eddUtc - todayUtc) / 86400000);
    const elapsedDays = 280 - daysUntilEdd;
    if (elapsedDays < 0) return 'قبل بدء الحمل';
    if (elapsedDays > 300) return 'تجاوز موعد الولادة المتوقع';
    const weeks = Math.floor(elapsedDays / 7);
    const days = elapsedDays % 7;
    return `${weeks}+${days} أسابيع`;
  };

  const currentGa = computeCurrentGa();

  return (
    <div
      className="pregnancy-episode-header"
      data-testid="pregnancy-episode-header"
      style={{
        backgroundColor: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '1rem',
        marginBottom: '1rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#0f172a' }}>
              🤰 متابعة الحمل الحالي — دورة الحمل #{episode.episodeNumber}
            </span>
            <span
              style={{
                fontSize: '0.75rem',
                padding: '0.2rem 0.6rem',
                borderRadius: '9999px',
                fontWeight: 600,
                backgroundColor: episode.status === 'ACTIVE' ? '#dcfce7' : '#f1f5f9',
                color: episode.status === 'ACTIVE' ? '#166534' : '#475569',
              }}
            >
              {episode.status === 'ACTIVE' ? 'حمل نشط' : episode.status}
            </span>
            {episode.highRiskFlag && (
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '9999px',
                  fontWeight: 600,
                  backgroundColor: '#fee2e2',
                  color: '#991b1b',
                  border: '1px solid #f87171',
                }}
              >
                ⚠️ حمل عالي الخطورة
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem', fontSize: '0.875rem', color: '#334155', flexWrap: 'wrap' }}>
            <div>
              <strong>عمر الحمل المحسوب:</strong>{' '}
              <span style={{ color: '#0284c7', fontWeight: 'bold' }}>{currentGa ?? 'غير محدد'}</span>
            </div>
            <div>
              <strong>الموعد المتوقع للولادة (EDD):</strong>{' '}
              <span style={{ fontWeight: 'bold' }}>{episode.estimatedDueDate}</span>
            </div>
            <div>
              <strong>طريقة تحديد الموعد:</strong>{' '}
              <span>{episode.datingMethod}</span>
              {episode.isDatingFinalized && (
                <span style={{ color: '#16a34a', marginRight: '0.3rem' }}>✓ (معتمد سريرياً)</span>
              )}
            </div>
          </div>
        </div>

        {/* GPA Summary Tag */}
        <div
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            padding: '0.5rem 0.75rem',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>الموجز التوليدي (GPA)</div>
          <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#0f172a', direction: 'ltr' }}>
            G{episode.gravidity} P{episode.parity} ({episode.termDeliveries}-{episode.pretermDeliveries}-{episode.abortions}-{episode.livingChildren})
          </div>
          <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
            أحياء: {episode.livingChildren} | إجهاض: {episode.abortions}
          </div>
        </div>
      </div>

      {/* Maternal details row */}
      <div
        style={{
          display: 'flex',
          gap: '1.25rem',
          marginTop: '0.75rem',
          paddingTop: '0.75rem',
          borderTop: '1px solid #e2e8f0',
          fontSize: '0.8rem',
          color: '#475569',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <strong>فصيلة الدم وعامل ريزوس:</strong>{' '}
          <span style={{ fontWeight: 600, color: '#0f172a' }}>{episode.bloodGroupRh ?? 'غير مسجل'}</span>
          {episode.rhAntibodyScreenPositive && (
            <span style={{ color: '#dc2626', marginRight: '0.3rem' }}>(أجسام مضادة إيجابية Rh!)</span>
          )}
        </div>
        <div>
          <strong>تاريخ آخر دورة شهرية (LMP):</strong>{' '}
          <span>{episode.lastMenstrualPeriodDate ?? 'غير معلوم'}</span>
          <span style={{ marginRight: '0.2rem', color: '#64748b' }}>
            ({episode.lmpCertainty ? 'مؤكد' : 'غير مؤكد'})
          </span>
        </div>
        <div>
          <strong>عدد الأجنة:</strong>{' '}
          <span>{episode.multipleGestationCount > 1 ? `متعدد (${episode.multipleGestationCount})` : 'مفرد (Singleton)'}</span>
        </div>
      </div>

      {episode.highRiskFlag && episode.highRiskJustification && (
        <div
          style={{
            marginTop: '0.5rem',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '4px',
            padding: '0.5rem 0.75rem',
            fontSize: '0.8rem',
            color: '#991b1b',
          }}
        >
          <strong>مبررات الخطورة العالية:</strong> {episode.highRiskJustification}
        </div>
      )}
    </div>
  );
};

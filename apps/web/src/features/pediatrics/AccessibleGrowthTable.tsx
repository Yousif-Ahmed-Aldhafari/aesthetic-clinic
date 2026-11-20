import React from 'react';
import type { PediatricGrowthRecordItem } from './types.js';

interface AccessibleGrowthTableProps {
  records: PediatricGrowthRecordItem[];
}

export const AccessibleGrowthTable: React.FC<AccessibleGrowthTableProps> = ({ records }) => {
  const activeRecords = (records || []).filter((r) => r.status !== 'ENTERED_IN_ERROR');

  const formatZScore = (z?: number | string | null, p?: number | string | null) => {
    if (z === null || z === undefined || z === '') return '—';
    const numZ = Number(z);
    if (isNaN(numZ)) return '—';
    const sign = numZ > 0 ? '+' : '';
    const numP = p !== null && p !== undefined && p !== '' ? Number(p) : null;
    const pct = numP !== null && !isNaN(numP) ? ` (${numP}%)` : '';
    return `${sign}${numZ.toFixed(2)}${pct}`;
  };

  return (
    <div className="accessible-growth-table-wrapper" data-testid="accessible-growth-table" dir="rtl">
      <div style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 style={{ margin: 0, fontSize: '1rem', color: '#1e293b' }}>
          📊 جدول قياسات النمو ومؤشرات منظمة الصحة العالمية (عرض متاح وسهل الوصول)
        </h4>
        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
          إجمالي القياسات النشطة: {activeRecords.length}
        </span>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
        <table
          className="table growth-table"
          style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}
          role="table"
          aria-label="جدول القياسات الجسمانية ومؤشرات النمو"
        >
          <caption style={{ textAlign: 'right', padding: '0.5rem', color: '#64748b', fontSize: '0.8rem' }}>
            سجل القياسات الجسمانية الدورية للطفل ومقارنتها بمعايير منظمة الصحة العالمية (WHO 2006)
          </caption>
          <thead>
            <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #cbd5e1', textAlign: 'right' }}>
              <th scope="col" style={{ padding: '0.6rem 0.75rem' }}>تاريخ القياس</th>
              <th scope="col" style={{ padding: '0.6rem 0.75rem' }}>العمر الزمني (يوم / سنة)</th>
              <th scope="col" style={{ padding: '0.6rem 0.75rem' }}>العمر المصحح</th>
              <th scope="col" style={{ padding: '0.6rem 0.75rem' }}>الوزن (كجم) ومئينه</th>
              <th scope="col" style={{ padding: '0.6rem 0.75rem' }}>الطول/القامة (سم) والنوع</th>
              <th scope="col" style={{ padding: '0.6rem 0.75rem' }}>محيط الرأس (سم)</th>
              <th scope="col" style={{ padding: '0.6rem 0.75rem' }}>كتلة الجسم (BMI)</th>
              <th scope="col" style={{ padding: '0.6rem 0.75rem' }}>المصدر</th>
              <th scope="col" style={{ padding: '0.6rem 0.75rem' }}>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {activeRecords.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                  لا توجد قياسات مسجلة في هذا الجدول
                </td>
              </tr>
            ) : (
              activeRecords.map((rec) => {
                const dateStr = new Date(rec.measuredAt).toLocaleDateString('ar-YE');
                const ageY = (Number(rec.chronologicalAgeDays) / 365.25).toFixed(1);
                const isPretermCorrected =
                  rec.correctedAgeDays !== null &&
                  rec.correctedAgeDays !== undefined &&
                  rec.correctedAgeDays !== rec.chronologicalAgeDays;

                return (
                  <tr
                    key={rec.id}
                    style={{ borderBottom: '1px solid #e2e8f0' }}
                    data-testid={`growth-row-${rec.id}`}
                  >
                    <th scope="row" style={{ padding: '0.6rem 0.75rem', fontWeight: 600 }}>
                      {dateStr}
                    </th>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      {ageY} سنة ({rec.chronologicalAgeDays} يوم)
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      {isPretermCorrected ? (
                        <span style={{ color: '#0284c7', fontWeight: 500 }}>
                          {(Number(rec.correctedAgeDays) / 30.4375).toFixed(1)} شهر
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      {rec.weightKg ? (
                        <div>
                          <strong>{rec.weightKg} كجم</strong>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {formatZScore(rec.weightForAgeZScore, rec.weightForAgePercentile)}
                          </div>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      {rec.statureCm ? (
                        <div>
                          <strong>{rec.statureCm} سم</strong>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {rec.statureMethod === 'RECUMBENT_LENGTH' ? 'طول مستلقٍ' : 'قامة واقفة'}{' '}
                            | {formatZScore(rec.lengthForAgeZScore, rec.lengthForAgePercentile)}
                          </div>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      {rec.headCircumferenceCm ? (
                        <div>
                          <strong>{rec.headCircumferenceCm} سم</strong>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {formatZScore(rec.headCircumferenceZScore, rec.headCircumferencePercentile)}
                          </div>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      {rec.bodyMassIndex ? (
                        <div>
                          <strong>{rec.bodyMassIndex}</strong>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {formatZScore(rec.bmiForAgeZScore, rec.bmiForAgePercentile)}
                          </div>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem', fontSize: '0.8rem', color: '#475569' }}>
                      {rec.measurementSource === 'CLINICAL_ENCOUNTER'
                        ? 'عيادة'
                        : rec.measurementSource === 'NURSE_TRIAGE'
                        ? 'فرز تمريضي'
                        : rec.measurementSource === 'COMMUNITY_SCREENING'
                        ? 'مسح مجتمعي'
                        : 'سجل سابق'}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      <span
                        style={{
                          padding: '0.15rem 0.4rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          backgroundColor: '#dcfce7',
                          color: '#166534',
                        }}
                      >
                        نهائي
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

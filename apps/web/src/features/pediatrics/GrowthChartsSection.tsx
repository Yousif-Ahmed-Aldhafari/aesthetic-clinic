import React, { useState } from 'react';
import type { PediatricGrowthRecordItem, PediatricBirthHistoryItem } from './types.js';

interface GrowthChartsSectionProps {
  gender: 'MALE' | 'FEMALE';
  birthHistory: PediatricBirthHistoryItem | null;
  records: PediatricGrowthRecordItem[];
}

type ChartType = 'WEIGHT_FOR_AGE' | 'LENGTH_FOR_AGE' | 'HEAD_CIRCUMFERENCE' | 'BMI_FOR_AGE';

interface ReferenceCurvePoint {
  month: number;
  p3: number;
  p15: number;
  p50: number;
  p85: number;
  p97: number;
}

// WHO 2006 Reference Curve Points (Sampled across 0, 3, 6, 9, 12, 18, 24, 36, 48, 60 months)
const WHO_CURVES: Record<'MALE' | 'FEMALE', Record<ChartType, ReferenceCurvePoint[]>> = {
  MALE: {
    WEIGHT_FOR_AGE: [
      { month: 0, p3: 2.5, p15: 2.9, p50: 3.3, p85: 3.9, p97: 4.4 },
      { month: 3, p3: 5.0, p15: 5.7, p50: 6.4, p85: 7.2, p97: 8.0 },
      { month: 6, p3: 6.4, p15: 7.1, p50: 7.9, p85: 8.8, p97: 9.8 },
      { month: 9, p3: 7.2, p15: 8.0, p50: 8.9, p85: 9.9, p97: 11.0 },
      { month: 12, p3: 7.7, p15: 8.6, p50: 9.6, p85: 10.8, p97: 12.0 },
      { month: 18, p3: 8.8, p15: 9.8, p50: 10.9, p85: 12.2, p97: 13.7 },
      { month: 24, p3: 9.7, p15: 10.8, p50: 12.2, p85: 13.6, p97: 15.3 },
      { month: 36, p3: 11.3, p15: 12.7, p50: 14.3, p85: 16.2, p97: 18.3 },
      { month: 48, p3: 12.7, p15: 14.4, p50: 16.3, p85: 18.6, p97: 21.2 },
      { month: 60, p3: 14.1, p15: 16.0, p50: 18.3, p85: 21.0, p97: 24.2 },
    ],
    LENGTH_FOR_AGE: [
      { month: 0, p3: 46.1, p15: 48.0, p50: 49.9, p85: 51.8, p97: 53.7 },
      { month: 3, p3: 57.3, p15: 59.4, p50: 61.4, p85: 63.5, p97: 65.5 },
      { month: 6, p3: 63.3, p15: 65.5, p50: 67.6, p85: 69.8, p97: 71.9 },
      { month: 9, p3: 67.5, p15: 69.7, p50: 72.0, p85: 74.2, p97: 76.5 },
      { month: 12, p3: 71.0, p15: 73.4, p50: 75.7, p85: 78.1, p97: 80.5 },
      { month: 18, p3: 76.9, p15: 79.6, p50: 82.3, p85: 85.0, p97: 87.7 },
      { month: 24, p3: 81.7, p15: 84.8, p50: 87.8, p85: 90.9, p97: 93.9 },
      { month: 36, p3: 88.7, p15: 92.4, p50: 96.1, p85: 99.8, p97: 103.5 },
      { month: 48, p3: 94.9, p15: 99.1, p50: 103.3, p85: 107.5, p97: 111.7 },
      { month: 60, p3: 100.7, p15: 105.3, p50: 110.0, p85: 114.6, p97: 119.2 },
    ],
    HEAD_CIRCUMFERENCE: [
      { month: 0, p3: 31.9, p15: 33.2, p50: 34.5, p85: 35.8, p97: 37.0 },
      { month: 3, p3: 38.3, p15: 39.5, p50: 40.5, p85: 41.9, p97: 42.9 },
      { month: 6, p3: 41.0, p15: 42.2, p50: 43.3, p85: 44.7, p97: 45.8 },
      { month: 9, p3: 42.6, p15: 43.8, p50: 45.0, p85: 46.4, p97: 47.5 },
      { month: 12, p3: 43.6, p15: 44.8, p50: 46.1, p85: 47.5, p97: 48.6 },
      { month: 18, p3: 44.9, p15: 46.2, p50: 47.4, p85: 48.9, p97: 50.0 },
      { month: 24, p3: 45.8, p15: 47.0, p50: 48.3, p85: 49.8, p97: 51.0 },
      { month: 36, p3: 47.0, p15: 48.3, p50: 49.5, p85: 51.1, p97: 52.3 },
      { month: 48, p3: 47.7, p15: 49.0, p50: 50.3, p85: 51.9, p97: 53.1 },
      { month: 60, p3: 48.3, p15: 49.6, p50: 50.9, p85: 52.5, p97: 53.8 },
    ],
    BMI_FOR_AGE: [
      { month: 0, p3: 11.1, p15: 12.2, p50: 13.4, p85: 14.8, p97: 16.1 },
      { month: 3, p3: 14.5, p15: 15.6, p50: 16.8, p85: 18.2, p97: 19.5 },
      { month: 6, p3: 14.9, p15: 16.1, p50: 17.3, p85: 18.7, p97: 20.0 },
      { month: 9, p3: 14.8, p15: 15.9, p50: 17.1, p85: 18.5, p97: 19.8 },
      { month: 12, p3: 14.5, p15: 15.6, p50: 16.8, p85: 18.2, p97: 19.4 },
      { month: 18, p3: 14.1, p15: 15.1, p50: 16.3, p85: 17.6, p97: 18.8 },
      { month: 24, p3: 13.8, p15: 14.8, p50: 16.0, p85: 17.3, p97: 18.5 },
      { month: 36, p3: 13.5, p15: 14.4, p50: 15.6, p85: 16.9, p97: 18.1 },
      { month: 48, p3: 13.3, p15: 14.2, p50: 15.3, p85: 16.7, p97: 17.9 },
      { month: 60, p3: 13.1, p15: 14.1, p50: 15.2, p85: 16.6, p97: 18.0 },
    ],
  },
  FEMALE: {
    WEIGHT_FOR_AGE: [
      { month: 0, p3: 2.4, p15: 2.8, p50: 3.2, p85: 3.7, p97: 4.2 },
      { month: 3, p3: 4.5, p15: 5.2, p50: 5.8, p85: 6.6, p97: 7.5 },
      { month: 6, p3: 5.7, p15: 6.5, p50: 7.3, p85: 8.2, p97: 9.3 },
      { month: 9, p3: 6.5, p15: 7.3, p50: 8.2, p85: 9.3, p97: 10.5 },
      { month: 12, p3: 7.0, p15: 7.9, p50: 8.9, p85: 10.1, p97: 11.5 },
      { month: 18, p3: 8.1, p15: 9.1, p50: 10.2, p85: 11.6, p97: 13.2 },
      { month: 24, p3: 9.0, p15: 10.2, p50: 11.5, p85: 13.0, p97: 14.8 },
      { month: 36, p3: 10.8, p15: 12.2, p50: 13.9, p85: 15.8, p97: 18.1 },
      { month: 48, p3: 12.3, p15: 14.0, p50: 16.1, p85: 18.5, p97: 21.5 },
      { month: 60, p3: 13.7, p15: 15.8, p50: 18.2, p85: 21.2, p97: 24.9 },
    ],
    LENGTH_FOR_AGE: [
      { month: 0, p3: 45.4, p15: 47.3, p50: 49.1, p85: 51.0, p97: 52.9 },
      { month: 3, p3: 55.6, p15: 57.7, p50: 59.8, p85: 61.9, p97: 64.0 },
      { month: 6, p3: 61.2, p15: 63.5, p50: 65.7, p85: 68.0, p97: 70.3 },
      { month: 9, p3: 65.3, p15: 67.7, p50: 70.1, p85: 72.6, p97: 75.0 },
      { month: 12, p3: 68.9, p15: 71.4, p50: 74.0, p85: 76.6, p97: 79.2 },
      { month: 18, p3: 74.9, p15: 77.8, p50: 80.7, p85: 83.6, p97: 86.5 },
      { month: 24, p3: 80.0, p15: 83.2, p50: 86.4, p85: 89.6, p97: 92.9 },
      { month: 36, p3: 87.4, p15: 91.2, p50: 95.1, p85: 98.9, p97: 102.7 },
      { month: 48, p3: 94.1, p15: 98.4, p50: 102.7, p85: 107.0, p97: 111.3 },
      { month: 60, p3: 99.9, p15: 104.7, p50: 109.4, p85: 114.2, p97: 118.9 },
    ],
    HEAD_CIRCUMFERENCE: [
      { month: 0, p3: 31.5, p15: 32.7, p50: 33.9, p85: 35.1, p97: 36.2 },
      { month: 3, p3: 37.2, p15: 38.4, p50: 39.5, p85: 40.7, p97: 41.9 },
      { month: 6, p3: 39.7, p15: 41.0, p50: 42.2, p85: 43.5, p97: 44.6 },
      { month: 9, p3: 41.3, p15: 42.6, p50: 43.8, p85: 45.1, p97: 46.3 },
      { month: 12, p3: 42.4, p15: 43.7, p50: 44.9, p85: 46.3, p97: 47.4 },
      { month: 18, p3: 43.8, p15: 45.1, p50: 46.4, p85: 47.8, p97: 49.0 },
      { month: 24, p3: 44.7, p15: 46.0, p50: 47.2, p85: 48.7, p97: 49.9 },
      { month: 36, p3: 46.0, p15: 47.3, p50: 48.5, p85: 50.0, p97: 51.3 },
      { month: 48, p3: 46.8, p15: 48.1, p50: 49.3, p85: 50.9, p97: 52.2 },
      { month: 60, p3: 47.4, p15: 48.7, p50: 50.0, p85: 51.6, p97: 52.9 },
    ],
    BMI_FOR_AGE: [
      { month: 0, p3: 11.1, p15: 12.1, p50: 13.3, p85: 14.6, p97: 15.8 },
      { month: 3, p3: 14.1, p15: 15.2, p50: 16.4, p85: 17.8, p97: 19.1 },
      { month: 6, p3: 14.4, p15: 15.6, p50: 16.9, p85: 18.3, p97: 19.7 },
      { month: 9, p3: 14.3, p15: 15.4, p50: 16.7, p85: 18.1, p97: 19.5 },
      { month: 12, p3: 14.0, p15: 15.1, p50: 16.3, p85: 17.8, p97: 19.1 },
      { month: 18, p3: 13.7, p15: 14.7, p50: 15.9, p85: 17.3, p97: 18.6 },
      { month: 24, p3: 13.4, p15: 14.4, p50: 15.5, p85: 16.9, p97: 18.2 },
      { month: 36, p3: 13.1, p15: 14.1, p50: 15.2, p85: 16.6, p97: 17.9 },
      { month: 48, p3: 12.9, p15: 13.9, p50: 15.0, p85: 16.4, p97: 17.7 },
      { month: 60, p3: 12.8, p15: 13.8, p50: 15.0, p85: 16.4, p97: 17.9 },
    ],
  },
};

const CHART_CONFIG: Record<
  ChartType,
  { labelAr: string; yUnit: string; yMin: number; yMax: number; getValue: (r: PediatricGrowthRecordItem) => number | null | undefined }
> = {
  WEIGHT_FOR_AGE: {
    labelAr: 'الوزن مقابل العمر (Weight-for-Age)',
    yUnit: 'كجم',
    yMin: 0,
    yMax: 26,
    getValue: (r) => (r.weightKg !== null && r.weightKg !== undefined ? Number(r.weightKg) : null),
  },
  LENGTH_FOR_AGE: {
    labelAr: 'الطول / القامة مقابل العمر (Length/Height-for-Age)',
    yUnit: 'سم',
    yMin: 40,
    yMax: 125,
    getValue: (r) => (r.statureCm !== null && r.statureCm !== undefined ? Number(r.statureCm) : null),
  },
  HEAD_CIRCUMFERENCE: {
    labelAr: 'محيط الرأس مقابل العمر (Head Circumference-for-Age)',
    yUnit: 'سم',
    yMin: 30,
    yMax: 56,
    getValue: (r) => (r.headCircumferenceCm !== null && r.headCircumferenceCm !== undefined ? Number(r.headCircumferenceCm) : null),
  },
  BMI_FOR_AGE: {
    labelAr: 'مؤشر كتلة الجسم مقابل العمر (BMI-for-Age)',
    yUnit: 'كجم/م²',
    yMin: 10,
    yMax: 22,
    getValue: (r) => (r.bodyMassIndex !== null && r.bodyMassIndex !== undefined ? Number(r.bodyMassIndex) : null),
  },
};

export const GrowthChartsSection: React.FC<GrowthChartsSectionProps> = ({
  gender,
  birthHistory,
  records,
}) => {
  const [chartType, setChartType] = useState<ChartType>('WEIGHT_FOR_AGE');
  const [useCorrectedAge, setUseCorrectedAge] = useState<boolean>(
    (birthHistory?.gestationalAgeWeeks ?? 40) < 37,
  );

  const activeRecords = (records || []).filter((r) => r.status !== 'ENTERED_IN_ERROR');
  const curves = WHO_CURVES[gender][chartType];
  const config = CHART_CONFIG[chartType];

  // SVG Chart Dimensions
  const width = 600;
  const height = 340;
  const padding = { top: 20, right: 30, bottom: 40, left: 50 };
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;

  const maxMonth = 60;
  const xToSvg = (month: number) => padding.left + (month / maxMonth) * graphWidth;
  const yToSvg = (val: number) =>
    padding.top + graphHeight - ((val - config.yMin) / (config.yMax - config.yMin)) * graphHeight;

  // Build path strings for percentile curves
  const makePath = (key: 'p3' | 'p15' | 'p50' | 'p85' | 'p97') => {
    return curves
      .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${xToSvg(pt.month)} ${yToSvg(pt[key])}`)
      .join(' ');
  };

  // Patient data points
  const points = activeRecords
    .map((r) => {
      const ageDays = useCorrectedAge && r.correctedAgeDays !== null && r.correctedAgeDays !== undefined
        ? r.correctedAgeDays
        : r.chronologicalAgeDays;
      const month = Math.min(60, ageDays / 30.4375);
      const val = config.getValue(r);
      return { record: r, month, val };
    })
    .filter((pt): pt is { record: PediatricGrowthRecordItem; month: number; val: number } => pt.val !== null && pt.val !== undefined);

  return (
    <div className="growth-charts-section" data-testid="growth-charts-section" dir="rtl">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {(Object.keys(CHART_CONFIG) as ChartType[]).map((type) => (
            <button
              key={type}
              type="button"
              className={`btn btn-sm ${chartType === type ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setChartType(type)}
              style={{
                fontSize: '0.8rem',
                backgroundColor: chartType === type ? '#2563eb' : '#ffffff',
                color: chartType === type ? '#ffffff' : '#334155',
                borderColor: '#cbd5e1',
              }}
              data-testid={`chart-tab-${type}`}
            >
              {CHART_CONFIG[type].labelAr.split(' (')[0]}
            </button>
          ))}
        </div>

        {(birthHistory?.gestationalAgeWeeks ?? 40) < 37 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer', color: '#1e293b' }}>
            <input
              type="checkbox"
              checked={useCorrectedAge}
              onChange={(e) => setUseCorrectedAge(e.target.checked)}
              data-testid="chart-toggle-corrected-age"
            />
            عرض النقاط حسب العمر المصحح للخداج
          </label>
        )}
      </div>

      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1e293b', marginBottom: '0.5rem' }}>
          {config.labelAr} — منظمة الصحة العالمية (WHO 2006) | {gender === 'MALE' ? 'ذكور 👦' : 'إناث 👧'}
        </div>

        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: '100%', maxWidth: '650px', height: 'auto', overflow: 'visible' }}
          role="img"
          aria-label={config.labelAr}
        >
          {/* Background Gridlines */}
          {[0, 12, 24, 36, 48, 60].map((m) => (
            <g key={m}>
              <line
                x1={xToSvg(m)}
                y1={padding.top}
                x2={xToSvg(m)}
                y2={padding.top + graphHeight}
                stroke="#e2e8f0"
                strokeDasharray="2,2"
              />
              <text
                x={xToSvg(m)}
                y={padding.top + graphHeight + 18}
                textAnchor="middle"
                fontSize="10"
                fill="#64748b"
              >
                {m} ش
              </text>
            </g>
          ))}

          {/* Y Axis Gridlines */}
          {[0.25, 0.5, 0.75, 1].map((ratio) => {
            const yVal = config.yMin + ratio * (config.yMax - config.yMin);
            return (
              <g key={ratio}>
                <line
                  x1={padding.left}
                  y1={yToSvg(yVal)}
                  x2={padding.left + graphWidth}
                  y2={yToSvg(yVal)}
                  stroke="#e2e8f0"
                  strokeDasharray="2,2"
                />
                <text
                  x={padding.left - 8}
                  y={yToSvg(yVal) + 4}
                  textAnchor="end"
                  fontSize="10"
                  fill="#64748b"
                >
                  {Math.round(yVal)} {config.yUnit}
                </text>
              </g>
            );
          })}

          {/* Axes */}
          <line
            x1={padding.left}
            y1={padding.top}
            x2={padding.left}
            y2={padding.top + graphHeight}
            stroke="#94a3b8"
            strokeWidth="1.5"
          />
          <line
            x1={padding.left}
            y1={padding.top + graphHeight}
            x2={padding.left + graphWidth}
            y2={padding.top + graphHeight}
            stroke="#94a3b8"
            strokeWidth="1.5"
          />

          {/* Percentile Curves */}
          <path d={makePath('p97')} fill="none" stroke="#dc2626" strokeWidth="1" strokeDasharray="3,3" />
          <path d={makePath('p85')} fill="none" stroke="#f59e0b" strokeWidth="1" strokeDasharray="2,2" />
          <path d={makePath('p50')} fill="none" stroke="#16a34a" strokeWidth="2" />
          <path d={makePath('p15')} fill="none" stroke="#f59e0b" strokeWidth="1" strokeDasharray="2,2" />
          <path d={makePath('p3')} fill="none" stroke="#dc2626" strokeWidth="1" strokeDasharray="3,3" />

          {/* Labels for percentiles on right edge */}
          <text x={padding.left + graphWidth + 4} y={yToSvg(curves[curves.length - 1].p97) + 3} fontSize="9" fill="#dc2626">97%</text>
          <text x={padding.left + graphWidth + 4} y={yToSvg(curves[curves.length - 1].p85) + 3} fontSize="9" fill="#f59e0b">85%</text>
          <text x={padding.left + graphWidth + 4} y={yToSvg(curves[curves.length - 1].p50) + 3} fontSize="9" fill="#16a34a" fontWeight="bold">50%</text>
          <text x={padding.left + graphWidth + 4} y={yToSvg(curves[curves.length - 1].p15) + 3} fontSize="9" fill="#f59e0b">15%</text>
          <text x={padding.left + graphWidth + 4} y={yToSvg(curves[curves.length - 1].p3) + 3} fontSize="9" fill="#dc2626">3%</text>

          {/* Connecting Line between patient measurements */}
          {points.length > 1 && (
            <path
              d={points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${xToSvg(pt.month)} ${yToSvg(pt.val)}`).join(' ')}
              fill="none"
              stroke="#2563eb"
              strokeWidth="2.5"
            />
          )}

          {/* Patient Measurement Dots */}
          {points.map((pt, i) => (
            <g key={i}>
              <circle
                cx={xToSvg(pt.month)}
                cy={yToSvg(pt.val)}
                r="5"
                fill="#1d4ed8"
                stroke="#ffffff"
                strokeWidth="2"
              />
              <title>
                {`بتاريخ: ${new Date(pt.record.measuredAt).toLocaleDateString('ar-YE')}\nالعمر: ${(pt.month).toFixed(1)} شهر\nالقياس: ${pt.val} ${config.yUnit}`}
              </title>
            </g>
          ))}
        </svg>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.75rem', fontSize: '0.75rem', color: '#475569', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#1d4ed8' }}></span>
            <span>قياسات المريض</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ display: 'inline-block', width: '16px', height: '2px', backgroundColor: '#16a34a' }}></span>
            <span>المئين الخمسون (المتوسط الطبيعي 50th)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ display: 'inline-block', width: '16px', height: '2px', backgroundColor: '#f59e0b', borderTop: '1px dashed #f59e0b' }}></span>
            <span>المئينان 15th و 85th</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ display: 'inline-block', width: '16px', height: '2px', backgroundColor: '#dc2626', borderTop: '1px dashed #dc2626' }}></span>
            <span>الحدود القصوى 3rd و 97th (الانحراف ±2)</span>
          </div>
        </div>
      </div>
    </div>
  );
};

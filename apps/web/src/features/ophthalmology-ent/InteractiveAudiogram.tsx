import React from 'react';

const FREQUENCIES = [125, 250, 500, 1000, 2000, 4000, 8000];
const MIN_DB = -10;
const MAX_DB = 120;
const DB_STEP = 10;

interface InteractiveAudiogramProps {
  rightAirThresholds: number[];
  leftAirThresholds: number[];
  rightBoneThresholds?: number[];
  leftBoneThresholds?: number[];
}

export const InteractiveAudiogram: React.FC<InteractiveAudiogramProps> = ({
  rightAirThresholds,
  leftAirThresholds,
  rightBoneThresholds = [],
  leftBoneThresholds = [],
}) => {
  // SVG Dimensions
  const width = 640;
  const height = 400;
  const margin = { top: 40, right: 40, bottom: 50, left: 60 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  // X coordinate calculation
  const getX = (index: number) => {
    return margin.left + (index / (FREQUENCIES.length - 1)) * plotWidth;
  };

  // Y coordinate calculation (inverted: -10 at top, 120 at bottom)
  const getY = (db: number) => {
    const clamped = Math.max(MIN_DB, Math.min(MAX_DB, db));
    return margin.top + ((clamped - MIN_DB) / (MAX_DB - MIN_DB)) * plotHeight;
  };

  // Generate SVG path for a line connecting valid thresholds
  const generatePath = (thresholds: number[]) => {
    const points: string[] = [];
    thresholds.forEach((val, idx) => {
      if (val !== null && val !== undefined && !isNaN(val)) {
        const x = getX(idx);
        const y = getY(val);
        points.push(`${points.length === 0 ? 'M' : 'L'} ${x} ${y}`);
      }
    });
    return points.join(' ');
  };

  return (
    <div className="audiogram-container space-y-4" dir="ltr">
      <div className="flex items-center justify-between px-2 text-sm font-semibold">
        <div className="flex items-center gap-2 text-red-600">
          <span className="inline-block w-4 h-4 rounded-full border-2 border-red-600 text-center text-xs leading-3">O</span>
          <span>Right Ear (AD) / الأذن اليمنى</span>
        </div>
        <div className="text-xs text-gray-500">
          Standard Audiogram (ISO 8253-1)
        </div>
        <div className="flex items-center gap-2 text-blue-600">
          <span className="font-bold">✕</span>
          <span>Left Ear (AS) / الأذن اليسرى</span>
        </div>
      </div>

      <div className="relative border border-gray-300 rounded-lg bg-white shadow-sm overflow-hidden p-2">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto select-none"
          role="img"
          aria-label="Pure Tone Audiogram Chart"
        >
          {/* Normal hearing zone shade (0 to 20 dB HL) */}
          <rect
            x={margin.left}
            y={getY(0)}
            width={plotWidth}
            height={getY(20) - getY(0)}
            fill="#f0fdf4"
            opacity="0.6"
          />
          <text
            x={margin.left + 8}
            y={getY(15)}
            fontSize="10"
            fill="#16a34a"
            fontWeight="500"
          >
            Normal Hearing Range (0 - 20 dB HL)
          </text>

          {/* Grid lines - horizontal (dB HL) */}
          {Array.from({ length: (MAX_DB - MIN_DB) / DB_STEP + 1 }).map((_, i) => {
            const db = MIN_DB + i * DB_STEP;
            const y = getY(db);
            const isZero = db === 0;
            const isTwenty = db === 20;
            return (
              <g key={`y-${db}`}>
                <line
                  x1={margin.left}
                  y1={y}
                  x2={width - margin.right}
                  y2={y}
                  stroke={isZero || isTwenty ? '#94a3b8' : '#e2e8f0'}
                  strokeWidth={isZero || isTwenty ? '1.5' : '1'}
                  strokeDasharray={isTwenty ? '4 2' : undefined}
                />
                <text
                  x={margin.left - 10}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="10"
                  fill="#64748b"
                >
                  {db}
                </text>
              </g>
            );
          })}

          {/* Grid lines - vertical (Frequencies) */}
          {FREQUENCIES.map((freq, idx) => {
            const x = getX(idx);
            return (
              <g key={`x-${freq}`}>
                <line
                  x1={x}
                  y1={margin.top}
                  x2={x}
                  y2={height - margin.bottom}
                  stroke="#e2e8f0"
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={height - margin.bottom + 20}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="600"
                  fill="#334155"
                >
                  {freq >= 1000 ? `${freq / 1000}k` : freq}
                </text>
              </g>
            );
          })}

          {/* Axis Labels */}
          <text
            x={width / 2}
            y={height - 10}
            textAnchor="middle"
            fontSize="12"
            fontWeight="bold"
            fill="#1e293b"
          >
            Frequency (Hz) / التردد (هرتز)
          </text>

          <text
            transform={`rotate(-90)`}
            x={-(height / 2)}
            y={20}
            textAnchor="middle"
            fontSize="12"
            fontWeight="bold"
            fill="#1e293b"
          >
            Hearing Level (dB HL) / مستوى السمع
          </text>

          {/* Right Air Line & Symbols (Red Circle) */}
          <path
            d={generatePath(rightAirThresholds)}
            fill="none"
            stroke="#dc2626"
            strokeWidth="2"
          />
          {rightAirThresholds.map((val, idx) => {
            if (val === null || val === undefined || isNaN(val)) return null;
            const cx = getX(idx);
            const cy = getY(val);
            return (
              <circle
                key={`r-air-${idx}`}
                cx={cx}
                cy={cy}
                r="6"
                fill="white"
                stroke="#dc2626"
                strokeWidth="2.5"
                className="cursor-pointer hover:scale-125 transition-transform"
              >
                <title>{`Right Air: ${FREQUENCIES[idx]} Hz = ${val} dB HL`}</title>
              </circle>
            );
          })}

          {/* Left Air Line & Symbols (Blue Cross) */}
          <path
            d={generatePath(leftAirThresholds)}
            fill="none"
            stroke="#2563eb"
            strokeWidth="2"
            strokeDasharray="4 2"
          />
          {leftAirThresholds.map((val, idx) => {
            if (val === null || val === undefined || isNaN(val)) return null;
            const cx = getX(idx);
            const cy = getY(val);
            const d = 5;
            return (
              <g key={`l-air-${idx}`} className="cursor-pointer hover:scale-125 transition-transform">
                <line x1={cx - d} y1={cy - d} x2={cx + d} y2={cy + d} stroke="#2563eb" strokeWidth="2.5" />
                <line x1={cx - d} y1={cy + d} x2={cx + d} y2={cy - d} stroke="#2563eb" strokeWidth="2.5" />
                <title>{`Left Air: ${FREQUENCIES[idx]} Hz = ${val} dB HL`}</title>
              </g>
            );
          })}

          {/* Right Bone Symbols (< bracket in red) */}
          {rightBoneThresholds.map((val, idx) => {
            if (val === null || val === undefined || isNaN(val)) return null;
            const cx = getX(idx) - 10;
            const cy = getY(val);
            return (
              <text
                key={`r-bone-${idx}`}
                x={cx}
                y={cy + 5}
                fontSize="14"
                fontWeight="bold"
                fill="#dc2626"
                textAnchor="middle"
              >
                &lt;
                <title>{`Right Bone: ${FREQUENCIES[idx]} Hz = ${val} dB HL`}</title>
              </text>
            );
          })}

          {/* Left Bone Symbols (> bracket in blue) */}
          {leftBoneThresholds.map((val, idx) => {
            if (val === null || val === undefined || isNaN(val)) return null;
            const cx = getX(idx) + 10;
            const cy = getY(val);
            return (
              <text
                key={`l-bone-${idx}`}
                x={cx}
                y={cy + 5}
                fontSize="14"
                fontWeight="bold"
                fill="#2563eb"
                textAnchor="middle"
              >
                &gt;
                <title>{`Left Bone: ${FREQUENCIES[idx]} Hz = ${val} dB HL`}</title>
              </text>
            );
          })}
        </svg>
      </div>

      {/* Accessible Table Representation (WCAG 2.1 AA) */}
      <div className="overflow-x-auto border border-gray-200 rounded-md text-xs">
        <table className="min-w-full divide-y divide-gray-200 text-center" aria-label="Audiometry Threshold Data Table">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Ear / التوصيل</th>
              {FREQUENCIES.map((f) => (
                <th key={f} scope="col" className="px-2 py-2 font-medium">
                  {f >= 1000 ? `${f / 1000} kHz` : `${f} Hz`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            <tr>
              <th scope="row" className="px-3 py-1.5 font-medium text-red-600 text-left">
                Right Air (O)
              </th>
              {FREQUENCIES.map((_, i) => (
                <td key={`r-air-cell-${i}`} className="px-2 py-1.5">
                  {rightAirThresholds[i] !== undefined && rightAirThresholds[i] !== null
                    ? `${rightAirThresholds[i]} dB`
                    : '—'}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className="px-3 py-1.5 font-medium text-blue-600 text-left">
                Left Air (✕)
              </th>
              {FREQUENCIES.map((_, i) => (
                <td key={`l-air-cell-${i}`} className="px-2 py-1.5">
                  {leftAirThresholds[i] !== undefined && leftAirThresholds[i] !== null
                    ? `${leftAirThresholds[i]} dB`
                    : '—'}
                </td>
              ))}
            </tr>
            {rightBoneThresholds.length > 0 && (
              <tr>
                <th scope="row" className="px-3 py-1.5 font-medium text-red-500 text-left">
                  Right Bone (&lt;)
                </th>
                {FREQUENCIES.map((_, i) => (
                  <td key={`r-bone-cell-${i}`} className="px-2 py-1.5">
                    {rightBoneThresholds[i] !== undefined && rightBoneThresholds[i] !== null
                      ? `${rightBoneThresholds[i]} dB`
                      : '—'}
                  </td>
                ))}
              </tr>
            )}
            {leftBoneThresholds.length > 0 && (
              <tr>
                <th scope="row" className="px-3 py-1.5 font-medium text-blue-500 text-left">
                  Left Bone (&gt;)
                </th>
                {FREQUENCIES.map((_, i) => (
                  <td key={`l-bone-cell-${i}`} className="px-2 py-1.5">
                    {leftBoneThresholds[i] !== undefined && leftBoneThresholds[i] !== null
                      ? `${leftBoneThresholds[i]} dB`
                      : '—'}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

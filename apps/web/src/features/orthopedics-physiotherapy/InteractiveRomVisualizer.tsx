import React from 'react';
import type { JointIdentifier, JointMovementType } from './types';

interface InteractiveRomVisualizerProps {
  joint: JointIdentifier;
  movement: JointMovementType;
  normalDegrees: number;
  activeDegrees: number;
  passiveDegrees?: number | null;
  contralateralDegrees?: number | null;
  onDegreesChange?: (degrees: number) => void;
  readOnly?: boolean;
}

export const InteractiveRomVisualizer: React.FC<InteractiveRomVisualizerProps> = ({
  joint,
  movement,
  normalDegrees,
  activeDegrees,
  passiveDegrees,
  contralateralDegrees,
  onDegreesChange,
  readOnly = false,
}) => {
  // Dimensions for SVG Goniometer
  const size = 320;
  const center = size / 2;
  const radius = 120;
  const innerRadius = 70;

  // Clamped values for angle mapping (0 to 180 or up to normal + 30)
  const maxScaleDegrees = Math.max(180, Math.ceil((normalDegrees + 20) / 10) * 10);
  const clampedActive = Math.max(0, Math.min(maxScaleDegrees, activeDegrees));
  const clampedNormal = Math.max(0, Math.min(maxScaleDegrees, normalDegrees));
  const clampedContralateral = contralateralDegrees != null ? Math.max(0, Math.min(maxScaleDegrees, contralateralDegrees)) : null;

  // Angle conversion: Goniometer dial from 180° (left) clockwise to 0° (right) or bottom

  // Given angle in degrees (0 = horizontal right, 180 = horizontal left in traditional goniometer)
  // Let's sweep from 180 deg (start = left) to 180 - angle (moving up and right)
  const getCoordinates = (deg: number, r: number) => {
    // 0 deg is left (angle = PI), maxScaleDegrees is right (angle = 0)
    const angleRatio = deg / maxScaleDegrees;
    const rad = Math.PI - angleRatio * Math.PI;
    const x = center + r * Math.cos(rad);
    const y = center - r * Math.sin(rad);
    return { x, y };
  };

  const createArcPath = (startDeg: number, endDeg: number, r1: number, r2: number) => {
    if (startDeg >= endDeg) return '';
    const p1 = getCoordinates(startDeg, r1);
    const p2 = getCoordinates(endDeg, r1);
    const p3 = getCoordinates(endDeg, r2);
    const p4 = getCoordinates(startDeg, r2);

    const largeArcFlag = endDeg - startDeg > maxScaleDegrees / 2 ? 1 : 0;

    return `M ${p1.x} ${p1.y} A ${r1} ${r1} 0 ${largeArcFlag} 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${r2} ${r2} 0 ${largeArcFlag} 0 ${p4.x} ${p4.y} Z`;
  };

  // Severity color
  const deficitFromNormal = Math.max(0, normalDegrees - activeDegrees);
  const deficitPercent = normalDegrees > 0 ? Math.round((deficitFromNormal / normalDegrees) * 100) : 0;
  
  let severityBadgeClass = 'bg-green-100 text-green-800 border-green-300';
  let severityLabelAr = 'مدى طبيعي';
  if (deficitPercent > 40) {
    severityBadgeClass = 'bg-red-100 text-red-800 border-red-300';
    severityLabelAr = 'عجز شديد (> 40%)';
  } else if (deficitPercent > 20) {
    severityBadgeClass = 'bg-amber-100 text-amber-800 border-amber-300';
    severityLabelAr = 'عجز متوسط (21-40%)';
  } else if (deficitPercent > 0) {
    severityBadgeClass = 'bg-yellow-100 text-yellow-800 border-yellow-300';
    severityLabelAr = 'عجز خفيف (≤ 20%)';
  }

  // Active needle endpoint
  const activeNeedle = getCoordinates(clampedActive, radius + 5);

  return (
    <div className="rom-visualizer bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col items-center">
      <div className="w-full flex items-center justify-between pb-2 mb-2 border-b border-gray-100 text-sm">
        <div>
          <span className="font-bold text-gray-800">{joint} — {movement}</span>
          <span className="text-xs text-gray-500 mr-2 block">مقياس مدى الحركة السريري (AAOS Goniometer)</span>
        </div>
        <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${severityBadgeClass}`}>
          {severityLabelAr}
        </span>
      </div>

      {/* SVG Goniometer */}
      <div className="relative flex justify-center items-center w-full max-w-[340px]">
        <svg
          viewBox={`0 0 ${size} ${center + 40}`}
          className="w-full h-auto select-none overflow-visible"
          role="img"
          aria-label={`Goniometer chart for ${joint} ${movement}. Measured: ${activeDegrees} degrees, Normal: ${normalDegrees} degrees.`}
        >
          {/* Base background protractor semi-circle */}
          <path
            d={createArcPath(0, maxScaleDegrees, radius, innerRadius)}
            fill="#f1f5f9"
            stroke="#cbd5e1"
            strokeWidth="1"
          />

          {/* Normal Reference Range Arc (soft green) */}
          <path
            d={createArcPath(0, clampedNormal, radius, innerRadius)}
            fill="#dcfce7"
            stroke="#86efac"
            strokeWidth="1"
            opacity="0.8"
          />

          {/* Measured Active ROM Arc */}
          <path
            d={createArcPath(0, clampedActive, radius, innerRadius)}
            fill="#bfdbfe"
            stroke="#3b82f6"
            strokeWidth="1"
            opacity="0.9"
          />

          {/* Deficit Zone Arc (amber/red) */}
          {clampedActive < clampedNormal && (
            <path
              d={createArcPath(clampedActive, clampedNormal, radius, innerRadius)}
              fill="#fee2e2"
              stroke="#fca5a5"
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.75"
            />
          )}

          {/* Tick marks and labels */}
          {Array.from({ length: Math.floor(maxScaleDegrees / 15) + 1 }).map((_, i) => {
            const deg = i * 15;
            const isMajor = deg % 30 === 0;
            const innerPoint = getCoordinates(deg, innerRadius);
            const outerPoint = getCoordinates(deg, radius + (isMajor ? 6 : 3));
            const textPoint = getCoordinates(deg, radius + 18);

            return (
              <g key={`tick-${deg}`}>
                <line
                  x1={innerPoint.x}
                  y1={innerPoint.y}
                  x2={outerPoint.x}
                  y2={outerPoint.y}
                  stroke={isMajor ? '#64748b' : '#94a3b8'}
                  strokeWidth={isMajor ? 1.5 : 0.8}
                />
                {isMajor && (
                  <text
                    x={textPoint.x}
                    y={textPoint.y}
                    fontSize="9"
                    fill="#64748b"
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {deg}°
                  </text>
                )}
              </g>
            );
          })}

          {/* Contralateral Marker (dashed purple line) if present */}
          {clampedContralateral != null && (
            <g>
              {(() => {
                const contraPt = getCoordinates(clampedContralateral, radius + 10);
                return (
                  <>
                    <line
                      x1={center}
                      y1={center}
                      x2={contraPt.x}
                      y2={contraPt.y}
                      stroke="#9333ea"
                      strokeWidth="2.5"
                      strokeDasharray="4 3"
                    />
                    <circle cx={contraPt.x} cy={contraPt.y} r="4" fill="#9333ea" />
                  </>
                );
              })()}
            </g>
          )}

          {/* Active Degrees Pointer Needle */}
          <line
            x1={center}
            y1={center}
            x2={activeNeedle.x}
            y2={activeNeedle.y}
            stroke="#1d4ed8"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx={activeNeedle.x} cy={activeNeedle.y} r="5" fill="#1d4ed8" />

          {/* Center Pivot Boss */}
          <circle cx={center} cy={center} r="9" fill="#1e293b" />
          <circle cx={center} cy={center} r="4" fill="#ffffff" />

          {/* Center Digital Readout */}
          <text
            x={center}
            y={center - 25}
            textAnchor="middle"
            fontSize="22"
            fontWeight="bold"
            fill="#1e293b"
          >
            {activeDegrees}°
          </text>
          <text
            x={center}
            y={center - 10}
            textAnchor="middle"
            fontSize="10"
            fill="#64748b"
          >
            المدى الإيجابي المقاس
          </text>
        </svg>
      </div>

      {/* Interactive Slider if not read-only */}
      {!readOnly && onDegreesChange && (
        <div className="w-full mt-2 px-4 flex items-center gap-3">
          <span className="text-xs text-gray-500 font-medium">0°</span>
          <input
            type="range"
            min="0"
            max={maxScaleDegrees}
            step="1"
            value={activeDegrees}
            onChange={(e) => onDegreesChange(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            aria-label="Adjust measured degrees"
          />
          <span className="text-xs text-gray-500 font-medium">{maxScaleDegrees}°</span>
        </div>
      )}

      {/* Legend & Summary Details */}
      <div className="w-full mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="p-2 bg-blue-50 border border-blue-200 rounded text-center">
          <div className="text-blue-700 font-bold">{activeDegrees}°</div>
          <div className="text-blue-600 text-[11px]">المدى المقاس (Active)</div>
        </div>

        <div className="p-2 bg-green-50 border border-green-200 rounded text-center">
          <div className="text-green-700 font-bold">{normalDegrees}°</div>
          <div className="text-green-600 text-[11px]">المعيار الطبيعي (AAOS)</div>
        </div>

        <div className="p-2 bg-purple-50 border border-purple-200 rounded text-center">
          <div className="text-purple-700 font-bold">
            {contralateralDegrees != null ? `${contralateralDegrees}°` : '—'}
          </div>
          <div className="text-purple-600 text-[11px]">الطرف المقابل (Contralateral)</div>
        </div>

        <div className="p-2 bg-amber-50 border border-amber-200 rounded text-center">
          <div className="text-amber-700 font-bold">
            {deficitFromNormal > 0 ? `-${deficitFromNormal}° (${deficitPercent}%)` : 'لا يوجد عجز'}
          </div>
          <div className="text-amber-600 text-[11px]">مقدار العجز (Deficit)</div>
        </div>
      </div>

      {/* Accessible Table Fallback (WCAG 2.1 AA) */}
      <div className="sr-only">
        <table>
          <caption>بيانات مدى حركة المفصل</caption>
          <thead>
            <tr>
              <th scope="col">المعلمة</th>
              <th scope="col">القيمة</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>الدرجة المقاسة</td>
              <td>{activeDegrees} درجة</td>
            </tr>
            <tr>
              <td>المعيار المرجعي الطبيعي (AAOS)</td>
              <td>{normalDegrees} درجة</td>
            </tr>
            {passiveDegrees != null && (
              <tr>
                <td>المدى السلبي (Passive)</td>
                <td>{passiveDegrees} درجة</td>
              </tr>
            )}
            {contralateralDegrees != null && (
              <tr>
                <td>الطرف المقابل السليم</td>
                <td>{contralateralDegrees} درجة</td>
              </tr>
            )}
            <tr>
              <td>مقدار العجز</td>
              <td>{deficitFromNormal} درجة ({deficitPercent}%)</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

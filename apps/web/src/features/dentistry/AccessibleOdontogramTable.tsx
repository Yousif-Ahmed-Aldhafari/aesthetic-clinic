import React from 'react';
import type { DentalOdontogramItem, ToothNumberingSystem } from './types';
import { CONDITION_CONFIG } from './InteractiveOdontogram';

export interface AccessibleOdontogramTableProps {
  odontogram: DentalOdontogramItem;
  numberingSystem?: ToothNumberingSystem;
}

export const AccessibleOdontogramTable: React.FC<AccessibleOdontogramTableProps> = ({
  odontogram,
  numberingSystem = 'FDI_ISO_3950',
}) => {
  // Sort findings by tooth number
  const sortedFindings = [...(odontogram.findings ?? [])].sort(
    (a, b) => a.toothNumberFdi - b.toothNumberFdi,
  );

  return (
    <div className="accessible-odontogram-table" style={{ direction: 'rtl' }}>
      <div
        style={{
          padding: '8px 12px',
          background: '#f8fafc',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
          marginBottom: '1rem',
        }}
      >
        <h4 style={{ margin: 0, color: '#1e293b' }}>
          ♿ المخطط السني الميسّر وقارئ الشاشة (Accessible Odontogram Data Table)
        </h4>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
          جدول بيانات سريري متوافق مع معايير إتاحة الوصول (WCAG 2.1 AA) وقارئات الشاشة.
        </p>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table
          aria-label="جدول موجودات فحص الأسنان واللثة"
          style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'right' }}
        >
          <thead>
            <tr style={{ background: '#f1f5f9' }}>
              <th scope="col" style={{ padding: '8px', border: '1px solid #cbd5e1' }}>رقم السن ({numberingSystem})</th>
              <th scope="col" style={{ padding: '8px', border: '1px solid #cbd5e1' }}>نوع السن</th>
              <th scope="col" style={{ padding: '8px', border: '1px solid #cbd5e1' }}>الحالة السريرية</th>
              <th scope="col" style={{ padding: '8px', border: '1px solid #cbd5e1' }}>السطوح المتأثرة</th>
              <th scope="col" style={{ padding: '8px', border: '1px solid #cbd5e1' }}>الشدة</th>
              <th scope="col" style={{ padding: '8px', border: '1px solid #cbd5e1' }}>الوصف السريري</th>
              <th scope="col" style={{ padding: '8px', border: '1px solid #cbd5e1' }}>قياسات دواعم السن</th>
            </tr>
          </thead>
          <tbody>
            {sortedFindings.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '16px', textAlign: 'center', color: '#64748b' }}>
                  لا توجد موجودات مسجلة على هذا المخطط حتى الآن (جميع الأسنان سليمة).
                </td>
              </tr>
            ) : (
              sortedFindings.map((finding) => {
                const conf = CONDITION_CONFIG[finding.condition];
                const perio = (odontogram.periodontalRecords ?? []).find(
                  (p) => p.toothNumberFdi === finding.toothNumberFdi,
                );

                return (
                  <tr key={finding.toothNumberFdi} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '8px', border: '1px solid #cbd5e1', fontWeight: 'bold' }}>
                      السن {finding.toothNumberFdi}
                    </td>
                    <td style={{ padding: '8px', border: '1px solid #cbd5e1' }}>
                      {finding.isDeciduous ? 'لبني (مؤقت)' : 'دائم'}
                      {finding.isSupernumerary ? ' (سن زائد)' : ''}
                    </td>
                    <td style={{ padding: '8px', border: '1px solid #cbd5e1' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: conf?.color ?? '#cbd5e1',
                          color: '#ffffff',
                          fontSize: '12px',
                          fontWeight: 'bold',
                        }}
                      >
                        {conf?.labelAr ?? finding.condition}
                      </span>
                    </td>
                    <td style={{ padding: '8px', border: '1px solid #cbd5e1' }}>
                      {finding.surfacesAffected.length > 0
                        ? finding.surfacesAffected.join('، ')
                        : 'تاج كامل / لا يوجد سطح محدد'}
                    </td>
                    <td style={{ padding: '8px', border: '1px solid #cbd5e1' }}>
                      {finding.severity === 'MILD'
                        ? 'بسيطة'
                        : finding.severity === 'MODERATE'
                        ? 'متوسطة'
                        : finding.severity === 'SEVERE'
                        ? 'شديدة'
                        : '-'}
                    </td>
                    <td style={{ padding: '8px', border: '1px solid #cbd5e1' }}>
                      {finding.clinicalDescription ?? 'لا توجد ملاحظات إضافية'}
                    </td>
                    <td style={{ padding: '8px', border: '1px solid #cbd5e1' }}>
                      {perio ? (
                        <span>
                          عمق السبر: [{perio.probingDepthsMm.join(', ')}] مم · CAL: [
                          {perio.clinicalAttachmentMm?.join(', ')}] مم
                          {perio.furcationGrade && perio.furcationGrade !== 'CLASS_0' && ` · ${perio.furcationGrade}`}
                          {perio.mobilityGrade && perio.mobilityGrade !== 'GRADE_0' && ` · ${perio.mobilityGrade}`}
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>لم يُسجل فحص لثوي</span>
                      )}
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

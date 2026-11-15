import React, { useState, useEffect, useCallback } from 'react';
import {
  listMedications,
  recordMedication,
  reconcileMedications,
  type MedicationRecordItem,
  type MedicationRecordStatus,
  type ClinicalProvenance,
} from './clinical-foundation-api';

interface MedicationReconciliationPanelProps {
  clinicId: string;
  patientId: string;
  encounterId?: string;
  csrfToken?: string;
  onRefreshSummary?: () => void;
}

const statusLabels: Record<MedicationRecordStatus, { label: string; badgeClass: string }> = {
  ACTIVE: { label: 'جاري الاستخدام (Active)', badgeClass: 'cf-badge-success' },
  PAUSED: { label: 'موقوف مؤقتاً (Paused)', badgeClass: 'cf-badge-warning' },
  DISCONTINUED: { label: 'تم إيقافه نهائياً (Discontinued)', badgeClass: 'cf-badge-danger' },
  COMPLETED: { label: 'مكتمل الكورس (Completed)', badgeClass: 'cf-badge-info' },
  ENTERED_IN_ERROR: { label: 'أدخل بالخطأ', badgeClass: 'cf-badge-danger' },
};

export const MedicationReconciliationPanel: React.FC<MedicationReconciliationPanelProps> = ({
  clinicId,
  patientId,
  encounterId,
  csrfToken,
  onRefreshSummary,
}) => {
  const [medications, setMedications] = useState<MedicationRecordItem[]>([]);
  const [selectedForReconciliation, setSelectedForReconciliation] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form State
  const [medicationName, setMedicationName] = useState('');
  const [genericName, setGenericName] = useState('');
  const [dosage, setDosage] = useState('');
  const [route, setRoute] = useState('فموي (Oral)');
  const [frequency, setFrequency] = useState('مرة يومياً (Once daily)');
  const [instructions, setInstructions] = useState('');
  const [indication, setIndication] = useState('');
  const [status, setStatus] = useState<MedicationRecordStatus>('ACTIVE');
  const [provenance, setProvenance] = useState<ClinicalProvenance>('PATIENT_REPORTED');
  const [startDate, setStartDate] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await listMedications(clinicId, patientId, undefined, csrfToken);
      setMedications(items);
      // Auto-select active medications that haven't been reconciled
      setSelectedForReconciliation(items.filter(m => m.status === 'ACTIVE' && !m.isReconciled).map(m => m.id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل قائمة الأدوية');
    } finally {
      setLoading(false);
    }
  }, [clinicId, patientId, csrfToken]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!medicationName.trim() || !dosage.trim()) {
      setError('يرجى تحديد اسم الدواء والجرعة المقررة');
      return;
    }

    try {
      await recordMedication(
        clinicId,
        patientId,
        {
          encounterId,
          medicationName: medicationName.trim(),
          genericName: genericName.trim() || undefined,
          dosage: dosage.trim(),
          route: route.trim(),
          frequency: frequency.trim(),
          instructions: instructions.trim() || undefined,
          indication: indication.trim() || undefined,
          status,
          provenance,
          startDate: startDate ? new Date(startDate).toISOString() : undefined,
        },
        csrfToken,
      );

      setSuccessMessage('تم توثيق الدواء في السجل الدوائي للمريض');
      setMedicationName('');
      setGenericName('');
      setDosage('');
      setInstructions('');
      setIndication('');
      await loadData();
      if (onRefreshSummary) onRefreshSummary();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'فشل تسجيل الدواء');
    }
  };

  const handleReconcileSelected = async () => {
    if (selectedForReconciliation.length === 0) {
      setError('يرجى تحديد دواء واحد على الأقل للمطابقة الدوائية');
      return;
    }

    setError(null);
    try {
      const res = await reconcileMedications(clinicId, patientId, selectedForReconciliation, csrfToken);
      setSuccessMessage(`تمت مطابقة وتدقيق ${res.reconciledCount} دواء بنجاح`);
      setSelectedForReconciliation([]);
      await loadData();
      if (onRefreshSummary) onRefreshSummary();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'فشلت عملية المطابقة الدوائية');
    }
  };

  const toggleSelectMedication = (id: string) => {
    setSelectedForReconciliation(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  };

  return (
    <div className="clinical-foundation-container">
      {error && <div className="cf-alert cf-alert-danger">{error}</div>}
      {successMessage && <div className="cf-alert cf-alert-success">{successMessage}</div>}

      {/* Record Medication Form */}
      <div className="cf-card">
        <div className="cf-header">
          <h3>سجل ومطابقة الأدوية الحالية للمريض (Medication Reconciliation)</h3>
          <span className="cf-meta">توثيق شامل للأدوية الموصوفة سابقاً أو المأخوذة ذاتياً دون تأثير على المخزون</span>
        </div>

        <form onSubmit={handleRecord}>
          <div className="cf-grid">
            <div className="cf-field">
              <label>اسم الدواء التجاري أو الشائع *</label>
              <input
                type="text"
                className="cf-input"
                placeholder="مثال: جلوكوفاج، ريتين أ، بانادول..."
                value={medicationName}
                onChange={e => setMedicationName(e.target.value)}
                required
              />
            </div>

            <div className="cf-field">
              <label>الاسم العلمي (Generic Name)</label>
              <input
                type="text"
                className="cf-input"
                placeholder="مثال: Metformin, Tretinoin, Paracetamol..."
                value={genericName}
                onChange={e => setGenericName(e.target.value)}
              />
            </div>

            <div className="cf-field">
              <label>الجرعة والقوة *</label>
              <input
                type="text"
                className="cf-input"
                placeholder="مثال: 500mg، 0.05%، 10 وحدة..."
                value={dosage}
                onChange={e => setDosage(e.target.value)}
                required
              />
            </div>

            <div className="cf-field">
              <label>طريقة التناول (Route) *</label>
              <input
                type="text"
                className="cf-input"
                value={route}
                onChange={e => setRoute(e.target.value)}
                required
              />
            </div>

            <div className="cf-field">
              <label>التكرار والتوقيت (Frequency) *</label>
              <input
                type="text"
                className="cf-input"
                value={frequency}
                onChange={e => setFrequency(e.target.value)}
                required
              />
            </div>

            <div className="cf-field">
              <label>الحالة الراهنة للدواء</label>
              <select
                className="cf-select"
                value={status}
                onChange={e => setStatus(e.target.value as MedicationRecordStatus)}
              >
                {Object.entries(statusLabels).map(([key, info]) => (
                  <option key={key} value={key}>
                    {info.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="cf-field">
              <label>مصدر المعلومة</label>
              <select
                className="cf-select"
                value={provenance}
                onChange={e => setProvenance(e.target.value as ClinicalProvenance)}
              >
                <option value="PATIENT_REPORTED">إفادة المريض</option>
                <option value="CLINICIAN_MEASURED">موصوف بواسطة طبيب العيادة</option>
                <option value="HISTORICAL_TRANSCRIPTION">منقول من تقرير طبي خارجي</option>
              </select>
            </div>

            <div className="cf-field">
              <label>تاريخ بدء الاستخدام</label>
              <input
                type="date"
                className="cf-input"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>
          </div>

          <div className="cf-grid" style={{ marginTop: '0.75rem' }}>
            <div className="cf-field">
              <label>سبب الاستخدام / دواعي الاستعمال (Indication)</label>
              <input
                type="text"
                className="cf-input"
                placeholder="السكري، حب الشباب، ارتفاع الضغط..."
                value={indication}
                onChange={e => setIndication(e.target.value)}
              />
            </div>
            <div className="cf-field">
              <label>إرشادات خاصة</label>
              <input
                type="text"
                className="cf-input"
                placeholder="مع الطعام، قبل النوم، تجنب أشعة الشمس..."
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
              />
            </div>
          </div>

          <div className="cf-actions">
            <button type="submit" className="cf-btn-primary" disabled={loading}>
              توثيق الدواء في السجل
            </button>
          </div>
        </form>
      </div>

      {/* Medication Reconciliation Action Bar */}
      <div className="cf-card" style={{ backgroundColor: '#f0f9ff', borderColor: '#bae6fd' }}>
        <div className="cf-header">
          <h4>إجراء المطابقة الدوائية السريرية (Perform Medication Reconciliation)</h4>
          <span className="cf-meta">مراجعة شاملة لقائمة الأدوية النشطة واعتماد ملاءمتها</span>
        </div>
        <p style={{ fontSize: '0.875rem', color: '#0369a1', margin: '0 0 1rem 0' }}>
          قم باختيار الأدوية النشطة التي تمت مراجعتها ومناقشتها مع المريض في هذه الزيارة واعتماد مطابقتها.
        </p>
        <div className="cf-actions">
          <button
            type="button"
            className="cf-btn-primary"
            disabled={selectedForReconciliation.length === 0 || loading}
            onClick={handleReconcileSelected}
          >
            اعتماد المطابقة الدوائية ({selectedForReconciliation.length} دواء محدد)
          </button>
        </div>
      </div>

      {/* Medications Table */}
      <div className="cf-card">
        <div className="cf-header">
          <h3>سجل الأدوية المتراكم للمريض</h3>
          <span className="cf-meta">{medications.length} دواء مسجل</span>
        </div>

        {medications.length === 0 ? (
          <p style={{ color: '#64748b' }}>لا توجد أدوية مسجلة لهذا المريض بعد.</p>
        ) : (
          <div className="cf-table-container">
            <table className="cf-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>مطابقة</th>
                  <th>الدواء</th>
                  <th>الجرعة والتكرار</th>
                  <th>الطريقة</th>
                  <th>دواعي الاستعمال</th>
                  <th>الحالة</th>
                  <th>حالة المطابقة</th>
                  <th>الموثق</th>
                </tr>
              </thead>
              <tbody>
                {medications.map(m => (
                  <tr key={m.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedForReconciliation.includes(m.id)}
                        onChange={() => toggleSelectMedication(m.id)}
                      />
                    </td>
                    <td>
                      <div style={{ fontWeight: 700 }}>{m.medicationName}</div>
                      {m.genericName && <small style={{ color: '#64748b' }}>{m.genericName}</small>}
                    </td>
                    <td>
                      {m.dosage} · {m.frequency}
                    </td>
                    <td>{m.route}</td>
                    <td>{m.indication || '---'}</td>
                    <td>
                      <span className={`cf-badge ${statusLabels[m.status]?.badgeClass}`}>
                        {statusLabels[m.status]?.label}
                      </span>
                    </td>
                    <td>
                      {m.isReconciled ? (
                        <span className="cf-badge cf-badge-success">
                          تمت المطابقة {m.reconciledByName ? `بواسطة ${m.reconciledByName}` : ''}
                        </span>
                      ) : (
                        <span className="cf-badge cf-badge-warning">بانتظار المطابقة السريرية</span>
                      )}
                    </td>
                    <td>{m.recordedByName || 'طبيب'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

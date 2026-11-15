import React, { useState, useEffect, useCallback } from 'react';
import {
  listPrescriptions,
  createPrescriptionDraft,
  signPrescription,
  cancelPrescription,
  type MedicationPrescriptionItem,
  type PrescriptionStatus,
} from './clinical-foundation-api';

interface PrescriptionManagementPanelProps {
  clinicId: string;
  patientId: string;
  encounterId: string;
  csrfToken?: string;
  onRefreshSummary?: () => void;
}

interface DraftItemInput {
  medicationName: string;
  genericName?: string;
  strength: string;
  dosageForm: string;
  route: string;
  frequency: string;
  duration: string;
  durationDays?: number;
  quantity: number;
  unit: string;
  refillsAllowed?: number;
  substitutionAllowed?: boolean;
  instructions: string;
  indication?: string;
}

const prescriptionStatusLabels: Record<PrescriptionStatus, { label: string; badgeClass: string }> = {
  DRAFT: { label: 'مسودة (Draft)', badgeClass: 'cf-badge-warning' },
  PENDING_REVIEW: { label: 'قيد المراجعة', badgeClass: 'cf-badge-warning' },
  SIGNED: { label: 'موقعة سريرياً (Signed)', badgeClass: 'cf-badge-success' },
  CANCELLED: { label: 'ملغاة (Cancelled)', badgeClass: 'cf-badge-danger' },
  SUPERSEDED: { label: 'مستبدلة بوصفة أحدث', badgeClass: 'cf-badge-info' },
};

const emptyItem: DraftItemInput = {
  medicationName: '',
  genericName: '',
  strength: '',
  dosageForm: 'أقراص (Tablets)',
  route: 'فموي (Oral)',
  frequency: 'مرة يومياً (Once daily)',
  duration: '7 أيام',
  durationDays: 7,
  quantity: 1,
  unit: 'عبوة',
  refillsAllowed: 0,
  substitutionAllowed: false,
  instructions: 'تناول قرصاً واحداً بعد الأكل',
  indication: '',
};

export const PrescriptionManagementPanel: React.FC<PrescriptionManagementPanelProps> = ({
  clinicId,
  patientId,
  encounterId,
  csrfToken,
  onRefreshSummary,
}) => {
  const [prescriptions, setPrescriptions] = useState<MedicationPrescriptionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Draft Creation Form State
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<DraftItemInput[]>([{ ...emptyItem }]);

  // Signing Modal / Flow State
  const [signingRx, setSigningRx] = useState<MedicationPrescriptionItem | null>(null);
  const [safetyReviewAcknowledged, setSafetyReviewAcknowledged] = useState(false);

  // Cancellation Modal State
  const [cancellingRx, setCancellingRx] = useState<MedicationPrescriptionItem | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');

  // Selected Detail View State
  const [selectedRx, setSelectedRx] = useState<MedicationPrescriptionItem | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listPrescriptions(clinicId, patientId, { encounterId }, csrfToken);
      setPrescriptions(list);
      if (selectedRx) {
        const refreshed = list.find(r => r.id === selectedRx.id);
        if (refreshed) setSelectedRx(refreshed);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل الوصفات الطبية');
    } finally {
      setLoading(false);
    }
  }, [clinicId, patientId, encounterId, selectedRx, csrfToken]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleAddItem = () => {
    setItems(prev => [...prev, { ...emptyItem }]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof DraftItemInput, value: unknown) => {
    setItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleCreateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    // Validate items
    for (const it of items) {
      if (!it.medicationName.trim() || !it.strength.trim() || !it.instructions.trim()) {
        setError('يرجى التأكد من ملء اسم الدواء، القوة، وإرشادات الاستخدام لجميع الأدوية في الوصفة');
        return;
      }
    }

    try {
      const rx = await createPrescriptionDraft(
        clinicId,
        patientId,
        {
          encounterId,
          notes: notes.trim() || undefined,
          items: items.map(it => ({
            ...it,
            medicationName: it.medicationName.trim(),
            genericName: it.genericName?.trim() || undefined,
            strength: it.strength.trim(),
            instructions: it.instructions.trim(),
            indication: it.indication?.trim() || undefined,
          })),
        },
        csrfToken,
      );

      setSuccessMessage(`تم إنشاء مسودة الوصفة الطبية برقم ${rx.prescriptionNumber}`);
      setNotes('');
      setItems([{ ...emptyItem }]);
      await loadData();
      setSelectedRx(rx);
      if (onRefreshSummary) onRefreshSummary();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'فشل إنشاء مسودة الوصفة');
    }
  };

  const handleSign = async () => {
    if (!signingRx) return;
    setError(null);
    setSuccessMessage(null);

    if (signingRx.allergyCheckWarning && !safetyReviewAcknowledged) {
      setError('يوجد تحذير حساسية! يلزم الإقرار الصريح بمراجعة الأمان الدوائي قبل التوقيع.');
      return;
    }

    try {
      const signed = await signPrescription(
        clinicId,
        signingRx.id,
        {
          safetyReviewAcknowledged: signingRx.allergyCheckWarning ? safetyReviewAcknowledged : true,
          expectedVersion: signingRx.version,
        },
        csrfToken,
      );

      setSuccessMessage(`تم توقيع الوصفة الطبية ${signed.prescriptionNumber} وتوليد البصمة المشفرة المقاومة للتلاعب بنجاح`);
      setSigningRx(null);
      setSafetyReviewAcknowledged(false);
      await loadData();
      setSelectedRx(signed);
      if (onRefreshSummary) onRefreshSummary();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'فشل توقيع الوصفة الطبية');
    }
  };

  const handleCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingRx) return;
    if (!cancellationReason.trim()) {
      setError('يرجى توضيح سبب إلغاء الوصفة الطبية');
      return;
    }

    try {
      const cancelled = await cancelPrescription(
        clinicId,
        cancellingRx.id,
        {
          cancellationReason: cancellationReason.trim(),
          expectedVersion: cancellingRx.version,
        },
        csrfToken,
      );

      setSuccessMessage(`تم إلغاء الوصفة الطبية ${cancelled.prescriptionNumber} وتوثيق السبب`);
      setCancellingRx(null);
      setCancellationReason('');
      await loadData();
      setSelectedRx(cancelled);
      if (onRefreshSummary) onRefreshSummary();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'فشل إلغاء الوصفة الطبية');
    }
  };

  return (
    <div className="clinical-foundation-container">
      {error && <div className="cf-alert cf-alert-danger">{error}</div>}
      {successMessage && <div className="cf-alert cf-alert-success">{successMessage}</div>}

      {/* Prescription Drafting Form */}
      <div className="cf-card">
        <div className="cf-header">
          <h3>تحرير وصفة طبية للمريض الخارجي (Outpatient Prescription)</h3>
          <span className="cf-meta">تتطلب صلاحية وصف الدواء (MEDICATION_PRESCRIBE) وتوقيع رقمي موثق</span>
        </div>

        <form onSubmit={handleCreateDraft}>
          <div className="cf-field">
            <label>ملاحظات عامة وتوجيهات للصيدلية / المريض</label>
            <textarea
              className="cf-textarea"
              rows={2}
              placeholder="مثال: يرجى صرف الدواء وفق الجرعات بدقة، والمتابعة بعد انتهاء الكورس..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          <div style={{ marginTop: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h4 style={{ margin: 0 }}>الأدوية المقررة في الوصفة ({items.length})</h4>
              <button
                type="button"
                className="cf-btn-secondary"
                style={{ fontSize: '0.85rem' }}
                onClick={handleAddItem}
              >
                ＋ إضافة دواء آخر للوصفة
              </button>
            </div>

            {items.map((item, index) => (
              <div
                key={index}
                style={{
                  padding: '1rem',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  backgroundColor: '#f8fafc',
                  marginBottom: '1rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <b style={{ color: '#0f172a' }}>عنصر الدواء #{index + 1}</b>
                  {items.length > 1 && (
                    <button
                      type="button"
                      className="cf-btn-danger"
                      style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                      onClick={() => handleRemoveItem(index)}
                    >
                      حذف هذا الدواء
                    </button>
                  )}
                </div>

                <div className="cf-grid">
                  <div className="cf-field">
                    <label>اسم الدواء التجاري أو العلمي *</label>
                    <input
                      type="text"
                      className="cf-input"
                      placeholder="Amoxicillin, Roaccutane..."
                      value={item.medicationName}
                      onChange={e => handleItemChange(index, 'medicationName', e.target.value)}
                      required
                    />
                  </div>

                  <div className="cf-field">
                    <label>الاسم العلمي (إن وجد)</label>
                    <input
                      type="text"
                      className="cf-input"
                      placeholder="Generic name..."
                      value={item.genericName}
                      onChange={e => handleItemChange(index, 'genericName', e.target.value)}
                    />
                  </div>

                  <div className="cf-field">
                    <label>القوة والتركيز *</label>
                    <input
                      type="text"
                      className="cf-input"
                      placeholder="500 mg، 20 mg..."
                      value={item.strength}
                      onChange={e => handleItemChange(index, 'strength', e.target.value)}
                      required
                    />
                  </div>

                  <div className="cf-field">
                    <label>الشكل الصيدلاني *</label>
                    <input
                      type="text"
                      className="cf-input"
                      placeholder="أقراص، شراب، مرهم..."
                      value={item.dosageForm}
                      onChange={e => handleItemChange(index, 'dosageForm', e.target.value)}
                      required
                    />
                  </div>

                  <div className="cf-field">
                    <label>طريقة التناول *</label>
                    <input
                      type="text"
                      className="cf-input"
                      value={item.route}
                      onChange={e => handleItemChange(index, 'route', e.target.value)}
                      required
                    />
                  </div>

                  <div className="cf-field">
                    <label>تكرار الجرعة *</label>
                    <input
                      type="text"
                      className="cf-input"
                      value={item.frequency}
                      onChange={e => handleItemChange(index, 'frequency', e.target.value)}
                      required
                    />
                  </div>

                  <div className="cf-field">
                    <label>مدة العلاج *</label>
                    <input
                      type="text"
                      className="cf-input"
                      placeholder="7 أيام، أسبوعين..."
                      value={item.duration}
                      onChange={e => handleItemChange(index, 'duration', e.target.value)}
                      required
                    />
                  </div>

                  <div className="cf-field">
                    <label>الكمية المصروفة *</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        className="cf-input"
                        style={{ width: '80px' }}
                        value={item.quantity}
                        onChange={e => handleItemChange(index, 'quantity', parseInt(e.target.value, 10) || 1)}
                        required
                      />
                      <input
                        type="text"
                        className="cf-input"
                        placeholder="علبة، شريط..."
                        value={item.unit}
                        onChange={e => handleItemChange(index, 'unit', e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="cf-grid" style={{ marginTop: '0.75rem' }}>
                  <div className="cf-field" style={{ gridColumn: 'span 2' }}>
                    <label>إرشادات الاستخدام للمريض *</label>
                    <input
                      type="text"
                      className="cf-input"
                      placeholder="قرص واحد كل 8 ساعات بعد الأكل مباشرة..."
                      value={item.instructions}
                      onChange={e => handleItemChange(index, 'instructions', e.target.value)}
                      required
                    />
                  </div>
                  <div className="cf-field">
                    <label>دواعي الاستعمال السريرية</label>
                    <input
                      type="text"
                      className="cf-input"
                      placeholder="التهاب حاد، حب شباب كيسي..."
                      value={item.indication}
                      onChange={e => handleItemChange(index, 'indication', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="cf-actions">
            <button type="submit" className="cf-btn-primary" disabled={loading}>
              إنشاء مسودة الوصفة برقم تسلسلي
            </button>
          </div>
        </form>
      </div>

      {/* Prescriptions List */}
      <div className="cf-card">
        <div className="cf-header">
          <h3>الوصفات الطبية المحررة للاستشارة</h3>
          <span className="cf-meta">{prescriptions.length} وصفة</span>
        </div>

        {prescriptions.length === 0 ? (
          <p style={{ color: '#64748b' }}>لا توجد وصفات طبية محررة في هذه الاستشارة بعد.</p>
        ) : (
          <div className="cf-table-container">
            <table className="cf-table">
              <thead>
                <tr>
                  <th>رقم الوصفة</th>
                  <th>تاريخ الإنشاء</th>
                  <th>الحالة</th>
                  <th>عدد الأدوية</th>
                  <th>تحذير الحساسية</th>
                  <th>الطبيب المحرر</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {prescriptions.map(rx => (
                  <tr key={rx.id}>
                    <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{rx.prescriptionNumber}</td>
                    <td>{new Date(rx.createdAt).toLocaleString('ar-SA')}</td>
                    <td>
                      <span className={`cf-badge ${prescriptionStatusLabels[rx.status]?.badgeClass}`}>
                        {prescriptionStatusLabels[rx.status]?.label}
                      </span>
                    </td>
                    <td>{rx.items?.length ?? 0} دواء</td>
                    <td>
                      {rx.allergyCheckWarning ? (
                        <span className="cf-badge cf-badge-danger" title={rx.allergyCheckWarning}>
                          ⚠️ تنبيه حساسية
                        </span>
                      ) : (
                        <span className="cf-badge cf-badge-success">سليم</span>
                      )}
                    </td>
                    <td>{rx.prescriberName}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button
                          type="button"
                          className="cf-btn-secondary"
                          style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                          onClick={() => setSelectedRx(rx)}
                        >
                          عرض وتفاصيل
                        </button>

                        {(rx.status === 'DRAFT' || rx.status === 'PENDING_REVIEW') && (
                          <button
                            type="button"
                            className="cf-btn-primary"
                            style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', backgroundColor: '#059669' }}
                            onClick={() => {
                              setSigningRx(rx);
                              setSafetyReviewAcknowledged(false);
                            }}
                          >
                            توقيع سريري
                          </button>
                        )}

                        {rx.status !== 'CANCELLED' && rx.status !== 'SUPERSEDED' && (
                          <button
                            type="button"
                            className="cf-btn-danger"
                            style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                            onClick={() => {
                              setCancellingRx(rx);
                              setCancellationReason('');
                            }}
                          >
                            إلغاء
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Selected Prescription Detail / Print View */}
      {selectedRx && (
        <div className="cf-card" style={{ borderColor: '#0284c7', borderWidth: '2px' }}>
          <div className="cf-header">
            <div>
              <h3 style={{ color: '#0369a1' }}>
                وصفة طبية معتمدة: {selectedRx.prescriptionNumber}
              </h3>
              <span className="cf-meta">
                الحالة: {prescriptionStatusLabels[selectedRx.status]?.label} · الطبيب المحرر:{' '}
                {selectedRx.prescriberName}
              </span>
            </div>
            <button
              type="button"
              className="cf-btn-secondary"
              onClick={() => setSelectedRx(null)}
            >
              إغلاق العرض
            </button>
          </div>

          {selectedRx.allergyCheckWarning && (
            <div className="cf-alert cf-alert-danger">
              <b>⚠️ تحذير تضارب الحساسية المسجل:</b> {selectedRx.allergyCheckWarning}
            </div>
          )}

          {selectedRx.status === 'SIGNED' && selectedRx.signatureDigest && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem', color: '#15803d' }}>
                ✓ تم توقيع الوصفة رقمياً. البصمة المشفرة المقاومة للتلاعب (SHA-256 Digest):
              </div>
              <div className="cf-security-box">{selectedRx.signatureDigest}</div>
              <small style={{ color: '#64748b' }}>
                وقعت في: {new Date(selectedRx.signedAt!).toLocaleString('ar-SA')} بواسطة الممارس المعتمد.
                الأصل السريري محمي بقفل قاعدة البيانات ضد أي تعديل لاحق.
              </small>
            </div>
          )}

          {selectedRx.status === 'CANCELLED' && (
            <div className="cf-alert cf-alert-danger">
              <b>تم إلغاء هذه الوصفة:</b> {selectedRx.cancellationReason} (بتاريخ{' '}
              {new Date(selectedRx.cancelledAt!).toLocaleString('ar-SA')})
            </div>
          )}

          {selectedRx.notes && (
            <div style={{ margin: '0.75rem 0', fontStyle: 'italic', color: '#475569' }}>
              <b>ملاحظات الطبيب:</b> {selectedRx.notes}
            </div>
          )}

          <h4 style={{ margin: '1rem 0 0.5rem 0' }}>قائمة الأدوية المعتمدة بالوصفة:</h4>
          <div className="cf-table-container">
            <table className="cf-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>الدواء</th>
                  <th>التركيز والشكل</th>
                  <th>طريقة التناول والتكرار</th>
                  <th>المدة</th>
                  <th>الكمية</th>
                  <th>إرشادات الاستعمال</th>
                </tr>
              </thead>
              <tbody>
                {selectedRx.items?.map((it, idx) => (
                  <tr key={it.id || idx}>
                    <td>{idx + 1}</td>
                    <td style={{ fontWeight: 700 }}>
                      {it.medicationName}
                      {it.genericName && <small style={{ display: 'block', color: '#64748b' }}>{it.genericName}</small>}
                    </td>
                    <td>
                      {it.strength} · {it.dosageForm}
                    </td>
                    <td>
                      {it.route} · {it.frequency}
                    </td>
                    <td>{it.duration}</td>
                    <td>
                      {it.quantity} {it.unit}
                    </td>
                    <td>{it.instructions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Signing Confirmation Modal */}
      {signingRx && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div className="cf-card" style={{ maxWidth: '520px', width: '90%' }}>
            <div className="cf-header">
              <h4>التوقيع السريري النهائي للوصفة الطبية</h4>
              <button
                type="button"
                className="cf-btn-secondary"
                style={{ padding: '0.2rem 0.6rem' }}
                onClick={() => setSigningRx(null)}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.9rem', color: '#334155' }}>
              أنت على وشك التوقيع السريري النهائي للوصفة الطبية رقم{' '}
              <b style={{ fontFamily: 'monospace' }}>{signingRx.prescriptionNumber}</b>.
              بعد التوقيع تصبح الأدوية والبيانات السريرية محمية ومقفلة ببصمة مشفرة SHA-256 ولا يمكن تعديلها.
            </p>

            {signingRx.allergyCheckWarning && (
              <div className="cf-alert cf-alert-danger" style={{ marginTop: '0.75rem' }}>
                <b>⚠️ تنبيه أمان دوائي حرج:</b>
                <div>{signingRx.allergyCheckWarning}</div>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginTop: '0.75rem',
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={safetyReviewAcknowledged}
                    onChange={e => setSafetyReviewAcknowledged(e.target.checked)}
                  />
                  <span>أقر بأني اطلعت على تحذير الحساسية وأجريت التقييم السريري اللازم لملاءمة العلاج</span>
                </label>
              </div>
            )}

            <div className="cf-actions" style={{ justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button
                type="button"
                className="cf-btn-secondary"
                onClick={() => setSigningRx(null)}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="cf-btn-primary"
                style={{ backgroundColor: '#059669' }}
                disabled={Boolean(signingRx.allergyCheckWarning && !safetyReviewAcknowledged)}
                onClick={handleSign}
              >
                اعتماد وتوقيع الوصفة رسمياً
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Modal */}
      {cancellingRx && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div className="cf-card" style={{ maxWidth: '480px', width: '90%' }}>
            <div className="cf-header">
              <h4>إلغاء الوصفة الطبية {cancellingRx.prescriptionNumber}</h4>
              <button
                type="button"
                className="cf-btn-secondary"
                style={{ padding: '0.2rem 0.6rem' }}
                onClick={() => setCancellingRx(null)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCancel}>
              <div className="cf-field">
                <label>سبب الإلغاء الموثق *</label>
                <textarea
                  className="cf-textarea"
                  rows={3}
                  placeholder="بيان سبب إلغاء الوصفة الطبية للتوثيق والتدقيق الطبي..."
                  value={cancellationReason}
                  onChange={e => setCancellationReason(e.target.value)}
                  required
                />
              </div>

              <div className="cf-actions" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button
                  type="button"
                  className="cf-btn-secondary"
                  onClick={() => setCancellingRx(null)}
                >
                  تراجع
                </button>
                <button type="submit" className="cf-btn-danger">
                  تأكيد إلغاء الوصفة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

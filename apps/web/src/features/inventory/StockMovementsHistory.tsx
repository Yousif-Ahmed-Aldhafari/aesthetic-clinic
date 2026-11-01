import { useState } from 'react';
import {
  type InventoryMovementRecord,
  type InventoryProductRecord,
  type InventoryLocationRecord,
  type InventoryMovementType,
  inventoryMovementTypeLabels,
  inventoryReasonLabels,
} from './inventory-api';

interface Props {
  movements: InventoryMovementRecord[];
  products: InventoryProductRecord[];
  locations: InventoryLocationRecord[];
  onFilterChange: (query: { productId?: string; locationId?: string; movementType?: InventoryMovementType }) => void;
}

export function StockMovementsHistory({
  movements,
  products,
  locations,
  onFilterChange,
}: Props) {
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');

  function handleFilter() {
    onFilterChange({
      productId: selectedProduct || undefined,
      locationId: selectedLocation || undefined,
      movementType: selectedType !== 'ALL' ? (selectedType as InventoryMovementType) : undefined,
    });
  }

  function formatDateTime(iso: string) {
    try {
      const d = new Date(iso);
      return new Intl.DateTimeFormat('ar-SA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(d);
    } catch {
      return iso;
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="inventory-actions-bar">
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            className="inventory-filter-select"
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
          >
            <option value="">جميع الأصناف</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nameAr} ({p.sku})
              </option>
            ))}
          </select>

          <select
            className="inventory-filter-select"
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
          >
            <option value="">جميع المواقع</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nameAr} ({l.code})
              </option>
            ))}
          </select>

          <select
            className="inventory-filter-select"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
          >
            <option value="ALL">جميع أنواع الحركات</option>
            {Object.entries(inventoryMovementTypeLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>

          <button className="inventory-btn inventory-btn-secondary" onClick={handleFilter}>
            تطبيق الفلتر
          </button>
        </div>

        <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
          سجل غير قابل للتعديل أو الحذف (Append-Only Audit Ledger)
        </span>
      </div>

      <div className="inventory-table-container">
        <table className="inventory-table">
          <thead>
            <tr>
              <th>التاريخ والوقت</th>
              <th>الصنف / المنتج</th>
              <th>الموقع</th>
              <th>نوع الحركة</th>
              <th>الكمية</th>
              <th>الرصيد بعد الحركة</th>
              <th>السبب والملاحظات</th>
              <th>المسؤول</th>
            </tr>
          </thead>
          <tbody>
            {movements.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                  لا توجد حركات مخزنية مسجلة وفق الفلتر الحالي.
                </td>
              </tr>
            ) : (
              movements.map((m) => {
                const isPositive = parseFloat(m.quantity) > 0;
                return (
                  <tr key={m.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.85rem', color: '#4b5563' }}>
                      {formatDateTime(m.createdAt)}
                    </td>
                    <td>
                      <strong>{m.product.nameAr}</strong>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{m.product.sku}</div>
                    </td>
                    <td>
                      <span>{m.location.nameAr}</span>
                      {m.sourceLocation && (
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          {m.movementType === 'TRANSFER_OUT' ? 'إلى: ' : 'من: '}
                          {m.sourceLocation.nameAr}
                        </div>
                      )}
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          m.movementType === 'RECEIPT' || m.movementType === 'TRANSFER_IN'
                            ? 'badge-green'
                            : m.movementType === 'ISSUE' || m.movementType === 'TRANSFER_OUT'
                            ? 'badge-amber'
                            : m.movementType === 'OPENING_BALANCE'
                            ? 'badge-blue'
                            : 'badge-purple'
                        }`}
                      >
                        {inventoryMovementTypeLabels[m.movementType]}
                      </span>
                    </td>
                    <td>
                      <span className={isPositive ? 'quantity-positive' : 'quantity-negative'}>
                        {isPositive ? `+${m.quantity}` : m.quantity} {m.product.unit}
                      </span>
                    </td>
                    <td>
                      <strong style={{ fontFamily: 'monospace' }}>{m.balanceAfter}</strong>
                    </td>
                    <td>
                      <div>{inventoryReasonLabels[m.reasonCode] || m.reasonCode}</div>
                      {m.reasonExplanation && (
                        <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                          {m.reasonExplanation}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: '0.85rem', color: '#374151' }}>
                      {m.actor?.user?.name || '—'}
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
}

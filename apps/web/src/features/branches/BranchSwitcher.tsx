import { useEffect, useState } from 'react';
import type { ClinicContext } from '../auth/api';
import { listBranches, switchBranch, type ClinicBranchItem } from './branch-api';

interface Props {
  clinic: ClinicContext;
  csrfToken: string;
  onAuthError?: (error: unknown) => void;
  onBranchSwitched?: (branchId: string, branchName: string) => void;
}

export function BranchSwitcher({ clinic, csrfToken, onAuthError, onBranchSwitched }: Props) {
  const [branches, setBranches] = useState<ClinicBranchItem[]>([]);
  const [activeBranch, setActiveBranch] = useState<ClinicBranchItem | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function fetchBranches() {
      try {
        const res = await listBranches(clinic.clinicId, csrfToken);
        if (!cancelled && res.items.length > 0) {
          setBranches(res.items);
          // Default to first active branch or MAIN branch
          const main = res.items.find((b) => b.code === 'MAIN') || res.items[0];
          setActiveBranch(main);
        }
      } catch (err) {
        if (!cancelled && err && typeof err === 'object' && 'status' in err && err.status === 401) {
          onAuthError?.(err);
        }
      }
    }
    fetchBranches();
    return () => {
      cancelled = true;
    };
  }, [clinic.clinicId, csrfToken]);

  async function handleSwitch(branch: ClinicBranchItem) {
    if (busy || branch.id === activeBranch?.id) {
      setIsOpen(false);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await switchBranch(clinic.clinicId, branch.id, csrfToken);
      if (res.success) {
        setActiveBranch(branch);
        setIsOpen(false);
        onBranchSwitched?.(branch.id, branch.nameAr);
      }
    } catch (err: any) {
      setError(err?.message || 'تعذّر التبديل إلى هذا الفرع');
    } finally {
      setBusy(false);
    }
  }

  if (branches.length <= 1 && !activeBranch) {
    return null;
  }

  return (
    <div className="branch-switcher" style={{ position: 'relative', margin: '0.5rem 0' }}>
      <button
        type="button"
        className="branch-switch-btn"
        onClick={() => setIsOpen((prev) => !prev)}
        disabled={busy}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '6px 10px',
          background: 'rgba(255, 255, 255, 0.08)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '6px',
          color: 'inherit',
          cursor: 'pointer',
          fontSize: '0.85rem',
          textAlign: 'right',
        }}
        aria-label="تغيير فرع العيادة الحالي"
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>📍</span>
          <span>
            <small style={{ display: 'block', fontSize: '0.7rem', opacity: 0.8 }}>الفرع الحالي</small>
            <strong>{activeBranch ? activeBranch.nameAr : 'الفرع الرئيسي'}</strong>
          </span>
        </span>
        <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>{isOpen ? '▴' : '▾'}</span>
      </button>

      {isOpen && (
        <div
          className="branch-dropdown"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            left: 0,
            zIndex: 100,
            marginTop: '4px',
            background: 'var(--card-bg, #ffffff)',
            border: '1px solid #cbd5e0',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            maxHeight: '220px',
            overflowY: 'auto',
            color: '#2d3748',
          }}
        >
          {error && (
            <div style={{ padding: '6px 10px', color: '#e53e3e', fontSize: '0.8rem', background: '#fff5f5' }}>
              {error}
            </div>
          )}
          {branches.map((b) => {
            const isSelected = b.id === activeBranch?.id;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => handleSwitch(b)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '8px 12px',
                  background: isSelected ? '#edf2f7' : 'transparent',
                  border: 'none',
                  borderBottom: '1px solid #f7fafc',
                  textAlign: 'right',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                <span>
                  <strong>{b.nameAr}</strong>
                  <span style={{ fontSize: '0.75rem', color: '#718096', marginRight: '6px' }}>
                    ({b.code})
                  </span>
                </span>
                {isSelected && <span style={{ color: '#3182ce' }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

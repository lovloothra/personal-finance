'use client';
import { useMask } from '../contexts/MaskCtx';
import { useFy } from '../contexts/FyCtx';
import { fys, household, type FyKey } from '../lib/fixtures';
import { Icon } from '../primitives/Icon';

export function Topbar() {
  const { masked, setMasked } = useMask();
  const { fy, setFy } = useFy();
  const keys = Object.keys(fys) as FyKey[];

  return (
    <header className="topbar">
      <div className="search">
        <Icon name="search" size={16} />
        <input placeholder="Search merchants, categories, ₹ amounts…" />
      </div>
      <div className="topbar-right">
        <div className="seg" role="tablist" aria-label="Financial year">
          {keys.map((k) => (
            <button key={k} className={fy === k ? 'on' : ''} onClick={() => setFy(k)}>
              {fys[k].label}
            </button>
          ))}
        </div>
        <button
          className={`icon-btn ${masked ? 'on' : ''}`}
          title={masked ? 'Reveal all amounts' : 'Hide all amounts'}
          onClick={() => setMasked((m) => !m)}
        >
          <Icon name={masked ? 'eye-off' : 'eye'} size={18} />
        </button>
        <div className="ondevice">
          <Icon name="shield-check" size={14} />
          Local only
        </div>
        <div className="avatar" title={household.name}>
          {household.initials}
        </div>
      </div>
    </header>
  );
}

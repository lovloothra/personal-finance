'use client';
import { useState } from 'react';
import type { useSpending } from '../../data/useSpending';
import { Money } from '../../primitives/Money';
import { Icon } from '../../primitives/Icon';
import { CategoryGlyph } from '../../primitives/CategoryGlyph';
import { GroupRow } from './GroupRow';
import { labelForCategory } from '@/classifier/taxonomy';

export function ReportView({ spending }: { spending: ReturnType<typeof useSpending> }) {
  const { report, triage, highlight } = spending;
  const [open, setOpen] = useState<string | null>(null);
  const cats = report?.categories ?? [];
  const max = Math.max(1, ...cats.map((c) => c.amt));
  const total = cats.reduce((s, c) => s + c.amt, 0) || 1;

  return (
    <div className="card card-pad">
      {cats.map((c) => {
        const isUncat = c.name.toLowerCase() === 'uncategorised';
        const isOpen = open === c.name;
        return (
          <div key={c.name} className={`catrow ${isOpen ? 'open' : ''} ${highlight === c.name ? 'flash' : ''}`}>
            <button
              type="button"
              className="top rowbtn"
              onClick={() => setOpen(isOpen ? null : c.name)}
              style={{ cursor: 'pointer' }}
              aria-expanded={isOpen}
            >
              <span className="nm" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} size={15} color="var(--fg-3)" />
                <CategoryGlyph name={c.name} size={26} />
                {labelForCategory(c.name)}
                {!c.recurring && <span className="badge neutral" style={{ padding: '1px 7px' }}>one-time</span>}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="muted" style={{ fontSize: 12 }}>{Math.round((c.amt / total) * 100)}%</span>
                <Money amount={c.amt} interactive={false} />
              </span>
            </button>
            <div className="track"><i style={{ width: `${(c.amt / max) * 100}%`, background: c.color }} /></div>
            {isOpen && (
              <div className="sub" style={{ display: 'block' }}>
                {isUncat
                  ? (triage?.groups.length
                      ? triage.groups.map((g) => <GroupRow key={g.signature} group={g} spending={spending} />)
                      : <div className="muted" style={{ fontSize: 12.5, padding: '6px 0' }}>Nothing left to categorise.</div>)
                  : c.children.map((ch) => (
                      <div key={ch.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13, color: 'var(--fg-2)' }}>
                        <span>{ch.name}</span><Money amount={ch.amt} />
                      </div>
                    ))}
              </div>
            )}
          </div>
        );
      })}
      {cats.length === 0 && <div className="muted" style={{ padding: 16 }}>No spending in this period yet.</div>}
    </div>
  );
}

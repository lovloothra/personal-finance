'use client';
import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import { CategoryGlyph } from './CategoryGlyph';

export function CategoryChipPicker({
  categories, value, onPick, suggested, autoFocus,
}: {
  categories: string[];
  value: string;
  onPick: (category: string) => void;
  suggested?: string | null;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState('');
  const ordered = useMemo(() => {
    const seen = new Set<string>();
    const front: string[] = [];
    if (suggested && categories.includes(suggested)) { front.push(suggested); seen.add(suggested); }
    const rest = categories.filter((c) => !seen.has(c));
    return [...front, ...rest].filter((c) => c.toLowerCase().includes(q.toLowerCase()));
  }, [categories, suggested, q]);

  return (
    <div className="chip-picker">
      <input
        className="inp"
        placeholder="Filter categories…"
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && ordered[0]) { e.preventDefault(); onPick(ordered[0]); } }}
        style={{ width: '100%', marginBottom: 8 }}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 168, overflowY: 'auto' }}>
        {ordered.map((c) => {
          const isSug = c === suggested;
          const on = c === value;
          return (
            <button
              key={c}
              type="button"
              className={`cat-pill ${on ? 'on' : ''} ${isSug ? 'sug' : ''}`}
              onClick={() => onPick(c)}
            >
              <CategoryGlyph name={c} size={18} />
              {c}
              {isSug && <Icon name="sparkles" size={12} />}
            </button>
          );
        })}
        {ordered.length === 0 && <span className="muted" style={{ fontSize: 12.5 }}>No match.</span>}
      </div>
    </div>
  );
}

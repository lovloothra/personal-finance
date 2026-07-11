'use client';
import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import { CategoryGlyph } from './CategoryGlyph';
import { labelForCategory } from '@/classifier/taxonomy';

const SHORTLIST_SIZE = 6;

export function CategoryChipPicker({
  categories, value, onPick, suggested, priority, ranked, autoFocus,
}: {
  categories: string[];
  value: string;
  onPick: (category: string) => void;
  suggested?: string | null;
  /** Ranked categories (e.g. the user's most-assigned) shown before the rest. */
  priority?: string[];
  /** Precomputed shortlist order (e.g. from rankCategories) — takes
   * precedence over suggested/priority when present; remaining slots still
   * fill from the usual logic. Also drives the 1-5 keycap chips. */
  ranked?: string[];
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState(false);

  // Ranked shortlist: precomputed `ranked` first (if given), then suggestion,
  // then priority ranking, then taxonomy order as filler. The full set stays
  // reachable via search or "More".
  const shortlist = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const push = (c: string) => {
      if (c && categories.includes(c) && !seen.has(c)) { seen.add(c); out.push(c); }
    };
    for (const c of ranked ?? []) push(c);
    if (suggested) push(suggested);
    for (const c of priority ?? []) push(c);
    for (const c of categories) { if (out.length >= SHORTLIST_SIZE) break; push(c); }
    if (value) push(value); // the current selection must always be visible
    return out.slice(0, Math.max(SHORTLIST_SIZE, value ? SHORTLIST_SIZE + 1 : SHORTLIST_SIZE));
  }, [categories, suggested, priority, ranked, value]);

  const visible = useMemo(() => {
    if (q) {
      const needle = q.toLowerCase();
      return categories.filter(
        (c) => c.toLowerCase().includes(needle) || labelForCategory(c).toLowerCase().includes(needle),
      );
    }
    return expanded ? categories : shortlist;
  }, [categories, shortlist, expanded, q]);

  const collapsed = !q && !expanded && categories.length > shortlist.length;

  return (
    <div className="chip-picker">
      <input
        className="inp"
        placeholder="Search categories…"
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && visible[0]) { e.preventDefault(); onPick(visible[0]); setQ(''); } }}
        style={{ width: '100%', marginBottom: 8 }}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 168, overflowY: 'auto' }}>
        {visible.map((c, idx) => {
          const isSug = c === suggested;
          const on = c === value;
          // Keycaps (1-5) only make sense on the collapsed, un-searched
          // shortlist — `visible` equals `shortlist` in that state, so the
          // index lines up with what `j`/`k`/number-key triage picks.
          const showKeycap = !q && !expanded && idx < 5;
          return (
            <button
              key={c}
              type="button"
              className={`cat-pill ${on ? 'on' : ''} ${isSug ? 'sug' : ''}`}
              onClick={() => onPick(c)}
            >
              {showKeycap && <span className="kbd">{idx + 1}</span>}
              <CategoryGlyph name={c} size={18} />
              {labelForCategory(c)}
              {isSug && <Icon name="sparkles" size={12} />}
            </button>
          );
        })}
        {collapsed && (
          <button type="button" className="cat-pill" onClick={() => setExpanded(true)}>
            More…
          </button>
        )}
        {!q && expanded && (
          <button type="button" className="cat-pill" onClick={() => setExpanded(false)}>
            Fewer
          </button>
        )}
        {visible.length === 0 && <span className="muted" style={{ fontSize: 12.5 }}>No match.</span>}
      </div>
    </div>
  );
}

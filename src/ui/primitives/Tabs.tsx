'use client';
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { rovingIndex } from './rovingIndex';

interface Tab {
  id: string;
  label: ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
  'aria-label'?: string;
}

/**
 * Accessible tab strip over the existing `.tabs` CSS (workbench.css). No
 * panel is owned here — the caller renders the active view itself — so this
 * only wires up `role="tablist"`/`role="tab"` and roving-tabindex keyboard
 * navigation (selection follows focus, matching the ARIA "automatic
 * activation" tabs pattern).
 */
export function Tabs({ tabs, active, onChange, 'aria-label': ariaLabel }: TabsProps) {
  const btnRefs = useRef<Array<HTMLButtonElement | null>>([]);
  // Exactly one tab must stay reachable via Tab even if `active` doesn't
  // match any id (e.g. transient state) — fall back to the first.
  const activeIndex = tabs.findIndex((t) => t.id === active);
  const focusableIndex = activeIndex >= 0 ? activeIndex : 0;

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = rovingIndex(index, e.key, tabs.length);
    if (next === null) return;
    e.preventDefault();
    onChange(tabs[next].id);
    btnRefs.current[next]?.focus();
  };

  return (
    <div className="tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((t, i) => {
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            ref={(el) => {
              btnRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={selected}
            tabIndex={i === focusableIndex ? 0 : -1}
            className={selected ? 'on' : ''}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

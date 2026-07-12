'use client';
import { useRef, type KeyboardEvent } from 'react';
import { rovingIndex } from './rovingIndex';

interface SegmentedOption {
  value: string;
  label: string;
}

interface SegmentedControlProps {
  options: SegmentedOption[];
  value: string;
  onChange: (v: string) => void;
  'aria-label': string;
}

// Beyond this many options the pill row stops being scannable — fall back to
// a native <select>, which stays keyboard-accessible without inventing a
// second interaction pattern.
const OVERFLOW_THRESHOLD = 5;

/**
 * Radiogroup semantics over the existing `.seg` CSS (workbench.css — the
 * FY switcher in Topbar). Roving-tabindex arrow-key navigation, same
 * "selection follows focus" model as Tabs.
 */
export function SegmentedControl({ options, value, onChange, 'aria-label': ariaLabel }: SegmentedControlProps) {
  const btnRefs = useRef<Array<HTMLButtonElement | null>>([]);

  if (options.length > OVERFLOW_THRESHOLD) {
    return (
      <select
        className="inp"
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 'auto', padding: '6px 10px', fontSize: 13 }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  // Exactly one option must stay reachable via Tab even if `value` doesn't
  // match any option (e.g. transient state) — fall back to the first.
  const activeIndex = options.findIndex((o) => o.value === value);
  const focusableIndex = activeIndex >= 0 ? activeIndex : 0;

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = rovingIndex(index, e.key, options.length);
    if (next === null) return;
    e.preventDefault();
    onChange(options[next].value);
    btnRefs.current[next]?.focus();
  };

  return (
    <div className="seg" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              btnRefs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={i === focusableIndex ? 0 : -1}
            className={selected ? 'on' : ''}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

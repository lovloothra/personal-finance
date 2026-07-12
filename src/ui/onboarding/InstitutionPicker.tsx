'use client';
import { useEffect, useRef, useState } from 'react';
import { InstLogo } from '../primitives/InstLogo';

interface Institution {
  id: string;
  displayName: string;
  category: string;
  type?: string | null;
}

interface Props {
  category: string; // bank | credit_card_issuer | broker | insurer | ...
  placeholder?: string;
  value?: string; // selected institution id
  valueLabel?: string;
  onSelect: (inst: Institution | null) => void;
}

/**
 * Typeahead over the institutions table so users pick a real pack institution
 * instead of hand-typing ids. Searches /api/institutions as they type.
 */
export function InstitutionPicker({ category, placeholder, value, valueLabel, onSelect }: Props) {
  const [query, setQuery] = useState(valueLabel ?? '');
  const [results, setResults] = useState<Institution[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(Boolean(value));
  const boxRef = useRef<HTMLDivElement>(null);

  // Prefill arrives asynchronously (after the profile fetch); sync the visible
  // text once the saved institution label is known.
  useEffect(() => {
    if (valueLabel) {
      setQuery(valueLabel);
      setSelected(true);
    }
  }, [valueLabel]);

  useEffect(() => {
    if (selected || query.trim().length < 1) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/institutions?category=${encodeURIComponent(category)}&q=${encodeURIComponent(query)}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { institutions: Institution[] };
        setResults(data.institutions);
        setOpen(true);
      } catch {
        /* aborted, or the request failed — leave the previous results in place */
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, category, selected]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        className="inp"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelected(false);
          onSelect(null);
        }}
        onFocus={() => results.length && setOpen(true)}
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <div
          style={{
            position: 'absolute',
            zIndex: 20,
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: 'var(--bg-page)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 12px 28px rgba(20,20,40,.14)',
            maxHeight: 240,
            overflowY: 'auto',
            padding: 4,
          }}
        >
          {results.map((inst) => (
            <button
              key={inst.id}
              type="button"
              onClick={() => {
                setQuery(inst.displayName);
                setSelected(true);
                setOpen(false);
                onSelect(inst);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                textAlign: 'left',
                padding: '8px 10px',
                borderRadius: 7,
                border: 0,
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 13.5,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-subtle)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <InstLogo id={inst.id} name={inst.displayName} size={22} />
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inst.displayName}</span>
              {inst.type ? <span className="muted" style={{ fontSize: 11.5, marginLeft: 'auto', flexShrink: 0 }}>{inst.type.replace(/_/g, ' ')}</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

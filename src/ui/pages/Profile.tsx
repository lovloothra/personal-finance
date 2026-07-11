'use client';
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Icon } from '../primitives/Icon';
import { FootMeta, PageHead } from './shared';
import { InstitutionPicker } from '../onboarding/InstitutionPicker';
import { labelForOption } from '../lib/format';
import type { ReviewDTO } from '../data/useDashboard';

type FieldType = 'text' | 'date' | 'number' | 'select' | 'institution';

interface FieldView {
  key: string;
  label: string;
  type: FieldType;
  value: string;
  hint?: string;
  options?: string[];
  category?: string;
  currentId?: string;
  readOnly?: boolean;
}
interface SectionView {
  id: string;
  name: string;
  why: string;
  fields: FieldView[];
  pct: number;
  editable: boolean;
}

function summarise(section: SectionView): string {
  const filled = section.fields.filter((f) => f.value.trim() !== '').map((f) => f.value);
  if (filled.length) return filled.slice(0, 3).join(' · ');
  return section.editable ? 'Not added yet — tap to complete' : 'Detected from your statements';
}

// --- Field grouping ---------------------------------------------------------
// Repeated entities ("cards.0.*", "cards.1.*") render under one subheading
// with the redundant label prefix stripped, so the drawer reads "Card 1 →
// Issuer / Product / Last 4" instead of a flat run of "Card 1 issuer…".

const GROUP_NAMES: Record<string, string> = {
  banks: 'Bank',
  cards: 'Card',
  loans: 'Loan',
  brokers: 'Broker',
  investmentPlatforms: 'Platform',
  insurers: 'Insurer',
  subscriptions: 'Subscription',
  houseHelp: 'House help',
  projects: 'Project',
  dependents: 'Dependent',
};

interface FieldGroup {
  heading: string | null;
  fields: FieldView[];
}

function groupFields(fields: FieldView[]): FieldGroup[] {
  const groups: FieldGroup[] = [];
  for (const f of fields) {
    const m = f.key.match(/^(\w+)\.(\d+)\./);
    const heading = m && GROUP_NAMES[m[1]] ? `${GROUP_NAMES[m[1]]} ${Number(m[2]) + 1}` : null;
    const last = groups[groups.length - 1];
    if (last && last.heading === heading) last.fields.push(f);
    else groups.push({ heading, fields: [f] });
  }
  return groups;
}

/** "Card 1 issuer" → "Issuer" when the field sits under a "Card 1" heading. */
function shortLabel(f: FieldView, heading: string | null): string {
  if (!heading) return f.label;
  const stripped = f.label.replace(new RegExp(`^${heading}\\s*`, 'i'), '').trim();
  // The entity's main field is often labelled exactly like the heading
  // ("Bank 1") — fall back to the singular group word ("Bank").
  if (!stripped) return heading.replace(/\s*\d+$/, '');
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

// --- Edit drawer -----------------------------------------------------------

function ProfileEditDrawer({ section, onClose, onSaved }: { section: SectionView; onClose: () => void; onSaved: () => void }) {
  const [show, setShow] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(section.fields.map((f) => [f.key, f.value])));
  const [ids, setIds] = useState<Record<string, string>>(() =>
    Object.fromEntries(section.fields.filter((f) => f.type === 'institution').map((f) => [f.key, f.currentId ?? ''])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), 10);
    return () => clearTimeout(t);
  }, []);

  const close = useCallback(() => {
    setShow(false);
    setTimeout(onClose, 220);
  }, [onClose]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [close]);

  const save = async () => {
    setSaving(true);
    setError(null);
    const values: Record<string, string> = {};
    for (const f of section.fields) {
      if (f.readOnly) continue;
      values[f.key] = f.type === 'institution' ? ids[f.key] ?? '' : vals[f.key] ?? '';
    }
    try {
      const res = await fetch('/api/profile/patch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ values }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      onSaved();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const editableFields = section.fields.filter((f) => !f.readOnly);
  const filled = editableFields.filter((f) => (f.type === 'institution' ? ids[f.key] : vals[f.key]?.trim())).length;
  const pct = editableFields.length ? Math.round((filled / editableFields.length) * 100) : 100;

  return (
    <>
      <div className={`scrim ${show ? 'show' : ''}`} onClick={close} />
      <aside className={`drawer ${show ? 'show' : ''}`}>
        <div className="drawer-head">
          <div>
            <h3>{section.name}</h3>
            <p>{section.why}</p>
          </div>
          <button className="drawer-x" onClick={close}>
            <Icon name="x" size={20} />
          </button>
        </div>
        <div className="drawer-body">
          {groupFields(section.fields).map((g, gi) => {
            const started = g.fields.some((f) => (f.type === 'institution' ? ids[f.key] : vals[f.key]?.trim()));
            return (
              <div key={g.heading ?? `g${gi}`}>
                {g.heading && (
                  <div className="quest-subhead" style={{ margin: '14px 0 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {g.heading}
                    {!started && <span className="badge neutral" style={{ fontWeight: 500 }}>optional</span>}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px 12px' }}>
                  {g.fields.map((f) => (
                    <div className="field" key={f.key} style={{ margin: 0 }}>
                      <label>{shortLabel(f, g.heading)}</label>
                      {f.readOnly ? (
                        <div className="inp" style={{ background: 'var(--bg-subtle)', color: 'var(--fg-2)' }}>{f.value || '—'}</div>
                      ) : f.type === 'institution' ? (
                        <InstitutionPicker
                          category={f.category ?? 'bank'}
                          placeholder={`Search ${shortLabel(f, g.heading).toLowerCase()}…`}
                          valueLabel={f.value}
                          onSelect={(inst) => setIds((m) => ({ ...m, [f.key]: inst?.id ?? '' }))}
                        />
                      ) : f.type === 'select' ? (
                        <select className="inp" value={vals[f.key] ?? ''} onChange={(e) => setVals((m) => ({ ...m, [f.key]: e.target.value }))}>
                          <option value="">Select…</option>
                          {(f.options ?? []).map((o) => (
                            <option key={o} value={o}>{labelForOption(o)}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="inp"
                          type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
                          value={vals[f.key] ?? ''}
                          placeholder={`Add ${shortLabel(f, g.heading).toLowerCase()}…`}
                          onChange={(e) => setVals((m) => ({ ...m, [f.key]: e.target.value }))}
                        />
                      )}
                      {f.hint && <div className="hint">{f.hint}</div>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="note privacy" style={{ marginTop: 6 }}>
            <span className="ic"><Icon name="hard-drive" size={16} /></span>
            <span>Saved to your encrypted on-device database. Nothing here is ever uploaded.</span>
          </div>
          {error && <div className="note warn" style={{ marginTop: 10 }}><span className="ic"><Icon name="triangle-alert" size={16} /></span><span>{error}</span></div>}
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="muted" style={{ fontSize: 12.5, marginRight: 'auto' }}>
            {section.editable ? `${filled} of ${editableFields.length} filled · ${pct}%` : 'Detected automatically'}
          </span>
          <button className="btn btn-ghost" onClick={close}>Cancel</button>
          {section.editable && (
            <button className="btn btn-primary" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

// --- Page ------------------------------------------------------------------

export function Profile() {
  const [sections, setSections] = useState<SectionView[]>([]);
  const [overall, setOverall] = useState(0);
  const [editing, setEditing] = useState<SectionView | null>(null);
  const [profileGaps, setProfileGaps] = useState<ReviewDTO['items']>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/profile/full');
      const data = (await res.json()) as { sections: SectionView[]; overall: number };
      setSections(data.sections ?? []);
      setOverall(data.overall ?? 0);
    } catch {
      /* leave empty */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    fetch('/api/dashboard/review')
      .then((r) => r.json())
      .then((data: ReviewDTO) => {
        setProfileGaps(data.hasData ? data.items.filter((i) => i.kind === 'missing_profile') : []);
      })
      .catch(() => { /* leave empty */ });
  }, []);

  return (
    <div className="content-wrap fade-in">
      <PageHead title="Profile" sub="The more we know, the more we can recognise. All of it stays local." />

      {/* Profile-gap nudge banner */}
      {profileGaps.length > 0 && (
        <div className="card card-pad" style={{ marginBottom: 16, borderColor: 'var(--amber-400)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <Icon name="info" size={16} color="var(--amber-600)" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 6 }}>A few profile gaps are affecting classification</div>
              {profileGaps.map((item) => (
                <div key={item.id} style={{ fontSize: 13, marginBottom: 4 }}>
                  <span style={{ fontWeight: 500 }}>{item.title}</span>
                  {item.desc && <span className="muted" style={{ marginLeft: 6 }}>{item.desc}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="card card-pad" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div className="ring" style={{ ['--p' as string]: overall, width: 56, height: 56 } as CSSProperties}>
          <i style={{ width: 44, height: 44, fontSize: 13 }}>{overall}%</i>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-display)' }}>
            {overall >= 100 ? 'Profile complete' : `Profile is ${overall}% complete`}
          </div>
          <div style={{ fontSize: 13, color: 'var(--fg-2)', marginTop: 2 }}>
            {overall >= 100 ? 'Everything we need is on file. You can refine details anytime.' : 'Filling the gaps below lifts classification accuracy and source coverage.'}
          </div>
        </div>
        <span className="ondevice"><Icon name="lock" size={14} />Encrypted on disk</span>
      </div>

      <div className="grid-2e">
        {sections.map((p) => (
          <div
            key={p.id}
            className={`card card-pad ${p.editable ? 'card-hover' : ''}`}
            style={{ cursor: p.editable ? 'pointer' : 'default' }}
            onClick={() => setEditing(p)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div className="ring" style={{ ['--p' as string]: p.editable ? p.pct : 100 } as CSSProperties}>
                <i>{p.editable ? p.pct : <Icon name="sparkles" size={13} />}</i>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14.5 }}>{p.name}</div>
                <div className="muted" style={{ fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {summarise(p)}
                </div>
              </div>
              <span className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }}>
                <Icon name={p.editable ? 'pencil' : 'eye'} size={14} />
                {p.editable ? 'Edit' : 'View'}
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--fg-2)', display: 'flex', gap: 7, alignItems: 'flex-start', background: 'var(--bg-subtle)', padding: '9px 11px', borderRadius: 10 }}>
              <Icon name="help-circle" size={14} color="var(--fg-3)" style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{p.why}</span>
            </div>
          </div>
        ))}
      </div>
      <FootMeta />
      {editing && <ProfileEditDrawer section={editing} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  );
}

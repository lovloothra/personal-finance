'use client';
import { useEffect, useState, type CSSProperties } from 'react';
import { profileSections as seed, type ProfileSection } from '../lib/fixtures';
import { Icon } from '../primitives/Icon';
import { FootMeta, PageHead } from './shared';

interface ProfileField {
  k: string;
  v: string;
  hint?: string;
}

const PROFILE_FIELDS: Record<string, ProfileField[]> = {
  personal: [
    { k: 'Full name', v: 'Aditya Iyer' },
    { k: 'PAN', v: 'ABXPI1234K', hint: 'Used only to derive statement passwords, on-device.' },
    { k: 'Date of birth', v: '14 / 08 / 1991' },
    { k: 'City', v: 'Bengaluru, KA' },
  ],
  accounts: [
    { k: 'Primary bank', v: 'HDFC Bank ··4821' },
    { k: 'Second bank', v: '', hint: 'We see credits referencing an ICICI account — add it to lift coverage.' },
    { k: 'Credit card', v: 'HDFC ··7702' },
    { k: 'Second card', v: 'Amex ··3009' },
  ],
  employer: [
    { k: 'Employer', v: 'Nexora Systems Pvt Ltd' },
    { k: 'Annual CTC', v: '₹49,20,000' },
    { k: 'Salary account', v: 'HDFC ··4821' },
  ],
  family: [
    { k: 'Spouse', v: 'Sneha Iyer' },
    { k: 'Dependents', v: '2 children' },
    { k: 'Parents (insured)', v: '', hint: 'Adding parents enables 80D detection for their premiums.' },
  ],
  home: [
    { k: 'Monthly rent', v: '₹55,000' },
    { k: 'Landlord / payee', v: 'Prestige Property Mgmt' },
    { k: 'HRA component', v: '₹33,000 / mo' },
  ],
  investments: [
    { k: 'Brokers', v: 'Groww, Zerodha' },
    { k: 'NPS account', v: 'Protean ··PRAN' },
    { k: 'Other platforms', v: '', hint: 'Kuvera detected — add to tag its SIPs correctly.' },
  ],
  subscriptions: [
    { k: 'Confirmed subscriptions', v: '7 tracked' },
    { k: 'Renewal reminders', v: 'On' },
  ],
  annual: [
    { k: 'One-time projects', v: 'Goa anniversary trip' },
    { k: 'Annual expenses', v: '', hint: 'School fees, insurance renewals — isolate them from monthly view.' },
  ],
};

interface ProfileEditDrawerProps {
  section: ProfileSection;
  onClose: () => void;
  onSave: (id: string, pct: number, vals: string[]) => void;
}

function ProfileEditDrawer({ section, onClose, onSave }: ProfileEditDrawerProps) {
  const fields = PROFILE_FIELDS[section.id] || [];
  const [show, setShow] = useState(false);
  const [vals, setVals] = useState<string[]>(() => fields.map((f) => f.v));

  useEffect(() => {
    const t = setTimeout(() => setShow(true), 10);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    setShow(false);
    setTimeout(onClose, 220);
  };

  const filled = vals.filter((v) => v.trim() !== '').length;
  const pct = fields.length ? Math.round((filled / fields.length) * 100) : 100;

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
          {fields.map((f, i) => (
            <div className="field" key={f.k}>
              <label>{f.k}</label>
              <input
                className="inp"
                value={vals[i]}
                placeholder={`Add ${f.k.toLowerCase()}…`}
                onChange={(e) =>
                  setVals((vs) => vs.map((v, j) => (j === i ? e.target.value : v)))
                }
              />
              {f.hint && <div className="hint">{f.hint}</div>}
            </div>
          ))}
          <div className="note privacy" style={{ marginTop: 6 }}>
            <span className="ic">
              <Icon name="hard-drive" size={16} />
            </span>
            <span>Saved to your encrypted on-device database. Nothing here is ever uploaded.</span>
          </div>
        </div>
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span className="muted" style={{ fontSize: 12.5, marginRight: 'auto' }}>
            {filled} of {fields.length} filled · {pct}%
          </span>
          <button className="btn btn-ghost" onClick={close}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              onSave(section.id, pct, vals.filter((v) => v.trim()));
              close();
            }}
          >
            Save changes
          </button>
        </div>
      </aside>
    </>
  );
}

export function Profile() {
  const [sections, setSections] = useState<ProfileSection[]>(() => seed.map((p) => ({ ...p })));
  const [editing, setEditing] = useState<ProfileSection | null>(null);
  const overall = Math.round(sections.reduce((s, p) => s + p.pct, 0) / sections.length);

  const handleSave = (id: string, pct: number, vals: string[]) => {
    setSections((secs) =>
      secs.map((s) => {
        if (s.id !== id) return s;
        const summary = vals.length ? vals.slice(0, 3).join(', ') : s.fields;
        return { ...s, pct, fields: summary };
      }),
    );
  };

  return (
    <div className="content-wrap fade-in">
      <PageHead title="Profile" sub="The more we know, the more we can recognise. All of it stays local." />
      <div className="card card-pad" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          className="ring"
          style={{ ['--p' as string]: overall, width: 56, height: 56 } as CSSProperties}
        >
          <i style={{ width: 44, height: 44, fontSize: 13 }}>{overall}%</i>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-display)' }}>
            Profile is {overall}% complete
          </div>
          <div style={{ fontSize: 13, color: 'var(--fg-2)', marginTop: 2 }}>
            Filling the gaps below would lift your classification accuracy and source coverage.
          </div>
        </div>
        <span className="ondevice">
          <Icon name="lock" size={14} />
          Encrypted on disk
        </span>
      </div>

      <div className="grid-2e">
        {sections.map((p) => (
          <div
            key={p.id}
            className="card card-pad card-hover"
            style={{ cursor: 'pointer' }}
            onClick={() => setEditing(p)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div className="ring" style={{ ['--p' as string]: p.pct } as CSSProperties}>
                <i>{p.pct}</i>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14.5 }}>{p.name}</div>
                <div
                  className="muted"
                  style={{ fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                  {p.fields}
                </div>
              </div>
              <span className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }}>
                <Icon name="pencil" size={14} />
                Edit
              </span>
            </div>
            <div
              style={{
                fontSize: 12.5,
                color: 'var(--fg-2)',
                display: 'flex',
                gap: 7,
                alignItems: 'flex-start',
                background: 'var(--bg-subtle)',
                padding: '9px 11px',
                borderRadius: 10,
              }}
            >
              <Icon name="help-circle" size={14} color="var(--fg-3)" style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{p.why}</span>
            </div>
          </div>
        ))}
      </div>
      <FootMeta />
      {editing && <ProfileEditDrawer section={editing} onClose={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

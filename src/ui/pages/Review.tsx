'use client';
import { useCallback, useEffect, useState } from 'react';
import { review as seed, type ReviewItem, type ReviewKind } from '../lib/fixtures';
import { Icon } from '../primitives/Icon';
import { FootMeta, PageHead } from './shared';
import type { ReviewDTO } from '../data/useDashboard';

type Filter = 'all' | ReviewKind;

const KIND_LABELS: Record<Filter, string> = {
  all: 'All',
  locked_pdf: 'Locked PDFs',
  uncategorised: 'Uncategorised',
  low_confidence: 'Low confidence',
  missing_profile: 'Profile gaps',
};

const ICON_CLASS: Record<ReviewKind, string> = {
  locked_pdf: 'lock',
  uncategorised: 'uncat',
  low_confidence: 'lowconf',
  missing_profile: 'profile',
};

export function Review() {
  const [items, setItems] = useState<ReviewItem[]>(seed);
  const [live, setLive] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/review');
      const data: ReviewDTO = await res.json();
      setLive(true);
      setItems(data.hasData ? (data.items as ReviewItem[]) : []);
    } catch {
      /* keep fixtures */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resolveLocal = (id: string) => setItems((it) => it.filter((x) => x.id !== id));

  const submitPassword = async () => {
    if (!password.trim()) return;
    setUnlocking(true);
    setFlash(null);
    try {
      const res = await fetch('/api/review/unlock', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Unlock failed');
      setFlash(
        data.unlocked > 0
          ? `Unlocked ${data.unlocked} statement${data.unlocked === 1 ? '' : 's'} — ${data.transactions} transactions imported.`
          : `That password didn't match any locked statements. ${data.stillLocked} still locked.`,
      );
      setPassword('');
      setUnlockOpen(false);
      await load();
    } catch (e) {
      setFlash(e instanceof Error ? e.message : 'Unlock failed');
    } finally {
      setUnlocking(false);
    }
  };

  const shown = filter === 'all' ? items : items.filter((i) => i.kind === filter);
  const lockedCount = items.filter((i) => i.kind === 'locked_pdf').length;

  return (
    <div className="content-wrap fade-in">
      <PageHead title="Review queue" sub={live ? `${items.reduce((n, i) => n + (i.count ?? 1), 0)} items need your eye` : 'A few things need your eye to push coverage past 98%'} />

      {/* Global password entry — one password is tried against every locked statement. */}
      {lockedCount > 0 && (
        <div className="card card-pad" style={{ marginBottom: 16, borderColor: 'var(--amber-400)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--amber-50, #fff7ed)', color: 'var(--amber-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="lock-keyhole" size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{lockedCount} statement{lockedCount === 1 ? '' : 's'} still locked</div>
              <div className="muted" style={{ fontSize: 12.5 }}>Enter the document password and we&apos;ll try it on every locked statement, on-device.</div>
            </div>
            {!unlockOpen ? (
              <button className="btn btn-primary btn-sm" onClick={() => setUnlockOpen(true)}>Add password</button>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  className="inp"
                  type="password"
                  autoFocus
                  placeholder="Statement password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitPassword()}
                  style={{ width: 200 }}
                />
                <button className="btn btn-primary btn-sm" disabled={unlocking || !password.trim()} onClick={submitPassword}>
                  {unlocking ? 'Trying…' : 'Unlock'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setUnlockOpen(false); setPassword(''); }}>Cancel</button>
              </div>
            )}
          </div>
          {flash && <div className="muted" style={{ fontSize: 13, marginTop: 10, color: 'var(--fg-1)' }}>{flash}</div>}
        </div>
      )}

      <div className="chips" style={{ marginBottom: 18 }}>
        {(Object.entries(KIND_LABELS) as Array<[Filter, string]>).map(([k, lbl]) => (
          <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>
            {lbl}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="ic">
              <Icon name="check-check" size={24} color="var(--mint-500)" />
            </div>
            <h3 style={{ fontFamily: 'var(--font-display)', margin: '0 0 4px' }}>All clear</h3>
            <p style={{ margin: 0 }}>Nothing left to review here. Your data is as complete as your inbox allows.</p>
          </div>
        </div>
      ) : (
        <div className="stack">
          {shown.map((it) => (
            <div key={it.id} className="review-item">
              <div className={`ic ${ICON_CLASS[it.kind]}`}>
                <Icon name={it.icon} size={20} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="ttl">
                  {it.title}
                  {it.count && (
                    <span className="badge neutral" style={{ marginLeft: 8 }}>
                      {it.count}
                    </span>
                  )}
                </div>
                <div className="desc">{it.desc}</div>
              </div>
              <div className="ra">
                <button className="btn btn-ghost btn-sm" onClick={() => resolveLocal(it.id)}>
                  Snooze
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => (it.kind === 'locked_pdf' ? setUnlockOpen(true) : resolveLocal(it.id))}
                >
                  {it.action}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <FootMeta />
    </div>
  );
}

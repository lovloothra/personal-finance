'use client';
import { useCallback, useEffect, useState } from 'react';
import { review as seed, type ReviewItem, type ReviewKind } from '../lib/fixtures';
import { Icon } from '../primitives/Icon';
import { Money } from '../primitives/Money';
import { FootMeta, PageHead } from './shared';
import type { ReviewDTO } from '../data/useDashboard';
import { useShellMeta } from '../contexts/ShellMetaCtx';

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

interface UncatGroup {
  signature: string;
  sample: string;
  suggestedMerchant: string;
  count: number;
  total: number;
  flow: string;
  category: string | null;
  firstDate: string;
  lastDate: string;
}

interface UncatDTO {
  hasData: boolean;
  totalTransactions: number;
  totalGroups: number;
  groups: UncatGroup[];
  categories: string[];
}

function GroupRow({
  group,
  categories,
  onAssigned,
}: {
  group: UncatGroup;
  categories: string[];
  onAssigned: (signature: string, updated: number) => void;
}) {
  const [merchant, setMerchant] = useState(group.suggestedMerchant);
  const [category, setCategory] = useState(group.category ?? '');
  const [flow, setFlow] = useState(group.flow);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assign = async () => {
    if (!merchant.trim() || !category) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/review/assign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signature: group.signature, merchant: merchant.trim(), category, flow }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Assign failed');
      onAssigned(group.signature, data.updated as number);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Assign failed');
      setBusy(false);
    }
  };

  return (
    <div className="review-item" style={{ alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="ttl" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360 }} title={group.sample}>
            {group.sample}
          </span>
          <span className="badge neutral">{group.count}×</span>
          <span className="badge neutral">
            <Money amount={group.total} />
          </span>
        </div>
        <div className="desc">
          {group.firstDate === group.lastDate ? group.firstDate : `${group.firstDate} → ${group.lastDate}`}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="inp"
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            placeholder="Merchant"
            style={{ width: 180 }}
          />
          <select className="inp" value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: 170 }}>
            <option value="" disabled>
              Category…
            </option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select className="inp" value={flow} onChange={(e) => setFlow(e.target.value)} style={{ width: 120 }}>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
            <option value="transfer">Transfer</option>
            <option value="investment">Investment</option>
          </select>
          <button className="btn btn-primary btn-sm" disabled={busy || !merchant.trim() || !category} onClick={assign}>
            {busy ? 'Assigning…' : `Assign ${group.count > 1 ? `all ${group.count}` : ''}`}
          </button>
        </div>
        {error && (
          <div style={{ fontSize: 12.5, color: 'var(--red-600)', marginTop: 6 }}>{error}</div>
        )}
      </div>
    </div>
  );
}

export function Review() {
  const [items, setItems] = useState<ReviewItem[]>(seed);
  const [live, setLive] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState<string | null>(null);
  const [uncat, setUncat] = useState<UncatDTO | null>(null);
  const [uncatLoading, setUncatLoading] = useState(false);
  const { refresh: refreshShellMeta } = useShellMeta();

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

  const loadUncat = useCallback(async () => {
    setUncatLoading(true);
    try {
      const res = await fetch('/api/review/uncategorised');
      setUncat((await res.json()) as UncatDTO);
    } catch {
      setUncat(null);
    } finally {
      setUncatLoading(false);
    }
  }, []);

  const openAssign = (itemId: string) => {
    setAssignOpen(itemId);
    void loadUncat();
  };

  const onAssigned = (sig: string, updated: number) => {
    setUncat((u) =>
      u
        ? {
            ...u,
            groups: u.groups.filter((g) => g.signature !== sig),
            totalGroups: u.totalGroups - 1,
            totalTransactions: u.totalTransactions - updated,
          }
        : u,
    );
    setFlash(`Categorised ${updated} transaction${updated === 1 ? '' : 's'}. The classifier will remember this.`);
    void load();
    void refreshShellMeta();
  };

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
      void refreshShellMeta();
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

      {flash && lockedCount === 0 && (
        <div className="card card-pad" style={{ marginBottom: 16, borderColor: 'var(--mint-500)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="check-check" size={16} color="var(--mint-600)" />
            <span style={{ fontSize: 13.5 }}>{flash}</span>
          </div>
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
            <div key={it.id}>
              <div className="review-item">
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
                  {(it.kind === 'uncategorised' || it.kind === 'low_confidence') && live ? (
                    <button className="btn btn-primary btn-sm" onClick={() => (assignOpen === it.id ? setAssignOpen(null) : openAssign(it.id))}>
                      {assignOpen === it.id ? 'Close' : it.action}
                    </button>
                  ) : (
                    <>
                      <button className="btn btn-ghost btn-sm" onClick={() => resolveLocal(it.id)}>
                        Snooze
                      </button>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => (it.kind === 'locked_pdf' ? setUnlockOpen(true) : resolveLocal(it.id))}
                      >
                        {it.action}
                      </button>
                    </>
                  )}
                </div>
              </div>
              {(it.kind === 'uncategorised' || it.kind === 'low_confidence') && assignOpen === it.id && (
                <div className="card" style={{ marginTop: 10 }}>
                  <div className="card-head">
                    <h3>Assign merchants &amp; categories</h3>
                    {uncat && (
                      <span className="muted" style={{ fontSize: 12.5 }}>
                        {uncat.totalTransactions} transactions in {uncat.totalGroups} groups — one assignment clears the whole group
                      </span>
                    )}
                  </div>
                  <div className="card-list" style={{ maxHeight: 520, overflowY: 'auto' }}>
                    {uncatLoading && <div className="muted" style={{ padding: 16, fontSize: 13 }}>Loading…</div>}
                    {!uncatLoading && uncat?.groups.length === 0 && (
                      <div className="muted" style={{ padding: 16, fontSize: 13 }}>Nothing left — every transaction is categorised.</div>
                    )}
                    {!uncatLoading &&
                      uncat?.groups.map((g) => (
                        <GroupRow key={g.signature} group={g} categories={uncat.categories} onAssigned={onAssigned} />
                      ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <FootMeta />
    </div>
  );
}

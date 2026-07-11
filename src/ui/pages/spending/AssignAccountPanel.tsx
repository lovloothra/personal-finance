'use client';
import { useEffect, useState } from 'react';

/**
 * Document-level account assignment. A statement is FROM one account, so the
 * picker lists the source DOCUMENTS behind a triage group (not the txn group
 * itself); assigning stamps the document plus every transaction parsed from
 * it — sibling groups from the same statement resolve in the same click.
 */

interface DocInfo {
  id: string;
  institutionId: string | null;
  docType: string | null;
  filename: string | null;
  txnCount: number;
  firstDate: string | null;
  lastDate: string | null;
}

interface AccountOption {
  id: string;
  kind: 'bank' | 'card';
  institutionId: string | null;
  institutionName: string | null;
  last4: string | null;
  nickname: string | null;
}

interface InstOption { id: string; displayName: string; category: string }

const NEW_ACCOUNT = '__register_new__';

function accountLabel(a: AccountOption): string {
  const name = a.nickname ?? a.institutionName ?? a.institutionId ?? 'Account';
  return `${name}${a.last4 ? ` ··${a.last4}` : ''} (${a.kind})`;
}

function docLabel(d: DocInfo): string {
  const kind = d.docType === 'card_statement' ? 'Card statement' : 'Bank statement';
  const dates = d.firstDate ? (d.firstDate === d.lastDate ? d.firstDate : `${d.firstDate} → ${d.lastDate}`) : 'no dated rows';
  return `${kind} · ${d.txnCount} transaction${d.txnCount === 1 ? '' : 's'} · ${dates}`;
}

function DocAssignRow({ doc, accounts, onAssigned }: {
  doc: DocInfo;
  accounts: AccountOption[];
  onAssigned: () => void;
}) {
  // Preselect the first registered account at the document's institution
  // family — usually the right answer, always overridable.
  const family = accounts.find(
    (a) => a.institutionId && doc.institutionId && (a.institutionId === doc.institutionId || a.institutionId === `${doc.institutionId}-cards`),
  );
  const [choice, setChoice] = useState<string>(family?.id ?? accounts[0]?.id ?? NEW_ACCOUNT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Register-new fields
  const [kind, setKind] = useState<'bank' | 'card'>(doc.docType === 'card_statement' ? 'card' : 'bank');
  const [institutions, setInstitutions] = useState<InstOption[] | null>(null);
  const [institutionId, setInstitutionId] = useState('');
  const [last4, setLast4] = useState('');
  const [nickname, setNickname] = useState('');

  const registering = choice === NEW_ACCOUNT;

  useEffect(() => {
    if (!registering || institutions) return;
    fetch('/api/institutions?limit=50')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { institutions: InstOption[] }) => setInstitutions(d.institutions))
      .catch(() => {
        setInstitutions([]);
        setError('Failed to load institutions — try again.');
      });
  }, [registering, institutions]);

  const assign = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = registering
        ? { documentId: doc.id, register: { kind, institutionId, last4: last4 || undefined, nickname: nickname || undefined } }
        : { documentId: doc.id, accountId: choice };
      const res = await fetch('/api/review/assign-account', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Assign failed');
      onAssigned();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Assign failed');
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 12.5, color: 'var(--fg-2)' }} title={doc.filename ?? undefined}>
        {docLabel(doc)}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="inp" value={choice} onChange={(e) => setChoice(e.target.value)} style={{ flex: '0 1 260px' }}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{accountLabel(a)}</option>
          ))}
          <option value={NEW_ACCOUNT}>Register a new account…</option>
        </select>
        {!registering && (
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={assign}>
            {busy ? 'Assigning…' : 'Assign'}
          </button>
        )}
      </div>
      {registering && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="inp" value={kind} onChange={(e) => setKind(e.target.value as 'bank' | 'card')} style={{ flex: '0 0 110px' }}>
            <option value="bank">Bank</option>
            <option value="card">Card</option>
          </select>
          <select className="inp" value={institutionId} onChange={(e) => setInstitutionId(e.target.value)} style={{ flex: '0 1 220px' }}>
            <option value="">Institution…</option>
            {(institutions ?? []).map((i) => (
              <option key={i.id} value={i.id}>{i.displayName}</option>
            ))}
          </select>
          <input
            className="inp"
            value={last4}
            onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="Last 4 (optional)"
            style={{ flex: '0 0 130px' }}
          />
          <input
            className="inp"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Nickname (optional)"
            style={{ flex: '0 0 160px' }}
          />
          <button className="btn btn-primary btn-sm" disabled={busy || !institutionId} onClick={assign}>
            {busy ? 'Assigning…' : 'Register & assign'}
          </button>
        </div>
      )}
      {error && <div style={{ fontSize: 12.5, color: 'var(--red-600)' }}>{error}</div>}
    </div>
  );
}

export function AssignAccountPanel({ signature, onAssigned }: {
  signature: string;
  /** Called after any successful assignment so the parent reloads the triage list. */
  onAssigned: () => void;
}) {
  const [docs, setDocs] = useState<DocInfo[] | null>(null);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/review/assign-account?signature=${encodeURIComponent(signature)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { docs: DocInfo[]; accounts: AccountOption[]; error?: string }) => {
        if (!active) return;
        if (d.error) throw new Error(d.error);
        setDocs(d.docs);
        setAccounts(d.accounts);
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : 'Failed to load documents'));
    return () => { active = false; };
  }, [signature]);

  return (
    <div style={{
      marginTop: 10, padding: '10px 12px',
      border: '1px solid var(--border)', borderRadius: 8,
      display: 'grid', gap: 10,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>Assign the source statement to an account</div>
      {error && <div style={{ fontSize: 12.5, color: 'var(--red-600)' }}>{error}</div>}
      {docs === null && !error && <div className="muted" style={{ fontSize: 12.5 }}>Loading…</div>}
      {docs?.length === 0 && (
        <div className="muted" style={{ fontSize: 12.5 }}>
          Every document behind this group already has an account — refresh to update the list.
        </div>
      )}
      {docs?.map((d) => (
        <DocAssignRow key={d.id} doc={d} accounts={accounts} onAssigned={onAssigned} />
      ))}
    </div>
  );
}

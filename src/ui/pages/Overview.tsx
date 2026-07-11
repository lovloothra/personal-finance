'use client';
import Link from 'next/link';
import { useFy } from '../contexts/FyCtx';
import { fyLabel } from '../lib/format';
import { viewState } from '../lib/viewState';
import { MerchantLogo } from '../primitives/MerchantLogo';
import { Button } from '../primitives/Button';
import { Icon } from '../primitives/Icon';
import { Money } from '../primitives/Money';
import { StatCard } from '../primitives/StatCard';
import { EmptyState } from '../primitives/EmptyState';
import { ErrorState } from '../primitives/ErrorState';
import { Skeleton } from '../primitives/Skeleton';
import { FootMeta, PageHead, TxnRow } from './shared';
import { useOverview, recentToTxn, type OverviewDTO } from '../data/useOverview';
import { useShellMeta, type ReviewMeta, type ShellStatus } from '../contexts/ShellMetaCtx';
import { useDashboard, type TaxDTO } from '../data/useDashboard';
import { labelForCategory } from '@/classifier/taxonomy';

interface CatView {
  name: string;
  amt: number;
  color: string;
  recurring: boolean;
}

export function Overview() {
  const { fy } = useFy();
  const { data, loading, error, retry } = useOverview(fy);
  const { review, profileName, status: shellStatus } = useShellMeta();
  const { data: taxData } = useDashboard<TaxDTO>('tax', fy);
  const state = viewState(loading, error, data?.hasData);
  const f = fyLabel(fy);
  const taxCmp = data?.hasData && taxData?.hasData ? taxData.comparison : null;

  const reviewParts = review
    ? [
        review.locked > 0 ? `${review.locked} locked PDF${review.locked === 1 ? '' : 's'}` : null,
        review.uncategorised > 0 ? `${review.uncategorised} uncategorised` : null,
        review.lowConfidence > 0 ? `${review.lowConfidence} low-confidence` : null,
      ].filter((p): p is string => p != null)
    : null;

  return (
    <div className="content-wrap fade-in">
      <PageHead title={`Hello, ${(data?.name ?? profileName ?? 'there').split(' ')[0]}`} sub={f.label}>
        <Button variant="secondary" icon="refresh-cw" href="/sources">
          Re-run import
        </Button>
      </PageHead>

      {state === 'loading' && (
        <>
          <div className="grid-4" style={{ marginBottom: 16 }}>
            <Skeleton variant="stat" count={4} />
          </div>
          <div className="grid-2" style={{ marginBottom: 16 }}>
            <Skeleton variant="block" height={260} />
            <Skeleton variant="block" height={260} />
          </div>
        </>
      )}

      {state === 'error' && <ErrorState message={error ?? undefined} onRetry={retry} />}

      {state === 'empty' && (
        <EmptyState
          icon="sparkles"
          title="No transactions yet"
          body="Run your first Gmail import to see where your money goes."
          action={{ label: 'Run an import', href: '/sources' }}
        />
      )}

      {state === 'ready' && data && (
        <OverviewContent data={data} review={review} reviewParts={reviewParts} shellStatus={shellStatus} taxCmp={taxCmp} />
      )}

      <FootMeta />
    </div>
  );
}

function OverviewContent({
  data,
  review,
  reviewParts,
  shellStatus,
  taxCmp,
}: {
  data: OverviewDTO;
  review: ReviewMeta | null;
  reviewParts: string[] | null;
  shellStatus: ShellStatus;
  taxCmp: TaxDTO['comparison'] | null;
}) {
  const { income, expenses, net, savingsRate, prevSavingsRate } = data;
  const topCats: CatView[] = data.topCategories.map((c) => ({ name: c.name, amt: c.amount, color: c.color, recurring: true }));
  const maxCat = topCats.length ? topCats[0].amt : 1;
  const recent = data.recent.map(recentToTxn);
  const merchants = data.topMerchants;

  return (
    <>
      <div className="grid-4" style={{ marginBottom: 16 }}>
        <StatCard lbl="Income" icon="arrow-down-to-line" val={<Money compact amount={income} pos />} delta="vs prior FY" dir="up" />
        <StatCard lbl="Expenses" icon="arrow-up-from-line" val={<Money compact amount={expenses} />} sub="CC payments de-duped" />
        <StatCard
          lbl="Money kept"
          icon="piggy-bank"
          val={<Money compact amount={net} pos={net >= 0} sign={net < 0} />}
          accent={net >= 0 ? 'var(--mint-600)' : 'var(--red-500)'}
          sub={net < 0 ? 'Spent more than earned' : undefined}
        />
        <StatCard lbl="Savings rate" icon="percent" val={`${savingsRate}%`} delta={`${savingsRate - prevSavingsRate >= 0 ? '+' : ''}${savingsRate - prevSavingsRate} pts`} dir={savingsRate - prevSavingsRate >= 0 ? 'up' : 'down'} />
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-head">
            <h3>Where it went</h3>
            <Link className="link" href="/spending">
              All expenses
              <Icon name="arrow-right" size={13} />
            </Link>
          </div>
          <div className="card-list">
            {topCats.map((c) => (
              <div key={c.name} className="catrow" style={{ cursor: 'default' }}>
                <div className="top">
                  <span className="nm">
                    <span className="swatch" style={{ background: c.color }} />
                    {labelForCategory(c.name)}
                    {c.recurring ? null : (
                      <span className="badge neutral" style={{ padding: '1px 7px' }}>
                        one-time
                      </span>
                    )}
                  </span>
                  <Money amount={c.amt} />
                </div>
                <div className="track">
                  <i style={{ width: `${(c.amt / maxCat) * 100}%`, background: c.color }} />
                </div>
              </div>
            ))}
            {topCats.length === 0 && <div className="muted" style={{ padding: 16 }}>No spending yet this period.</div>}
          </div>
        </div>

        <div className="stack">
          <div className="card card-pad" style={{ background: net >= 0 ? 'var(--gradient-mint)' : 'var(--gradient-hero)', border: 0, color: '#fff' }}>
            <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.9, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {net >= 0 ? 'You kept' : 'You overspent by'}
            </div>
            <div className="fig" style={{ fontSize: 34, margin: '8px 0 2px' }}>
              <Money amount={net} className="onmint" />
            </div>
            <div style={{ fontSize: 13, opacity: 0.92 }}>
              {net >= 0
                ? `${savingsRate}% of everything you earned this year.`
                : 'More went out than came in — uncategorised imports often hide salary credits. Clear the review queue to firm this up.'}
            </div>
          </div>
          <Link href="/tax" className="card card-pad card-hover" style={{ display: 'block', textDecoration: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--indigo-50)', color: 'var(--indigo-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="receipt-indian-rupee" size={18} />
              </div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, margin: 0 }}>
                {taxCmp ? `Tax: ${taxCmp.recommended} regime wins` : 'Tax: compare regimes'}
              </h3>
            </div>
            <p style={{ fontSize: 13, color: 'var(--fg-2)', margin: '0 0 6px', lineHeight: 1.5 }}>
              {taxCmp ? (
                <>
                  Based on detected evidence, the {taxCmp.recommended} regime saves you{' '}
                  <b style={{ color: 'var(--mint-700)' }}>
                    <Money amount={taxCmp.saving} />
                  </b>{' '}
                  this year.
                </>
              ) : (
                <>See how the old and new regimes compare on the income and deductions detected so far.</>
              )}
            </p>
            <span className="link" style={{ color: 'var(--brand)', fontWeight: 600, fontSize: 13 }}>
              Compare regimes →
            </span>
          </Link>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h3>Recent activity</h3>
            <Link className="link" href="/spending">
              See all
              <Icon name="arrow-right" size={13} />
            </Link>
          </div>
          <div className="card-list">
            {recent.map((t) => (
              <TxnRow key={t.id} t={t} />
            ))}
            {recent.length === 0 && <div className="muted" style={{ padding: 16 }}>No recent activity.</div>}
          </div>
        </div>
        <div className="stack">
          <Link href="/spending" className="card card-pad card-hover" style={{ display: 'block', textDecoration: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, margin: 0 }}>Needs your eye</h3>
              {shellStatus === 'ready' && review && (
                <span className={`badge ${review.total === 0 ? 'mint' : 'cau'}`}>
                  {review.total === 0 ? 'All clear' : `${review.total} item${review.total === 1 ? '' : 's'}`}
                </span>
              )}
            </div>
            <p style={{ fontSize: 13, color: 'var(--fg-2)', margin: '8px 0 0', lineHeight: 1.5 }}>
              {reviewParts
                ? reviewParts.length > 0
                  ? `${reviewParts.join(', ')}. Clear them to make your numbers trustworthy.`
                  : 'Nothing waiting on you — every imported transaction is classified.'
                : 'Once your inbox is imported, anything that needs a second look shows up here.'}
            </p>
            <span className="link" style={{ color: 'var(--brand)', fontWeight: 600, fontSize: 13, marginTop: 8, display: 'inline-block' }}>
              Go to Spending →
            </span>
          </Link>
          <div className="card card-pad">
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, margin: '0 0 12px' }}>Top merchants</h3>
            {merchants.map((m) => (
              <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
                <MerchantLogo name={m.name} color={m.color} size={30} />
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{labelForCategory(m.name)}</span>
                <span style={{ marginLeft: 'auto' }}>
                  <Money amount={m.amount} />
                </span>
              </div>
            ))}
            {merchants.length === 0 && <div className="muted" style={{ padding: '8px 0' }}>No merchants yet.</div>}
          </div>
        </div>
      </div>
    </>
  );
}

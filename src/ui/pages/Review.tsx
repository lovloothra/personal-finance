'use client';
import { useState } from 'react';
import { review as seed, type ReviewItem, type ReviewKind } from '../lib/fixtures';
import { Icon } from '../primitives/Icon';
import { FootMeta, PageHead } from './shared';

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
  const [filter, setFilter] = useState<Filter>('all');
  const resolve = (id: string) => setItems((it) => it.filter((x) => x.id !== id));

  const shown = filter === 'all' ? items : items.filter((i) => i.kind === filter);

  return (
    <div className="content-wrap fade-in">
      <PageHead title="Review queue" sub="A few things need your eye to push coverage past 98%" />
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
                <button className="btn btn-ghost btn-sm" onClick={() => resolve(it.id)}>
                  Snooze
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => resolve(it.id)}>
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

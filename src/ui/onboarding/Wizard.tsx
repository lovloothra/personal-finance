'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/ui/primitives/Icon';
import { InstitutionPicker } from './InstitutionPicker';
import { labelForOption } from '@/ui/lib/format';
import type { ProfileSeed } from '@/profile/types';
import type { ReactNode } from 'react';

const FY = '2025-26';

type ChapterId = 'you' | 'income' | 'home' | 'money' | 'spending' | 'future' | 'gmail';

interface Chapter {
  id: ChapterId;
  title: string;
  eyebrow: string;
  icon: string;
  minutes: string;
  unlock: string;
}

const CHAPTERS: Chapter[] = [
  { id: 'you', title: 'You', eyebrow: 'Identity', icon: 'user-round', minutes: '4 min', unlock: 'Unlocks statement passwords' },
  { id: 'income', title: 'Income', eyebrow: 'Salary', icon: 'badge-indian-rupee', minutes: '3 min', unlock: 'Unlocks salary detection' },
  { id: 'home', title: 'Home', eyebrow: 'Rent & HRA', icon: 'home', minutes: '4 min', unlock: 'Unlocks HRA tracking' },
  { id: 'money', title: 'Money', eyebrow: 'Accounts', icon: 'landmark', minutes: '6 min', unlock: 'Unlocks scoped Gmail queries' },
  { id: 'spending', title: 'Spending', eyebrow: 'Recurring & projects', icon: 'receipt-text', minutes: '6 min', unlock: 'Unlocks cleaner categories' },
  { id: 'future', title: 'Future', eyebrow: 'Investments & tax', icon: 'trending-up', minutes: '5 min', unlock: 'Unlocks tax evidence' },
  { id: 'gmail', title: 'Gmail Import', eyebrow: 'Read-only', icon: 'mail-check', minutes: '5 min', unlock: 'Build the first ledger' },
];

type Draft = {
  personal: Record<string, string>;
  spouse: Record<string, string>;
  dependents: Record<string, string>[];
  employer: Record<string, string>;
  home: Record<string, string>;
  banks: Record<string, string>[];
  cards: Record<string, string>[];
  loans: Record<string, string>[];
  brokers: Record<string, string>[];
  investmentPlatforms: Record<string, string>[];
  insurers: Record<string, string>[];
  subscriptions: Record<string, string>[];
  houseHelp: Record<string, string>[];
  projects: Record<string, string>[];
  goals: Record<string, string>;
  tax: Record<string, string>;
  onboarding: { completedChapters: string[]; skippedChapters: string[]; xp: number; level: number; lastChapter?: string };
};

const row = (n: number) => Array.from({ length: n }, () => ({} as Record<string, string>));

const EMPTY: Draft = {
  personal: {},
  spouse: {},
  dependents: row(2),
  employer: {},
  home: {},
  banks: row(3),
  cards: row(3),
  loans: row(2),
  brokers: row(2),
  investmentPlatforms: row(2),
  insurers: row(2),
  subscriptions: row(4),
  houseHelp: row(2),
  projects: row(3),
  goals: {},
  tax: {},
  onboarding: { completedChapters: [], skippedChapters: [], xp: 0, level: 1 },
};

const s = (v: unknown) => (v == null ? '' : String(v));
const clone = (d: Draft): Draft => JSON.parse(JSON.stringify(d)) as Draft;
const num = (v?: string) => {
  const n = Number((v ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && (v ?? '').trim() ? n : undefined;
};
const defined = <T extends object>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '')) as Partial<T>;
const splitHints = (v?: string) => (v ?? '').split(',').map((x) => x.trim()).filter(Boolean);

function seedToDraft(seed?: Partial<ProfileSeed>): Draft {
  const d = clone(EMPTY);
  d.personal = { ...seed?.personal } as Record<string, string>;
  d.spouse = { ...seed?.spouse } as Record<string, string>;
  d.dependents = row(2).map((_, i) => ({
    fullName: seed?.dependents?.[i]?.fullName ?? '',
    relation: seed?.dependents?.[i]?.relation ?? '',
    dob: seed?.dependents?.[i]?.dob ?? '',
    pan: seed?.dependents?.[i]?.pan ?? '',
    mobile: seed?.dependents?.[i]?.mobile ?? '',
  }));
  d.employer = {
    name: seed?.employer?.name ?? '',
    monthlyNetSalary: s(seed?.employer?.monthlyNetSalary),
  };
  d.home = {
    ownership: seed?.home?.ownership ?? '',
    monthlyRent: s(seed?.home?.monthlyRent),
    landlordName: seed?.home?.landlordName ?? '',
    cityTier: seed?.home?.cityTier ?? '',
    hraInSalary: s(seed?.home?.hraInSalary),
  };
  d.banks = row(3).map((_, i) => ({
    institutionId: seed?.banks?.[i]?.institutionId ?? '',
    nickname: seed?.banks?.[i]?.nickname ?? '',
    last4: seed?.banks?.[i]?.last4 ?? '',
    customerId: seed?.banks?.[i]?.customerId ?? '',
    accountType: seed?.banks?.[i]?.accountType ?? '',
  }));
  d.cards = row(3).map((_, i) => ({
    institutionId: seed?.cards?.[i]?.institutionId ?? '',
    productId: seed?.cards?.[i]?.productId ?? '',
    nickname: seed?.cards?.[i]?.nickname ?? '',
    last4: seed?.cards?.[i]?.last4 ?? '',
    network: seed?.cards?.[i]?.network ?? '',
    creditLimit: s(seed?.cards?.[i]?.creditLimit),
    statementDay: s(seed?.cards?.[i]?.statementDay),
  }));
  d.loans = row(2).map((_, i) => ({
    institutionId: seed?.loans?.[i]?.institutionId ?? '',
    kind: seed?.loans?.[i]?.kind ?? '',
    principal: s(seed?.loans?.[i]?.principal),
    emiAmount: s(seed?.loans?.[i]?.emiAmount),
    outstanding: s(seed?.loans?.[i]?.outstanding),
    interestRate: s(seed?.loans?.[i]?.interestRate),
    emiDay: s(seed?.loans?.[i]?.emiDay),
    startDate: seed?.loans?.[i]?.startDate ?? '',
    endDate: seed?.loans?.[i]?.endDate ?? '',
  }));
  d.brokers = row(2).map((_, i) => ({
    institutionId: seed?.brokers?.[i]?.institutionId ?? '',
    name: seed?.brokers?.[i]?.name ?? '',
    taxSection: seed?.brokers?.[i]?.taxSection ?? '',
  }));
  d.investmentPlatforms = row(2).map((_, i) => ({
    institutionId: seed?.investmentPlatforms?.[i]?.institutionId ?? '',
    name: seed?.investmentPlatforms?.[i]?.name ?? '',
    kind: seed?.investmentPlatforms?.[i]?.kind ?? '',
    taxSection: seed?.investmentPlatforms?.[i]?.taxSection ?? '',
  }));
  d.insurers = row(2).map((_, i) => ({
    institutionId: seed?.insurers?.[i]?.institutionId ?? '',
    name: seed?.insurers?.[i]?.name ?? '',
    kind: seed?.insurers?.[i]?.kind ?? '',
    taxSection: seed?.insurers?.[i]?.taxSection ?? '',
    cadence: seed?.insurers?.[i]?.cadence ?? '',
    premium: s(seed?.insurers?.[i]?.premium),
  }));
  d.subscriptions = row(4).map((_, i) => ({
    name: seed?.subscriptions?.[i]?.name ?? '',
    cadence: seed?.subscriptions?.[i]?.cadence ?? '',
    category: seed?.subscriptions?.[i]?.category ?? '',
    amount: s(seed?.subscriptions?.[i]?.amount),
  }));
  d.houseHelp = row(2).map((_, i) => ({
    name: seed?.houseHelp?.[i]?.name ?? '',
    role: seed?.houseHelp?.[i]?.role ?? '',
    upiHandle: seed?.houseHelp?.[i]?.upiHandle ?? '',
    monthlyAmount: s(seed?.houseHelp?.[i]?.monthlyAmount),
  }));
  d.projects = row(3).map((_, i) => ({
    id: seed?.projects?.[i]?.id ?? '',
    name: seed?.projects?.[i]?.name ?? '',
    budget: s(seed?.projects?.[i]?.budget),
    startDate: seed?.projects?.[i]?.startDate ?? '',
    endDate: seed?.projects?.[i]?.endDate ?? '',
    status: seed?.projects?.[i]?.status ?? '',
    categoryHints: seed?.projects?.[i]?.categoryHints?.join(', ') ?? '',
  }));
  d.goals = {
    savingsRateTarget: s(seed?.goals?.savingsRateTarget),
    retirementAge: s(seed?.goals?.retirementAge),
    retirementCorpus: s(seed?.goals?.retirementCorpus),
    emergencyFundMonths: s(seed?.goals?.emergencyFundMonths),
  };
  d.tax = {
    regimePreference: seed?.tax?.regimePreference ?? 'compare',
    annual80C: s(seed?.tax?.annual80C),
    annual80D: s(seed?.tax?.annual80D),
    nps80CCD1B: s(seed?.tax?.nps80CCD1B),
  };
  d.onboarding = {
    completedChapters: seed?.onboarding?.completedChapters ?? [],
    skippedChapters: seed?.onboarding?.skippedChapters ?? [],
    xp: seed?.onboarding?.xp ?? 0,
    level: seed?.onboarding?.level ?? 1,
    lastChapter: seed?.onboarding?.lastChapter,
  };
  return d;
}

function draftToProfile(d: Draft, chapter: ChapterId, skipped: boolean): Partial<ProfileSeed> {
  const completed = new Set(d.onboarding.completedChapters);
  const skippedSet = new Set(d.onboarding.skippedChapters);
  if (skipped) skippedSet.add(chapter);
  else completed.add(chapter);
  const completedChapters = [...completed].filter((id) => id !== 'gmail');
  const xp = completedChapters.length * 140 + skippedSet.size * 35;

  const profile: Partial<ProfileSeed> = {
    personal: {
      fullName: d.personal.fullName?.trim() || '',
      pan: d.personal.pan?.trim().toUpperCase() || undefined,
      dob: d.personal.dob || undefined,
      mobile: d.personal.mobile || undefined,
      city: d.personal.city || undefined,
      email: d.personal.email || undefined,
    },
    dependents: d.dependents
      .filter((x) => x.fullName?.trim())
      .map((x) => ({ fullName: x.fullName.trim(), relation: x.relation || 'dependent', dob: x.dob || undefined, isDependent: true, hasIncome: false })),
    employer: d.employer.name?.trim()
      ? { name: d.employer.name.trim(), aliases: [d.employer.name.trim().toLowerCase()], monthlyNetSalary: num(d.employer.monthlyNetSalary) }
      : undefined,
    home: defined({
      ownership: d.home.ownership as 'owned' | 'rented' | 'family' | undefined,
      monthlyRent: num(d.home.monthlyRent),
      landlordName: d.home.landlordName?.trim(),
      cityTier: d.home.cityTier as 'metro' | 'non_metro' | undefined,
      hraInSalary: num(d.home.hraInSalary),
    }) as ProfileSeed['home'],
    banks: d.banks
      .filter((x) => x.institutionId)
      .map((x, i) => ({ institutionId: x.institutionId, nickname: x.nickname || undefined, last4: x.last4 || undefined, customerId: x.customerId || undefined, accountType: x.accountType || undefined, isPrimary: i === 0 })),
    cards: d.cards
      .filter((x) => x.institutionId)
      .map((x) => ({ institutionId: x.institutionId, productId: x.productId || undefined, nickname: x.nickname || undefined, last4: x.last4 || undefined, network: x.network || undefined, statementDay: num(x.statementDay) })),
    loans: d.loans
      .filter((x) => x.kind || x.institutionId)
      .map((x) => ({ kind: x.kind || 'loan', institutionId: x.institutionId || undefined, emiAmount: num(x.emiAmount), outstanding: num(x.outstanding), interestRate: num(x.interestRate), emiDay: num(x.emiDay) })),
    brokers: d.brokers
      .filter((x) => x.institutionId && x.name)
      .map((x) => ({ institutionId: x.institutionId, name: x.name, taxSection: x.taxSection && x.taxSection !== 'none' ? x.taxSection : null })),
    investmentPlatforms: d.investmentPlatforms
      .filter((x) => x.institutionId && x.name)
      .map((x) => ({ institutionId: x.institutionId, name: x.name, kind: x.kind || undefined, taxSection: x.taxSection && x.taxSection !== 'none' ? x.taxSection : null })),
    insurers: d.insurers
      .filter((x) => x.name && x.kind)
      .map((x) => ({ institutionId: x.institutionId || undefined, name: x.name, kind: x.kind, premium: num(x.premium), cadence: x.cadence || undefined, taxSection: x.taxSection && x.taxSection !== 'none' ? x.taxSection : null })),
    subscriptions: d.subscriptions
      .filter((x) => x.name)
      .map((x) => ({ name: x.name, amount: num(x.amount), cadence: x.cadence || undefined, category: x.category || undefined })),
    houseHelp: d.houseHelp
      .filter((x) => x.name && x.role)
      .map((x) => ({ name: x.name, role: x.role, monthlyAmount: num(x.monthlyAmount), upiHandle: x.upiHandle || undefined })),
    projects: d.projects
      .filter((x) => x.name)
      .map((x) => ({
        id: (x.id || x.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        name: x.name,
        budget: num(x.budget),
        startDate: x.startDate || undefined,
        endDate: x.endDate || undefined,
        categoryHints: splitHints(x.categoryHints),
      })),
    goals: defined({
      savingsRateTarget: num(d.goals.savingsRateTarget),
      retirementAge: num(d.goals.retirementAge),
      retirementCorpus: num(d.goals.retirementCorpus),
      emergencyFundMonths: num(d.goals.emergencyFundMonths),
    }) as ProfileSeed['goals'],
    tax: defined({
      regimePreference: d.tax.regimePreference as ProfileSeed['tax']['regimePreference'],
      annual80C: num(d.tax.annual80C),
      annual80D: num(d.tax.annual80D),
      nps80CCD1B: num(d.tax.nps80CCD1B),
    }) as ProfileSeed['tax'],
    onboarding: { completedChapters, skippedChapters: [...skippedSet], xp, level: Math.max(1, Math.floor(xp / 300) + 1), lastChapter: chapter },
  };
  if (d.spouse.fullName?.trim()) {
    profile.spouse = {
      fullName: d.spouse.fullName.trim(),
      pan: d.spouse.pan?.trim().toUpperCase() || undefined,
      dob: d.spouse.dob || undefined,
      mobile: d.spouse.mobile || undefined,
    };
  }
  return profile;
}

function TextField({ label, value, onChange, placeholder, type = 'text', hint }: { label: string; value?: string; onChange: (v: string) => void; placeholder?: string; type?: string; hint?: string }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input className="inp" type={type} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value?: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div className="field">
      <label>{label}</label>
      <select className="inp" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select...</option>
        {options.map((o) => <option key={o} value={o}>{labelForOption(o)}</option>)}
      </select>
    </div>
  );
}

function InstField({ label, category, value, valueLabel, onSelect }: { label: string; category: string; value?: string; valueLabel?: string; onSelect: (id: string) => void }) {
  return (
    <div className="field">
      <label>{label}</label>
      <InstitutionPicker category={category} value={value} valueLabel={valueLabel} placeholder={`Search ${label.toLowerCase()}...`} onSelect={(inst) => onSelect(inst?.id ?? '')} />
    </div>
  );
}

function ChapterShell({ chapter, index, draft, children }: { chapter: Chapter; index: number; draft: Draft; children: ReactNode }) {
  const complete = draft.onboarding.completedChapters.length;
  const pct = Math.round((complete / 6) * 100);
  return (
    <>
      <div className="quest-head">
        <div className="quest-emblem"><Icon name={chapter.icon} size={22} /></div>
        <div>
          <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>{chapter.eyebrow} mission {index + 1} of {CHAPTERS.length}</div>
          <h2>{chapter.title}</h2>
          <p className="lead">{chapter.unlock}. Estimated time: {chapter.minutes}.</p>
        </div>
      </div>
      <div className="quest-score">
        <div>
          <b>Profile coverage {pct}%</b>
          <span>{draft.onboarding.xp} XP - Level {draft.onboarding.level}</span>
        </div>
        <div className="quest-bar"><i style={{ width: `${pct}%` }} /></div>
      </div>
      {children}
    </>
  );
}

interface Estimate {
  messageCount: number;
  humanEstimate: string;
  consentRequired: boolean;
  senders: string[];
}

export function Wizard() {
  const router = useRouter();
  const [chapterIndex, setChapterIndex] = useState(0);
  const [draft, setDraft] = useState<Draft>(() => clone(EMPTY));
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gmailError, setGmailError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/profile/onboarding')
      .then((r) => r.json())
      .then((data) => {
        setDraft(seedToDraft(data.seed));
        setLabels(data.labels ?? {});
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gmail = params.get('gmail');
    if (gmail === 'connected') setChapterIndex(CHAPTERS.length - 1);
    if (gmail === 'error') {
      setChapterIndex(CHAPTERS.length - 1);
      setGmailError(params.get('reason') ?? 'Authorization failed.');
    }
    if (gmail) window.history.replaceState({}, '', '/onboarding');
  }, []);

  const chapter = CHAPTERS[chapterIndex];
  const setObj = (group: keyof Draft, key: string, value: string) => {
    setDraft((prev) => ({ ...prev, [group]: { ...(prev[group] as Record<string, string>), [key]: value } }));
  };
  const setRow = (group: keyof Draft, i: number, key: string, value: string) => {
    setDraft((prev) => {
      const list = [...(prev[group] as Record<string, string>[])];
      list[i] = { ...list[i], [key]: value };
      return { ...prev, [group]: list };
    });
  };

  const saveAndMove = async (skipped = false) => {
    if (!draft.personal.fullName?.trim()) {
      setError('Add your name first. Everything else can be skipped and edited later.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const profile = draftToProfile(draft, chapter.id, skipped);
      const res = await fetch('/api/profile/onboarding', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ profile }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      setDraft(seedToDraft(data.seed));
      setLabels(data.labels ?? {});
      setChapterIndex((i) => Math.min(i + 1, CHAPTERS.length - 1));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const back = () => setChapterIndex((i) => Math.max(0, i - 1));

  return (
    <div className="onb onb-wide">
      <div className="quest-shell fade-in">
        <aside className="quest-rail">
          <div className="onb-logo"><Icon name="wallet" size={24} /></div>
          {CHAPTERS.map((c, i) => {
            const done = draft.onboarding.completedChapters.includes(c.id);
            return (
              <button key={c.id} className={`quest-step ${i === chapterIndex ? 'on' : ''} ${done ? 'done' : ''}`} onClick={() => setChapterIndex(i)}>
                <span><Icon name={done ? 'check' : c.icon} size={15} /></span>
                <b>{c.title}</b>
                <em>{c.minutes}</em>
              </button>
            );
          })}
          <div className="quest-privacy"><Icon name="hard-drive" size={14} /> Local-first. Encrypted on disk.</div>
        </aside>
        <main className="quest-main">
          {chapter.id !== 'gmail' ? (
            <>
              <ChapterShell chapter={chapter} index={chapterIndex} draft={draft}>
                {chapter.id === 'you' && (
                  <>
                    <div className="row2">
                      <TextField label="Full name" value={draft.personal.fullName} placeholder="Lov Loothra" onChange={(v) => setObj('personal', 'fullName', v)} />
                      <TextField label="PAN" value={draft.personal.pan} placeholder="ABCDE1234F" onChange={(v) => setObj('personal', 'pan', v.toUpperCase())} hint="Used only for local password candidates." />
                    </div>
                    <div className="row2">
                      <TextField label="Date of birth" type="date" value={draft.personal.dob} onChange={(v) => setObj('personal', 'dob', v)} />
                      <TextField label="City" value={draft.personal.city} placeholder="Bengaluru" onChange={(v) => setObj('personal', 'city', v)} />
                    </div>
                    <div className="row2">
                      <TextField label="Mobile" value={draft.personal.mobile} placeholder="9876543210" onChange={(v) => setObj('personal', 'mobile', v)} />
                      <TextField label="Email" value={draft.personal.email} placeholder="asha@example.com" onChange={(v) => setObj('personal', 'email', v)} />
                    </div>
                    <div className="quest-subhead">Household</div>
                    <div className="row2">
                      <TextField label="Spouse name" value={draft.spouse.fullName} placeholder="Optional" onChange={(v) => setObj('spouse', 'fullName', v)} />
                      <TextField label="Spouse PAN" value={draft.spouse.pan} placeholder="Optional" onChange={(v) => setObj('spouse', 'pan', v.toUpperCase())} />
                    </div>
                    <div className="row2">
                      <TextField label="Dependent name" value={draft.dependents[0].fullName} placeholder="Optional" onChange={(v) => setRow('dependents', 0, 'fullName', v)} />
                      <SelectField label="Relation" value={draft.dependents[0].relation} options={['child', 'parent', 'dependent']} onChange={(v) => setRow('dependents', 0, 'relation', v)} />
                    </div>
                  </>
                )}

                {chapter.id === 'income' && (
                  <div className="row2">
                    <TextField label="Employer" value={draft.employer.name} placeholder="Nexora Systems" onChange={(v) => setObj('employer', 'name', v)} />
                    <TextField label="Monthly net salary (Rs.)" type="number" value={draft.employer.monthlyNetSalary} placeholder="180000" onChange={(v) => setObj('employer', 'monthlyNetSalary', v)} />
                  </div>
                )}

                {chapter.id === 'home' && (
                  <>
                    <div className="row2">
                      <SelectField label="Home type" value={draft.home.ownership} options={['rented', 'owned', 'family']} onChange={(v) => setObj('home', 'ownership', v)} />
                      <SelectField label="City tier" value={draft.home.cityTier} options={['metro', 'non_metro']} onChange={(v) => setObj('home', 'cityTier', v)} />
                    </div>
                    <div className="row2">
                      <TextField label="Monthly rent (Rs.)" type="number" value={draft.home.monthlyRent} placeholder="55000" onChange={(v) => setObj('home', 'monthlyRent', v)} />
                      <TextField label="Landlord / payee" value={draft.home.landlordName} placeholder="R. Venkatesh" onChange={(v) => setObj('home', 'landlordName', v)} />
                    </div>
                    <TextField label="Annual HRA in salary (Rs.)" type="number" value={draft.home.hraInSalary} placeholder="396000" onChange={(v) => setObj('home', 'hraInSalary', v)} />
                  </>
                )}

                {chapter.id === 'money' && (
                  <>
                    {[0, 1].map((i) => (
                      <div className="quest-block" key={`bank-${i}`}>
                        <div className="quest-subhead">Bank account {i + 1}</div>
                        <div className="row2">
                          <InstField label="Bank" category="bank" value={draft.banks[i].institutionId} valueLabel={labels[draft.banks[i].institutionId]} onSelect={(id) => setRow('banks', i, 'institutionId', id)} />
                          <TextField label="Account last 4" value={draft.banks[i].last4} placeholder="4821" onChange={(v) => setRow('banks', i, 'last4', v.replace(/\D/g, '').slice(0, 4))} />
                        </div>
                      </div>
                    ))}
                    {[0, 1].map((i) => (
                      <div className="quest-block" key={`card-${i}`}>
                        <div className="quest-subhead">Credit card {i + 1}</div>
                        <div className="row3">
                          <InstField label="Issuer" category="credit_card_issuer" value={draft.cards[i].institutionId} valueLabel={labels[draft.cards[i].institutionId]} onSelect={(id) => setRow('cards', i, 'institutionId', id)} />
                          <InstField label="Which card?" category="credit_card_product" value={draft.cards[i].productId} valueLabel={labels[draft.cards[i].productId]} onSelect={(id) => setRow('cards', i, 'productId', id)} />
                          <TextField label="Card last 4" value={draft.cards[i].last4} placeholder="7702" onChange={(v) => setRow('cards', i, 'last4', v.replace(/\D/g, '').slice(0, 4))} />
                        </div>
                      </div>
                    ))}
                    <div className="quest-subhead">Loans & EMIs</div>
                    <div className="row2">
                      <SelectField label="Loan type" value={draft.loans[0].kind} options={['home', 'auto', 'personal', 'education']} onChange={(v) => setRow('loans', 0, 'kind', v)} />
                      <TextField label="Monthly EMI (Rs.)" type="number" value={draft.loans[0].emiAmount} placeholder="65000" onChange={(v) => setRow('loans', 0, 'emiAmount', v)} />
                    </div>
                  </>
                )}

                {chapter.id === 'spending' && (
                  <>
                    <div className="quest-subhead">Known subscriptions</div>
                    {[0, 1, 2].map((i) => (
                      <div className="row3" key={`sub-${i}`}>
                        <TextField label={`Subscription ${i + 1}`} value={draft.subscriptions[i].name} placeholder={i === 0 ? 'Cursor AI' : 'Optional'} onChange={(v) => setRow('subscriptions', i, 'name', v)} />
                        <TextField label="Amount (Rs.)" type="number" value={draft.subscriptions[i].amount} onChange={(v) => setRow('subscriptions', i, 'amount', v)} />
                        <SelectField label="Cadence" value={draft.subscriptions[i].cadence} options={['monthly', 'quarterly', 'yearly']} onChange={(v) => setRow('subscriptions', i, 'cadence', v)} />
                      </div>
                    ))}
                    <div className="quest-subhead">Household payments</div>
                    <div className="row3">
                      <TextField label="Payee name" value={draft.houseHelp[0].name} placeholder="Lakshmi" onChange={(v) => setRow('houseHelp', 0, 'name', v)} />
                      <SelectField label="Role" value={draft.houseHelp[0].role} options={['maid', 'cook', 'driver', 'nanny', 'gardener']} onChange={(v) => setRow('houseHelp', 0, 'role', v)} />
                      <TextField label="Monthly amount (Rs.)" type="number" value={draft.houseHelp[0].monthlyAmount} placeholder="12000" onChange={(v) => setRow('houseHelp', 0, 'monthlyAmount', v)} />
                    </div>
                    <div className="quest-subhead">Big projects</div>
                    <div className="row3">
                      <TextField label="Project" value={draft.projects[0].name} placeholder="Goa anniversary trip" onChange={(v) => setRow('projects', 0, 'name', v)} />
                      <TextField label="Budget (Rs.)" type="number" value={draft.projects[0].budget} onChange={(v) => setRow('projects', 0, 'budget', v)} />
                      <TextField label="Hints" value={draft.projects[0].categoryHints} placeholder="travel, hotel" onChange={(v) => setRow('projects', 0, 'categoryHints', v)} />
                    </div>
                  </>
                )}

                {chapter.id === 'future' && (
                  <>
                    <div className="quest-subhead">Investments</div>
                    <div className="row3">
                      <InstField label="Broker" category="broker" value={draft.brokers[0].institutionId} valueLabel={labels[draft.brokers[0].institutionId]} onSelect={(id) => setRow('brokers', 0, 'institutionId', id)} />
                      <TextField label="Broker name" value={draft.brokers[0].name} placeholder="Groww" onChange={(v) => setRow('brokers', 0, 'name', v)} />
                      <SelectField label="Tax section" value={draft.brokers[0].taxSection} options={['none', '80C', '80CCD1B']} onChange={(v) => setRow('brokers', 0, 'taxSection', v)} />
                    </div>
                    <div className="row3">
                      <InstField label="NPS / platform" category="investment_platform" value={draft.investmentPlatforms[0].institutionId} valueLabel={labels[draft.investmentPlatforms[0].institutionId]} onSelect={(id) => setRow('investmentPlatforms', 0, 'institutionId', id)} />
                      <TextField label="Platform name" value={draft.investmentPlatforms[0].name} placeholder="HDFC Pension" onChange={(v) => setRow('investmentPlatforms', 0, 'name', v)} />
                      <SelectField label="Kind" value={draft.investmentPlatforms[0].kind} options={['mutual_fund', 'nps', 'pension', 'gold']} onChange={(v) => setRow('investmentPlatforms', 0, 'kind', v)} />
                    </div>
                    <div className="quest-subhead">Insurance</div>
                    <div className="row3">
                      <InstField label="Insurer" category="insurer" value={draft.insurers[0].institutionId} valueLabel={labels[draft.insurers[0].institutionId]} onSelect={(id) => setRow('insurers', 0, 'institutionId', id)} />
                      <SelectField label="Type" value={draft.insurers[0].kind} options={['health', 'term', 'life', 'vehicle']} onChange={(v) => setRow('insurers', 0, 'kind', v)} />
                      <TextField label="Annual premium (Rs.)" type="number" value={draft.insurers[0].premium} placeholder="31200" onChange={(v) => setRow('insurers', 0, 'premium', v)} />
                    </div>
                    <div className="quest-subhead">Goals & tax</div>
                    <div className="row3">
                      <TextField label="Savings target (%)" type="number" value={draft.goals.savingsRateTarget} placeholder="45" onChange={(v) => setObj('goals', 'savingsRateTarget', v)} />
                      <TextField label="Retirement age" type="number" value={draft.goals.retirementAge} placeholder="50" onChange={(v) => setObj('goals', 'retirementAge', v)} />
                      <SelectField label="Tax regime" value={draft.tax.regimePreference} options={['compare', 'old', 'new']} onChange={(v) => setObj('tax', 'regimePreference', v)} />
                    </div>
                  </>
                )}
              </ChapterShell>
              {error && <div className="note warn"><span className="ic"><Icon name="triangle-alert" size={16} /></span><span>{error}</span></div>}
              <div className="quest-actions">
                <button className="btn btn-ghost" onClick={back} disabled={chapterIndex === 0 || saving}><Icon name="arrow-left" size={15} />Back</button>
                {chapter.id !== 'you' && <button className="btn btn-secondary" onClick={() => saveAndMove(true)} disabled={saving}>Skip mission</button>}
                <button className="btn btn-primary" onClick={() => saveAndMove(false)} disabled={saving}>{saving ? 'Saving...' : chapterIndex === CHAPTERS.length - 2 ? 'Save profile & connect Gmail' : 'Save & continue'}<Icon name="arrow-right" size={15} /></button>
              </div>
            </>
          ) : (
            <GmailQuest draft={draft} onBack={back} onFinish={() => router.push('/')} initialError={gmailError} />
          )}
        </main>
      </div>
    </div>
  );
}

function GmailQuest({ draft, onBack, onFinish, initialError }: { draft: Draft; onBack: () => void; onFinish: () => void; initialError: string | null }) {
  const [hasClient, setHasClient] = useState<boolean | null>(null);
  const [clientJson, setClientJson] = useState('');
  const [savingClient, setSavingClient] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [stage, setStage] = useState<'connect' | 'testing' | 'tested' | 'import' | 'done'>('connect');
  const [estimate, setEstimate] = useState<Estimate | null>(null);

  const runEstimate = useCallback(async () => {
    setStage('testing');
    setError(null);
    try {
      const res = await fetch(`/api/gmail/estimate?fy=${FY}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Estimate failed');
      setEstimate(data);
      setStage('tested');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Estimate failed');
      setStage('connect');
    }
  }, []);

  useEffect(() => {
    fetch('/api/oauth/client')
      .then((r) => r.json())
      .then((d) => setHasClient(Boolean(d.hasClient)))
      .catch(() => setHasClient(false));
  }, []);

  useEffect(() => {
    const connected = sessionStorage.getItem('pf_gmail_connected') === '1';
    if (connected) sessionStorage.removeItem('pf_gmail_connected');
    if (connected && !initialError) void runEstimate();
  }, [runEstimate, initialError]);

  const saveClient = async () => {
    setSavingClient(true);
    setError(null);
    try {
      const res = await fetch('/api/oauth/client', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ json: clientJson }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to save client');
      setHasClient(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save client');
    } finally {
      setSavingClient(false);
    }
  };

  const connect = async () => {
    setError(null);
    try {
      const res = await fetch('/api/auth/google/start');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not start OAuth');
      sessionStorage.setItem('pf_gmail_connected', '1');
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start OAuth');
    }
  };

  return (
    <ChapterShell chapter={CHAPTERS[6]} index={6} draft={draft}>
      {stage === 'import' ? (
        <ImportRun onDone={() => setStage('done')} />
      ) : stage === 'done' ? (
        <div className="onb-card center" style={{ padding: 0, border: 0, boxShadow: 'none' }}>
          <div className="check-pop"><Icon name="sparkles" size={34} /></div>
          <h2>Your first ledger is ready.</h2>
          <p className="lead">Your profile, statements and evidence are indexed locally. You can edit the profile and re-run import from the workbench anytime.</p>
          <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={onFinish}>Open the workbench</button>
        </div>
      ) : stage === 'testing' ? (
        <div className="center">
          <div className="scan-ring" />
          <h2 style={{ fontSize: 19 }}>Running profile-aware Gmail estimate...</h2>
          <p className="lead">The query builder is using the profile you just saved.</p>
        </div>
      ) : stage === 'tested' && estimate ? (
        <>
          <div className="check-pop"><Icon name="check" size={38} strokeWidth={2.4} /></div>
          <div className="reason-box">
            <div className="kv" style={{ borderTop: 0, paddingTop: 0 }}><span className="k">Messages matched</span><span className="v">{estimate.messageCount.toLocaleString('en-IN')}</span></div>
            <div className="kv"><span className="k">Estimated download</span><span className="v">about {estimate.humanEstimate}</span></div>
            <div className="kv"><span className="k">Providers</span><span className="v">{estimate.senders.slice(0, 4).join(', ') || 'Profile-scoped'}</span></div>
          </div>
          <div className="quest-actions">
            <button className="btn btn-ghost" onClick={onBack}><Icon name="arrow-left" size={15} />Back</button>
            <button className="btn btn-primary" onClick={() => setStage('import')}>Import Gmail evidence<Icon name="arrow-right" size={15} /></button>
          </div>
        </>
      ) : (
        <>
          {error && <div className="note warn"><span className="ic"><Icon name="triangle-alert" size={16} /></span><span>{error}</span></div>}
          {hasClient === false ? (
            <>
              <p className="lead">One-time setup: paste your own Google Cloud Desktop OAuth client JSON. The app asks only for Gmail read-only access.</p>
              <div className="field">
                <label>OAuth client JSON</label>
                <textarea className="inp" style={{ minHeight: 116, fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }} value={clientJson} onChange={(e) => setClientJson(e.target.value)} placeholder='{ "installed": { "client_id": "...", "client_secret": "..." } }' />
              </div>
              <div className="quest-actions">
                <button className="btn btn-ghost" onClick={onBack}><Icon name="arrow-left" size={15} />Back</button>
                <button className="btn btn-primary" disabled={savingClient || !clientJson.trim()} onClick={saveClient}>{savingClient ? 'Saving...' : 'Save client'}</button>
              </div>
            </>
          ) : (
            <>
              <div className="reason-box">
                <div className="step"><span className="n"><Icon name="check" size={11} /></span><div>Uses your latest saved profile to scope provider queries</div></div>
                <div className="step"><span className="n"><Icon name="check" size={11} /></span><div>Gmail read-only scope; cannot send, delete, or modify mail</div></div>
                <div className="step"><span className="n"><Icon name="check" size={11} /></span><div>Attachments and tokens stay encrypted on this device</div></div>
              </div>
              <div className="quest-actions">
                <button className="btn btn-ghost" onClick={onBack}><Icon name="arrow-left" size={15} />Back</button>
                <button className="gbtn" onClick={connect} disabled={hasClient === null}>Connect Gmail (read-only)</button>
              </div>
            </>
          )}
        </>
      )}
    </ChapterShell>
  );
}

function ImportRun({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<'idle' | 'consent' | 'running' | 'done'>('idle');
  const [pct, setPct] = useState(0);
  const [lines, setLines] = useState<{ text: string; kind: string }[]>([]);
  const [consent, setConsent] = useState<{ human: string; messageCount: number } | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);
  const totalRef = useRef(0);

  const log = (text: string, kind = '') => setLines((p) => [...p, { text, kind }]);

  const run = useCallback((yes: boolean) => {
    setPhase('running');
    setLines([]);
    setPct(0);
    const es = new EventSource(`/api/gmail/import?fy=${FY}${yes ? '&yes=1' : ''}`);
    esRef.current = es;
    es.onmessage = (ev) => {
      const e = JSON.parse(ev.data) as { phase: string; message?: string; messageCount?: number; attachmentCount?: number };
      switch (e.phase) {
        case 'estimate':
          if (e.messageCount) totalRef.current = e.messageCount;
          log(e.message ?? 'Estimating...', 'dim');
          break;
        case 'consent_required':
          es.close();
          setConsent({ human: e.message?.replace(/^.*about /, '') ?? 'over 1 GB', messageCount: e.messageCount ?? 0 });
          setPhase('consent');
          break;
        case 'fetch':
          if (e.messageCount && totalRef.current) setPct(Math.min(99, Math.round((e.messageCount / totalRef.current) * 100)));
          log(e.message ?? `Fetched ${e.messageCount ?? 0} messages`);
          break;
        case 'attachment':
          log(e.message ?? 'attachment', 'ok');
          break;
        case 'done':
          es.close();
          setPct(100);
          log(e.message ?? 'Import complete', 'ok');
          setPhase('done');
          onDone();
          break;
        case 'error':
          es.close();
          log(`Error: ${e.message}`, 'warn');
          break;
        default:
          // Ingest phases (parse/classify/review) and any future ones — without
          // this the log froze at "processing…" for the whole ingest stage.
          if (e.message) log(e.message, 'dim');
          break;
      }
    };
    es.onerror = () => es.close();
  }, [onDone]);

  useEffect(() => {
    run(false);
    return () => esRef.current?.close();
  }, [run]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = 9999;
  }, [lines]);

  if (phase === 'consent' && consent) {
    return (
      <>
        <div className="note warn"><span className="ic"><Icon name="hard-drive-download" size={18} /></span><span>This import will download about {consent.human} locally.</span></div>
        <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={() => run(true)}>Download & import</button>
      </>
    );
  }

  return (
    <>
      <div className="imp-bar"><i style={{ width: pct + '%' }} /></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 14 }}>
        <span className="muted">{phase === 'done' ? 'Done' : 'Working locally'}</span>
        <span className="fig">{pct}%</span>
      </div>
      <div className="imp-log" ref={logRef}>
        {lines.map((l, i) => <div key={i} className={l.kind}>{l.kind === 'ok' ? 'ok ' : l.kind === 'warn' ? 'err ' : '> '}{l.text}</div>)}
        {phase === 'running' && <div className="dim">...</div>}
      </div>
    </>
  );
}

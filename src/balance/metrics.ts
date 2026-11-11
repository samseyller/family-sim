/**
 * Balance metrics: turn LifeSamples into one flat record of numbers ("career.nw65.gen1": 1.9e6),
 * check them against design bands, and compare them with a saved baseline to catch drift.
 */
import { ACHIEVEMENTS } from '../content/achievements';
import type { Strategy } from '../engine/strategies';
import { SAMPLE_AGES, STRATEGIES, type LifeSample } from './simulate';

export type Metrics = Record<string, number>;
export type SamplesByStrategy = Record<Strategy, LifeSample[]>;

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const ratio = (a: number, b: number) => (b ? a / b : 0);
const round = (n: number) => (Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10000) / 10000);

export function summarize(samples: SamplesByStrategy): Metrics {
  const m: Metrics = {};
  const all = STRATEGIES.flatMap((st) => samples[st]);
  for (const st of STRATEGIES) {
    const lives = samples[st];
    const p = `${st}.`;
    for (const age of SAMPLE_AGES) m[`${p}nw${age}`] = median(lives.flatMap((l) => l.netWorthAt[age] ?? []));
    const nw65 = lives.flatMap((l) => l.netWorth65);
    m[`${p}nw65.gen1`] = median(nw65.filter(([g]) => g === 1).map(([, v]) => v));
    m[`${p}nw65.gen2`] = median(nw65.filter(([g]) => g === 2).map(([, v]) => v));
    m[`${p}nw65.gen3+`] = median(nw65.filter(([g]) => g >= 3).map(([, v]) => v));
    m[`${p}wealthGrowth`] = ratio(m[`${p}nw65.gen3+`], m[`${p}nw65.gen1`]);
    const income = lives.reduce((n, l) => n + l.income, 0);
    m[`${p}savingsRate`] = 1 - ratio(lives.reduce((n, l) => n + l.expenses, 0), income);
    m[`${p}debtShare`] = ratio(lives.reduce((n, l) => n + l.debtYears, 0), lives.reduce((n, l) => n + l.adultYears, 0));
    m[`${p}lifespan`] = mean(lives.flatMap((l) => l.lifespans));
    m[`${p}generations`] = mean(lives.map((l) => l.generations));
    m[`${p}endedEarly`] = mean(lives.map((l) => (l.ended ? 1 : 0)));
    m[`${p}inheritance`] = median(lives.flatMap((l) => l.inheritances));
    for (const k of ['total', 'wealth', 'bonds', 'achievement', 'wellbeing'] as const) m[`${p}legacy${k === 'total' ? '' : `.${k}`}`] = median(lives.map((l) => l.legacy[k]));
  }
  const legacies = STRATEGIES.map((st) => m[`${st}.legacy`]);
  m['all.legacyBalance'] = ratio(Math.min(...legacies), Math.max(...legacies));
  m['all.violations'] = all.reduce((n, l) => n + l.violations.length, 0);
  m['all.runawayDebt'] = mean(all.map((l) => (l.runawayDebt ? 1 : 0)));

  const kids = all.reduce((t, l) => { for (const k of Object.keys(t) as (keyof typeof t)[]) t[k] += l.kids[k]; return t; },
    { n: 0, athlete: 0, varsity: 0, scholarship: 0, pro: 0, allStar: 0, served: 0, fallen: 0, degree: 0, topDegree: 0 });
  m['kids.perLife'] = ratio(kids.n, all.length);
  m['kids.athlete'] = ratio(kids.athlete, kids.n);
  m['kids.varsity'] = ratio(kids.varsity, kids.n);
  m['kids.scholarship'] = ratio(kids.scholarship, kids.n);
  m['kids.pro'] = ratio(kids.pro, kids.n);
  m['kids.allStar'] = ratio(kids.allStar, kids.n);
  m['kids.proPerAthlete'] = ratio(kids.pro, kids.athlete);
  m['kids.served'] = ratio(kids.served, kids.n);
  m['kids.fallenPerServed'] = ratio(kids.fallen, kids.served);
  m['kids.degree'] = ratio(kids.degree, kids.n);
  m['kids.topDegree'] = ratio(kids.topDegree, kids.n);

  for (const a of ACHIEVEMENTS) m[`ach.${a.id}`] = mean(all.map((l) => (l.achievements.includes(a.id) ? 1 : 0)));
  const years = all.reduce((n, l) => n + l.years, 0);
  const events: Record<string, number> = {};
  for (const l of all) for (const [id, n] of Object.entries(l.events)) events[id] = (events[id] ?? 0) + n;
  for (const [id, n] of Object.entries(events)) m[`event.${id}`] = ratio(n, years);
  for (const k of Object.keys(m)) m[k] = round(m[k]);
  return m;
}

// ── Design bands: what "balanced" means. A value outside its band is a real problem. ──────────

/** `known`: a gap we know about and haven't fixed yet; reported as a warning, not a failure. */
export interface Band { key: string; min?: number; max?: number; why: string; known?: string }

const perStrategy = (suffix: string, min: number | undefined, max: number | undefined, why: string): Band[] =>
  STRATEGIES.map((st) => ({ key: `${st}.${suffix}`, min, max, why }));

export const BANDS: Band[] = [
  { key: 'all.violations', max: 0, why: 'Broken invariants: NaN money, stats outside 0–100, or an event with no available choice.' },
  { key: 'all.runawayDebt', max: 0.05, why: 'Lives stuck over $1M in debt for a decade should be very rare.' },
  ...perStrategy('nw35', -100_000, 500_000, 'Net worth at 35: early adulthood should be tight but recoverable.'),
  ...perStrategy('nw65.gen1', 400_000, 4_000_000, 'A first-generation working life should end comfortable, not rich beyond need.'),
  ...perStrategy('wealthGrowth', 0.8, 4.5, 'Wealth should level off across generations (siblings, probate, costs), not snowball.'),
  ...perStrategy('savingsRate', 0.02, 0.45, 'Money should feel scarce: neither always broke nor effortless.'),
  ...perStrategy('debtShare', 0.01, 0.3, 'Debt should happen sometimes but not dominate a life.'),
  ...perStrategy('lifespan', 62, 92, 'Played characters should mostly live a full life.'),
  ...perStrategy('generations', 2, 6, 'A 120-year run should pass the torch at least once or twice.'),
  ...perStrategy('endedEarly', undefined, 0.75, 'Most family lines should survive 120 years. (Scripted players pick randomly at baby and marriage choices, so this runs high.)'),
  // Over 500 lives per style this is ~87%; the 60-life sample swings ±15 points, hence 0.6.
  { key: 'all.legacyBalance', min: 0.6, why: 'No play style (career, family, balanced) should trail the best by much (median legacy score).' },
  { key: 'kids.proPerAthlete', min: 0.01, max: 0.12, why: 'Going pro should be possible but rare (~1 in 20 athletes).' },
  { key: 'kids.fallenPerServed', max: 0.03, why: 'Deaths in service must stay rare.' },
  { key: 'kids.degree', min: 0.15, max: 0.85, why: 'College should be common but not universal.' },
];

export interface BandFailure extends Band { value: number | undefined }

export function checkBands(m: Metrics, bands = BANDS): BandFailure[] {
  return bands
    .map((b) => ({ ...b, value: m[b.key] }))
    .filter((b) => b.value === undefined || (b.min !== undefined && b.value < b.min) || (b.max !== undefined && b.value > b.max));
}

// ── Drift: compare with the committed baseline. ───────────────────────────────────────────────

export interface Drift { key: string; before: number; after: number; reason: string }

/**
 * How far a metric may move before it counts as drift. Measured: the same code on three different
 * sets of 60 seeds per style spreads money medians by up to ~35%, savings rates by ~8 points and
 * "line ended" by ~15 points, so tolerances sit just above that. Any engine change that adds or
 * removes a random roll reshuffles every life, so drift must be bigger than seed noise to count.
 * Achievement and event rates are only checked for content going dead.
 */
export function tolerance(key: string): { rel?: number; abs?: number; deadOnly?: boolean } {
  if (key.startsWith('ach.') || key.startsWith('event.')) return { deadOnly: true };
  if (key === 'all.violations') return { abs: 0 };
  if (key === 'kids.perLife') return { rel: 0.25 };
  if (key.startsWith('kids.')) return { abs: 0.03, rel: 0.6 };
  if (key.endsWith('.inheritance')) return { rel: 2.5 }; // few inheritances per life: very noisy, so only flags huge shifts
  if (key.endsWith('.legacy.achievement') || key.endsWith('.legacy.wellbeing')) return { abs: 25 };
  if (key.endsWith('.legacy.bonds')) return { abs: 10 };
  if (/\.(nw\d+|nw65\.gen|legacy\.wealth)/.test(key)) return { rel: 0.4, abs: 60_000 };
  if (key.endsWith('.endedEarly')) return { abs: 0.2 };
  if (key.endsWith('.savingsRate')) return { abs: 0.1 };
  if (key.endsWith('.debtShare') || key === 'all.runawayDebt') return { abs: 0.05 };
  if (key === 'all.legacyBalance') return { abs: 0.25 };
  if (key.endsWith('.wealthGrowth')) return { rel: 0.35 };
  if (key.endsWith('.lifespan')) return { abs: 4 };
  if (key.endsWith('.generations')) return { abs: 0.6 };
  return { rel: 0.3, abs: 5 }; // legacy scores and anything new
}

/** Content rarer than this can vanish from a sample by chance, so it isn't checked for going dead. */
export const DEAD_CHECK_MIN = { ach: 0.02, event: 0.002 };

export function compareToBaseline(now: Metrics, base: Metrics): Drift[] {
  const out: Drift[] = [];
  for (const [key, before] of Object.entries(base)) {
    const after = now[key] ?? (key.startsWith('ach.') || key.startsWith('event.') ? 0 : undefined);
    const t = tolerance(key);
    if (after === undefined) {
      out.push({ key, before, after: NaN, reason: 'metric disappeared' });
      continue;
    }
    if (t.deadOnly) {
      const min = key.startsWith('ach.') ? DEAD_CHECK_MIN.ach : DEAD_CHECK_MIN.event;
      if (before >= min && after === 0) out.push({ key, before, after, reason: 'no longer happens in any simulated life' });
      continue;
    }
    const diff = Math.abs(after - before);
    // Within tolerance if inside either the absolute or the relative allowance.
    const ok = (t.abs !== undefined && diff <= t.abs) || (t.rel !== undefined && diff <= Math.abs(before) * t.rel);
    if (!ok) out.push({ key, before, after, reason: `moved ${before ? `${Math.round(((after - before) / Math.abs(before)) * 100)}%` : `by ${round(after - before)}`}` });
  }
  return out;
}

// ── Reporting ────────────────────────────────────────────────────────────────────────────────

export const fmt = (key: string, v: number | undefined) => {
  if (v === undefined || Number.isNaN(v)) return '—';
  if (/\.(nw\d+|nw65\.gen|inheritance)/.test(key)) return `$${Math.round(v / 1000).toLocaleString('en-US')}k`;
  if (key.startsWith('ach.') || key.startsWith('kids.') && key !== 'kids.perLife' || /\.(savingsRate|debtShare|endedEarly)$/.test(key) || key === 'all.legacyBalance' || key === 'all.runawayDebt') return `${(v * 100).toFixed(1)}%`;
  return Math.abs(v) >= 100 ? Math.round(v).toLocaleString('en-US') : String(Math.round(v * 100) / 100);
};

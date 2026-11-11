/** A readable Markdown balance report: failures first, then the numbers, then content coverage. */
import { ACHIEVEMENTS } from '../content/achievements';
import { EVENT_BY_ID } from '../engine/events';
import { DEAD_CHECK_MIN, fmt, type BandFailure, type Drift, type Metrics } from './metrics';
import { STRATEGIES, type LifeSample } from './simulate';

export interface Baseline {
  meta: { lives: number; seedFrom: number; maxYears: number; rulesVersion: string; updated: string };
  metrics: Metrics;
}

export interface ReportInput {
  title: string;
  metrics: Metrics;
  failures: BandFailure[];
  drift: Drift[];
  baseline?: Baseline;
  /** Extra sections (the deep run adds spreads and violations). */
  extra?: string[];
}

const ROWS: [string, string][] = [
  ['nw35', 'Net worth at 35 (median)'],
  ['nw45', 'Net worth at 45'],
  ['nw65', 'Net worth at 65'],
  ['nw75', 'Net worth at 75'],
  ['nw65.gen1', 'At 65, first generation'],
  ['nw65.gen2', 'At 65, second generation'],
  ['nw65.gen3+', 'At 65, third generation on'],
  ['wealthGrowth', 'Wealth growth, gen 3+ ÷ gen 1'],
  ['inheritance', 'Inheritance (median)'],
  ['savingsRate', 'Savings rate'],
  ['debtShare', 'Adult years in debt'],
  ['lifespan', 'Lifespan of played characters'],
  ['generations', 'Generations in 120 years'],
  ['endedEarly', 'Family line ended early'],
  ['legacy', 'Legacy score (median)'],
  ['legacy.bonds', 'Legacy: family bonds'],
  ['legacy.wellbeing', 'Legacy: wellbeing'],
];

const KIDS: [string, string][] = [
  ['kids.perLife', 'Children per life who reached 25'],
  ['kids.degree', 'Earned a degree'],
  ['kids.topDegree', 'Top-university degree'],
  ['kids.athlete', 'Played sports'],
  ['kids.varsity', 'Made varsity'],
  ['kids.scholarship', 'Athletic scholarship'],
  ['kids.pro', 'Went pro'],
  ['kids.proPerAthlete', 'Went pro, per athlete'],
  ['kids.allStar', 'All-Star'],
  ['kids.served', 'Served in the military'],
  ['kids.fallenPerServed', 'Died in service, per veteran'],
];

const cell = (key: string, m: Metrics, base?: Metrics) => {
  const now = fmt(key, m[key]);
  return base && base[key] !== undefined ? `${now} <sub>(${fmt(key, base[key])})</sub>` : now;
};

export function renderReport({ title, metrics: m, failures, drift, baseline, extra = [] }: ReportInput): string {
  const base = baseline?.metrics;
  const hard = failures.filter((f) => !f.known);
  const known = failures.filter((f) => f.known);
  const out: string[] = [`# ${title}`, ''];
  const ok = !hard.length && !drift.length;
  out.push(ok ? '**Result: pass.** Every metric is inside its design band' + (base ? ' and close to the baseline.' : '.') : '**Result: FAIL.**', '');
  if (hard.length) {
    out.push('## Outside the design bands', '');
    for (const f of hard) out.push(`- **${f.key}** = ${fmt(f.key, f.value)} (band ${f.min !== undefined ? fmt(f.key, f.min) : '…'} to ${f.max !== undefined ? fmt(f.key, f.max) : '…'}). ${f.why}`);
    out.push('');
  }
  if (drift.length) {
    out.push('## Drift from the baseline', '', 'If the change was intended, run `npm run balance:update` and commit the new baseline.', '');
    for (const d of drift) out.push(`- **${d.key}**: ${fmt(d.key, d.before)} → ${fmt(d.key, d.after)} (${d.reason})`);
    out.push('');
  }
  if (known.length) {
    out.push('## Known issues (warnings)', '');
    for (const f of known) out.push(`- **${f.key}** = ${fmt(f.key, f.value)} (want ${f.min !== undefined ? `≥ ${fmt(f.key, f.min)}` : ''}${f.max !== undefined ? ` ≤ ${fmt(f.key, f.max)}` : ''}). ${f.known}`);
    out.push('');
  }

  out.push('## By play style', '', base ? 'Baseline values in (parentheses).' : '', '');
  out.push(`| Metric | ${STRATEGIES.join(' | ')} |`, `|---|${STRATEGIES.map(() => '---:').join('|')}|`);
  for (const [k, label] of ROWS) out.push(`| ${label} | ${STRATEGIES.map((st) => cell(`${st}.${k}`, m, base)).join(' | ')} |`);
  out.push('', `Legacy balance (weakest style ÷ strongest): ${cell('all.legacyBalance', m, base)} · runaway debt: ${cell('all.runawayDebt', m, base)} of lives · invariant violations: ${m['all.violations']}`, '');

  out.push('## Children’s lives', '', '| | Share |', '|---|---:|');
  for (const [k, label] of KIDS) out.push(`| ${label} | ${cell(k, m, base)} |`);
  out.push('');

  const achieved = ACHIEVEMENTS.map((a) => ({ a, v: m[`ach.${a.id}`] ?? 0 }));
  const never = achieved.filter((x) => x.v === 0).map((x) => x.a.title);
  out.push('## Content coverage', '');
  out.push(`Achievements unlocked in at least one life: ${achieved.length - never.length} of ${achieved.length}.`);
  out.push(`Most common: ${[...achieved].sort((a, b) => b.v - a.v).slice(0, 6).map((x) => `${x.a.title} ${fmt('ach.', x.v)}`).join(', ')}.`);
  out.push(`Rare (under ${fmt('ach.', DEAD_CHECK_MIN.ach)} of lives): ${achieved.filter((x) => x.v > 0 && x.v < DEAD_CHECK_MIN.ach).map((x) => x.a.title).join(', ') || 'none'}.`);
  out.push(`Never reached by the scripted players: ${never.join(', ') || 'none'}.`, '');
  const neverEvents = Object.keys(EVENT_BY_ID).filter((id) => !m[`event.${id}`]);
  out.push(`Events seen: ${Object.keys(EVENT_BY_ID).length - neverEvents.length} of ${Object.keys(EVENT_BY_ID).length}. Never fired: ${neverEvents.join(', ') || 'none'}.`, '');
  out.push('Scripted players never pick hobbies or sports for themselves, invest, buy upgrades, move cities, adopt dogs or date around, so content behind those choices shows as never reached here.', '');

  out.push(...extra);
  if (baseline) out.push(`<sub>Baseline: ${baseline.meta.lives} lives per style from seed ${baseline.meta.seedFrom}, rules ${baseline.meta.rulesVersion}, updated ${baseline.meta.updated}.</sub>`, '');
  return out.join('\n');
}

const pct = (xs: number[], q: number) => { if (!xs.length) return 0; const a = [...xs].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(q * a.length))]; };
const k = (n: number) => `$${Math.round(n / 1000).toLocaleString('en-US')}k`;

/** Deep-run extras: how wide the outcomes spread, and every broken invariant found. */
export function spreadSection(samples: Record<string, LifeSample[]>): string[] {
  const out = ['## Spread of outcomes', '', '| Net worth at 65 | 10th pct | median | 90th pct | richest |', '|---|---:|---:|---:|---:|'];
  for (const st of STRATEGIES) {
    const xs = samples[st].flatMap((l) => l.netWorthAt[65] ?? []);
    out.push(`| ${st} | ${k(pct(xs, 0.1))} | ${k(pct(xs, 0.5))} | ${k(pct(xs, 0.9))} | ${k(pct(xs, 1))} |`);
  }
  out.push('');
  const v = Object.entries(samples).flatMap(([st, ls]) => ls.flatMap((l) => l.violations.map((x) => `${st} seed ${l.seed}, ${x}`)));
  out.push('## Invariant violations', '', v.length ? v.slice(0, 40).map((x) => `- ${x}`).join('\n') : 'None.', '');
  const debt = Object.entries(samples).flatMap(([st, ls]) => ls.filter((l) => l.runawayDebt).map((l) => `${st} ${l.seed}`));
  out.push(`Lives with runaway debt (seed, to replay): ${debt.slice(0, 30).join(', ') || 'none'}${debt.length > 30 ? ', …' : ''}.`, '');
  return out;
}


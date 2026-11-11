/**
 * Headless play for balance measurement. Plays whole family lines with a scripted strategy and
 * records one LifeSample per run: plain JSON, so runs can be split across processes and merged.
 * Pure engine code (no Node APIs), shared by the balance tests and scripts/balance.ts.
 */
import { estimateYear } from '../engine/budget';
import { netWorth } from '../engine/finance';
import { newGame } from '../engine/generate';
import { buildMemorial } from '../engine/memorial';
import { autoplayYear, chooseHeir, eligibleHeirs, updatePlan } from '../engine/phases';
import { makeRng } from '../engine/rng';
import { strategyPlan, type Strategy } from '../engine/strategies';
import type { GameState } from '../engine/types';
import { active, ageOf, alive } from '../engine/util';
import { track } from '../profile/tracker';
import { newProfile } from '../profile/types';

export const STRATEGIES: Strategy[] = ['career', 'family', 'balanced'];
export const SAMPLE_AGES = [35, 45, 55, 65, 75] as const;

export interface LifeSample {
  seed: number;
  years: number;
  /** The family line ended (no heirs) before the year limit. */
  ended: boolean;
  generations: number;
  legacy: { wealth: number; bonds: number; achievement: number; wellbeing: number; total: number };
  /** Age at death of each played character. */
  lifespans: number[];
  /** Net worth of the played household when the played character reached each sample age. */
  netWorthAt: Partial<Record<number, number[]>>;
  /** [generation, net worth] when a played character turned 65. */
  netWorth65: [number, number][];
  income: number;
  expenses: number;
  adultYears: number;
  debtYears: number;
  inheritances: number[];
  achievements: string[];
  events: Record<string, number>;
  /** People born during play who reached 25 (or died): how their lives went. */
  kids: { n: number; athlete: number; varsity: number; scholarship: number; pro: number; allStar: number; served: number; fallen: number; degree: number; topDegree: number };
  /** The played household stayed over $1M in debt for 10+ years (a spiral with no way out). */
  runawayDebt: boolean;
  /** Broken invariants (NaN money, stats out of range, events with no possible choice, ...). */
  violations: string[];
}

const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n);

/** Invariants that must hold every year of every life. */
export function checkInvariants(s: GameState): string[] {
  const out: string[] = [];
  for (const hh of Object.values(s.households)) {
    if (!finite(hh.wallet)) out.push(`household ${hh.id}: wallet is ${hh.wallet}`);
    if (hh.investments !== undefined && !finite(hh.investments)) out.push(`household ${hh.id}: investments are ${hh.investments}`);
    for (const a of hh.assets) if (!finite(a.value) || !finite(a.mortgage)) out.push(`household ${hh.id}: asset ${a.kind} value ${a.value} mortgage ${a.mortgage}`);
  }
  for (const p of Object.values(s.people)) {
    if (!alive(p)) continue;
    for (const [k, v] of Object.entries(p.stats)) if (!finite(v) || v < 0 || v > 100) out.push(`${p.firstName} (${p.id}): ${k} = ${v}`);
    for (const [k, v] of Object.entries(p.skills)) if (v !== undefined && (!finite(v) || v < 0 || v > 100)) out.push(`${p.firstName} (${p.id}): skill ${k} = ${v}`);
    if (p.retirementSavings !== undefined && !finite(p.retirementSavings)) out.push(`${p.firstName} (${p.id}): retirement savings ${p.retirementSavings}`);
  }
  return out;
}

/** Play one family line for up to `maxYears` with a strategy; random (but valid) event choices. */
export function playLife(strategy: Strategy, seed: number, maxYears = 120): LifeSample {
  const r = makeRng(seed * 31 + 7);
  let s = newGame(seed);
  const startYear = s.year;
  let profile = track(newProfile(), null, s, '').profile;
  const sample: LifeSample = {
    seed, years: 0, ended: false, generations: 0, legacy: { wealth: 0, bonds: 0, achievement: 0, wellbeing: 0, total: 0 },
    lifespans: [], netWorthAt: {}, netWorth65: [], income: 0, expenses: 0, adultYears: 0, debtYears: 0, inheritances: [],
    runawayDebt: false, achievements: [], events: {}, kids: { n: 0, athlete: 0, varsity: 0, scholarship: 0, pro: 0, allStar: 0, served: 0, fallen: 0, degree: 0, topDegree: 0 }, violations: [],
  };
  const violate = (v: string) => { if (sample.violations.length < 20) sample.violations.push(`${s.year}: ${v}`); };
  let deepDebt = 0;
  const step = (next: GameState) => { profile = track(profile, s, next, '').profile; s = next; };

  let y = 0;
  for (; y < maxYears; y++) {
    if (s.phase === 'SUCCESSION') {
      const dead = s.people[s.activeId];
      sample.lifespans.push(ageOf(dead, s.year));
      const heirs = eligibleHeirs(s).sort((a, b) => a.birthYear - b.birthYear);
      step(chooseHeir(s, (heirs.find((h) => h.generation > dead.generation) ?? heirs[0])?.id ?? null));
    }
    if (s.phase === 'GAME_OVER') { sample.ended = true; break; }
    s = updatePlan(s, strategyPlan(s, strategy));
    const me = active(s);
    const age = ageOf(me, s.year);
    const hh = s.households[me.householdId];
    const nw = netWorth(s, hh.id);
    if ((SAMPLE_AGES as readonly number[]).includes(age)) (sample.netWorthAt[age] ??= []).push(nw);
    if (age === 65) sample.netWorth65.push([me.generation, nw]);
    if (age >= 18) {
      const est = estimateYear(s);
      sample.income += est.totalIncome;
      sample.expenses += est.totalExpenses;
      sample.adultYears++;
      if (hh.wallet < 0) sample.debtYears++;
    }
    deepDebt = hh.wallet < -1_000_000 ? deepDebt + 1 : 0;
    if (deepDebt === 10) sample.runawayDebt = true;
    const journalLen = s.journal.length;
    step(autoplayYear(s, (pe) => {
      sample.events[pe.eventId] = (sample.events[pe.eventId] ?? 0) + 1;
      const ok = pe.choices.filter((c) => !c.disabled);
      if (!ok.length) { violate(`event ${pe.eventId} had no available choice`); return pe.choices[0].id; }
      return r.pick(ok).id;
    }));
    for (const v of checkInvariants(s)) violate(v);
    for (const j of s.journal.slice(journalLen)) {
      const m = /^You inherited \$([\d,]+)/.exec(j.text);
      if (m) sample.inheritances.push(Number(m[1].replace(/,/g, '')));
    }
  }
  sample.years = y;
  const memo = buildMemorial(s);
  sample.generations = memo.generations;
  sample.legacy = { ...memo.legacy };
  sample.achievements = Object.keys(profile.achievements).sort();
  for (const p of Object.values(s.people)) {
    if (p.birthYear < startYear || (alive(p) && ageOf(p, s.year) < 25)) continue;
    const k = sample.kids;
    k.n++;
    if (p.hobby === 'sports' || p.sport) k.athlete++;
    if (p.flags.varsity) k.varsity++;
    if (p.flags.full_ride) k.scholarship++;
    if (p.flags.went_pro) k.pro++;
    if (p.flags.all_star) k.allStar++;
    if (p.flags.tours) k.served++;
    if (p.flags.fallen) k.fallen++;
    if (p.flags.degree) k.degree++;
    if (p.flags.top_degree) k.topDegree++;
  }
  return sample;
}

export function playLives(strategy: Strategy, seeds: number[], maxYears = 120): LifeSample[] {
  return seeds.map((seed) => playLife(strategy, seed, maxYears));
}

/** Consecutive seeds: `count` lives starting at `from`. */
export const seedRange = (from: number, count: number) => Array.from({ length: count }, (_, i) => from + i);

/** The fixed sample the balance test and baseline use (about 30 seconds). */
export const STANDARD_RUN = { seedFrom: 1000, lives: 60, maxYears: 120 };
/** The occasional deep check: different seeds, many more lives, run in parallel. */
export const DEEP_RUN = { seedFrom: 100_000, lives: 500, maxYears: 120 };

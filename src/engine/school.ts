/**
 * School grades and getting into college.
 *
 * Every school year (ages 6–17) a child gets a grade from 0.0 to 4.0. It compares their smarts
 * to what's typical for their age (nobody is expected to be smart at 6), plus that year's
 * study effort. Habits carry over: each year's grade is part last year's, so a slow start
 * takes time to climb out of. For admissions, high school (14–17) counts 70% and the earlier
 * years 30%.
 *
 * Colleges: a top university (selective, expensive, the only route to doctor, lawyer and
 * engineer), a state university, or trade school. Admission odds come from GPA and smarts;
 * money decides whether the first year's tuition can be paid (college fund plus savings),
 * and a strong GPA earns scholarships.
 */
import type { Rng } from './rng';
import type { GameState, Household, Person } from './types';
import { ageOf, clamp, money } from './util';

export type CollegeTier = 'top' | 'state' | 'trade';

/** Yearly tuition before scholarships. */
export const TUITION: Record<CollegeTier, number> = { top: 55000, state: 12000, trade: 5000 };
export const COLLEGE_YEARS: Record<CollegeTier, number> = { top: 4, state: 4, trade: 2 };
export const COLLEGE_LABEL: Record<CollegeTier, string> = { top: 'a top university', state: 'state university', trade: 'trade school' };
/** Habit carry-over: the share of last year's grade in this year's. */
export const GRADE_MOMENTUM = 0.35;
export const HIGH_SCHOOL_FROM = 14;
export const HIGH_SCHOOL_WEIGHT = 0.7;

/** Smarts a typical child has at each age (6 → ~17, 17 → ~66). */
export const expectedSmarts = (age: number) => 12 + 4.5 * (age - 5);

const round2 = (n: number) => Math.round(n * 100) / 100;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);

function gradesIn(p: Person, from: number, to: number) {
  return Object.entries(p.grades ?? {}).filter(([a]) => Number(a) >= from && Number(a) <= to).map(([, g]) => g);
}

/** One school year: a grade from smarts for their age, effort, stress, and last year's habits. */
export function schoolYear(s: GameState, rng: Rng, c: Person, effort: number) {
  const age = ageOf(c, s.year);
  if (age < 6 || age > 17) return;
  const rel = c.stats.smarts - expectedSmarts(age);
  const perf = clamp(2.5 + rel / 20 + (effort - 2.5) * 0.12 - Math.max(0, c.stats.stress - 60) / 40 + (rng.next() - 0.5) * 0.5, 0, 4);
  const prev = c.grades?.[String(age - 1)];
  const grade = prev === undefined ? perf : GRADE_MOMENTUM * prev + (1 - GRADE_MOMENTUM) * perf;
  c.grades = { ...(c.grades ?? {}), [String(age)]: round2(clamp(grade, 0, 4)) };
}

/** Plain average of every grade so far. */
export const gpaOf = (p: Person) => {
  const m = mean(Object.values(p.grades ?? {}));
  return m === undefined ? undefined : round2(m);
};
export const highSchoolGpa = (p: Person) => {
  const m = mean(gradesIn(p, HIGH_SCHOOL_FROM, 17));
  return m === undefined ? undefined : round2(m);
};

/** The GPA colleges look at: high school 70%, earlier years 30% (estimated from smarts with no record). */
export function admissionGpa(p: Person): number {
  const early = mean(gradesIn(p, 6, HIGH_SCHOOL_FROM - 1));
  const hs = mean(gradesIn(p, HIGH_SCHOOL_FROM, 17));
  if (hs !== undefined) return round2(early === undefined ? hs : (1 - HIGH_SCHOOL_WEIGHT) * early + HIGH_SCHOOL_WEIGHT * hs);
  if (early !== undefined) return round2(early);
  return round2(clamp(1.2 + p.stats.smarts / 35, 0, 4));
}

/** Chance (0–1) of being admitted. Trade school takes everyone. */
export function admitChance(p: Person, tier: CollegeTier): number {
  const g = admissionGpa(p);
  const smarts = p.stats.smarts;
  if (tier === 'top') return clamp((g - 3.2) * 1.2 + (smarts - 65) / 35, 0.02, 0.92);
  if (tier === 'state') return clamp(0.35 + (g - 2.0) * 0.45 + (smarts - 40) / 60, 0.05, 0.98);
  return 1;
}

/** Share of tuition covered by a merit scholarship. */
export function scholarshipOf(p: Person, tier: CollegeTier): number {
  const g = admissionGpa(p);
  if (tier === 'top') return g >= 3.85 ? 0.5 : g >= 3.6 ? 0.25 : 0;
  if (tier === 'state') return g >= 3.7 ? 0.5 : g >= 3.3 ? 0.25 : 0;
  return 0;
}

export const yearlyTuition = (p: Person, tier: CollegeTier) => Math.round(TUITION[tier] * (1 - scholarshipOf(p, tier)));

/** Can the student and their household pay the first year (college fund first, then savings)? */
export const canAfford = (p: Person, payer: Household, tier: CollegeTier) => p.fund + Math.max(0, payer.wallet) >= yearlyTuition(p, tier);

export function oddsLabel(x: number) {
  return x >= 0.75 ? 'likely' : x >= 0.4 ? 'possible' : x >= 0.15 ? 'a reach' : 'a long shot';
}

/** "GPA 3.42 (high school 3.60)" or a smarts-based estimate. */
export function gpaText(p: Person) {
  const all = gpaOf(p);
  const hs = highSchoolGpa(p);
  if (all === undefined) return `GPA about ${admissionGpa(p).toFixed(1)}`;
  return `GPA ${admissionGpa(p).toFixed(2)}${hs !== undefined ? ` (high school ${hs.toFixed(2)})` : ''}`;
}

/** The tier a study kind belongs to (older saves only knew university and trade). */
export const tierOfStudy = (kind: Person['studyKind']): CollegeTier => (kind === 'top' ? 'top' : kind === 'trade' ? 'trade' : 'state');

/**
 * Apply to `tier`: roll admission (falling back to state university, then trade school),
 * start studying, record any scholarship, and move the college fund to the household that
 * pays tuition. Returns where they ended up and a sentence describing it.
 */
export function enroll(s: GameState, rng: Rng, p: Person, tier: CollegeTier, payer: Household): { tier: CollegeTier; note: string } {
  const notes: string[] = [];
  let got: CollegeTier = tier;
  if (tier === 'top' && !rng.chance(admitChance(p, 'top'))) {
    notes.push('The top university said no');
    got = 'state';
  }
  if (got === 'state' && !rng.chance(admitChance(p, 'state'))) {
    notes.push(tier === 'state' ? 'State university said no' : 'state university said no too');
    got = 'trade';
  }
  if (!canAfford(p, payer, got) && got !== 'trade') {
    notes.push(`${COLLEGE_LABEL[got]} was out of reach financially`);
    got = 'trade';
  }
  p.flags.came_of_age = 1;
  p.studyingUntil = s.year + COLLEGE_YEARS[got];
  p.studyKind = got === 'top' ? 'top' : got === 'state' ? 'university' : 'trade';
  const sch = scholarshipOf(p, got);
  if (sch) {
    p.flags.scholarship = Math.round(sch * 100);
    notes.push(`a ${Math.round(sch * 100)}% scholarship`);
  } else delete p.flags.scholarship;
  if (p.fund > 0) {
    payer.wallet += p.fund;
    p.fund = 0;
  }
  const where = `${COLLEGE_LABEL[got]}${notes.length ? ` (${notes.join('; ')})` : ''}`;
  return { tier: got, note: where };
}

/** Tuition this year for someone studying (with their scholarship). */
/** Tuition this year for someone studying: free with the GI Bill or an ROTC scholarship. */
export const tuitionFor = (p: Person) => (p.flags.gi_bill || p.flags.rotc || p.flags.athletic_scholarship ? 0 : Math.round(TUITION[tierOfStudy(p.studyKind)] * (1 - (p.flags.scholarship ?? 0) / 100)));

/** A decision choice for applying to college: odds, cost after scholarship, affordability. */
export function collegeChoice(p: Person, payer: Household, tier: 'top' | 'state', id: string, label: string) {
  const chance = admitChance(p, tier);
  const yearly = yearlyTuition(p, tier);
  const sch = Math.round(scholarshipOf(p, tier) * 100);
  const affordable = canAfford(p, payer, tier);
  const careers = tier === 'top' ? ' · the only way to become a doctor, lawyer or engineer' : '';
  const hint = affordable
    ? `${Math.round(chance * 100)}% chance (${oddsLabel(chance)}) · ${money(yearly)}/yr${sch ? ` after a ${sch}% scholarship` : ''} · ${COLLEGE_YEARS[tier]} yrs${careers}`
    : `Can't afford it: ${money(yearly)} a year, and the college fund plus savings is ${money(p.fund + Math.max(0, payer.wallet))}`;
  return { id, label: `${label} (${Math.round(chance * 100)}% chance)`, hint, disabled: !affordable };
}

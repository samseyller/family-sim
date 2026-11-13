/**
 * Scripted play styles used by the headless sim and tests. Like a real player,
 * they manage careers: apply for work when unemployed, move up to clearly
 * better-paying jobs, and take a second (part-time) job when the household is
 * running a deficit, dropping it again once money is comfortable.
 */
import { TIME_BUDGET } from '../content/actions';
import { CAREER_BY_ID, PROGRAMS, programBlocker, qualifies, requiredBlocks, salaryOf, type Career, type JobSlot } from '../content/careers';
import { estimateYear } from './budget';
import { defaultPlan, sanitizePlan } from './generate';
import type { GameState, JobIntent, Plan, Program } from './types';
import { active, ageOf, kidsAtHome, partnerOf } from './util';
import { openingsFor } from './jobMarket';

export type Strategy = 'career' | 'family' | 'balanced';

const bestJob = (s: GameState, slot: JobSlot): Career | undefined => {
  const me = active(s);
  return openingsFor(s, slot).filter((c) => qualifies(me, c)).sort((a, b) => b.salary - a.salary)[0];
};

/** Job moves a sensible player would make this year. */
function jobIntents(s: GameState): JobIntent[] {
  const me = active(s);
  const age = ageOf(me, s.year);
  const intents: JobIntent[] = [];
  if (age < 18 || me.retired || me.studyingUntil || age >= 63) return intents;
  const full = bestJob(s, 'full');
  if (!me.jobId && full) intents.push({ kind: 'apply', careerId: full.id });
  else if (me.jobId && full && full.id !== me.jobId && full.salary > salaryOf(CAREER_BY_ID[me.jobId], me.jobLevel) * 1.2) {
    intents.push({ kind: 'apply', careerId: full.id });
  }
  return intents;
}

/** Time blocks for a given style, with work sized to the jobs held or being applied for. */
function allocate(s: GameState, kind: Strategy, intents: JobIntent[], partTime: boolean): Record<string, number> {
  const me = active(s);
  const alloc: Record<string, number> = {};
  let left = TIME_BUDGET;
  const give = (k: string, n: number) => {
    const g = Math.min(n, left);
    if (g > 0) alloc[k] = (alloc[k] ?? 0) + g;
    left -= g;
  };
  const applyFull = intents.find((i) => i.kind === 'apply' && CAREER_BY_ID[i.careerId].hours === 'full');
  const fullCareer = applyFull?.kind === 'apply' ? CAREER_BY_ID[applyFull.careerId] : me.jobId && !me.retired && !me.studyingUntil ? CAREER_BY_ID[me.jobId] : undefined;
  const req = fullCareer ? requiredBlocks(fullCareer, applyFull ? 1 : me.jobLevel) : 0;
  const kids = kidsAtHome(s, me);
  const partner = partnerOf(s, me.id);

  if (kind === 'career') {
    give('work', req ? req + 3 : 0);
    if (partTime) give('parttime', 2);
    give('learn', 1);
  } else {
    give('work', req);
    if (partTime) give('parttime', 2);
    if (partner) give('partner_time', kind === 'family' ? 2 : 1);
    for (const k of kids) {
      give(`child_time:${k.id}`, 1);
      if (kind === 'family') give(`homework:${k.id}`, 1);
    }
  }
  if (!partner && kind !== 'career') give('socialize', 1);
  give('exercise', 1);
  give('relax', left);
  return alloc;
}

export function strategyPlan(s: GameState, kind: Strategy): Plan {
  const me = active(s);
  if (ageOf(me, s.year) < 18) return defaultPlan(s); // kids just live their kid plan

  const kids = kidsAtHome(s, me);
  const children: Plan['children'] = {};
  for (const k of kids) {
    children[k.id] = kind === 'career'
      ? { focus: 'studies', tutoring: true, lessons: false, fundContribution: 5000 }
      : kind === 'family'
        ? { focus: 'free', tutoring: false, lessons: true, fundContribution: 2000 }
        : { focus: 'free', tutoring: false, lessons: false, fundContribution: 1000 };
  }
  const intents = jobIntents(s);
  const wallet = s.households[me.householdId].wallet;
  const hasPart = !!me.partJobId;

  // First try without a second job; add one if the year would run a deficit.
  const build = (partTime: boolean, extra: JobIntent[]): Plan =>
    sanitizePlan(s, { alloc: allocate(s, kind, [...intents, ...extra], partTime), children, jobIntents: [...intents, ...extra], retireContribution: kind === 'career' ? 0.15 : 0.1 });

  let plan = build(hasPart, []);
  const net = estimateYear({ ...s, plan }).net;
  const working = !!me.jobId || intents.length > 0;
  if (!hasPart && working && (net < 0 || wallet < 0)) {
    const part = bestJob(s, 'part');
    if (part) plan = build(true, [{ kind: 'apply', careerId: part.id }]);
  } else if (hasPart && me.jobId && wallet > 40000 && net > 0) {
    // Comfortable again: drop the second job and get the time back.
    plan = build(false, [{ kind: 'quit', slot: 'part' }]);
  }
  return plan;
}

// ── Plan edits (used by the explorer play styles on top of strategyPlan) ─────────────

/** Move time blocks from relaxing (then exercise, socializing, learning) to `want`. */
export function shiftBlocks(s: GameState, plan: Plan, want: Record<string, number>): Plan {
  const alloc = { ...plan.alloc };
  for (const [k, n] of Object.entries(want)) {
    let need = n - (alloc[k] ?? 0);
    // Like a sensible player, keep one block each of rest and exercise (stress 80+ means burnout).
    for (const from of ['relax', 'socialize', 'learn', 'parttime', 'partner_time', ...Object.keys(alloc).filter((x) => x.startsWith('child_time')), 'exercise']) {
      if (need <= 0) break;
      const keep = from === 'relax' || from === 'exercise' ? 1 : 0;
      const take = Math.min(need, Math.max(0, (alloc[from] ?? 0) - keep));
      if (take > 0) { alloc[from] -= take; alloc[k] = (alloc[k] ?? 0) + take; need -= take; }
    }
  }
  const used = Object.values(alloc).reduce((a, b) => a + b, 0);
  if (used < TIME_BUDGET) alloc.relax = (alloc.relax ?? 0) + TIME_BUDGET - used;
  return sanitizePlan(s, { ...plan, alloc });
}

/** Plan to apply for `careerId` (replacing other job moves in that slot). */
export function planApply(plan: Plan, careerId: string): Plan {
  const slot = CAREER_BY_ID[careerId].hours;
  return { ...plan, jobIntents: [...plan.jobIntents.filter((i) => i.kind !== 'apply' || CAREER_BY_ID[i.careerId].hours !== slot), { kind: 'apply', careerId }] };
}

/** Enroll in a night-school program when eligible and not studying already. */
export function planEnroll(s: GameState, plan: Plan, program: Program): Plan {
  const p = active(s);
  if (p.education || p.flags[program] || programBlocker(p, PROGRAMS[program], ageOf(p, s.year))) return plan;
  return { ...plan, eduIntent: { kind: 'enroll', program } };
}

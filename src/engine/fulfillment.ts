/**
 * Fulfillment and aspiration (Stage 4): the difference between a good year and a life that feels meaningful.
 *
 * - **Aspiration**: what someone wants from life right now: connection, mastery, achievement, exploration, security
 *   or service. The player picks (or accepts a suggestion) at adulthood; everyone else gets one from their interests.
 * - **Fulfillment** (0–100, slow): moves toward how well this year's actual life served that aspiration, smoothed over
 *   several years. Hard circumstances (illness, a newborn, caring for a parent, retirement's first year, looking for
 *   work) temper the signal instead of punishing it.
 * - Reach is deliberately small: a couple of happiness points a year, a little less stress when fulfilled. Never
 *   income, skills, health, fertility or survival.
 *
 * Pure and deterministic: no random rolls.
 */
import { activitySituation } from './activitySituations';
import type { Aspiration, GameState, Person } from './types';
import { ageOf, childrenOf, getBond, kidsAtHome, membersOf, parentsOf, partnerOf, stat } from './util';

export const ASPIRATIONS: Aspiration[] = ['connection', 'mastery', 'achievement', 'exploration', 'security', 'service'];

export const ASPIRATION_INFO: Record<Aspiration, { icon: string; label: string; desc: string }> = {
  connection: { icon: '💞', label: 'Connection', desc: 'Close relationships: time with partner, kids, family and friends.' },
  mastery: { icon: '🎯', label: 'Mastery', desc: 'Getting really good at something: practice and learning.' },
  achievement: { icon: '🏆', label: 'Achievement', desc: 'Getting ahead: going the extra mile, promotions, credentials, your own business.' },
  exploration: { icon: '🧭', label: 'Exploration', desc: 'New places and new things: travel, moves, firsts.' },
  security: { icon: '🛡️', label: 'Security', desc: 'A safe footing: savings, no debt, a home of your own.' },
  service: { icon: '🤝', label: 'Service', desc: 'Helping others: volunteering, mentoring, caring for family.' },
};

/** How fast fulfillment moves toward this year's target (a few years to settle). */
export const SMOOTHING = 0.2;
/** Where a neutral year lands, and how far a strong year (signal ±1) pulls from there. */
const NEUTRAL = 50;
const SWING = 40;

/** A suggestion from someone's traits, hobby and life: never a lock-in. */
export function suggestAspiration(p: Person): Aspiration {
  const t = (x: Person['traits'][number]) => p.traits.includes(x);
  if (t('ambitious')) return 'achievement';
  if (t('kind')) return 'service';
  if (t('curious')) return 'exploration';
  if (t('creative') || t('athletic') || (p.hobby && (p.skills[p.hobby] ?? 0) >= 30)) return 'mastery';
  if (t('anxious')) return 'security';
  return 'connection';
}

export const aspirationOf = (p: Person): Aspiration => p.aspiration ?? suggestAspiration(p);

/** A conservative starting point for someone without one yet (an older save, or a newly simulated person). */
export function initialFulfillment(s: GameState, p: Person): number {
  let f = 50;
  if (p.jobId || p.retired) f += 4;
  if (partnerOf(s, p.id)) f += 4;
  f += Math.round((p.stats.happiness - 70) / 10);
  return Math.max(35, Math.min(65, f));
}

/** Activities that serve each aspiration (beyond the time blocks). */
const SERVES: Record<Aspiration, (id: string) => boolean> = {
  connection: (id) => ['partnerTime', 'childTime', 'familyOuting', 'socialize'].includes(activitySituation(id) ?? ''),
  mastery: (id) => ['practice', 'learn'].includes(activitySituation(id) ?? '') || id === 'share_creation',
  achievement: (id) => ['conference', 'run_food_truck', 'cater_event', 'play_gig', 'sell_furniture', 'household_goal'].includes(id),
  exploration: (id) => ['travel', 'newThing'].includes(activitySituation(id) ?? '') || id === 'road_trip',
  security: (id) => id === 'household_goal',
  service: (id) => activitySituation(id) === 'help' || ['mentor', 'volunteer_together', 'coach_kids'].includes(id),
};

/** What the player's plan and year looked like, for the signal. */
export interface FulfillmentYear {
  /** Time blocks: partner, children (total), family outing, socialize, practice, learn, work surplus. */
  partnerBlocks: number;
  childBlocks: number;
  outing: number;
  socialize: number;
  practice: number;
  learn: number;
  workSurplus: number;
  neglect: boolean;
  /** Activities done this year. */
  activities: string[];
}

/** How well a year served an aspiration: -1 (worked against it) to 1 (fully served it), with the main reason. */
export function aspirationSignal(s: GameState, p: Person, y: FulfillmentYear, asp: Aspiration = aspirationOf(p)): { signal: number; why: string } {
  const acts = y.activities.filter(SERVES[asp]).length;
  const age = ageOf(p, s.year);
  const hh = s.households[p.householdId];
  const clamp1 = (x: number) => Math.max(-1, Math.min(1, x));
  switch (asp) {
    case 'connection': {
      const people = (partnerOf(s, p.id) ? 1 : 0) + kidsAtHome(s, p).length;
      const time = y.partnerBlocks + y.childBlocks + y.outing + y.socialize + acts;
      const signal = clamp1((time - Math.max(2, people)) / Math.max(3, people + 1)) - (y.neglect ? 0.4 : 0);
      return { signal: clamp1(signal), why: signal >= 0 ? 'time with the people you love' : 'too little time with the people you love' };
    }
    case 'mastery': {
      const signal = clamp1((y.practice + y.learn + acts - 1) / 3);
      return { signal, why: signal >= 0 ? 'getting better at what you care about' : 'no time to practice or learn' };
    }
    case 'achievement': {
      const fresh = p.flags.fresh_credential === s.year || p.flags.hired_year === s.year;
      const working = !!p.jobId || p.retired || !!p.studyingUntil || !!p.education;
      const signal = clamp1(!working && age < 63 ? -0.6 : (y.workSurplus > 0 ? 0.4 : y.workSurplus < 0 ? -0.4 : -0.1) + (fresh ? 0.4 : 0) + p.jobLevel * 0.08 + acts * 0.15);
      return { signal, why: signal >= 0 ? 'progress at work' : 'a stalled year at work' };
    }
    case 'exploration': {
      const moved = p.flags.moved_year === s.year;
      const signal = clamp1((acts + (moved ? 2 : 0) - 0.5) / 2);
      return { signal, why: signal >= 0 ? 'new places and new things' : 'the same routine all year' };
    }
    case 'security': {
      const home = hh.assets.some((a) => a.kind === 'house');
      const cushion = hh.wallet + (hh.investments ?? 0);
      const signal = clamp1((hh.wallet < 0 ? -0.6 : -0.1) + (home ? 0.2 : 0) + (cushion > 100_000 ? 0.2 : 0) + acts * 0.3);
      return { signal, why: signal >= 0 ? 'a steady financial footing' : 'money worries' };
    }
    case 'service': {
      const caring = parentsOf(s, p).some((x) => x.flags.care_support);
      const signal = clamp1((acts + (caring ? 1 : 0) - 0.5) / 2);
      return { signal, why: signal >= 0 ? 'being there for others' : 'no chance to help anyone' };
    }
  }
}

/**
 * Change someone's aspiration: the old one goes into a short history (memorials remember it), and a new direction
 * gets a grace period so admitting an old dream no longer fits never costs fulfillment.
 */
export function setAspiration(p: Person, a: Aspiration, year: number, grace = 2) {
  const old = p.aspiration;
  if (old === a) return;
  if (old) {
    p.pastAspirations = [...(p.pastAspirations ?? []), { aspiration: old, until: year }].slice(-4);
    p.flags.aspiration_grace = year + grace;
  }
  p.aspiration = a;
}

/** The aspiration a year served best, if it clearly beat the person's own (for noticing a new interest). */
export function drifting(s: GameState, p: Person, y: FulfillmentYear): Aspiration | undefined {
  const own = aspirationSignal(s, p, y).signal;
  if (own > 0) return undefined;
  const best = ASPIRATIONS.filter((a) => a !== aspirationOf(p)).map((a) => ({ a, v: aspirationSignal(s, p, y, a).signal })).sort((x, z) => z.v - x.v)[0];
  return best && best.v >= 0.5 ? best.a : undefined;
}

/** Why a reflection came up (stored as an index in flags.reflect_reason). */
export const REFLECT_REASONS = ['parenthood', 'loss', 'move', 'plateau', 'drift'] as const;
export type ReflectReason = (typeof REFLECT_REASONS)[number];
/** At most one reflection this many years apart. */
export const REFLECT_GAP = 6;

/**
 * Should the active character pause and reflect on what they want? After a meaningful change (a first child, a
 * loss, a move, a long plateau for an achiever) or three years in a row of mostly serving a different aspiration.
 * Never for a single bad year, and at most once every REFLECT_GAP years. Updates the drift counter (in place).
 */
export function reflectionDue(s: GameState, p: Person, y: FulfillmentYear): { reason: ReflectReason; suggest?: Aspiration } | undefined {
  const d = drifting(s, p, y);
  if (d) { p.flags.drift_years = (p.flags.drift_years ?? 0) + 1; p.flags.drift_to = ASPIRATIONS.indexOf(d); }
  else { delete p.flags.drift_years; delete p.flags.drift_to; }
  if (!p.aspiration || s.year - (p.flags.reflect_year ?? -99) < REFLECT_GAP) return undefined;
  const kids = childrenOf(s, p.id);
  const lost = [partnerOfAny(s, p), ...kids, ...parentsOf(s, p)].some((x) => x && x.deathYear === s.year - 1);
  if (kids.length === 1 && kids[0].birthYear === s.year - 1) return { reason: 'parenthood', suggest: p.aspiration === 'connection' ? undefined : 'connection' };
  if (lost) return { reason: 'loss', suggest: p.aspiration === 'connection' ? 'service' : 'connection' };
  if (p.flags.moved_year === s.year - 1) return { reason: 'move', suggest: p.aspiration === 'exploration' ? undefined : 'exploration' };
  if (p.aspiration === 'achievement' && p.jobYears >= 10) return { reason: 'plateau', suggest: 'mastery' };
  if ((p.flags.drift_years ?? 0) >= 3) return { reason: 'drift', suggest: ASPIRATIONS[p.flags.drift_to ?? 0] };
  return undefined;
}

/** A partner, including one who died (for noticing a loss). */
const partnerOfAny = (s: GameState, p: Person) => {
  const ps = [...s.partnerships].reverse().find((x) => (x.a === p.id || x.b === p.id) && (x.status === 'married' || x.status === 'widowed' || x.status === 'dating'));
  return ps ? s.people[ps.a === p.id ? ps.b : ps.a] : undefined;
};

/** What someone sought in life, told briefly ("Sought mastery, then connection, and found it"). */
export function aimText(p: Person): string | undefined {
  if (!p.aspiration) return undefined;
  const path = [...(p.pastAspirations ?? []).map((x) => x.aspiration), p.aspiration].filter((a, i, all) => i === 0 || a !== all[i - 1]);
  const names = path.map((a) => ASPIRATION_INFO[a].label.toLowerCase());
  const sought = names.length > 1 ? `${names.slice(0, -1).join(', ')}, then ${names[names.length - 1]}` : names[0];
  const f = p.fulfillment ?? 50;
  return `Sought ${sought}${f >= 65 ? ', and found it' : f < 40 ? ', though it was hard to find' : ''}.`;
}

/** Hard circumstances that should temper expectations, not punish them. */
export function constrained(s: GameState, p: Person): string | undefined {
  if (p.stats.health < 40) return 'your health';
  if (membersOf(s, p.householdId).some((m) => ageOf(m, s.year) === 0)) return 'a new baby';
  if (parentsOf(s, p).some((x) => x.flags.care_home && x.flags.care_support)) return 'caring for a parent';
  if (p.flags.retired_year === s.year) return 'settling into retirement';
  if (!p.jobId && !p.retired && s.plan.jobIntents.length) return 'looking for work';
  return undefined;
}

/** Move fulfillment one year toward what the year delivered (in place). Returns the change and why. */
export function updateFulfillment(s: GameState, p: Person, y: FulfillmentYear): { delta: number; why: string } {
  const before = p.fulfillment ?? initialFulfillment(s, p);
  const { signal, why } = aspirationSignal(s, p, y);
  const hard = constrained(s, p);
  const grace = (p.flags.aspiration_grace ?? 0) >= s.year; // a new aspiration gets time to settle in
  const fresh = p.flags.refocus_year === s.year ? 0.2 : 0; // a deliberate fresh start
  const used = Math.min(1, (hard || grace ? Math.max(0, signal) : signal) + fresh);
  const target = NEUTRAL + SWING * used;
  const after = Math.round(Math.max(0, Math.min(100, before + SMOOTHING * (target - before))));
  p.fulfillment = after;
  // Small reach: a meaningful life is a happier, slightly calmer one.
  stat(p, 'happiness', Math.round((after - 50) / 25));
  if (after >= 70) stat(p, 'stress', -1);
  return { delta: after - before, why: hard && signal < 0 ? `a hard year (${hard}), so you went easy on yourself` : grace && signal < 0 ? 'still settling into a new direction' : why };
}

/** Close people's fulfillment, from their life rather than a plan (coarser). */
export function npcFulfillmentYear(s: GameState, people: Person[], note?: (text: string) => void) {
  for (const p of people) {
    if (ageOf(p, s.year) < 18) continue;
    // A life transition can change what someone wants (half the time; stable per person and year).
    const firstChild = childrenOf(s, p.id).length === 1 && childrenOf(s, p.id)[0].birthYear === s.year;
    const retiredNow = p.flags.retired_year === s.year;
    const next: Aspiration | undefined = firstChild ? 'connection' : retiredNow ? (p.traits.includes('kind') ? 'service' : 'connection') : undefined;
    if (next && aspirationOf(p) !== next && [...`${p.id}:${s.year}:revise`].reduce((a, ch) => (Math.imul(a, 31) + ch.charCodeAt(0)) >>> 0, 7) % 2 === 0) {
      setAspiration(p, next, s.year);
      note?.(`${p.firstName} has been rethinking what matters: ${firstChild ? 'with a baby on the way, family comes first now' : 'in retirement, it\'s ' + ASPIRATION_INFO[next].label.toLowerCase()}.`);
    }
    const before = p.fulfillment ?? initialFulfillment(s, p);
    const asp = aspirationOf(p);
    const partner = partnerOf(s, p.id);
    const kids = childrenOf(s, p.id);
    const signal =
      asp === 'connection' ? (partner ? 0.4 : -0.2) + (kids.length ? 0.3 : 0) + (kids.some((k) => getBond(s, p.id, k.id).affinity >= 40) ? 0.3 : 0)
      : asp === 'mastery' ? (p.hobby && (p.skills[p.hobby] ?? 0) >= 40 ? 0.6 : 0)
      : asp === 'achievement' ? (p.jobId ? 0.2 + p.jobLevel * 0.2 : -0.4)
      : asp === 'exploration' ? (p.flags.moved_year && s.year - p.flags.moved_year < 5 ? 0.6 : 0)
      : asp === 'security' ? (s.households[p.householdId].wallet >= 0 ? 0.5 : -0.5)
      : 0.2;
    p.fulfillment = Math.round(Math.max(0, Math.min(100, before + SMOOTHING * (NEUTRAL + SWING * Math.max(-1, Math.min(1, signal)) - before))));
  }
}

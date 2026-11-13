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
export function aspirationSignal(s: GameState, p: Person, y: FulfillmentYear): { signal: number; why: string } {
  const asp = aspirationOf(p);
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
export function npcFulfillmentYear(s: GameState, people: Person[]) {
  for (const p of people) {
    if (ageOf(p, s.year) < 18) continue;
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

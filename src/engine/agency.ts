/**
 * Close people's own lives (Stage 3): once a year, the people closest to the player (partner, children, parents,
 * siblings, grandchildren) may act on an intention of their own.
 *
 * - Private choices just happen and are mentioned in the recap: taking up a hobby, dropping by for a visit.
 * - Choices that touch the player (moving away, spending household money, reaching out after a rift, a boundary)
 *   become a decision, with support, compromise and disagreement on offer.
 *
 * Rolls use a stable hash of (family, year, person, intention), never the shared random roll, so an unrelated change
 * never reshuffles who does what. Rate limits keep it special: at most one decision a year from this pass, each person
 * at most one every INTENT_GAP years, and at most two recap notes a year.
 */
import { relativesOutside } from './activityKit';
import { harmFrom, stableHash } from './relationships';
import type { GameState, Hobby, Person } from './types';
import { active, adjustBond, ageOf, alive, childrenOf, getBond, journal, kidsAtHome, partnerOf } from './util';

/** Years between one person's decisions. */
export const INTENT_GAP = 4;
const NOTES_PER_YEAR = 2;

/** A stable roll in [0, 1) for this person, year and intention. */
const roll = (s: GameState, p: Person, intent: string) => stableHash(`${s.seed}:${s.year}:${p.id}:${intent}`) / 4294967296;
const has = (p: Person, t: Person['traits'][number]) => p.traits.includes(t);

/** The people close enough to act on the player's year: partner, children, parents, siblings, grandchildren. */
export function closePeople(s: GameState): Person[] {
  const me = active(s);
  const out = new Map<string, Person>();
  const add = (p?: Person) => { if (p && alive(p) && p.id !== me.id) out.set(p.id, p); };
  add(partnerOf(s, me.id));
  kidsAtHome(s, me).forEach(add);
  childrenOf(s, me.id).forEach(add);
  relativesOutside(s, me).forEach(add);
  return [...out.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
}

interface Intention {
  id: string;
  /** Becomes a player decision (scheduled event) rather than just happening. */
  decision: boolean;
  chance: (s: GameState, me: Person, p: Person) => number;
  /** Private choices: what happens, and the recap line. */
  act?: (s: GameState, me: Person, p: Person) => string;
}

const isChildOf = (p: Person, me: Person) => p.biologicalParents.includes(me.id) || p.adoptiveParents.includes(me.id);
const isSiblingOf = (p: Person, me: Person) => p.biologicalParents.some((id) => me.biologicalParents.includes(id));
const HOBBIES_FOR: Record<string, Hobby[]> = {
  creative: ['art', 'music', 'woodworking'], athletic: ['sports', 'fishing'], curious: ['cooking', 'gardening', 'flying'],
  default: ['gardening', 'cooking', 'fishing', 'art'],
};

const INTENTIONS: Intention[] = [
  {
    // A grown child gets a job offer somewhere else. Secure, supported people take the leap more often, whatever
    // their temperament; an anxious child with a strong bond at home may still go.
    id: 'distant_job', decision: true,
    chance: (s, me, p) => {
      const age = ageOf(p, s.year);
      // Children you invited home don't leave on their own.
      if (!isChildOf(p, me) || age < 22 || age > 40 || !p.jobId || p.flags.invited_home) return 0;
      const secure = getBond(s, me.id, p.id).affinity >= 40;
      return 0.05 + (has(p, 'ambitious') ? 0.03 : 0) + (has(p, 'curious') ? 0.02 : 0) - (has(p, 'anxious') && !secure ? 0.03 : 0);
    },
  },
  {
    // A partner wants to go back to school (household money: a shared decision).
    id: 'partner_night_school', decision: true,
    chance: (s, me, p) => {
      const age = ageOf(p, s.year);
      if (partnerOf(s, me.id)?.id !== p.id || p.householdId !== me.householdId || age < 25 || age > 55) return 0;
      if (p.flags.degree || p.flags.trade_cert || p.studyingUntil) return 0;
      return 0.04 + (has(p, 'curious') || has(p, 'ambitious') ? 0.03 : 0);
    },
  },
  {
    // An estranged relative reaches out.
    id: 'reaching_out', decision: true,
    chance: (s, me, p) => (p.householdId !== me.householdId && ageOf(p, s.year) >= 18 && getBond(s, me.id, p.id).affinity <= -10 ? 0.15 + (has(p, 'kind') ? 0.05 : 0) : 0),
  },
  {
    // A sibling wants to get everyone together.
    id: 'sibling_reunion', decision: true,
    chance: (s, me, p) => (isSiblingOf(p, me) && p.householdId !== me.householdId && ageOf(p, s.year) >= 25 && getBond(s, me.id, p.id).affinity >= 10 ? 0.04 + (has(p, 'kind') ? 0.02 : 0) : 0),
  },
  {
    // Someone who has felt pushed asks for room.
    id: 'boundary', decision: true,
    chance: (s, me, p) => (ageOf(p, s.year) >= 16 && harmFrom(p, me.id)?.kind === 'pressure' ? 0.3 + (has(p, 'stubborn') ? 0.1 : 0) : 0),
  },
  {
    // Private: a grown-up close to you picks up a hobby.
    id: 'hobby', decision: false,
    chance: (s, _me, p) => (!p.hobby && ageOf(p, s.year) >= 18 && ageOf(p, s.year) < 75 ? 0.06 : 0),
    act: (s, _me, p) => {
      const pool = HOBBIES_FOR[p.traits.find((t) => HOBBIES_FOR[t]) ?? 'default'];
      const h = pool[stableHash(`${p.id}:${s.year}:hobby`) % pool.length];
      p.hobby = h;
      p.skills[h] = Math.max(p.skills[h] ?? 0, 5);
      return `${p.firstName} took up ${h === 'sports' ? 'a sport' : h}.`;
    },
  },
  {
    // Private: a relative who lives elsewhere drops by.
    id: 'visit', decision: false,
    chance: (s, me, p) => (p.householdId !== me.householdId && ageOf(p, s.year) >= 18 && getBond(s, me.id, p.id).affinity >= 25 ? 0.08 : 0),
    act: (s, me, p) => {
      adjustBond(s, me.id, p.id, 4, 2);
      return `${p.firstName} dropped by for a visit.`;
    },
  },
];

/** The yearly pass: close people may act on an intention of their own. */
export function npcIntentions(s: GameState) {
  const me = active(s);
  if (!alive(me) || ageOf(me, s.year) < 18) return;
  let decided = false;
  let notes = 0;
  for (const p of closePeople(s)) {
    if (s.year - (p.flags.intent_year ?? -99) < INTENT_GAP) continue;
    for (const it of INTENTIONS) {
      if (it.decision && decided) continue;
      if (!it.decision && notes >= NOTES_PER_YEAR) continue;
      if (roll(s, p, it.id) >= it.chance(s, me, p)) continue;
      p.flags.intent_year = s.year;
      if (it.decision) {
        s.scheduled.push({ dueYear: s.year, eventId: it.id, subjectId: p.id });
        decided = true;
      } else {
        journal(s, it.act!(s, me, p), 'info');
        notes++;
      }
      break;
    }
  }
}

/** For tests and reports: is this intention a decision for the player? */
export const isDecision = (id: string) => INTENTIONS.find((x) => x.id === id)?.decision ?? false;

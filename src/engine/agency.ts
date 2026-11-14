/**
 * Close people's own lives: once a year, each person close to the player may act on a decision of their own.
 *
 * Every decision is data (DECISIONS below) evaluated in three layers:
 *   1. **Hard eligibility** (`eligible`): impossible or contradictory actions never happen, whatever the personality.
 *   2. **Context factors** (`factors`): only what is relevant to this decision (traits, aspiration, connection
 *      preference, bond, memories, life stage, work, interests, responsibilities, health, distance). Each factor moves
 *      the chance by at most FACTOR_CAP; the total is clamped to [base × FLOOR, max]. Traits change odds, never outcomes.
 *   3. **A stable roll** per (family, year, person, decision), never the shared random roll, so an unrelated change
 *      never reshuffles who does what, and fixed seeds replay exactly.
 *
 * Private choices just happen and are explained in the recap ("After years of enjoying music, Maya has decided to
 * take it seriously."). Choices that touch the player (moving away, household money, a rift, a boundary) become
 * decisions with support, compromise and disagreement on offer. Nobody spends the player's household money.
 * Rate limits keep it special: per person, one decision every INTENT_GAP years and one private step every NOTE_GAP
 * years; per year, at most one decision and NOTES_PER_YEAR recap notes.
 */
import { noteSiblings } from './threads';
import { CAREER_BY_ID, qualifies, type Career } from '../content/careers';
import { HOBBY_BY_ID } from '../content/actions';
import { relativesOutside } from './activityKit';
import { aspirationOf } from './fulfillment';
import { isNear } from './location';
import { connectionOf, harmFrom, harmText, remember, stableHash } from './relationships';
import type { GameState, Hobby, Person, Trait } from './types';
import { active, adjustBond, ageOf, alive, childrenOf, getBond, journal, kidsAtHome, parentsOf, partnerOf, stat } from './util';

/** Years between one person's decisions, and between their private steps. */
export const INTENT_GAP = 4;
export const NOTE_GAP = 2;
const NOTES_PER_YEAR = 3;
/** A new interest gets this long before it can be dropped, and a dropped one leaves this gap before the next. */
export const HOBBY_SETTLE = 5;
/** No single factor moves a chance by more than this. */
export const FACTOR_CAP = 0.08;
/** An eligible decision keeps at least this share of its base chance. */
export const FLOOR = 0.25;

export interface DecisionCtx {
  s: GameState;
  /** The player character. */
  me: Person;
  /** The person deciding. */
  p: Person;
  age: number;
}

/** One reason that makes a decision likelier (positive) or less likely (negative). */
export interface Factor {
  id: string;
  delta: number;
}

export interface DecisionDef {
  id: string;
  /** A decision for the player (a scheduled event) rather than a private step. */
  decision: boolean;
  eligible: (c: DecisionCtx) => boolean;
  base: number;
  max: number;
  factors: (c: DecisionCtx) => Factor[];
  /** Private steps: apply it and return the recap line (the explanation). */
  act?: (c: DecisionCtx, top?: Factor) => string;
}

/** The decision's chance for this person now, with the factors that shaped it (strongest first). */
export function evaluate(def: DecisionDef, c: DecisionCtx): { chance: number; factors: Factor[] } {
  const factors = def.factors(c)
    .map((f) => ({ id: f.id, delta: Math.max(-FACTOR_CAP, Math.min(FACTOR_CAP, f.delta)) }))
    .filter((f) => f.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  // Eligible decisions never drop to zero: personality makes something unlikely, never impossible.
  const chance = Math.max(def.base * FLOOR, Math.min(def.max, def.base + factors.reduce((n, f) => n + f.delta, 0)));
  return { chance, factors };
}

/** A stable roll in [0, 1) for this person, year and decision. */
export const decisionRoll = (s: GameState, p: Person, id: string) => stableHash(`${s.seed}:${s.year}:${p.id}:${id}`) / 4294967296;

// ── Helpers for factors ─────────────────────────────────────────────

const has = (p: Person, t: Trait) => p.traits.includes(t);
/** A factor when the condition holds (empty otherwise), so factor lists stay readable. */
const when = (cond: boolean, id: string, delta: number): Factor[] => (cond ? [{ id, delta }] : []);
const isChildOf = (p: Person, me: Person) => p.biologicalParents.includes(me.id) || p.adoptiveParents.includes(me.id);
const isParentOf = (p: Person, me: Person) => me.biologicalParents.includes(p.id) || me.adoptiveParents.includes(p.id);
const isSiblingOf = (p: Person, me: Person) => p.biologicalParents.some((id) => me.biologicalParents.includes(id));
/** Little ones at home: a real responsibility that makes big changes harder. */
const youngKidsAt = (s: GameState, p: Person) => kidsAtHome(s, p).some((k) => ageOf(k, s.year) < 6);
const pronoun = (p: Person) => (p.sex === 'F' ? 'she' : 'he');
const possessive = (p: Person) => (p.sex === 'F' ? 'her' : 'his');
const hobbyName = (h: Hobby) => (h === 'sports' ? 'sports' : HOBBY_BY_ID[h].label.toLowerCase());
const CREATIVE: Hobby[] = ['music', 'art', 'cooking', 'woodworking'];
const HOBBIES_FOR: Record<string, Hobby[]> = {
  creative: ['art', 'music', 'woodworking'], athletic: ['sports', 'fishing'], curious: ['cooking', 'gardening', 'flying'],
  default: ['gardening', 'cooking', 'fishing', 'art'],
};
/** Harms this person holds against the player (missed moments, pressure, broken promises). */
const harms = (p: Person, me: Person) => (p.memories ?? []).filter((m) => m.of === me.id && (m.kind === 'missed' || m.kind === 'pressure' || m.kind === 'promise_broken')).length;
const brokenPromises = (p: Person, me: Person) => (p.memories ?? []).filter((m) => m.of === me.id && m.kind === 'promise_broken').length;
/** The player is going through something hard: a loss last year, poor health, or high stress. */
export function playerStruggling(s: GameState, me: Person): 'loss' | 'stress' | 'health' | undefined {
  const lost = [...childrenOf(s, me.id), ...parentsOf(s, me)].some((x) => x.deathYear === s.year - 1)
    || s.partnerships.some((ps) => (ps.a === me.id || ps.b === me.id) && ps.status === 'widowed' && ps.endYear === s.year - 1);
  if (lost) return 'loss';
  if (me.stats.health < 40) return 'health';
  if (me.stats.stress >= 65) return 'stress';
  return undefined;
}

// ── The decisions ───────────────────────────────────────────────────

export const DECISIONS: DecisionDef[] = [
  // ── Decisions for the player (scheduled events) ──
  {
    // A grown child gets a job offer somewhere else. Secure, supported people take the leap more often; family
    // responsibilities and a wish for security hold people back. Children you invited home don't leave on their own.
    id: 'distant_job', decision: true, base: 0.05, max: 0.15,
    eligible: ({ me, p, age }) => isChildOf(p, me) && age >= 22 && age <= 40 && !!p.jobId && !p.flags.invited_home && !CAREER_BY_ID[p.jobId]?.military,
    factors: ({ s, me, p }) => {
      const secure = getBond(s, me.id, p.id).affinity >= 40;
      return [
        ...when(has(p, 'ambitious'), 'ambitious', 0.03),
        ...when(has(p, 'curious'), 'curious', 0.02),
        ...when(has(p, 'anxious') && !secure, 'anxious', -0.03),
        ...when(aspirationOf(p) === 'exploration' || aspirationOf(p) === 'achievement', 'aspiration', 0.03),
        ...when(aspirationOf(p) === 'security' && youngKidsAt(s, p), 'responsibilities', -0.04),
        ...when(aspirationOf(p) === 'connection', 'close_to_family', -0.02),
      ];
    },
  },
  {
    // A partner wants to go back to school (household money: a shared decision).
    id: 'partner_night_school', decision: true, base: 0.03, max: 0.12,
    eligible: ({ s, me, p, age }) => partnerOf(s, me.id)?.id === p.id && p.householdId === me.householdId && age >= 25 && age <= 55 && !p.flags.degree && !p.flags.trade_cert && !p.studyingUntil,
    factors: ({ s, p }) => [
      ...when(has(p, 'curious') || has(p, 'ambitious'), 'drive', 0.03),
      ...when(aspirationOf(p) === 'mastery' || aspirationOf(p) === 'achievement', 'aspiration', 0.02),
      ...when(youngKidsAt(s, p), 'little_ones', -0.02),
      ...when((p.fulfillment ?? 50) < 40, 'restless', 0.02),
    ],
  },
  {
    // A partner restless at work wants to change careers (household income: a shared decision).
    id: 'partner_career_change', decision: true, base: 0.015, max: 0.1,
    eligible: ({ s, me, p, age }) => partnerOf(s, me.id)?.id === p.id && p.householdId === me.householdId && age >= 25 && age <= 58 && !!p.jobId && p.jobYears >= 3 && !!careerChangeFor(p),
    factors: ({ s, p }) => [
      ...when(p.workPerf < 40, 'struggling_at_work', 0.04),
      ...when(p.jobYears >= 10, 'long_tenure', 0.02),
      ...when(has(p, 'ambitious') || has(p, 'curious'), 'drive', 0.02),
      ...when(aspirationOf(p) === 'exploration' || aspirationOf(p) === 'mastery', 'aspiration', 0.02),
      ...when(aspirationOf(p) === 'security', 'security', -0.03),
      ...when(youngKidsAt(s, p), 'little_ones', -0.02),
      ...when((p.fulfillment ?? 50) < 40, 'unfulfilled', 0.03),
    ],
  },
  {
    // An estranged relative reaches out. Remembered broken promises make it less likely.
    id: 'reaching_out', decision: true, base: 0.12, max: 0.3,
    eligible: ({ s, me, p, age }) => p.householdId !== me.householdId && age >= 18 && getBond(s, me.id, p.id).affinity <= -10,
    factors: ({ me, p }) => [
      ...when(has(p, 'kind'), 'kind', 0.05),
      ...when(has(p, 'stubborn'), 'stubborn', -0.04),
      ...when(aspirationOf(p) === 'connection', 'wants_connection', 0.04),
      ...when(brokenPromises(p, me) > 0, 'broken_promises', -0.05 * brokenPromises(p, me)),
    ],
  },
  {
    // A sibling wants to get everyone together.
    id: 'sibling_reunion', decision: true, base: 0.03, max: 0.1,
    eligible: ({ s, me, p, age }) => isSiblingOf(p, me) && p.householdId !== me.householdId && age >= 25 && getBond(s, me.id, p.id).affinity >= 10,
    factors: ({ p }) => [
      ...when(has(p, 'kind'), 'kind', 0.02),
      ...when(aspirationOf(p) === 'connection', 'wants_connection', 0.02),
      ...when(connectionOf(p) === 'experiences', 'loves_occasions', 0.01),
    ],
  },
  {
    // Someone who has felt pushed asks for room. High trust makes it less necessary.
    id: 'boundary', decision: true, base: 0.25, max: 0.5,
    eligible: ({ me, p, age }) => age >= 16 && harmFrom(p, me.id)?.kind === 'pressure',
    factors: ({ s, me, p }) => [
      ...when(has(p, 'stubborn'), 'stubborn', 0.08),
      ...when(connectionOf(p) === 'space', 'needs_space', 0.05),
      ...when(getBond(s, me.id, p.id).trust >= 40, 'trusts_you', -0.08),
    ],
  },

  // ── Private steps (noted in the recap) ──
  {
    // Picking up an interest.
    id: 'hobby', decision: false, base: 0.03, max: 0.12,
    eligible: ({ s, p, age }) => !p.hobby && age >= 16 && age < 78 && s.year - (p.flags.dropped_interest ?? -99) >= HOBBY_SETTLE,
    factors: ({ s, p, age }) => [
      ...when(has(p, 'creative') || has(p, 'curious'), 'curious_mind', 0.03),
      ...when(aspirationOf(p) === 'mastery' || aspirationOf(p) === 'exploration', 'aspiration', 0.03),
      ...when(p.retired || age < 25, 'free_time', 0.02),
      ...when(youngKidsAt(s, p), 'little_ones', -0.02),
      ...when(p.stats.health < 40, 'health', -0.02),
    ],
    act: ({ s, p }) => {
      const pool = HOBBIES_FOR[p.traits.find((t) => HOBBIES_FOR[t]) ?? 'default'];
      const h = pool[stableHash(`${p.id}:${s.year}:hobby`) % pool.length];
      p.hobby = h;
      p.skills[h] = Math.max(p.skills[h] ?? 0, 5);
      p.flags.hobby_year = s.year;
      return p.retired ? `${p.firstName} took up ${hobbyName(h)} in retirement.` : `${p.firstName} took up ${hobbyName(h)}.`;
    },
  },
  {
    // Taking an interest seriously (lessons, real practice).
    id: 'deepen_interest', decision: false, base: 0.03, max: 0.14,
    eligible: ({ s, p, age }) => !!p.hobby && (p.skills[p.hobby] ?? 0) >= 30 && (p.skills[p.hobby] ?? 0) < 90 && age >= 12 && !(p.flags.serious_interest && s.year - p.flags.serious_interest < 10),
    factors: ({ s, me, p }) => [
      ...when(aspirationOf(p) === 'mastery', 'wants_mastery', 0.04),
      ...when(has(p, 'creative') && CREATIVE.includes(p.hobby!), 'creative', 0.03),
      ...when(has(p, 'athletic') && p.hobby === 'sports', 'athletic', 0.03),
      ...when(has(p, 'stubborn'), 'persistent', 0.02),
      ...when(has(p, 'easygoing'), 'easygoing', -0.02),
      ...when((p.flags.encouraged ?? 0) > 0 || (p.memories ?? []).some((m) => m.kind === 'support' && m.of === me.id), 'encouraged', 0.03),
      ...when(youngKidsAt(s, p), 'little_ones', -0.02),
    ],
    act: ({ s, p }, top) => {
      const h = p.hobby!;
      const longtime = (p.skills[h] ?? 0) >= 45;
      p.skills[h] = Math.min(100, (p.skills[h] ?? 0) + 6);
      p.flags.serious_interest = s.year;
      if (top?.id === 'encouraged') return `With some encouragement, ${p.firstName} has decided to take ${hobbyName(h)} seriously.`;
      return longtime ? `After years of enjoying ${hobbyName(h)}, ${p.firstName} has decided to take it seriously.` : `${p.firstName} has decided to take ${hobbyName(h)} seriously.`;
    },
  },
  {
    // Letting an interest go (only one that never really took hold).
    id: 'drop_interest', decision: false, base: 0.03, max: 0.1,
    eligible: ({ s, p, age }) => !!p.hobby && (p.skills[p.hobby] ?? 0) < 25 && age >= 14 && !p.flags.serious_interest && s.year - (p.flags.hobby_year ?? -99) >= HOBBY_SETTLE,
    factors: ({ p }) => [
      ...when(has(p, 'curious'), 'moves_on', 0.02),
      ...when(has(p, 'easygoing'), 'easygoing', 0.02),
      ...when(aspirationOf(p) === 'mastery', 'wants_mastery', -0.03),
      ...when(has(p, 'stubborn'), 'persistent', -0.02),
    ],
    act: ({ s, p }) => {
      const h = p.hobby!;
      p.hobby = undefined;
      p.flags.dropped_interest = s.year;
      return `${p.firstName} has lost interest in ${hobbyName(h)}${has(p, 'curious') ? ' and is looking for something new' : ''}.`;
    },
  },
  {
    // Being there for the player through a hard time.
    id: 'offer_support', decision: false, base: 0.1, max: 0.3,
    eligible: ({ s, me, p, age }) => age >= 16 && getBond(s, me.id, p.id).affinity >= 25 && !!playerStruggling(s, me),
    factors: ({ s, me, p }) => [
      ...when(has(p, 'kind'), 'kind', 0.05),
      ...when(connectionOf(p) === 'support', 'shows_care_by_helping', 0.04),
      ...when(getBond(s, me.id, p.id).trust >= 40, 'trust', 0.03),
      ...when(p.stats.stress >= 70, 'own_troubles', -0.04),
      ...when(!isNear(s, p), 'far_away', -0.03),
    ],
    act: ({ s, me, p }) => {
      const why = playerStruggling(s, me);
      stat(me, 'stress', -5);
      adjustBond(s, me.id, p.id, 4, 3);
      remember(me, 'support', p.id, s.year);
      const how = !isNear(s, p) ? 'called every week' : connectionOf(p) === 'support' ? 'showed up with groceries and took over the errands' : 'kept you company';
      return `${p.firstName} ${how} ${why === 'loss' ? 'after your loss' : why === 'health' ? 'while you were unwell' : 'while things were hard'}.`;
    },
  },
  {
    // Pulling back after repeated hurt. Trust and kindness make it less likely; it never happens without real harm.
    id: 'create_distance', decision: false, base: 0.1, max: 0.25,
    eligible: ({ s, me, p, age }) => age >= 16 && harms(p, me) >= 2 && getBond(s, me.id, p.id).affinity < 25,
    factors: ({ s, me, p }) => [
      ...when(has(p, 'stubborn'), 'stubborn', 0.05),
      ...when(connectionOf(p) === 'space', 'needs_space', 0.03),
      ...when(has(p, 'kind'), 'kind', -0.04),
      ...when(getBond(s, me.id, p.id).trust >= 20, 'trust', -0.05),
    ],
    act: ({ s, me, p }) => {
      const harm = harmFrom(p, me.id)!;
      adjustBond(s, me.id, p.id, -4, -2);
      return `${p.firstName} has been keeping ${possessive(p)} distance lately. ${pronoun(p)[0].toUpperCase() + pronoun(p).slice(1)} hasn’t forgotten you ${harmText(harm)}.`;
    },
  },
  {
    // A grandparent encourages the player's child in their interest.
    id: 'encourage_interest', decision: false, base: 0.04, max: 0.14,
    eligible: ({ s, me, p, age }) => isParentOf(p, me) && age >= 50 && p.stats.health >= 40 && !!grandchildToEncourage(s, me, p),
    factors: ({ s, me, p }) => {
      const kid = grandchildToEncourage(s, me, p)!;
      return [
        ...when(has(p, 'kind'), 'kind', 0.03),
        ...when(p.hobby === kid.hobby && (p.skills[kid.hobby!] ?? 0) >= 30, 'shared_interest', 0.05),
        ...when(aspirationOf(p) === 'mastery' || aspirationOf(p) === 'connection', 'aspiration', 0.02),
        ...when(!isNear(s, p), 'far_away', -0.02),
      ];
    },
    act: ({ s, me, p }, top) => {
      const kid = grandchildToEncourage(s, me, p)!;
      const h = kid.hobby!;
      kid.skills[h] = Math.min(100, (kid.skills[h] ?? 0) + 4);
      kid.flags.encouraged = (kid.flags.encouraged ?? 0) + 1;
      remember(kid, 'support', p.id, s.year);
      adjustBond(s, p.id, kid.id, 5, 3);
      return top?.id === 'shared_interest'
        ? `${p.firstName} has been teaching ${kid.firstName} the ${hobbyName(h)} ${pronoun(p)} learned years ago.`
        : `${p.firstName} has been cheering ${kid.firstName} on at ${hobbyName(h)}.`;
    },
  },
  {
    // Grandparents nearby help with little ones.
    id: 'grandparent_help', decision: false, base: 0.08, max: 0.22,
    eligible: ({ s, me, p, age }) => isParentOf(p, me) && age >= 50 && age <= 82 && p.stats.health >= 50 && !p.flags.care_home && isNear(s, p)
      && kidsAtHome(s, me).some((k) => ageOf(k, s.year) < 10) && getBond(s, me.id, p.id).affinity >= 10,
    factors: ({ s, me, p }) => [
      ...when(has(p, 'kind'), 'kind', 0.04),
      ...when(connectionOf(p) === 'support', 'shows_care_by_helping', 0.03),
      ...when(aspirationOf(p) === 'connection' || aspirationOf(p) === 'service', 'aspiration', 0.03),
      ...when(p.retired, 'retired', 0.03),
      ...when(getBond(s, me.id, p.id).affinity < 30, 'cool_bond', -0.03),
    ],
    act: ({ s, me, p }) => {
      stat(me, 'stress', -4);
      for (const k of kidsAtHome(s, me).filter((x) => ageOf(x, s.year) < 10)) adjustBond(s, p.id, k.id, 5, 3);
      return `${p.firstName} offered to watch the kids every week. You finally had some evenings back.`;
    },
  },
  {
    // A teenager starts claiming more independence.
    id: 'teen_independence', decision: false, base: 0.12, max: 0.3,
    eligible: ({ me, p, age }) => isChildOf(p, me) && p.householdId === me.householdId && age >= 15 && age <= 17 && !p.flags.independent,
    factors: ({ p }) => [
      ...when(has(p, 'stubborn'), 'stubborn', 0.06),
      ...when(has(p, 'curious') || has(p, 'ambitious'), 'drive', 0.03),
      ...when(has(p, 'anxious'), 'anxious', -0.05),
      ...when(connectionOf(p) === 'space', 'needs_space', 0.03),
    ],
    act: ({ s, p }) => {
      p.flags.independent = s.year;
      return `${p.firstName} wants more say in ${possessive(p)} own life lately: later curfews, ${possessive(p)} own plans.`;
    },
  },
  {
    // Siblings at home find something in common.
    id: 'sibling_bond', decision: false, base: 0.08, max: 0.2,
    eligible: ({ s, me, p, age }) => isChildOf(p, me) && p.householdId === me.householdId && age >= 8 && age <= 17 && !!siblingAtHome(s, me, p),
    factors: ({ s, me, p }) => {
      const sib = siblingAtHome(s, me, p)!;
      return [
        ...when(!!p.hobby && p.hobby === sib.hobby, 'shared_interest', 0.06),
        ...when(has(p, 'kind') || has(sib, 'kind'), 'kind', 0.02),
        ...when(has(p, 'stubborn') && has(sib, 'stubborn'), 'two_stubborn', -0.04),
      ];
    },
    act: ({ s, me, p }, top) => {
      const sib = siblingAtHome(s, me, p)!;
      adjustBond(s, p.id, sib.id, 5, 3);
      noteSiblings(s, me, p, sib);
      return top?.id === 'shared_interest'
        ? `${p.firstName} and ${sib.firstName} have been doing ${hobbyName(p.hobby!)} together every chance they get.`
        : `${p.firstName} and ${sib.firstName} have been getting along better than ever.`;
    },
  },
  {
    // A relative who lives elsewhere drops by. Some people need more time alone.
    id: 'visit', decision: false, base: 0.06, max: 0.16,
    eligible: ({ s, me, p, age }) => p.householdId !== me.householdId && age >= 18 && getBond(s, me.id, p.id).affinity >= 25,
    factors: ({ s, p }) => [
      ...when(connectionOf(p) === 'time', 'loves_time_together', 0.03),
      ...when(connectionOf(p) === 'space', 'needs_space', -0.03),
      ...when(isNear(s, p), 'nearby', 0.02),
      ...when(!isNear(s, p), 'far_away', -0.03),
    ],
    act: ({ s, me, p }) => {
      adjustBond(s, me.id, p.id, 4, 2);
      return `${p.firstName} dropped by for a visit.`;
    },
  },
  {
    // Sharing good news: a promotion this year.
    id: 'share_news', decision: false, base: 0.35, max: 0.6,
    eligible: ({ s, me, p }) => p.flags.promoted_year === s.year && !!p.jobId && getBond(s, me.id, p.id).affinity >= 0,
    factors: ({ s, me, p }) => [
      ...when(getBond(s, me.id, p.id).affinity >= 40, 'close', 0.1),
      ...when(has(p, 'ambitious'), 'ambitious', 0.05),
    ],
    act: ({ s, me, p }) => {
      adjustBond(s, me.id, p.id, 2, 1);
      return `${p.firstName} got promoted at work and called you first.`;
    },
  },
];
const BY_ID: Record<string, DecisionDef> = Object.fromEntries(DECISIONS.map((d) => [d.id, d]));

/** A career a restless partner could move into (qualified now, a different field). */
export function careerChangeFor(p: Person): Career | undefined {
  const now = p.jobId ? CAREER_BY_ID[p.jobId] : undefined;
  const options = Object.values(CAREER_BY_ID).filter((c) => c.hours === 'full' && c.id !== p.jobId && !c.military && !c.pro && !c.startup && !c.formerPro && c.sector !== now?.sector && qualifies(p, c));
  return options.length ? options[stableHash(`${p.id}:career`) % options.length] : undefined;
}

/** The player's child at home (6–17, with a hobby) a grandparent could encourage. */
function grandchildToEncourage(s: GameState, me: Person, gp: Person): Person | undefined {
  return kidsAtHome(s, me).find((k) => { const a = ageOf(k, s.year); return a >= 6 && a <= 17 && !!k.hobby && getBond(s, gp.id, k.id).affinity >= -10; });
}
/** A brother or sister at home (8–17) for this child. */
const siblingAtHome = (s: GameState, me: Person, p: Person) =>
  kidsAtHome(s, me).find((x) => x.id !== p.id && ageOf(x, s.year) >= 8 && ageOf(x, s.year) <= 17 && isSiblingOf(x, p));

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

/** The yearly pass: close people may act on a decision of their own. */
export function npcIntentions(s: GameState) {
  const me = active(s);
  if (!alive(me) || ageOf(me, s.year) < 18) return;
  let decided = false;
  let notes = 0;
  for (const p of closePeople(s)) {
    const c: DecisionCtx = { s, me, p, age: ageOf(p, s.year) };
    const canDecide = !decided && s.year - (p.flags.intent_year ?? -99) >= INTENT_GAP;
    const canNote = notes < NOTES_PER_YEAR && s.year - (p.flags.note_year ?? -99) >= NOTE_GAP;
    if (!canDecide && !canNote) continue;
    for (const def of DECISIONS) {
      if (def.decision ? !canDecide : !canNote) continue;
      if (!def.eligible(c)) continue;
      const { chance, factors } = evaluate(def, c);
      if (decisionRoll(s, p, def.id) >= chance) continue;
      if (def.decision) {
        p.flags.intent_year = s.year;
        s.scheduled.push({ dueYear: s.year, eventId: def.id, subjectId: p.id });
        decided = true;
      } else {
        p.flags.note_year = s.year;
        journal(s, def.act!(c, factors.find((f) => f.delta > 0)), 'info');
        notes++;
      }
      break;
    }
  }
}

/** For tests and reports. */
export const isDecision = (id: string) => BY_ID[id]?.decision ?? false;
export const decisionById = (id: string) => BY_ID[id];

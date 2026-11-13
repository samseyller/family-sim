/**
 * Personality: how traits change someone's *reaction* to what they do. A trait is a modifier, never a verdict: it
 * scales how much an action lifts mood, eases stress, or builds a bond (by about 5–15%, capped when traits stack),
 * and adds small, explained costs. It never changes what an action costs, what it requires, or whether it's allowed.
 *
 * Everything here is pure and deterministic (no random rolls), so traits never reshuffle the dice.
 * Design and test notes: docs/plans/personality-traits.md (local).
 */
import type { Hobby, Person, Trait } from './types';

/** What someone is doing, as far as personality is concerned. */
export type Situation =
  | 'exercise' | 'relax' | 'learn' | 'practice' | 'socialize' | 'partnerTime' | 'childTime' | 'familyOuting'
  | 'help' | 'travel' | 'newThing';

/** Hobbies that count as making something. */
export const CREATIVE_HOBBIES: Hobby[] = ['music', 'art', 'cooking', 'woodworking'];

interface Effect {
  /** Added to the reaction factor (0.1 = 10% stronger). */
  boost: number;
  /** Why, in the person's own terms ("You love a challenge."). */
  note: string;
  /** Only when this holds (e.g. creative practice needs a creative hobby). */
  when?: (p: Person) => boolean;
}

const isCreativeHobby = (p: Person) => !!p.hobby && CREATIVE_HOBBIES.includes(p.hobby);

/** Trait × situation: how much more (or less) an action does for someone like this. */
const REACTIONS: Record<Trait, Partial<Record<Situation, Effect>>> = {
  ambitious: {
    practice: { boost: 0.05, note: 'You like seeing yourself get better.' },
  },
  kind: {
    help: { boost: 0.15, note: 'Helping out comes naturally to you.' },
    partnerTime: { boost: 0.1, note: 'You give people your full attention.' },
    childTime: { boost: 0.1, note: 'You give people your full attention.' },
    socialize: { boost: 0.1, note: 'People warm to you quickly.' },
    familyOuting: { boost: 0.1, note: 'You give people your full attention.' },
  },
  stubborn: {
    practice: { boost: 0.1, note: 'You don’t give up on something you’ve chosen.' },
  },
  curious: {
    learn: { boost: 0.15, note: 'New ideas light you up.' },
    travel: { boost: 0.15, note: 'You soak up new places.' },
    newThing: { boost: 0.15, note: 'You love trying something new.' },
  },
  anxious: {
    relax: { boost: 0.15, note: 'A calm, predictable day settles your nerves.' },
  },
  easygoing: {
    relax: { boost: 0.05, note: 'You know how to switch off.' },
    familyOuting: { boost: 0.05, note: 'You roll with whatever the day brings.' },
    practice: { boost: -0.1, note: 'Grinding at the same thing isn’t really your style.' },
  },
  creative: {
    practice: { boost: 0.15, note: 'Making things feeds you.', when: isCreativeHobby },
  },
  athletic: {
    exercise: { boost: 0.15, note: 'Moving feels great to you.' },
    practice: { boost: 0.1, note: 'You love to compete.', when: (p) => p.hobby === 'sports' },
  },
};

/** Stacked traits never more than this far from neutral. */
export const REACTION_RANGE = { min: 0.8, max: 1.25 };

export interface Reaction {
  /** Multiply the action's effect on this person by this. */
  factor: number;
  /** The trait note that mattered most, if any. */
  note?: string;
  trait?: Trait;
}

/** How someone reacts to a situation, given their traits (1 = like anyone else). */
export function reaction(p: Person, situation: Situation): Reaction {
  let boost = 0;
  let top: { trait: Trait; e: Effect } | undefined;
  for (const t of p.traits) {
    const e = REACTIONS[t]?.[situation];
    if (!e || (e.when && !e.when(p))) continue;
    boost += e.boost;
    if (!top || Math.abs(e.boost) > Math.abs(top.e.boost)) top = { trait: t, e };
  }
  const factor = Math.min(REACTION_RANGE.max, Math.max(REACTION_RANGE.min, 1 + boost));
  return top ? { factor, note: top.e.note, trait: top.trait } : { factor };
}

/** Scale a change by someone's reaction (rounded to keep stats whole). */
export const scaled = (amount: number, r: Reaction) => Math.round(amount * r.factor * 10) / 10;

// ── Yearly tendencies (small, explained costs and comforts) ──────────

/** What happened in someone's year, as far as their traits care. */
export interface YearShape {
  worked: boolean;
  /** Blocks of work beyond what the job asks (negative: below it). */
  workSurplus: number;
  /** An adult under retirement age with no job at all. */
  idle: boolean;
  learned: boolean;
  practicedCreative: boolean;
  exercised: boolean;
  triedSomethingNew: boolean;
  /** Applied for or quit a job, enrolled or dropped out, or moved city this year. */
  bigChange: boolean;
  /** Someone at home felt neglected this year. */
  neglect: boolean;
  /** Helped others at least twice while stressed (70+). */
  helpedWhileStressed: boolean;
  /** Years in a row (including this one) without a creative outlet, and without anything new. */
  yearsWithoutOutlet?: number;
  yearsInRoutine?: number;
}

/** A long stretch: missing something weighs once at the end of each stretch of this many years (not every year). */
export const STRETCH = { outlet: 3, routine: 2 };
const atStretchEnd = (years: number | undefined, n: number) => !!years && years % n === 0;

export interface Tendency {
  trait: Trait;
  happiness?: number;
  stress?: number;
  note: string;
}

/** The year's small trait effects for one person (each trait contributes at most one). */
export function yearTendencies(p: Person, y: YearShape): Tendency[] {
  const out: Tendency[] = [];
  const has = (t: Trait) => p.traits.includes(t);
  if (has('ambitious')) {
    if (y.worked && y.workSurplus > 0) out.push({ trait: 'ambitious', happiness: 3, note: 'You love a challenge: going the extra mile at work felt good.' });
    else if ((y.worked && y.workSurplus < 0) || y.idle) out.push({ trait: 'ambitious', happiness: -3, note: 'A stalled year gnawed at you.' });
    else if (y.neglect) out.push({ trait: 'ambitious', happiness: -2, note: 'You know you let family slip this year, and it stings.' });
  }
  if (has('kind') && y.helpedWhileStressed) out.push({ trait: 'kind', stress: 3, note: 'You kept helping everyone while running on empty.' });
  if (has('curious') && atStretchEnd(y.yearsInRoutine, STRETCH.routine)) out.push({ trait: 'curious', happiness: -2, note: 'The routine has gone stale: nothing new in a while.' });
  if (has('anxious')) {
    if (y.bigChange) out.push({ trait: 'anxious', stress: 4, note: 'All the change this year kept you up at night.' });
    else out.push({ trait: 'anxious', stress: -2, note: 'A steady, predictable year suited you.' });
  }
  if (has('easygoing')) out.push({ trait: 'easygoing', stress: -1, note: 'You rolled with whatever came.' });
  if (has('creative') && atStretchEnd(y.yearsWithoutOutlet, STRETCH.outlet)) out.push({ trait: 'creative', happiness: -2, note: 'Years without a creative outlet: you miss making things.' });
  if (has('athletic') && !y.exercised) out.push({ trait: 'athletic', happiness: -2, note: 'You felt restless without exercise.' });
  return out;
}

// ── Explaining traits ───────────────────────────────────────────────

/** One line each: what the trait tends to bring, and what it can cost. For tooltips. */
export const TRAIT_INFO: Record<Trait, string> = {
  ambitious: 'Thrives on progress and going the extra mile; a stalled year or neglected family weighs more.',
  kind: 'Helping and time together build bonds faster; helping while stressed takes a toll.',
  stubborn: 'Sticks with what they chose; pushes back when pressured (trust and patience still work).',
  curious: 'Gets more from learning, travel and new things; a year of the same routine feels stale.',
  anxious: 'Calm routines and rest help a lot; big changes bring extra worry for a while.',
  easygoing: 'Rolls with setbacks and stress; less driven by repetitive practice.',
  creative: 'Making things feeds them; a year without a creative outlet drags.',
  athletic: 'Gets more from exercise and sports; restless in a year without them.',
};

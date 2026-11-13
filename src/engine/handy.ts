/**
 * Hobby skills that pay off at home: a mechanic in the family fixes the cars for less (and keeps
 * them running longer), a woodworker does renovations and additions themselves, and a gardener
 * with a yard grows some of the groceries.
 */
import { HOMES } from '../content/finance';
import type { GameState, Hobby, Household } from './types';
import { ageOf, membersOf } from './util';

export const HANDY = {
  /** At skill 100, repairs cost this much less and breakdowns are this much rarer. */
  mechanicRepairCut: 0.5,
  mechanicBreakdownCut: 0.3,
  /** At skill 100, renovations and additions cost this much less (you supply the labor). */
  diyCut: 0.35,
  /** Groceries a skilled gardener grows in a year (before city prices), and the greenhouse bonus. */
  gardenMax: 2500,
  greenhouseBoost: 1.5,
} as const;

/** The best skill at this hobby among the adults living in a household. */
export function bestSkill(s: GameState, householdId: string, hobby: Hobby) {
  return membersOf(s, householdId)
    .filter((p) => ageOf(p, s.year) >= 18)
    .reduce((best, p) => Math.max(best, p.skills[hobby] ?? 0), 0);
}

const share = (skill: number) => Math.min(100, Math.max(0, skill)) / 100;

/** Multiplier on car repair bills for a household with this mechanic skill. */
export const repairFactor = (skill: number) => 1 - HANDY.mechanicRepairCut * share(skill);
/** Multiplier on breakdown chances. */
export const breakdownFactor = (skill: number) => 1 - HANDY.mechanicBreakdownCut * share(skill);
/** Multiplier on renovation and addition costs for a household with this woodworking skill. */
export const diyFactor = (skill: number) => 1 - HANDY.diyCut * share(skill);

/**
 * What the household's garden saves on groceries this year (before city prices): someone at
 * home must garden as their hobby, and the home needs a yard (an owned house, not a condo).
 */
export function gardenHarvest(s: GameState, hh: Household) {
  const home = hh.assets.find((a) => a.kind === 'house');
  if (!home || home.name === HOMES.condo.label) return 0;
  const gardeners = membersOf(s, hh.id).filter((p) => ageOf(p, s.year) >= 12 && p.hobby === 'gardening');
  if (!gardeners.length) return 0;
  const skill = Math.max(...gardeners.map((p) => p.skills.gardening ?? 0));
  const greenhouse = (home.upgrades ?? []).includes('greenhouse') ? HANDY.greenhouseBoost : 1;
  return Math.round(HANDY.gardenMax * share(skill) * greenhouse);
}

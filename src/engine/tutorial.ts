/**
 * Guided first playthrough. A fixed family, starting at 18. Tabs unlock with age, a few
 * life beats are scripted, and guardrails keep the first life from going badly wrong:
 *  - money can't sink below a small cushion before 24 (the Money tab opens at 24);
 *  - a child is guaranteed between 24 and 30;
 *  - no severe negative events before 35;
 *  - the guided character can't die before 65.
 */
import type { GameState, Person } from './types';
import { ageOf, journal } from './util';

export const TUTORIAL_SEED = 20261109;
export const TUTORIAL_START_AGE = 18;

export type TabId = 'home' | 'plan' | 'family' | 'journal' | 'money' | 'activities';

/** Age at which each tab opens during the guided playthrough. */
export const TAB_UNLOCK_AGE: Record<TabId, number> = {
  home: 18,
  plan: 18,
  family: 20,
  journal: 20,
  money: 24,
  activities: 30,
};

export const FINANCE_GUARD_UNTIL = 24;
export const SEVERE_GUARD_UNTIL = 35;
export const DEATH_GUARD_UNTIL = 65;
/** Random major events stay quiet (only scripted and life-stage beats) until this age. */
export const SCRIPTED_UNTIL = 30;
/** Money floor while finances are guarded. */
export const CUSHION = 1000;

/** Scripted beats: [age, event id]. Each fires only if it still makes sense then. */
export const SCRIPT: [number, string][] = [
  [21, 'meet_someone'],
  [23, 'proposal'],
  [25, 'baby'],
];

const guided = (s: GameState) => !!s.tutorial;

/** The guided character (the first one played), while the tutorial applies. */
export function guidedPerson(s: GameState): Person | undefined {
  return guided(s) ? s.people[s.tutorial!.personId] : undefined;
}

const guidedAge = (s: GameState) => {
  const p = guidedPerson(s);
  return p && p.id === s.activeId ? ageOf(p, s.year) : undefined;
};

/** Tabs the player can use right now. Everything is open outside the guided playthrough. */
export function unlockedTabs(s: GameState): TabId[] {
  const age = guidedAge(s);
  const all = Object.keys(TAB_UNLOCK_AGE) as TabId[];
  return age === undefined ? all : all.filter((t) => age >= TAB_UNLOCK_AGE[t]);
}

/** Severe events are held back early in the guided life. */
export const severeGuard = (s: GameState) => (guidedAge(s) ?? Infinity) < SEVERE_GUARD_UNTIL;
/** Random majors are held back early, leaving room for scripted beats. */
export const scriptedPhase = (s: GameState) => (guidedAge(s) ?? Infinity) < SCRIPTED_UNTIL;
/** Finances are cushioned early. */
export const financeGuard = (s: GameState) => (guidedAge(s) ?? Infinity) < FINANCE_GUARD_UNTIL;
/** The guided character can't die before 65; family at home is safe while they're young. */
export function deathGuard(s: GameState, p: Person) {
  const g = guidedPerson(s);
  if (!g) return false;
  const gAge = ageOf(g, s.year);
  if (p.id === g.id) return gAge < DEATH_GUARD_UNTIL;
  return gAge < SEVERE_GUARD_UNTIL && p.householdId === g.householdId;
}

/** Top the household up to the cushion while finances are guarded. */
export function applyCushion(s: GameState) {
  if (!financeGuard(s)) return;
  const g = guidedPerson(s)!;
  const hh = s.households[g.householdId];
  if (hh.wallet < CUSHION) {
    journal(s, 'Family helped you cover the bills this year.', 'info');
    hh.wallet = CUSHION;
  }
}

/** Queue the scripted beats relative to the guided character's birth year. */
export function scheduleScript(s: GameState, p: Person) {
  for (const [age, eventId] of SCRIPT) s.scheduled.push({ dueYear: p.birthYear + age, eventId });
}

export function markSeen(state: GameState, id: string): GameState {
  if (!state.tutorial || state.tutorial.seen.includes(id)) return state;
  return { ...state, tutorial: { ...state.tutorial, seen: [...state.tutorial.seen, id] } };
}

/** End the guided mode early (the player chose to skip the guide). */
export function skipTutorial(state: GameState): GameState {
  if (!state.tutorial) return state;
  const s = structuredClone(state);
  delete s.tutorial;
  journal(s, 'You switched off the guide. Anything can happen now.', 'info');
  return s;
}

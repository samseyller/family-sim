/** What every event file shares: the event types, small helpers, and queuing an event right now. */
import type { GameState, PendingChoice, PendingEvent, Person } from './types';
import type { Rng } from './rng';
import { ageOf, newId } from './util';
import { CITIES } from '../content/cities';
import { cityOfHousehold } from './location';

export interface Ctx {
  s: GameState;
  rng: Rng;
  me: Person;
}

export interface Built {
  title: string;
  text: string;
  choices: PendingChoice[];
}

export interface Candidate {
  subject?: Person;
  weight: number;
  /** Circumstance-driven: fires before the pacing timer is considered. */
  urgent?: boolean;
  /** Long overdue: comes up even in a year that already has major news (at most one a year). */
  overdue?: boolean;
}

export interface EventDef {
  id: string;
  major: boolean;
  cooldown: number;
  candidates?: (c: Ctx) => Candidate[];
  build: (c: Ctx, sub?: Person) => Built;
  resolve: (c: Ctx, choice: string, sub?: Person, text?: string) => string;
  /** Who can get this event: adults (default), children (under 18), or anyone. */
  stage?: 'adult' | 'child' | 'any';
  /** Harsh events, held back early in the guided first playthrough. */
  severe?: boolean;
  /** A work moment: at most one comes up a year (see generateEvents and careerEvents.ts). */
  work?: boolean;
  /** A story follow-up from a recorded thread (storyEvents.ts): at most one comes up a year. */
  story?: boolean;
}

export const wallet = (c: Ctx) => c.s.households[c.me.householdId];
export const age = (c: Ctx, p: Person) => ageOf(p, c.s.year);
/** Prices scale with the city's everyday costs, rounded to $50. */
export const local = (c: Ctx, n: number) => Math.round((n * CITIES[cityOfHousehold(wallet(c))].living) / 50) * 50;
export const one = (cond: boolean, weight: number, urgent = false, subject?: Person): Candidate[] =>
  cond ? [{ weight, urgent, subject }] : [];
/** You have a job you've held since before this year (no office drama in your first days). */
export const settledInJob = (c: { s: GameState; me: Person }) => !!c.me.jobId && c.me.flags.hired_year !== c.s.year;

/** Build an event and add it to this year's decisions. */
export function pushPending(c: Ctx, def: EventDef, subject?: Person, recheck = false) {
  const built = def.build(c, subject);
  const ev: PendingEvent = {
    uid: `${c.s.year}-${def.id}-${newId(c.s, 'e')}`,
    eventId: def.id,
    subjectId: subject?.id,
    major: def.major,
    ...(recheck ? { recheck: true } : {}),
    ...built,
  };
  c.s.pending.push(ev);
  c.s.lastFired[def.id] = c.s.year;
  if (def.major) c.s.lastMajorYear = c.s.year;
}

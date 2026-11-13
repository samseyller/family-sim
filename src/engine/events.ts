/**
 * Events: the registry, yearly pacing (generateEvents), resolving a choice, and keeping waiting events current.
 * The events themselves live in topic files (workEvents, familyEvents, lifeEvents, ...).
 */
import { CHILD_EVENTS } from './childhood';
import { LIFE_EVENTS } from './lifeEvents';
import { HOBBY_EVENTS } from './hobbyEvents';
import { MILITARY_EVENTS } from './militaryEvents';
import { SPORTS_EVENTS } from './sportsEvents';
import { HOME_EVENTS } from './homeEvents';
import { CAT_EVENTS } from './catEvents';
import { ROMANCE_EVENTS } from './romanceEvents';
import { LEARNING_EVENTS, WORK_EVENTS } from './workEvents';
import { FULL_HOUSE_EVENTS, GUIDED_KID, NAME_BABY, PARTNERSHIP_EVENTS, RAISING_EVENTS } from './familyEvents';
import { FRIEND_EVENTS } from './socialEvents';
import { DOG_EVENTS } from './dogEvents';
import { CAR_EVENTS, HOUSE_EVENTS } from './moneyEvents';
import { HEALTH_EVENTS } from './healthEvents';
import { PERSONALITY_EVENTS } from './personalityEvents';
import { RELATIONSHIP_EVENTS } from './relationshipEvents';
import { ASPIRATION_EVENTS } from './aspirationEvents';
import { CAREER_EVENTS } from './careerEvents';
import { scriptedPhase, severeGuard } from './tutorial';
import { makeRng, type Rng } from './rng';
import type { GameState, PendingEvent } from './types';
import { active, ageOf, alive, journal } from './util';
import { pushPending, type Candidate, type Ctx, type EventDef } from './eventKit';

export type { Ctx, EventDef } from './eventKit';
export { settledInJob } from './eventKit';
export { PROMO } from './workEvents';

/** Every event, in a fixed order: generateEvents walks this order before its weighted random pick. */
const ALL_EVENTS: EventDef[] = [
  ...WORK_EVENTS, ...RAISING_EVENTS, ...PARTNERSHIP_EVENTS, ...HOUSE_EVENTS, ...FRIEND_EVENTS, ...DOG_EVENTS, ...CAR_EVENTS,
  ...FULL_HOUSE_EVENTS, ...LEARNING_EVENTS,
  ...CHILD_EVENTS, ...LIFE_EVENTS, ...HOBBY_EVENTS, ...MILITARY_EVENTS, ...SPORTS_EVENTS, ...HOME_EVENTS, ...CAT_EVENTS, ...ROMANCE_EVENTS,
  NAME_BABY, GUIDED_KID,
  ...HEALTH_EVENTS,
  ...PERSONALITY_EVENTS,
  ...RELATIONSHIP_EVENTS,
  ...ASPIRATION_EVENTS,
  ...CAREER_EVENTS,
];

export const EVENT_BY_ID: Record<string, EventDef> = Object.fromEntries(ALL_EVENTS.map((e) => [e.id, e]));

const MAX_MINOR = 2;

/**
 * Step 7: decide this year's events. Scheduled consequences first, then
 * circumstance-driven (urgent) majors, then the pacing timer, then minors.
 */
export function generateEvents(s: GameState, rng: Rng) {
  const c: Ctx = { s, rng, me: active(s) };
  const due = s.scheduled.filter((x) => x.dueYear <= s.year);
  s.scheduled = s.scheduled.filter((x) => x.dueYear > s.year);
  for (const sch of due) {
    const def = EVENT_BY_ID[sch.eventId];
    if (!def) continue; // unknown (older-rules) event: never crash, just skip it
    let sub = sch.subjectId ? s.people[sch.subjectId] : undefined;
    if (sub && (!alive(sub) || (['health_scare', 'test_results'].includes(sch.eventId) && sub.id !== s.activeId))) continue;
    if (def.severe && severeGuard(s)) continue; // held back early in the guided playthrough
    // Scripted beats only happen if they still make sense (e.g. a proposal needs someone to propose to).
    if (def.candidates && !sch.subjectId) {
      const cands = def.candidates(c).filter((x) => x.weight > 0);
      if (!cands.length) continue;
      sub = cands[0].subject;
    }
    pushPending(c, def, sub);
  }

  const eligible: { def: EventDef; cand: Candidate }[] = [];
  const childActive = ageOf(c.me, s.year) < 18;
  for (const def of ALL_EVENTS) {
    if (!def.candidates) continue;
    // Children only get childhood events; adults never do. "any" events check age themselves.
    const stage = def.stage ?? 'adult';
    if (stage !== 'any' && (stage === 'child') !== childActive) continue;
    if (def.severe && severeGuard(s)) continue;
    const last = s.lastFired[def.id];
    if (last !== undefined && s.year - last < Math.max(1, def.cooldown)) continue;
    for (const cand of def.candidates(c)) if (cand.weight > 0) eligible.push({ def, cand });
  }

  // At most one work moment a year: once one is pending, other work events wait.
  let workUsed = s.pending.some((p) => EVENT_BY_ID[p.eventId]?.work);
  const allowed = (e: { def: EventDef }) => !(workUsed && e.def.work);
  if (!s.pending.some((p) => p.major)) {
    const urgent = eligible.filter((e) => e.def.major && e.cand.urgent && allowed(e));
    let pick = rng.weighted(urgent.map((e) => [e, e.cand.weight] as const));
    // Random majors wait until the guided playthrough opens up; scripted and life-stage beats still happen.
    if (!pick && !scriptedPhase(s)) {
      const since = s.year - s.lastMajorYear;
      const chance = since < 3 ? 0 : Math.min(0.9, (since - 2) * 0.3);
      if (rng.chance(chance)) {
        pick = rng.weighted(eligible.filter((e) => e.def.major && allowed(e)).map((e) => [e, e.cand.weight] as const));
      }
    }
    if (pick) { pushPending(c, pick.def, pick.cand.subject, true); if (pick.def.work) workUsed = true; }
  } else {
    // Something major already happened this year; long-overdue news (a promotion earned years
    // ago) still comes, so a run of bad luck can't hold it back forever.
    const pick = rng.weighted(eligible.filter((e) => e.def.major && e.cand.overdue).map((e) => [e, e.cand.weight] as const));
    if (pick) pushPending(c, pick.def, pick.cand.subject, true);
  }

  let minors = eligible.filter((e) => !e.def.major && allowed(e));
  let count = 0;
  while (minors.length && count < MAX_MINOR) {
    const pick = rng.weighted(minors.map((e) => [e, e.cand.weight] as const))!;
    minors = minors.filter((e) => e.def !== pick.def);
    if (!rng.chance(0.55)) continue;
    pushPending(c, pick.def, pick.cand.subject, true);
    count++;
    if (pick.def.work) { workUsed = true; minors = minors.filter(allowed); }
  }
}

export function resolveEvent(s: GameState, rng: Rng, pe: PendingEvent, choiceId: string, text?: string): string {
  const def = EVENT_BY_ID[pe.eventId];
  if (!def) return "This moment has passed.";
  const c: Ctx = { s, rng, me: active(s) };
  const sub = pe.subjectId ? s.people[pe.subjectId] : undefined;
  if (pe.subjectId && (!sub || !alive(sub))) return 'Circumstances changed before you could act.';
  const before = s.journal.length;
  const outcome = def.resolve(c, choiceId, sub, text);
  // If the event already wrote its own headline, log the outcome as a normal entry so highlights don't repeat.
  const headlined = s.journal.slice(before).some((j) => j.kind === 'major' || j.kind === 'birth');
  journal(s, `${pe.title}: ${outcome}`, pe.major && !headlined ? 'major' : 'info');
  return outcome;
}



/**
 * Is a chance-picked event still sensible after this year's earlier decisions? (A layoff
 * means no more office drama; a breakup means no proposal; a dog that passed can't get sick.)
 * Its own conditions are checked again against the current state.
 */
export function stillRelevant(s: GameState, pe: PendingEvent): boolean {
  if (!pe.recheck) return true;
  const def = EVENT_BY_ID[pe.eventId];
  if (!def?.candidates) return true;
  const c: Ctx = { s, rng: makeRng(0), me: active(s) }; // conditions never roll dice
  return def.candidates(c).some((x) => x.weight > 0 && (x.subject?.id ?? undefined) === (pe.subjectId ?? undefined));
}

/**
 * Rebuild a waiting event against the current state, so its text and which choices are
 * affordable reflect earlier decisions this year. Keeps its identity; keeps the original if
 * the event can't be rebuilt or would change its set of choices.
 */
export function refreshPending(s: GameState, pe: PendingEvent): PendingEvent {
  const def = EVENT_BY_ID[pe.eventId];
  if (!def) return pe;
  const sub = pe.subjectId ? s.people[pe.subjectId] : undefined;
  if (pe.subjectId && (!sub || !alive(sub))) return pe;
  try {
    const built = def.build({ s, rng: makeRng(0), me: active(s) }, sub);
    const same = built.choices.length === pe.choices.length && built.choices.every((ch, i) => ch.id === pe.choices[i].id)
      && built.choices.some((ch) => !ch.disabled);
    return same ? { ...pe, ...built } : pe;
  } catch {
    return pe;
  }
}

/**
 * Cross-checks a save's references against what this version of the game knows:
 * events (pending and scheduled, including their choice IDs where practical),
 * careers, and the people that scheduled events, births, and the guide point at.
 *
 * Saves made with the *current* rules must be clean. Saves from *older* rules can
 * be repaired: content that no longer exists is dropped and the player is told.
 */
import { CAREER_BY_ID } from '../content/careers';
import { EVENT_BY_ID } from '../engine/events';
import { finalizeRecap } from '../engine/phases';
import { makeRng } from '../engine/rng';
import type { GameState, PendingEvent } from '../engine/types';
import { active } from '../engine/util';

/** Choice IDs the event would offer if built now; undefined if that can't be determined. */
function expectedChoiceIds(s: GameState, pe: PendingEvent): Set<string> | undefined {
  const def = EVENT_BY_ID[pe.eventId];
  if (!def) return undefined;
  try {
    const clone: GameState = structuredClone(s);
    const sub = pe.subjectId ? clone.people[pe.subjectId] : undefined;
    const built = def.build({ s: clone, rng: makeRng(clone.rngState), me: active(clone) }, sub);
    return new Set(built.choices.map((c) => c.id));
  } catch {
    return undefined;
  }
}

function badPendingReason(s: GameState, pe: PendingEvent): string | null {
  if (!EVENT_BY_ID[pe.eventId]) return `pending event "${pe.eventId}" does not exist`;
  const ids = pe.choices.map((c) => c.id);
  if (new Set(ids).size !== ids.length) return `pending event "${pe.eventId}" has duplicate choices`;
  const expected = expectedChoiceIds(s, pe);
  if (!expected) return `pending event "${pe.eventId}" cannot be shown`;
  // Name suggestions are generated per birth ("n:<name>"), so only their shape can be checked.
  const unknown = ids.filter((id) => !expected.has(id) && !(pe.eventId === 'name_baby' && /^n:\S/.test(id)));
  return unknown.length ? `pending event "${pe.eventId}" has unknown choices: ${unknown.join(', ')}` : null;
}

/** Every reference problem in the state (empty when the save is safe to play). */
export function referenceProblems(s: GameState): string[] {
  const problems: string[] = [];
  for (const pe of s.pending) {
    const why = badPendingReason(s, pe);
    if (why) problems.push(why);
  }
  for (const sch of s.scheduled) {
    if (!EVENT_BY_ID[sch.eventId]) problems.push(`scheduled event "${sch.eventId}" does not exist`);
    if (sch.subjectId && !s.people[sch.subjectId]) problems.push(`scheduled event "${sch.eventId}" refers to missing person ${sch.subjectId}`);
  }
  for (const p of Object.values(s.people)) {
    if (p.jobId && !CAREER_BY_ID[p.jobId]) problems.push(`${p.id} has unknown job "${p.jobId}"`);
    if (p.partJobId && !CAREER_BY_ID[p.partJobId]) problems.push(`${p.id} has unknown part-time job "${p.partJobId}"`);
  }
  for (const it of s.plan.jobIntents) {
    if (it.kind === 'apply' && !CAREER_BY_ID[it.careerId]) problems.push(`plan applies for unknown job "${it.careerId}"`);
  }
  for (const hh of Object.values(s.households)) {
    for (const pid of hh.pendingBirth?.parents ?? []) if (!s.people[pid]) problems.push(`${hh.id} expects a birth to missing person ${pid}`);
  }
  if (s.tutorial && !s.people[s.tutorial.personId]) problems.push(`the guide follows missing person ${s.tutorial.personId}`);
  for (const fs of s.friends ?? []) {
    if (!s.people[fs.id] || !s.people[fs.of]) problems.push(`a friendship refers to missing person ${s.people[fs.id] ? fs.of : fs.id}`);
  }
  return problems;
}

/**
 * Repair a save made with older rules: drop events and jobs this version doesn't have.
 * Returns notes describing what changed (empty if nothing needed repair).
 */
export function repairOlderRules(state: GameState): { state: GameState; notes: string[] } {
  const s: GameState = structuredClone(state);
  const notes: string[] = [];
  const before = s.pending.length;
  s.pending = s.pending.filter((pe) => !badPendingReason(s, pe));
  if (s.pending.length < before) notes.push(`${before - s.pending.length} pending event(s) from older rules were skipped.`);
  const sched = s.scheduled.length;
  s.scheduled = s.scheduled.filter((x) => EVENT_BY_ID[x.eventId] && (!x.subjectId || s.people[x.subjectId]));
  if (s.scheduled.length < sched) notes.push(`${sched - s.scheduled.length} upcoming event(s) from older rules were dropped.`);
  for (const p of Object.values(s.people)) {
    if (p.jobId && !CAREER_BY_ID[p.jobId]) {
      notes.push(`${p.firstName}'s old job no longer exists; they are looking for work.`);
      p.jobId = undefined;
    }
    if (p.partJobId && !CAREER_BY_ID[p.partJobId]) p.partJobId = undefined;
  }
  s.plan.jobIntents = s.plan.jobIntents.filter((it) => it.kind !== 'apply' || CAREER_BY_ID[it.careerId]);
  for (const hh of Object.values(s.households)) {
    if (hh.pendingBirth && hh.pendingBirth.parents.some((pid) => !s.people[pid])) hh.pendingBirth = undefined;
  }
  if (s.tutorial && !s.people[s.tutorial.personId]) delete s.tutorial;
  if (s.friends) s.friends = s.friends.filter((fs) => s.people[fs.id] && s.people[fs.of]);
  // Story threads only add stories: ones pointing at people this save no longer has are dropped.
  if (s.threads) s.threads = s.threads.filter((t) => s.people[t.ownerId] && (!t.subjectId || s.people[t.subjectId]));
  for (const t of s.threads ?? []) if (t.takers) for (const id of Object.keys(t.takers)) if (!s.people[id]) delete t.takers[id];
  // If every pending decision was dropped, finish the year so play can continue.
  if (s.phase === 'DECISIONS' && s.pending.length === 0) {
    if (s.snapshot) finalizeRecap(s);
    else {
      s.phase = 'RECAP';
      s.recap = { year: s.year, statDeltas: {}, walletDelta: 0, entries: s.journal.filter((j) => j.year === s.year), activeDied: false };
    }
  }
  return { state: s, notes };
}

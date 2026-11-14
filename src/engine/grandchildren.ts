/**
 * Grandchildren's stories (docs/plans/next-stories.md §1): the history a played grandparent builds with each
 * grandchild, recorded as a `grandchild` story thread (owner: the grandparent, subject: the grandchild).
 *
 * - **Time together:** a year counts when a grandchild takes part in an activity with you (visits, dinners, reunions,
 *   teaching your craft...), once a year however much happened. The thread starts on the second such year (one visit
 *   isn't a relationship); `detail` is the craft you taught, if any.
 * - **Teaching:** the "Teach a grandchild your craft" activity raises their skill and may start them on your hobby.
 * - **Follow-ups** (storyEvents.ts): what you taught them, their 18th birthday (a gift, a letter, or just being
 *   there), and a single gentle nudge about a far-away grandchild you've barely seen.
 * - **Later:** coming of age and succession name what was shared; the skipped generation is a recognized pattern.
 */
import type { GameState, Person, Thread } from './types';
import { ageOf, alive, childrenOf } from './util';
import { noteThread } from './threads';

/** Is `p` a grandchild of `gp` (a child of one of their children)? */
export const isGrandchildOf = (s: GameState, p: Person, gp: Person) =>
  childrenOf(s, gp.id).some((k) => p.biologicalParents.includes(k.id) || p.adoptiveParents.includes(k.id));
/** All living grandchildren of `gp`. */
export const grandchildrenOf = (s: GameState, gp: Person) =>
  childrenOf(s, gp.id).flatMap((k) => childrenOf(s, k.id)).filter((g, i, all) => alive(g) && all.findIndex((x) => x.id === g.id) === i);
/** The thread with this grandchild, open or not. */
export const grandchildThread = (s: GameState, gp: Person, gc: Person): Thread | undefined =>
  (s.threads ?? []).find((t) => t.kind === 'grandchild' && t.ownerId === gp.id && t.subjectId === gc.id && t.closed === undefined);
/** Years recorded with this grandchild (0 if no thread yet). */
export const yearsWith = (s: GameState, gp: Person, gc: Person) => grandchildThread(s, gp, gc)?.hits.length ?? 0;

/** Time together this year. Starts the thread on the second distinct year; `craft` records what you taught. */
export function noteGrandchild(s: GameState, gp: Person, gc: Person, craft?: string) {
  if (!isGrandchildOf(s, gc, gp)) return;
  let t = grandchildThread(s, gp, gc);
  if (!t) {
    const first = gc.flags.gp_seen;
    if (first === undefined || first === s.year) { gc.flags.gp_seen = s.year; return; }
    t = noteThread(s, 'grandchild', gp, gc, { year: first });
    if (!t) return;
  }
  noteThread(s, 'grandchild', gp, gc);
  if (craft && !t.detail) t.detail = craft;
}

/** A grandchild of the active player took part in this activity: note the time together. */
export function grandchildrenTookPart(s: GameState, gp: Person, people: Person[], craft?: string) {
  for (const p of people) if (isGrandchildOf(s, p, gp)) noteGrandchild(s, gp, p, craft);
}

/** Grandchildren close enough to count in the life story: 3+ recorded years. */
export const closeGrandchildren = (s: GameState, gp: Person) =>
  (s.threads ?? []).filter((t) => t.kind === 'grandchild' && t.ownerId === gp.id && t.hits.length >= 3 && !!s.people[t.subjectId ?? '']);

/** Birthday calls (from the far-away nudge) count as a little time together each year. */
export function grandchildrenYear(s: GameState, gp: Person) {
  for (const gc of grandchildrenOf(s, gp)) {
    if (gc.flags.birthday_calls !== undefined && ageOf(gc, s.year) < 18) noteGrandchild(s, gp, gc);
  }
}

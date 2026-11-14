/**
 * Story threads: the few patterns in a life that can matter years later.
 *
 * A thread is a bounded record of something the simulation actually saw happen: the years a pattern showed up
 * (`hits`), the years it was answered (`answers`), who it concerns, and how it ended. Follow-up events (storyEvents.ts)
 * read threads to decide whether they are eligible, and quote only what a thread recorded, so a character never
 * remembers something that didn't happen.
 *
 * Most choices never create a thread. Only recurring patterns and a handful of significant moments do:
 *
 *   strain        someone you hurt in two or more different years (missed moments, pressure, broken promises);
 *                 answers are years you showed up for them afterwards (time together, support, kept promises)
 *   supported     someone you stood by in two or more different years
 *   encouraged    your child's interest you backed (lessons, practice they welcomed, a hobby you suggested)
 *   pushed        your child pushing back against your plans for them, year after year
 *   siblings      two of your children: hits are years they bonded, answers are years they clashed
 *   work_first    years you put work far ahead of time with your young children
 *   trained       a credential you earned as an adult
 *   missed_chance a promotion you turned down
 *   aspiration    years your life served what you wanted from it (fades after two years without)
 *   moved         moving away from a parent
 *   retired       retiring (detail: your last job)
 *   loss          losing someone close (for later stories; never a follow-up event of its own)
 *   tradition     a family tradition, live while kept (its own lifecycle in traditions.ts)
 *   grandchild    years of time together with a grandchild, and the craft you taught (grandchildren.ts)
 *
 * Lifecycle: a thread with no new hit for its `fade` years closes quietly; a thread whose subject has died closes;
 * at succession the heir inherits only what makes sense (someone the late character stood by may now stand by the
 * heir), everything else ends. Closed threads stay a while for the life story, then go: storage stays small.
 */
import { grandchildrenYear } from './grandchildren';
import { inheritTraditions, traditionsYear } from './traditions';
import type { GameState, Person, Thread, ThreadKind } from './types';
import { active, ageOf, alive, childrenOf, getBond, kidsAtHome, partnerOf } from './util';

/** Distinct years kept per thread, closed threads kept for the life story, and threads kept at most. */
const YEARS_KEPT = 8;
export const CLOSED_KEPT_YEARS = 60;
const MAX_THREADS = 60;
/** After a thread closes, the same pattern with the same person needs this long to start a new one. */
const REOPEN_GAP = 6;

interface Rule {
  /** Years without a new hit before the thread closes quietly. */
  fade: number;
  /** Survives the subject's death (only loss). */
  keepsDead?: boolean;
  /** Passes to the heir at succession. */
  inherit?: boolean;
}
export const THREAD_RULES: Record<ThreadKind, Rule> = {
  strain: { fade: 10 },
  supported: { fade: 14, inherit: true },
  encouraged: { fade: 12 },
  pushed: { fade: 12 },
  siblings: { fade: 14 },
  work_first: { fade: 4 },
  trained: { fade: 10 },
  missed_chance: { fade: 10 },
  aspiration: { fade: 2 },
  moved: { fade: 12 },
  retired: { fade: 6 },
  loss: { fade: 15, keepsDead: true },
  // Recognized patterns are closed when created (patterns.ts); they only live on for the life story.
  pattern: { fade: 0, keepsDead: true },
  // Traditions lapse by their own rules (traditions.ts).
  tradition: { fade: Infinity, keepsDead: true },
  grandchild: { fade: 12 },
};

const lastOf = (xs: number[] | undefined) => (xs?.length ? xs[xs.length - 1] : undefined);
const addYear = (xs: number[], year: number) => {
  if (xs.includes(year)) return;
  xs.push(year);
  xs.sort((a, b) => a - b);
  if (xs.length > YEARS_KEPT) xs.splice(0, xs.length - YEARS_KEPT);
};

/** The open thread of this kind for this owner (and subject, when given). */
export function openThread(s: GameState, kind: ThreadKind, ownerId: string, subjectId?: string, detail?: string): Thread | undefined {
  return (s.threads ?? []).find((t) => t.kind === kind && t.ownerId === ownerId && t.closed === undefined
    && (subjectId === undefined || t.subjectId === subjectId) && (detail === undefined || t.detail === detail));
}

/** Every thread (open or closed) of this kind for this owner. */
export const threadsOf = (s: GameState, ownerId: string, kind?: ThreadKind) =>
  (s.threads ?? []).filter((t) => t.ownerId === ownerId && (!kind || t.kind === kind));

/**
 * Record that a pattern showed up this year (or, with `answer`, that it was answered). Creates the thread when
 * needed, unless the same pattern with the same person closed recently. Returns the thread.
 */
export function noteThread(s: GameState, kind: ThreadKind, owner: Person, subject?: Person, opts: { detail?: string; answer?: boolean; year?: number; keyed?: boolean } = {}): Thread | undefined {
  const year = opts.year ?? s.year;
  // Keyed threads are one per (subject, detail) pair (two siblings); otherwise a new detail replaces the old thread.
  let t = openThread(s, kind, owner.id, subject?.id, opts.keyed ? opts.detail : undefined);
  if (t && !opts.keyed && opts.detail !== undefined && t.detail !== opts.detail) {
    // The pattern changed shape (a different hobby, a different aspiration): the old thread ends here.
    closeThread(t, s.year, 'changed');
    t = undefined;
  }
  if (!t) {
    if (opts.answer) return undefined; // nothing to answer yet
    const recent = (s.threads ?? []).some((x) => x.kind === kind && x.ownerId === owner.id && x.subjectId === subject?.id
      && x.closed !== undefined && s.year - x.closed < REOPEN_GAP && (opts.detail === undefined || x.detail === opts.detail));
    if (recent) return undefined;
    t = { kind, ownerId: owner.id, ...(subject ? { subjectId: subject.id } : {}), ...(opts.detail !== undefined ? { detail: opts.detail } : {}), since: year, hits: [] };
    (s.threads ??= []).push(t);
  }
  if (opts.answer) addYear((t.answers ??= []), year);
  else addYear(t.hits, year);
  return t;
}

/** Two of your children shared a year: bonded, or (with `clash`) clashed. One thread per pair. */
export function noteSiblings(s: GameState, owner: Person, a: Person, b: Person, clash = false) {
  const [older, younger] = a.birthYear < b.birthYear || (a.birthYear === b.birthYear && a.id < b.id) ? [a, b] : [b, a];
  noteThread(s, 'siblings', owner, older, { detail: younger.id, keyed: true });
  if (clash) noteThread(s, 'siblings', owner, older, { detail: younger.id, keyed: true, answer: true });
}

/** End a thread (a follow-up resolved it, it faded, or it stopped making sense). */
export function closeThread(t: Thread, year: number, outcome: string) {
  if (t.closed !== undefined) return;
  t.closed = year;
  t.outcome = outcome;
}

/** Answers that came after the last hit (sustained improvement since the pattern last showed up). */
export const answersSince = (t: Thread) => (t.answers ?? []).filter((y) => y > (lastOf(t.hits) ?? -Infinity)).length;

// ── The yearly pass ─────────────────────────────────────────────────

const HARMS = new Set(['missed', 'pressure', 'promise_broken']);
const CARE = new Set(['support', 'promise_kept']);

/** Record this year's patterns for the player character, then age out what no longer applies. */
export function threadsYear(s: GameState) {
  const me = active(s);
  if (alive(me) && ageOf(me, s.year) >= 18) { record(s, me); traditionsYear(s, me); grandchildrenYear(s, me); }
  lifecycle(s);
}

function record(s: GameState, me: Person) {
  // What people remember about you: harms and care, by distinct year.
  for (const p of Object.values(s.people)) {
    if (p.id === me.id || !alive(p) || !p.memories) continue;
    const mine = p.memories.filter((m) => m.of === me.id);
    const harmYears = [...new Set(mine.filter((m) => HARMS.has(m.kind)).map((m) => m.year))];
    const careYears = [...new Set(mine.filter((m) => CARE.has(m.kind)).map((m) => m.year))];
    const strain = openThread(s, 'strain', me.id, p.id);
    if (strain || harmYears.length >= 2) for (const y of harmYears) if (y >= (strain?.since ?? 0)) noteThread(s, 'strain', me, p, { year: y });
    const st = openThread(s, 'strain', me.id, p.id);
    if (st) for (const y of careYears) if (y > st.since) noteThread(s, 'strain', me, p, { year: y, answer: true });
    const sup = openThread(s, 'supported', me.id, p.id);
    if (sup || careYears.length >= 2) for (const y of careYears) if (y >= (sup?.since ?? 0)) noteThread(s, 'supported', me, p, { year: y });
  }
  // Showing up for someone you hurt: a year of real time together, with no new hurt, counts as an answer.
  const alloc = s.plan.alloc;
  const hurtNow = (p: Person) => (p.memories ?? []).some((m) => m.of === me.id && m.year === s.year && HARMS.has(m.kind));
  const partner = partnerOf(s, me.id);
  if (partner && (alloc.partner_time ?? 0) >= 1 && !hurtNow(partner)) noteThread(s, 'strain', me, partner, { answer: true });
  const kids = kidsAtHome(s, me);
  for (const k of kids) if ((alloc[`child_time:${k.id}`] ?? 0) >= 1 && !hurtNow(k)) noteThread(s, 'strain', me, k, { answer: true });

  // A lifetime tally for the memorial: years with children at home, and how many of them had real family time.
  if (kids.length) {
    me.flags.parent_years = (me.flags.parent_years ?? 0) + 1;
    const time = (alloc.family_outing ?? 0) + (alloc.partner_time ?? 0) + kids.reduce((n, k) => n + (alloc[`child_time:${k.id}`] ?? 0), 0);
    if (time >= Math.min(2, kids.length)) me.flags.family_years = (me.flags.family_years ?? 0) + 1;
  }
  // How close each child was to you when they turned 18 (set once).
  for (const k of childrenOf(s, me.id)) {
    if (alive(k) && ageOf(k, s.year) === 18 && k.flags.bond18 === undefined) k.flags.bond18 = getBond(s, me.id, k.id).affinity;
  }

  // Work far ahead of time with young children.
  const young = kids.filter((k) => ageOf(k, s.year) < 12);
  const family = (alloc.family_outing ?? 0) + young.reduce((n, k) => n + (alloc[`child_time:${k.id}`] ?? 0), 0);
  if (me.jobId && young.length && (alloc.work ?? 0) >= 6 && family <= 1) noteThread(s, 'work_first', me);

  // A life serving what you want from it.
  if (me.aspiration && (me.fulfillment ?? 0) >= 65) noteThread(s, 'aspiration', me, undefined, { detail: me.aspiration });
  else if (me.aspiration) {
    const t = openThread(s, 'aspiration', me.id);
    if (t && t.detail !== me.aspiration) closeThread(t, s.year, 'changed');
  }
}

function lifecycle(s: GameState) {
  if (!s.threads?.length) return;
  for (const t of s.threads) {
    if (t.closed !== undefined) continue;
    const rule = THREAD_RULES[t.kind];
    const owner = s.people[t.ownerId];
    const sub = t.subjectId ? s.people[t.subjectId] : undefined;
    // The player who just died keeps their threads until succession passes them on (inheritThreads).
    if (!owner || (!alive(owner) && owner.id !== s.activeId)) closeThread(t, s.year, 'ended');
    else if (!alive(owner)) continue;
    else if (t.subjectId && (!sub || (!alive(sub) && !rule.keepsDead))) closeThread(t, s.year, 'ended');
    else if (s.year - (lastOf(t.hits) ?? t.since) > rule.fade) closeThread(t, s.year, 'faded');
    // A child who moved on from the interest you backed: nothing to follow up, and no blame.
    else if (t.kind === 'encouraged' && sub && sub.hobby !== t.detail && ageOf(sub, s.year) >= 14) closeThread(t, s.year, 'outgrew');
    // A missed chance that no longer fits (a new job, or the step up came anyway).
    else if (t.kind === 'missed_chance' && t.detail !== `${owner.jobId}:${owner.jobLevel}`) closeThread(t, s.year, 'moot');
  }
  // Closed threads stay a while for the life story; storage stays bounded.
  s.threads = s.threads.filter((t) => t.closed === undefined || s.year - t.closed < CLOSED_KEPT_YEARS);
  if (s.threads.length > MAX_THREADS) {
    const closed = s.threads.filter((t) => t.closed !== undefined).sort((a, b) => a.closed! - b.closed!);
    const drop = new Set(closed.slice(0, s.threads.length - MAX_THREADS));
    s.threads = s.threads.filter((t) => !drop.has(t));
  }
}

/**
 * Succession: the heir inherits the story, not the late character's personality. Someone the late character stood
 * by may stand by the heir; a strain with the heir themselves ends (the heir's own memories carry it); the rest end.
 */
export function inheritThreads(s: GameState, prevId: string, heir: Person) {
  const taught = (s.threads ?? []).find((t) => t.kind === 'grandchild' && t.ownerId === prevId && t.subjectId === heir.id && t.detail);
  if (taught && heir.hobby === taught.detail) heir.stats.happiness = Math.min(100, heir.stats.happiness + 3);
  if (s.people[prevId]) inheritTraditions(s, s.people[prevId], heir);
  for (const t of s.threads ?? []) {
    if (t.ownerId !== prevId || t.closed !== undefined || t.kind === 'tradition') continue;
    if (THREAD_RULES[t.kind].inherit && t.subjectId !== heir.id && s.people[t.subjectId ?? '']?.deathYear === undefined) {
      t.ownerId = heir.id;
      t.inherited = prevId;
    } else closeThread(t, s.year, 'ended');
  }
}

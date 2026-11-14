/**
 * Family traditions (docs/plans/family-traditions.md): something a family does together year after year until it is
 * part of who they are. Emergent only: the player never declares one.
 *
 * - **Recognized** when one of the TRADITIONS activities happens, with at least one person taking part, in 3 distinct
 *   years out of the last 5 (solo runs never count). At most MAX_TRADITIONS live at once.
 * - **Recorded** as a `tradition` story thread: `hits` (recent years), `count` (all years kept) and `takers` (who took
 *   part, and how often).
 * - **A small boost** each year it is kept, very small until it is well formed (TRADITION_BONUS).
 * - **Lapses** quietly after LAPSE_YEARS missed years; doing it again within REVIVE_YEARS revives it, count intact.
 * - **Passes** at succession to an heir who took part HEIR_TAKES+ times; grown children who took part CARRY_TAKES+
 *   times may carry it on in their own homes (agency.ts `carry_tradition`), and an heir who carried one keeps it.
 */
import type { GameState, Person, Thread } from './types';
import { adjustBond, ageOf, alive, journal, kidsAtHome, stat } from './util';

/** The activities that can become traditions, and how the story names them (as a sentence start). */
export const TRADITIONS: Record<string, string> = {
  game_night: 'Game night', cook_together: 'Cooking dinner together', movie_marathon: 'Movie marathon night',
  garden: 'The family garden', park: 'Saturdays at the park', road_trip: 'The summer road trip', getaway: 'The weekend getaway',
  vacation: 'The beach vacation', host_holiday: 'Holiday dinner at your place', family_reunion: 'The family reunion',
  ball_game: 'Going to the ball game', concert: 'Concert night', world_trip: 'Traveling abroad together',
  birthday_camping: 'The birthday camping trip', grandparents_dinner: 'Sunday dinner with the grandparents', holiday_lights: 'The holiday light display',
};
/** The same, inside a sentence ("kept game night going"). */
export const TRADITION_NOUN: Record<string, string> = {
  game_night: 'game night', cook_together: 'cooking dinner together', movie_marathon: 'movie marathon night',
  garden: 'the family garden', park: 'Saturdays at the park', road_trip: 'the summer road trip', getaway: 'the weekend getaway',
  vacation: 'the beach vacation', host_holiday: 'the holiday dinner', family_reunion: 'the family reunion',
  ball_game: 'going to the ball game', concert: 'concert night', world_trip: 'traveling abroad together',
  birthday_camping: 'the birthday camping trip', grandparents_dinner: 'Sunday dinner with the grandparents', holiday_lights: 'the holiday light display',
};

export const MAX_TRADITIONS = 3;
export const RECOGNIZE = { years: 3, window: 5 };
export const LAPSE_YEARS = 3;
export const REVIVE_YEARS = 10;
export const HEIR_TAKES = 3;
export const CARRY_TAKES = 5;
const TAKERS_MAX = 12;

/**
 * The yearly boost for the player and everyone who takes part (once a year, on top of the activity itself). Very small
 * until the tradition is well formed; half points are applied as a whole point every other year.
 */
export const TRADITION_BONUS = [
  { from: 10, stage: 'well formed', affinity: 2, trust: 1, happiness: 2 },
  { from: 5, stage: 'taking root', affinity: 1, trust: 0.5, happiness: 1 },
  { from: RECOGNIZE.years, stage: 'new', affinity: 0.5, trust: 0, happiness: 0 },
] as const;
export const bonusFor = (count: number) => TRADITION_BONUS.find((b) => count >= b.from);
/** A half point every other year (bonds and stats are whole numbers). */
const whole = (x: number, count: number) => Math.floor(x) + (x % 1 && count % 2 === 0 ? 1 : 0);

export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const lastOf = (xs?: number[]) => (xs?.length ? xs[xs.length - 1] : undefined);

/** Live traditions kept by this player. */
export const liveTraditions = (s: GameState, ownerId: string) =>
  (s.threads ?? []).filter((t) => t.kind === 'tradition' && t.ownerId === ownerId && t.closed === undefined);
export const liveTradition = (s: GameState, ownerId: string, id: string) => liveTraditions(s, ownerId).find((t) => t.detail === id);
/** How many times someone took part in a tradition. */
export const takes = (t: Thread, personId: string) => t.takers?.[personId] ?? 0;
/** Every tradition this person kept (live or past), longest first. */
export const traditionsKeptBy = (s: GameState, personId: string) =>
  (s.threads ?? []).filter((t) => t.kind === 'tradition' && t.ownerId === personId).sort((a, b) => (b.count ?? 0) - (a.count ?? 0));

/** Distinct recent years this activity happened with someone taking part. */
export function qualifyingYears(s: GameState, id: string): number[] {
  return [...new Set((s.activityLog ?? []).filter((x) => x.id === id && x.year > s.year - RECOGNIZE.window && (x.with ?? 1) > 0).map((x) => x.year))].sort((a, b) => a - b);
}

function addTakers(t: Thread, people: Person[]) {
  const takers = (t.takers ??= {});
  for (const p of people) takers[p.id] = (takers[p.id] ?? 0) + 1;
  const ids = Object.keys(takers);
  if (ids.length > TAKERS_MAX) {
    for (const id of ids.sort((a, b) => takers[a] - takers[b]).slice(0, ids.length - TAKERS_MAX)) delete takers[id];
  }
}

/**
 * A tradition activity just happened with these people. Records the year (once a year), applies the boost and returns
 * a line for the result card ('' if this isn't, and didn't just become, a tradition).
 */
export function traditionYear(s: GameState, me: Person, id: string, people: Person[]): string {
  if (!TRADITIONS[id] || !people.length) return '';
  let t = liveTradition(s, me.id, id);
  let fresh = false;
  if (!t) {
    const room = liveTraditions(s, me.id).length < MAX_TRADITIONS;
    const lapsed = (s.threads ?? []).filter((x) => x.kind === 'tradition' && x.ownerId === me.id && x.detail === id && x.outcome === 'lapsed' && s.year - x.closed! <= REVIVE_YEARS)
      .sort((a, b) => b.closed! - a.closed!)[0];
    if (lapsed && room) {
      const away = s.year - (lastOf(lapsed.hits) ?? lapsed.closed!);
      delete lapsed.closed;
      delete lapsed.outcome;
      t = lapsed;
      journal(s, `${TRADITIONS[id]} is back, after ${away} years away.`, 'good', true);
    } else if (!lapsed && room) {
      const years = qualifyingYears(s, id);
      if (years.length < RECOGNIZE.years) return '';
      t = { kind: 'tradition', ownerId: me.id, detail: id, since: years[0], hits: years.slice(-8), count: years.length, takers: {} };
      (s.threads ??= []).push(t);
      fresh = true;
    } else return '';
  }
  if (t.hits.includes(s.year) && !fresh) return line(t); // already kept this year
  if (!fresh) {
    t.hits = [...t.hits, s.year].slice(-8);
    t.count = (t.count ?? t.hits.length) + 1;
  }
  addTakers(t, people);
  const count = t.count ?? t.hits.length;
  const b = bonusFor(count);
  if (b) {
    for (const p of people) {
      adjustBond(s, me.id, p.id, whole(b.affinity, count), whole(b.trust, count));
      stat(p, 'happiness', whole(b.happiness, count));
    }
    stat(me, 'happiness', whole(b.happiness, count));
  }
  if (count === 10 || count === 25) journal(s, `${TRADITIONS[id]}, for the ${ordinal(count)} year.`, 'good', true);
  return line(t);
}

/** "Game night: a family tradition since 2031 (12th year)." */
export function line(t: Thread): string {
  const count = t.count ?? t.hits.length;
  const b = bonusFor(count);
  return b?.stage === 'new'
    ? `${TRADITIONS[t.detail!]} is becoming a family tradition (${ordinal(count)} year).`
    : `${TRADITIONS[t.detail!]}: a family tradition since ${t.since} (${ordinal(count)} year).`;
}

/** The yearly pass: traditions kept by the player lapse after missed years; grown-up takers feel they belong. */
export function traditionsYear(s: GameState, me: Person) {
  for (const t of liveTraditions(s, me.id)) {
    const last = Math.max(lastOf(t.hits) ?? t.since, lastOf(t.answers) ?? -Infinity);
    const missed = s.year - last;
    if (missed >= LAPSE_YEARS) {
      t.closed = s.year;
      t.outcome = 'lapsed';
      journal(s, `${TRADITIONS[t.detail!]} has quietly faded.`, 'info', true);
    } else if (missed === 2) {
      journal(s, `${TRADITIONS[t.detail!]} hasn’t happened in two years.`, 'info');
    }
  }
  // Coming of age with a well-formed tradition behind you.
  for (const k of kidsAtHome(s, me)) {
    if (ageOf(k, s.year) !== 18) continue;
    const best = Math.max(0, ...liveTraditions(s, me.id).filter((t) => (t.count ?? 0) >= 10).map((t) => takes(t, k.id)));
    if (best >= 5) stat(k, 'happiness', best >= 10 ? 2 : 1);
  }
}

// ── Across generations ───────────────────────────────────────────────

/** Has this child already carried this tradition into their own home? */
export const carries = (s: GameState, ownerId: string, childId: string, id: string) =>
  (s.threads ?? []).some((t) => t.kind === 'pattern' && t.ownerId === ownerId && t.subjectId === childId && t.detail === `carried:${id}`);

/** A grown child starts the tradition in their own home (recorded on the player's side, for the story). */
export function carryTradition(s: GameState, owner: Person, child: Person, id: string, announce = true) {
  (s.threads ??= []).push({ kind: 'pattern', ownerId: owner.id, subjectId: child.id, detail: `carried:${id}`, since: s.year, hits: [s.year], closed: s.year, outcome: 'carried' });
  if (announce) journal(s, `${child.firstName} hosts ${TRADITION_NOUN[id]} at ${child.sex === 'F' ? 'her' : 'his'} place now, just like you did.`, 'good', true);
}

/** A grown child of the owner who could carry a tradition on: took part CARRY_TAKES+ times, has their own home. */
export function carryCandidate(s: GameState, owner: Person, child: Person): Thread | undefined {
  if (child.householdId === owner.householdId || !alive(child) || ageOf(child, s.year) < 22) return undefined;
  return (s.threads ?? []).filter((t) => t.kind === 'tradition' && t.ownerId === owner.id
    && (t.closed === undefined || (t.outcome === 'lapsed' && s.year - t.closed <= REVIVE_YEARS))
    && takes(t, child.id) >= CARRY_TAKES && !carries(s, owner.id, child.id, t.detail!))[0];
}

/**
 * Succession: a live tradition passes to an heir who took part HEIR_TAKES+ times; one the heir already carries in
 * their own home stays alive, its count continuing. Anything else ends. Returns the traditions the heir keeps.
 */
export function inheritTraditions(s: GameState, prev: Person, heir: Person): Thread[] {
  const kept: Thread[] = [];
  for (const t of liveTraditions(s, prev.id)) {
    if (takes(t, heir.id) >= HEIR_TAKES || carries(s, prev.id, heir.id, t.detail!)) {
      if (liveTraditions(s, heir.id).length >= MAX_TRADITIONS) { t.closed = s.year; t.outcome = 'ended'; continue; }
      t.ownerId = heir.id;
      t.inherited = prev.id;
      t.answers = [...(t.answers ?? []), s.year]; // a new keeper gets a fresh start before it can lapse
      kept.push(t);
    } else {
      t.closed = s.year;
      t.outcome = 'ended';
    }
  }
  // Carried, but lapsed back home: the heir's own version lives on.
  for (const c of (s.threads ?? []).filter((x) => x.kind === 'pattern' && x.ownerId === prev.id && x.subjectId === heir.id && x.detail?.startsWith('carried:'))) {
    const id = c.detail!.slice('carried:'.length);
    if (liveTradition(s, heir.id, id) || liveTraditions(s, heir.id).length >= MAX_TRADITIONS) continue;
    const old = (s.threads ?? []).filter((x) => x.kind === 'tradition' && x.ownerId === prev.id && x.detail === id).sort((a, b) => (b.count ?? 0) - (a.count ?? 0))[0];
    const t: Thread = { kind: 'tradition', ownerId: heir.id, detail: id, since: old?.since ?? c.since, hits: [c.since], answers: [s.year], count: (old?.count ?? 0) + 1, takers: { [heir.id]: CARRY_TAKES }, inherited: prev.id };
    (s.threads ??= []).push(t);
    kept.push(t);
  }
  return kept;
}

/** "Game night is Ann's to keep now; she took part 12 times growing up." */
export function inheritedLine(t: Thread, prev: Person, heir: Person): string {
  const n = takes(t, heir.id);
  return `${cap(TRADITION_NOUN[t.detail!])} is ${heir.firstName}’s to keep now${n >= HEIR_TAKES ? `; ${heir.firstName} took part ${n} times growing up` : `, carried on from ${prev.firstName}`}.`;
}

/**
 * Relationships: the same kindness lands differently with different people.
 *
 * - **Connection preference** (soft): quality time, practical support, shared experiences, or personal space. Derived
 *   from someone's traits and a stable hash, so existing saves need no rewrite; stored only once it has changed (life
 *   transitions can shift it). A preferred form of care helps a bit more; any form still helps.
 * - **Memories** (a few per person, fading after MEMORY_YEARS): a missed moment, pressure, support, a kept or broken
 *   promise. They colour conversations and make a real apology possible. Bonds (affinity and trust) stay the actual
 *   relationship state.
 *
 * Pure and deterministic: preferences use stable hashes, never the shared random roll.
 */
import type { Situation } from './personality';
import type { Connection, GameState, Memory, Person } from './types';

export const CONNECTIONS: Connection[] = ['time', 'support', 'experiences', 'space'];
/** Memories fade after this many years; each person keeps at most MEMORY_MAX. */
export const MEMORY_YEARS = 12;
export const MEMORY_MAX = 4;
/** How much more a preferred form of care does (and how much less pressing someone who wants space does). */
export const PREFERENCE = { match: 0.2, crowded: -0.15 };

/** A stable 32-bit hash. */
export const stableHash = (key: string) => [...key].reduce((a, ch) => (Math.imul(a, 31) + ch.charCodeAt(0)) >>> 0, 2166136261);

/** Someone's preference: set explicitly, or derived from traits (and a stable hash for everyone else). */
export function connectionOf(p: Person): Connection {
  if (p.connection) return p.connection;
  if (p.traits.includes('kind')) return 'support';
  if (p.traits.includes('curious') || p.traits.includes('athletic')) return 'experiences';
  if (p.traits.includes('stubborn') || p.traits.includes('anxious')) return 'space';
  return CONNECTIONS[stableHash(`${p.id}:connection`) % CONNECTIONS.length];
}

/** Which form of care a situation is. */
export function formOf(sit: Situation | undefined): Connection | undefined {
  switch (sit) {
    case 'partnerTime': case 'childTime': case 'socialize': return 'time';
    case 'help': return 'support';
    case 'familyOuting': case 'travel': case 'newThing': case 'exercise': return 'experiences';
    case 'relax': return 'space';
    default: return undefined;
  }
}

/** How someone receives a form of care (1 = like anyone). `heavy`: a lot of it at once (3+ blocks or a big plan). */
export function receiverFactor(p: Person, form: Connection | undefined, heavy = false): number {
  if (!form) return 1;
  const pref = connectionOf(p);
  let f = 1;
  if (pref === form) f += PREFERENCE.match;
  if (pref === 'space' && form === 'time' && heavy) f += PREFERENCE.crowded;
  if (form === 'support' && p.stats.stress >= 70) f += 0.1; // practical help means most to someone overwhelmed
  return Math.min(1.3, Math.max(0.8, f));
}

/** A short, natural clue for the Family tab (shown once you've asked). */
export function connectionClue(p: Person): string {
  const self = p.sex === 'F' ? 'herself' : 'himself';
  return {
    time: 'Likes having time together',
    support: 'Feels cared for when you help out',
    experiences: 'Loves doing new things together',
    space: `Needs room to decide things for ${self}`,
  }[connectionOf(p)];
}

/** A phrase for result cards ("loves time together"). */
export const connectionPhrase: Record<Connection, string> = {
  time: 'time together',
  support: 'a helping hand',
  experiences: 'doing new things together',
  space: 'being given room',
};

// ── Memories ─────────────────────────────────────────────────────────

/** Remember something about `of` (at most one of a kind per year; oldest dropped past MEMORY_MAX). */
export function remember(p: Person, kind: Memory['kind'], of: string, year: number) {
  const list = (p.memories ??= []);
  if (list.some((m) => m.kind === kind && m.of === of && m.year === year)) return;
  list.push({ kind, of, year });
  if (list.length > MEMORY_MAX) list.splice(0, list.length - MEMORY_MAX);
}

/** Forget a memory (after an apology or making amends). */
export function forget(p: Person, kind: Memory['kind'], of: string) {
  if (!p.memories) return;
  p.memories = p.memories.filter((m) => !(m.kind === kind && m.of === of));
  if (!p.memories.length) delete p.memories;
}

/** A harm `p` still holds against `of` (a missed moment, pressure, or a broken promise), if any. */
export const harmFrom = (p: Person, of: string) =>
  (p.memories ?? []).find((m) => m.of === of && (m.kind === 'missed' || m.kind === 'pressure' || m.kind === 'promise_broken'));

const HARM_TEXT: Record<string, string> = {
  missed: 'not being there',
  pressure: 'pushing so hard',
  promise_broken: 'breaking your promise',
};
export const harmText = (m: Memory) => HARM_TEXT[m.kind] ?? 'what happened';

/** Yearly upkeep: memories fade; a preference can shift at a life transition (becoming an adult or retiring). */
export function relationshipsYear(s: GameState) {
  for (const p of Object.values(s.people)) {
    if (p.memories) {
      p.memories = p.memories.filter((m) => s.year - m.year < MEMORY_YEARS);
      if (!p.memories.length) delete p.memories;
    }
    if (p.deathYear !== undefined) continue;
    const age = s.year - p.birthYear;
    if ((age === 18 || age === 65) && stableHash(`${p.id}:${s.year}:shift`) % 3 === 0) {
      p.connection = CONNECTIONS[stableHash(`${p.id}:${s.year}:pref`) % CONNECTIONS.length];
    }
  }
}

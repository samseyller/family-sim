import type { FlagKey } from './flags';
import type { Bond, GameState, JournalKind, Person, StatKey } from './types';

export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export const alive = (p: Person) => p.deathYear === undefined;

export const ageOf = (p: Person, year: number) => (p.deathYear ?? year) - p.birthYear;

export const fullName = (p: Person) => `${p.firstName} ${p.lastName}`;

export const money = (n: number) =>
  (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');

export const active = (s: GameState) => s.people[s.activeId];

export function newId(s: GameState, prefix: string) {
  return `${prefix}${s.nextId++}`;
}

export const bondKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Read-only bond lookup (does not create). */
export function getBond(s: GameState, a: string, b: string): Bond {
  return s.bonds[bondKey(a, b)] ?? { affinity: 0, trust: 0 };
}

export function adjustBond(s: GameState, a: string, b: string, dAffinity: number, dTrust: number) {
  const k = bondKey(a, b);
  const bd = (s.bonds[k] ??= { affinity: 0, trust: 0 });
  bd.affinity = Math.round(clamp(bd.affinity + dAffinity, -100, 100));
  bd.trust = Math.round(clamp(bd.trust + dTrust, -100, 100));
}

export function stat(p: Person, k: StatKey, d: number) {
  p.stats[k] = Math.round(clamp(p.stats[k] + d, 0, 100));
}

export function flag(p: Person, k: FlagKey, d = 1) {
  p.flags[k] = (p.flags[k] ?? 0) + d;
}

export function journal(s: GameState, text: string, kind: JournalKind = 'info', story = false) {
  s.journal.push({ year: s.year, text, kind, who: s.activeId, ...(story ? { story: true } : {}) });
}

export const livingPeople = (s: GameState) => Object.values(s.people).filter(alive);

export const membersOf = (s: GameState, householdId: string) =>
  Object.values(s.people).filter((p) => alive(p) && p.householdId === householdId);

export function activePartnership(s: GameState, id: string) {
  return s.partnerships.find(
    (x) => (x.a === id || x.b === id) && (x.status === 'married' || x.status === 'dating'),
  );
}

export function partnerOf(s: GameState, id: string): Person | undefined {
  const ps = activePartnership(s, id);
  if (!ps) return undefined;
  const other = s.people[ps.a === id ? ps.b : ps.a];
  return other && alive(other) ? other : undefined;
}

export const childrenOf = (s: GameState, id: string) =>
  Object.values(s.people).filter(
    (p) => p.biologicalParents.includes(id) || p.adoptiveParents.includes(id),
  );

export const parentsOf = (s: GameState, p: Person) =>
  [...p.biologicalParents, ...p.adoptiveParents].map((id) => s.people[id]).filter(Boolean);

/** Minor children of `parent` living in the same household. */
export function kidsAtHome(s: GameState, parent: Person) {
  return childrenOf(s, parent.id).filter(
    (c) => alive(c) && c.householdId === parent.householdId && ageOf(c, s.year) < 18,
  );
}

export const isAdult = (p: Person, year: number) => ageOf(p, year) >= 18;

export const NAME_MAX = 20;

/**
 * Tidy a player-typed name: letters (any language), spaces, hyphens and apostrophes only,
 * collapsed whitespace, first letter capitalized, at most NAME_MAX characters.
 * Returns '' when nothing usable is left.
 */
export function cleanName(raw: string | undefined): string {
  const s = (raw ?? '').normalize('NFC').replace(/[^\p{L}\p{M}' -]/gu, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim();
  return s ? s[0].toLocaleUpperCase() + s.slice(1) : '';
}

/**
 * A journal entry as the current player should read it. Entries are written in the second
 * person ("You were promoted") for whoever was playing then; once the story has passed to
 * someone else, those are retold about that person ("Joe was promoted", "Joe's mortgage").
 */
export function journalText(s: GameState, j: { text: string; who: string }): string {
  if (!j.who || j.who === s.activeId) return j.text;
  const p = s.people[j.who];
  if (!p) return j.text;
  return retell(j.text, p.firstName);
}

/** Retell second-person text about someone by name (they/them after the first mention). */
export function retell(text: string, name: string): string {
  // One left-to-right pass: the first mention gets the name, later ones become they/them/their.
  let named = false;
  const first = () => !named && (named = true);
  const out = text.replace(
    /\b(You were|You are|You're|You have|You've|you were|Yourself|yourself|Your|your|You|you)\b/g,
    (m) => {
      switch (m) {
        case 'You were': return first() ? `${name} was` : 'they were';
        case 'You are': case "You're": return first() ? `${name} is` : 'they are';
        case 'You have': case "You've": return first() ? `${name} has` : 'they have';
        case 'you were': return first() ? `${name} was` : 'they were';
        case 'Yourself': case 'yourself': return 'themself';
        case 'Your': case 'your': return first() ? `${name}'s` : 'their';
        case 'You': return first() ? name : 'they';
        default: return first() ? name : 'them'; // lowercase "you" is usually an object ("hugged you")
      }
    },
  );
  // Capitalize "they" at the start of a sentence.
  return out.replace(/(^|[.!?]\s+)(they|their)\b/g, (_m, pre: string, w: string) => `${pre}${w[0].toUpperCase()}${w.slice(1)}`);
}

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

export function flag(p: Person, k: string, d = 1) {
  p.flags[k] = (p.flags[k] ?? 0) + d;
}

export function journal(s: GameState, text: string, kind: JournalKind = 'info') {
  s.journal.push({ year: s.year, text, kind, who: s.activeId });
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

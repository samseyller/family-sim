/**
 * Pruning history: long family lines accumulate every relative, friend and in-law who ever lived. Once they are
 * gone, characters the player never played only need what the family tree and memorial show: their name, dates
 * and portrait. Everything else (stats, skills, jobs, money, memories, relationships with other non-played people)
 * is dropped to keep saves small.
 *
 * It runs only for long games (150+ years since the family began) and when the family is memorialized (game
 * over). Played characters (the lineage) are never pruned, and neither are their bonds, which the memorial's
 * legacy score uses.
 */
import { START_YEAR } from './generate';
import type { GameState, Person } from './types';
import { alive } from './util';

/** Pruning starts once a family line is this many years old. */
export const PRUNE_AFTER_YEARS = 150;
/** In long games, only people dead at least this long are pruned (recent deaths may still have follow-ups). */
export const PRUNE_DEAD_FOR = 10;

const ZERO_STATS = { health: 0, happiness: 0, smarts: 0, fitness: 0, stress: 0 };

/** Fields that stay: who they were, when they lived, how they looked, and where they sit in the tree. */
function compact(p: Person): Person {
  return {
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    sex: p.sex,
    birthYear: p.birthYear,
    deathYear: p.deathYear,
    generation: p.generation,
    householdId: p.householdId,
    biologicalParents: p.biologicalParents,
    adoptiveParents: p.adoptiveParents,
    looks: p.looks,
    // Required fields, emptied.
    stats: { ...ZERO_STATS },
    traits: [],
    skills: {},
    flags: { archived: 1 },
    jobLevel: 0,
    jobYears: 0,
    workPerf: 0,
    partPerf: 0,
    partYears: 0,
    retired: p.retired,
    pension: 0,
    fund: 0,
  };
}

/** Could this person be pruned now? */
function prunable(s: GameState, p: Person, minYearsDead: number, keep: Set<string>) {
  return !alive(p) && !p.flags.archived && !keep.has(p.id) && s.year - (p.deathYear ?? s.year) >= minYearsDead;
}

/**
 * Prune dead, never-played characters (in place). `memorial`: everyone eligible, at game over. Otherwise only in
 * games 150+ years old, and only people who died at least PRUNE_DEAD_FOR years ago. Returns how many were pruned.
 */
export function pruneHistory(s: GameState, memorial = false): number {
  if (!memorial && s.year - START_YEAR < PRUNE_AFTER_YEARS) return 0;
  const minYears = memorial ? 0 : PRUNE_DEAD_FOR;
  // Never prune anyone the game still points at: played characters, the active one, and pending or scheduled
  // events' subjects.
  const keep = new Set<string>([...s.lineage, s.activeId]);
  for (const x of [...s.pending, ...s.scheduled]) if (x.subjectId) keep.add(x.subjectId);
  for (const p of Object.values(s.people)) if (p.secretPartnerId) keep.add(p.secretPartnerId);

  const pruned = new Set<string>();
  for (const p of Object.values(s.people)) {
    if (!prunable(s, p, minYears, keep)) continue;
    s.people[p.id] = compact(p);
    pruned.add(p.id);
  }
  if (!pruned.size) return 0;

  // Their relationships with other non-played people go; bonds with played characters stay (the memorial uses them).
  const played = new Set(s.lineage);
  for (const key of Object.keys(s.bonds)) {
    const [a, b] = key.split('|');
    if ((pruned.has(a) || pruned.has(b)) && !played.has(a) && !played.has(b)) delete s.bonds[key];
  }
  if (s.friends) s.friends = s.friends.filter((f) => !pruned.has(f.id) && !pruned.has(f.of));
  return pruned.size;
}

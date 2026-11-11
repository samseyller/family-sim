/**
 * Pure profile tracking: compare the game state before and after a transition,
 * update lifetime stats, archive finished families, and unlock achievements.
 * No DOM or storage here, so it runs in tests and the headless sim too.
 */
import { retell } from '../engine/util';
import { ACHIEVEMENTS, type AchievementDef } from '../content/achievements';
import { buildMemorial } from '../engine/memorial';
import type { GameState } from '../engine/types';
import { active, ageOf, alive } from '../engine/util';
import type { ArchivedFamily, Profile } from './types';

export interface TrackResult {
  profile: Profile;
  unlocked: AchievementDef[];
  changed: boolean;
}

/** Stable id for a family run: the same seed and founder always map to the same archive entry. */
export const familyId = (s: GameState) => `${s.seed}-${s.lineage[0]}`;

export function archiveEntry(s: GameState, now: string): ArchivedFamily {
  const m = buildMemorial(s);
  return {
    id: familyId(s),
    familyName: m.familyName,
    startYear: s.journal[0]?.year ?? s.year,
    endYear: s.year,
    generations: m.generations,
    members: m.entries.map((e) => ({
      id: e.person.id,
      name: `${e.person.firstName} ${e.person.lastName}`,
      sex: e.person.sex,
      looks: { ...e.person.looks },
      birthYear: e.person.birthYear,
      deathYear: e.person.deathYear,
      title: e.title,
      knownFor: e.knownFor,
      epitaph: e.epitaph,
      children: e.children,
      // Told about them ("Joe married Ana"), not "You married Ana".
      highlights: e.highlights.map((h) => `${h.year}: ${retell(h.text, e.person.firstName)}`),
    })),
    legacy: m.legacy.total,
    breakdown: { wealth: m.legacy.wealth, bonds: m.legacy.bonds, achievement: m.legacy.achievement, wellbeing: m.legacy.wellbeing },
    endedAt: now,
  };
}

/** Called when the player starts a brand-new family. */
export function trackNewFamily(profile: Profile): Profile {
  return { ...profile, stats: { ...profile.stats, familiesStarted: profile.stats.familiesStarted + 1 } };
}

export function track(profile: Profile, prev: GameState | null, next: GameState, now = new Date().toISOString()): TrackResult {
  const p: Profile = structuredClone(profile);
  let changed = false;
  const st = p.stats;
  const bump = (k: keyof typeof st, v: number) => {
    if (v > 0) {
      st[k] += v;
      changed = true;
    }
  };
  const record = (k: keyof typeof st, v: number) => {
    if (v > st[k]) {
      st[k] = v;
      changed = true;
    }
  };

  // Only diff transitions within the same family run.
  const sameRun = prev && familyId(prev) === familyId(next);
  if (prev && sameRun) {
    bump('yearsPlayed', next.year - prev.year);
    bump('successions', next.lineage.length - prev.lineage.length);
    const lineageIds = new Set(next.lineage);
    for (const person of Object.values(next.people)) {
      if (prev.people[person.id]) continue;
      // A new person born to someone in the played lineage or their children.
      const parents = person.biologicalParents.map((id) => next.people[id]).filter(Boolean);
      const close = parents.some((par) => lineageIds.has(par.id) || par.biologicalParents.some((g) => lineageIds.has(g)));
      if (close && person.birthYear === next.year) bump('birthsInFamily', 1);
    }
    for (const id of next.lineage) {
      const person = next.people[id];
      if (!alive(person) && prev.people[id] && alive(prev.people[id])) record('longestLife', ageOf(person, next.year));
    }
  }
  const me = active(next);
  record('richestHousehold', Math.round(next.households[me.householdId]?.wallet ?? 0));
  record('mostGenerations', new Set(next.lineage.map((id) => next.people[id].generation)).size);

  if (next.phase === 'GAME_OVER' && prev?.phase !== 'GAME_OVER') {
    const entry = archiveEntry(next, now);
    if (!p.archive.some((a) => a.id === entry.id)) {
      p.archive.push(entry);
      bump('familiesEnded', 1);
      changed = true;
    }
  }

  const unlocked: AchievementDef[] = [];
  for (const a of ACHIEVEMENTS) {
    if (p.achievements[a.id]) continue;
    let ok = false;
    try {
      ok = a.test(next);
    } catch {
      ok = false;
    }
    if (ok) {
      p.achievements[a.id] = { at: now, year: next.year, family: me.lastName };
      unlocked.push(a);
      changed = true;
    }
  }
  return { profile: changed ? p : profile, unlocked, changed };
}

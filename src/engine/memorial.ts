import { jobTitle } from '../content/careers';
import type { GameState, JournalEntry, Person } from './types';
import { ageOf, alive, childrenOf, getBond, membersOf } from './util';

export interface MemorialEntry {
  person: Person;
  title: string;
  lifespan: string;
  children: number;
  knownFor: string;
  epitaph: string;
  highlights: JournalEntry[];
}

export interface Memorial {
  familyName: string;
  generations: number;
  years: string;
  entries: MemorialEntry[];
  legacy: { wealth: number; bonds: number; achievement: number; wellbeing: number; total: number };
}

function knownFor(s: GameState, p: Person): string {
  const kids = childrenOf(s, p.id);
  const avgBond = kids.length ? kids.reduce((sum, k) => sum + getBond(s, p.id, k.id).affinity, 0) / kids.length : 0;
  if (kids.length && avgBond >= 40) return 'a devoted parent';
  if (p.jobLevel >= 3) return 'a driven career';
  if (p.flags.health_vow) return 'a second chance at health';
  if (p.stats.happiness >= 70) return 'a contented life';
  if (p.flags.declined_promotion) return 'choosing family over the corner office';
  return 'quiet perseverance';
}

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];

/** A short generated epitaph. Deterministic per person, so it doesn't change between views. */
export function epitaphFor(s: GameState, p: Person, known: string): string {
  const kids = childrenOf(s, p.id).length;
  const age = ageOf(p, s.year);
  const role = kids
    ? `${p.sex === 'F' ? 'mother' : 'father'} of ${NUMBER_WORDS[kids] ?? kids}`
    : p.flags.degree ? 'a lifelong learner' : 'a steady friend';
  const work = p.jobId || p.retired ? jobTitle(p).toLowerCase() : '';
  const lines = [
    `${p.firstName}, ${role}${work && work !== 'unemployed' ? ` and ${/^[aeiou]/.test(work) ? 'an' : 'a'} ${work}` : ''}. Remembered for ${known}.`,
    `${age} years, ${role}. Remembered for ${known}.`,
    `${p.firstName} gave the family ${known}.`,
  ];
  const pick = [...p.id].reduce((h, c) => h + c.charCodeAt(0), 0) % lines.length;
  return lines[pick];
}

export function buildMemorial(s: GameState): Memorial {
  const entries = s.lineage.map((id) => {
    const p = s.people[id];
    return {
      person: p,
      title: alive(p) ? jobTitle(p) : p.retired ? 'Retired' : jobTitle(p),
      lifespan: `${p.birthYear}–${p.deathYear ?? 'present'} (${ageOf(p, s.year)})`,
      children: childrenOf(s, id).length,
      knownFor: knownFor(s, p),
      epitaph: epitaphFor(s, p, knownFor(s, p)),
      highlights: s.journal.filter((j) => j.who === id && (j.kind === 'major' || j.kind === 'birth')).slice(0, 6),
    };
  });
  // Wealth held by the living descendants' households.
  const descendants = new Set<string>();
  const walk = (id: string) => {
    for (const c of childrenOf(s, id)) if (!descendants.has(c.id)) { descendants.add(c.id); walk(c.id); }
  };
  walk(s.lineage[0]);
  const households = new Set<string>();
  for (const id of [...descendants, ...s.lineage]) {
    const p = s.people[id];
    if (alive(p)) households.add(p.householdId);
  }
  const wealth = [...households].reduce((sum, h) => {
    const hh = s.households[h];
    return membersOf(s, h).length ? sum + hh.wallet + (hh.investments ?? 0) + hh.assets.reduce((a, x) => a + x.value - x.mortgage, 0) : sum;
  }, 0);
  const bondsList = s.lineage.flatMap((id) => childrenOf(s, id).map((k) => getBond(s, id, k.id).affinity));
  const bonds = bondsList.length ? Math.round(bondsList.reduce((a, b) => a + b, 0) / bondsList.length) : 0;
  const achievement = s.lineage.reduce((sum, id) => sum + s.people[id].jobLevel * 10 + (s.people[id].flags.degree ? 10 : 0), 0);
  const wellbeing = Math.round(s.lineage.reduce((sum, id) => sum + s.people[id].stats.happiness, 0) / s.lineage.length);
  const total = Math.round(Math.max(0, wealth) / 10000 + bonds + achievement + wellbeing + s.lineage.length * 20);
  const first = s.people[s.lineage[0]];
  return {
    familyName: first.lastName,
    generations: new Set(s.lineage.map((id) => s.people[id].generation)).size,
    years: `${first.birthYear + 0}–${s.year}`,
    entries,
    legacy: { wealth, bonds, achievement, wellbeing, total },
  };
}

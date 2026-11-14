import { TRADITION_NOUN, traditionsKeptBy } from './traditions';
import { hobbyName, memorialStory, rememberedFor } from './narrative';
import { ASPIRATION_INFO } from './fulfillment';
import { stableHash } from './relationships';
import { jobTitle } from '../content/careers';
import { aimText } from './fulfillment';
import type { Aspiration, GameState, JournalEntry, Person } from './types';
import { ageOf, alive, childrenOf, getBond, membersOf } from './util';

export interface MemorialEntry {
  person: Person;
  title: string;
  lifespan: string;
  children: number;
  knownFor: string;
  /** What they sought in life ("Sought mastery, and found it."), if known. */
  aim?: string;
  epitaph: string;
  /** A few true lines about the life they lived (third person). */
  story: string[];
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
  // The strongest pattern in the life actually lived, when there is one; otherwise the plain reading below.
  const told = rememberedFor(s, p);
  if (told) return told;
  const kids = childrenOf(s, p.id);
  const avgBond = kids.length ? kids.reduce((sum, k) => sum + getBond(s, p.id, k.id).affinity, 0) / kids.length : 0;
  // The same reading in a few words, so families don't all sound alike (stable per person).
  const say = (...xs: string[]) => xs[stableHash(`${s.seed}:${p.id}:known`) % xs.length];
  if (kids.length && avgBond >= 40) return say('a devoted parent', 'always being there for the kids', 'a home the kids loved coming back to');
  if (kids.length >= 3 && (p.careerYears ?? 0) >= 20) return say('a full house and a busy life', 'a crowded kitchen table and a long workweek');
  if (p.jobLevel >= 3) return say('years of steady, good work', 'showing up for work, year after year', 'a steady hand and honest work');
  if (ageOf(p, p.deathYear ?? s.year) >= 85) return say('a long life, well lived', 'eighty-some years of it, and no regrets they’d admit to');
  if (p.flags.health_vow) return say('a second chance at health', 'turning their health around');
  if (p.stats.happiness >= 70) return say('a contented life', 'finding joy in ordinary days', 'a quick laugh and an easy heart');
  if (p.flags.declined_promotion) return say('choosing family over the corner office', 'going home on time, on purpose');
  if (kids.length) return say(`raising ${NUMBER_WORDS[kids.length] ?? kids.length} ${kids.length === 1 ? 'child' : 'children'}`, 'bringing up a family');
  return say('quiet perseverance', 'carrying on through hard years', 'getting up and trying again');
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
  const job = work && work !== 'unemployed' && work !== 'retired' ? ` and ${/^[aeiou]/.test(work) ? 'an' : 'a'} ${work}` : '';
  const grandkids = childrenOf(s, p.id).reduce((n, k) => n + childrenOf(s, k.id).length, 0);
  const [skill, lvl] = (Object.entries(p.skills) as [string, number][]).sort((a, b) => b[1] - a[1])[0] ?? [];
  const found = (s.threads ?? []).find((t) => t.ownerId === p.id && t.kind === 'aspiration' && t.outcome === 'milestone')?.detail;
  const Known = known.charAt(0).toUpperCase() + known.slice(1);
  // Every line is true for this person; the ones that need a fact only appear when the fact does.
  const lines = [
    `${p.firstName}, ${role}${job}. Remembered for ${known}.`,
    `${age} years, ${role}. Remembered for ${known}.`,
    `${p.firstName} gave the family ${known}.`,
    `${Known}: that was ${p.firstName}.`,
    `${p.firstName} (${p.birthYear}–${p.deathYear ?? s.year}), ${role}. Remembered for ${known}.`,
    ...(grandkids ? [`${p.firstName}, ${role} and grandparent of ${NUMBER_WORDS[grandkids] ?? grandkids}. Remembered for ${known}.`] : []),
    ...(skill && lvl >= 60 ? [`${p.firstName}, ${role}, never far from ${hobbyName(skill)}. Remembered for ${known}.`] : []),
    ...((traditionsKeptBy(s, p.id)[0]?.count ?? 0) >= 15 ? [`${p.firstName}, ${role}, who kept ${TRADITION_NOUN[traditionsKeptBy(s, p.id)[0].detail!]} going for ${traditionsKeptBy(s, p.id)[0].count} years.`] : []),
    ...(found ? [`${p.firstName} wanted ${ASPIRATION_INFO[found as Aspiration].label.toLowerCase()} from life, and found it.`] : []),
  ].filter((l) => l.length <= EPITAPH_LIMIT);
  return lines[stableHash(`${s.seed}:${p.id}:epitaph`) % lines.length];
}
/** Fits the archive's epitaph limit (profile EPITAPH_MAX). */
const EPITAPH_LIMIT = 160;

export function buildMemorial(s: GameState): Memorial {
  const entries = s.lineage.map((id) => {
    const p = s.people[id];
    return {
      person: p,
      title: alive(p) ? jobTitle(p) : p.retired ? 'Retired' : jobTitle(p),
      lifespan: `${p.birthYear}–${p.deathYear ?? 'present'} (${ageOf(p, s.year)})`,
      children: childrenOf(s, id).length,
      knownFor: knownFor(s, p),
      aim: aimText(p),
      epitaph: epitaphFor(s, p, knownFor(s, p)),
      story: memorialStory(s, p),
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

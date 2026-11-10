/**
 * Job listings. Each city posts a fresh set of openings every LISTING_YEARS years, chosen at
 * random but weighted toward the city's strong industries (Seattle hires lots of tech, Houston
 * energy, Los Angeles entertainment...). During the later years of a cycle some openings get
 * filled. There's always at least one entry-level opening of each kind. The player can only
 * apply for jobs that are open in their city right now.
 *
 * Listings are derived from (game seed, city, cycle), so they're stable within a cycle, the
 * same after a reload, and need no saving.
 */
import { CAREERS, type Career, type JobSlot } from '../content/careers';
import { CITIES, type CityId } from '../content/cities';
import { cityOf } from './location';
import { isCoastal } from './hobbies';
import { makeRng } from './rng';
import type { GameState, Person } from './types';
import { active } from './util';

/** A new round of listings every this many years. */
export const LISTING_YEARS = 2;
/** How many openings a city posts each round. */
export const OPENINGS: Record<JobSlot, number> = { full: 10, part: 6 };
/** Share of openings filled each later year of a cycle. */
export const FILLED_PER_YEAR = 0.25;

const hash = (k: string) => [...k].reduce((a, ch) => (Math.imul(a, 31) + ch.charCodeAt(0)) >>> 0, 2166136261);

export const cycleOf = (year: number) => Math.floor(year / LISTING_YEARS);
/** The year the next round of listings is posted. */
export const nextListingYear = (year: number) => (cycleOf(year) + 1) * LISTING_YEARS;

/** Entry-level: anyone can be hired. */
export const isEntry = (c: Career) => !c.requires && !c.skill && c.minSmarts <= 20;

/** How strongly a city hires for a career: its industry weight, with very senior jobs a little rarer. */
export function demand(city: CityId, c: Career) {
  const industry = CITIES[city].industries[c.sector] ?? 1;
  const rarity = c.requires === 'top_degree' ? 0.7 : isEntry(c) ? 1.3 : 1;
  return industry * rarity;
}

/** Weighted sample without replacement. */
function sample<T>(rng: ReturnType<typeof makeRng>, items: T[], weight: (t: T) => number, n: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (out.length < n && pool.length) {
    const total = pool.reduce((sum, t) => sum + weight(t), 0);
    let r = rng.next() * total;
    let i = 0;
    while (i < pool.length - 1 && r >= weight(pool[i])) r -= weight(pool[i++]);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

/** Openings in a city this year for a slot (full-time or part-time). */
export function listings(seed: number, city: CityId, year: number, slot: JobSlot): Career[] {
  const cycle = cycleOf(year);
  const rng = makeRng(hash(`${seed}:${city}:${cycle}:${slot}`));
  // Some careers only hire in coastal cities (charter fishing).
  const all = CAREERS.filter((c) => c.hours === slot && (!c.coastal || isCoastal(city)));
  let open = sample(rng, all, (c) => demand(city, c), OPENINGS[slot]);
  if (!open.some(isEntry)) open.push(sample(rng, all.filter(isEntry), (c) => demand(city, c), 1)[0]);
  // Later in the cycle, some openings are filled (never the last entry-level one).
  const yearsIn = year - cycle * LISTING_YEARS;
  if (yearsIn > 0) {
    const fill = makeRng(hash(`${seed}:${city}:${year}:${slot}:filled`));
    const entries = open.filter(isEntry);
    open = open.filter((c) => (isEntry(c) && entries.length === 1) || !fill.chance(FILLED_PER_YEAR * yearsIn));
    if (!open.some(isEntry)) open.push(entries[0]);
  }
  return open.sort((a, b) => a.salary - b.salary);
}

/** Openings where `p` lives, this year. */
export const openingsFor = (s: GameState, slot: JobSlot, p: Person = active(s)) => listings(s.seed, cityOf(s, p), s.year, slot);
export const isHiring = (s: GameState, careerId: string, p: Person = active(s)) =>
  openingsFor(s, 'full', p).some((c) => c.id === careerId) || openingsFor(s, 'part', p).some((c) => c.id === careerId);

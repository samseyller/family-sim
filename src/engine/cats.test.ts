import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_BY_ID } from '../content/achievements';
import { CAT_BREEDS, CAT_SHELTER_FEE, MAX_CATS } from '../content/cats';
import { performActivity } from './activities';
import { estimateYear } from './budget';
import { catAction, catBlocker, catsOf, catStage, catYear, catYearlyCost } from './cats';
import { dogAction } from './dogs';
import { EVENT_BY_ID, resolveEvent } from './events';
import { newGame } from './generate';
import { householdAction } from './household';
import { makeRng } from './rng';
import type { GameState, PendingEvent } from './types';
import { active, kidsAtHome } from './util';

const rich = (seed: number) => { const s = newGame(seed); s.households[active(s).householdId].wallet = 100_000; return s; };
const hh = (s: GameState) => s.households[active(s).householdId];
const got = (s: GameState, id: string) => ACHIEVEMENT_BY_ID[id].test(s);
const fresh = (s: GameState) => ({ ...s, energy: { year: s.year, max: 100, used: 0 }, activityLog: [] });
const pending = (eventId: string) => ({ uid: 'x', eventId, title: '', text: '', choices: [], major: false }) as unknown as PendingEvent;

describe('cats', () => {
  it('adopt a kitten or a shelter cat; they cost money every year', () => {
    let s = catAction(rich(7101), { kind: 'adoptKitten', breed: 'maine_coon', name: 'Moose' });
    expect(hh(s).wallet).toBe(100_000 - CAT_BREEDS.maine_coon.price);
    s = catAction(s, { kind: 'adoptShelterCat', name: '' });
    expect(catsOf(hh(s))).toHaveLength(2);
    expect(catsOf(hh(s))[0].name).toBe('Moose');
    const pet = estimateYear(s).expenses.find((l) => l.label === 'Pet care')!.amount;
    expect(pet).toBe(catsOf(hh(s)).reduce((n, c) => n + catYearlyCost(c, s.year), 0));
    expect(got(s, 'cat_person')).toBe(true);
  });

  it('up to four cats (two in a small apartment)', () => {
    let s = rich(7102);
    for (let i = 0; i < MAX_CATS; i++) s = catAction(s, { kind: 'adoptShelterCat', name: '' });
    expect(catBlocker(s, { kind: 'adoptShelterCat', name: '' })).toMatch(/plenty/);
    expect(got(s, 'cat_colony')).toBe(true);
    const small = rich(7103);
    hh(small).rentTier = 'small';
    hh(small).assets = hh(small).assets.filter((a) => a.kind !== 'house');
    const two = catAction(catAction(small, { kind: 'adoptShelterCat', name: '' }), { kind: 'adoptShelterCat', name: '' });
    expect(catBlocker(two, { kind: 'adoptShelterCat', name: '' })).toMatch(/two cats/);
  });

  it('grow from kitten to senior, drift without play, and eventually pass away', () => {
    const s = catAction(rich(7104), { kind: 'adoptKitten', breed: 'tabby', name: 'Tom' });
    const cat = catsOf(hh(s))[0];
    expect(catStage(cat, s.year)).toBe('kitten');
    const bond = cat.bond;
    s.year += 2;
    catYear(s, makeRng(1));
    expect(catStage(cat, s.year)).toBe('adult');
    expect(cat.bond).toBeLessThan(bond); // no playtime
    for (let y = 0; y < 30 && cat.deathYear === undefined; y++) { s.year++; catYear(s, makeRng(y)); }
    expect(cat.deathYear).toBeDefined();
    expect(catStage({ ...cat, birthYear: s.year - 13 }, s.year)).toBe('senior');
  });

  it('playtime and a cat tree keep them close', () => {
    let s = catAction(rich(7105), { kind: 'adoptKitten', breed: 'siamese', name: '' });
    s = catAction(s, { kind: 'catTree' });
    expect(hh(s).catTree).toBe(true);
    const before = catsOf(hh(s))[0].bond;
    s = performActivity(fresh(s), 'play_with_cats', []);
    expect(catsOf(hh(s))[0].bond).toBeGreaterThan(before);
    expect(catsOf(hh(s))[0].lastPlayYear).toBe(s.year);
  });

  it('a stray can move in, and a cat and dog can become friends', () => {
    const s = rich(7106);
    while (!EVENT_BY_ID.stray_cat.candidates!({ s, rng: makeRng(1), me: active(s) }).length) s.year++; // strays come in some years only
    active(s).birthYear = Math.min(active(s).birthYear, s.year - 25);
    expect(EVENT_BY_ID.stray_cat.candidates!({ s, rng: makeRng(1), me: active(s) })).toHaveLength(1);
    resolveEvent(s, makeRng(1), pending('stray_cat'), 'adopt');
    expect(catsOf(hh(s))[0].stray).toBe(true);
    expect(got(s, 'picked_by_a_stray')).toBe(true);
    const both = dogAction(s, { kind: 'adoptShelter', name: 'Rex' });
    expect(EVENT_BY_ID.cats_and_dogs.candidates!({ s: both, rng: makeRng(1), me: active(both) })).toHaveLength(1);
    resolveEvent(both, makeRng(1), pending('cats_and_dogs'), 'slow');
    expect(got(both, 'cats_and_dogs')).toBe(true);
    expect(EVENT_BY_ID.cats_and_dogs.candidates!({ s: both, rng: makeRng(1), me: active(both) })).toHaveLength(0); // once
  });

  it('cats go with their owner when a grown child moves out', () => {
    const s = rich(7107);
    const kid = kidsAtHome(s, active(s))[0];
    kid.birthYear = s.year - 25;
    const withCat = catAction(s, { kind: 'adoptShelterCat', name: 'Pip' });
    catsOf(hh(withCat))[0].ownerId = kid.id;
    const out = householdAction(withCat, { kind: 'askToLeave', personId: kid.id, gift: 0 });
    expect(catsOf(hh(out))).toHaveLength(0);
    expect(catsOf(out.households[out.people[kid.id].householdId])[0].name).toBe('Pip');
    expect(CAT_SHELTER_FEE).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_BY_ID } from '../content/achievements';
import { BREEDS, MAX_DOGS, SHELTER_FEE } from '../content/dogs';
import { performActivity } from './activities';
import { estimateYear } from './budget';
import { dogAction, dogAge, dogBlocker, dogsOf, dogStage, dogYear, dogYearlyCost } from './dogs';
import { newGame } from './generate';
import { splitOff } from './household';
import { makeRng } from './rng';
import type { GameState } from './types';
import { active } from './util';
import { parseSaveFile, serializeGame } from '../persistence/exportImport';

const got = (s: GameState, id: string) => ACHIEVEMENT_BY_ID[id].test(s);
const hhOf = (s: GameState) => s.households[active(s).householdId];
const rich = (seed: number) => { const s = newGame(seed); hhOf(s).wallet = 100_000; return s; };

describe('adopting', () => {
  it('a puppy costs the breed price, adds a yearly Pet care cost, and unlocks Best Friend', () => {
    const s0 = rich(901);
    const s = dogAction(s0, { kind: 'adoptPuppy', breed: 'golden', name: 'Biscuit' });
    const [d] = dogsOf(hhOf(s));
    expect(d).toMatchObject({ name: 'Biscuit', breed: 'golden', birthYear: s.year });
    expect(dogStage(d, s.year)).toBe('puppy');
    expect(hhOf(s).wallet).toBe(100_000 - BREEDS.golden.price);
    expect(estimateYear(s).expenses.find((l) => l.label === 'Pet care')?.amount).toBe(dogYearlyCost(d, s.year));
    expect(got(s, 'best_friend')).toBe(true);
    expect(got(s, 'rescue_hero')).toBe(false);
  });

  it('a shelter dog is an adult rescue', () => {
    const s = dogAction(rich(902), { kind: 'adoptShelter', name: '' });
    const [d] = dogsOf(hhOf(s));
    expect(d.rescued).toBe(true);
    expect(d.name.length).toBeGreaterThan(0);
    expect(dogAge(d, s.year)).toBeGreaterThanOrEqual(2);
    expect(hhOf(s).wallet).toBe(100_000 - SHELTER_FEE);
    expect(got(s, 'rescue_hero')).toBe(true);
  });

  it('three dogs is a full pack; a small apartment allows one', () => {
    let s = rich(903);
    for (let i = 0; i < MAX_DOGS; i++) s = dogAction(s, { kind: 'adoptPuppy', breed: 'beagle', name: `B${i}` });
    expect(got(s, 'pack_leader')).toBe(true);
    expect(dogBlocker(s, { kind: 'adoptShelter', name: '' })).toMatch(/full pack/);
    const t = rich(904);
    hhOf(t).rentTier = 'small';
    const one = dogAction(t, { kind: 'adoptShelter', name: '' });
    expect(dogBlocker(one, { kind: 'adoptShelter', name: '' })).toMatch(/small apartment/);
  });
});

describe('living with dogs', () => {
  it('everyone at home is happier; walks keep an energetic dog close', () => {
    const base = rich(911);
    const withDog = dogAction(base, { kind: 'adoptPuppy', breed: 'labrador', name: 'Max' });
    const a: GameState = structuredClone(base);
    const b: GameState = structuredClone(withDog);
    dogYear(a, makeRng(1));
    dogYear(b, makeRng(1));
    expect(active(b).stats.happiness).toBeGreaterThan(active(a).stats.happiness);

    const lonely: GameState = structuredClone(withDog);
    const walked = performActivity({ ...structuredClone(withDog), energy: { year: withDog.year, max: 100, used: 0 } }, 'walk_dogs', []);
    dogYear(lonely, makeRng(2));
    dogYear(walked, makeRng(2));
    expect(dogsOf(hhOf(walked))[0].bond).toBeGreaterThan(dogsOf(hhOf(lonely))[0].bond);
  });

  it('dogs age from puppy to senior and eventually pass away (Good Old Dog at 14)', () => {
    let s = dogAction(rich(912), { kind: 'adoptPuppy', breed: 'beagle', name: 'Scout' });
    const id = dogsOf(hhOf(s))[0].id;
    const stages = new Set<string>();
    const rng = makeRng(5);
    for (let y = 0; y < 25; y++) {
      const d = (hhOf(s).dogs ?? []).find((x) => x.id === id)!;
      if (d.deathYear !== undefined) break;
      stages.add(dogStage(d, s.year));
      d.health = 100; // a well-cared-for dog
      dogYear(s, rng);
      s = { ...s, year: s.year + 1 };
    }
    const d = (hhOf(s).dogs ?? []).find((x) => x.id === id)!;
    expect([...stages]).toEqual(['puppy', 'adult', 'senior']);
    expect(d.deathYear).toBeDefined();
    expect(d.deathYear! - d.birthYear).toBeGreaterThanOrEqual(BREEDS.beagle.lifespan - 1);
  });

  it('a dog reaching 14 unlocks Good Old Dog', () => {
    const s = dogAction(rich(915), { kind: 'adoptPuppy', breed: 'beagle', name: 'Gus' });
    expect(got(s, 'good_old_dog')).toBe(false);
    dogsOf(hhOf(s))[0].birthYear = s.year - 14;
    dogYear(s, makeRng(3));
    expect(got(s, 'good_old_dog')).toBe(true);
  });

  it('a dog moves out with its owner', () => {
    const s = dogAction(rich(913), { kind: 'adoptPuppy', breed: 'frenchie', name: 'Mochi' });
    const old = hhOf(s).id;
    splitOff(s, [active(s)], 0, 0);
    expect(dogsOf(hhOf(s)).map((d) => d.name)).toEqual(['Mochi']);
    expect(dogsOf(s.households[old])).toHaveLength(0);
  });

  it('dogs survive a save round-trip', () => {
    const s = dogAction(rich(914), { kind: 'adoptPuppy', breed: 'shepherd', name: 'Duke' });
    const res = parseSaveFile(serializeGame(s));
    expect(res.ok).toBe(true);
    if (res.ok && res.kind === 'game') expect(dogsOf(res.state.households[active(res.state).householdId])[0].name).toBe('Duke');
  });
});

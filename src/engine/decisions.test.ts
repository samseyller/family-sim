/** Slice 1: character-driven NPC decisions. */
import { describe, expect, it } from 'vitest';
import { playLife } from '../balance/simulate';
import { performActivity } from './activities';
import { closePeople, DECISIONS, decisionById, decisionRoll, evaluate, FACTOR_CAP, FLOOR, npcIntentions, type DecisionCtx } from './agency';
import { makeFriend } from './friends';
import { newGame } from './generate';
import { cityOf, otherCity } from './location';
import { remember } from './relationships';
import { makeRng } from './rng';
import type { GameState, Person, Trait } from './types';
import { active, ageOf, getBond, kidsAtHome, parentsOf, partnerOf } from './util';

const ctx = (s: GameState, p: Person): DecisionCtx => ({ s, me: active(s), p, age: ageOf(p, s.year) });
const chanceOf = (id: string, s: GameState, p: Person) => evaluate(decisionById(id), ctx(s, p)).chance;
const withTraits = (p: Person, traits: Trait[], extra: Partial<Person> = {}) => Object.assign(p, { traits, ...extra });

describe('hard eligibility', () => {
  it('impossible or contradictory decisions never happen, whatever the personality', () => {
    const s = newGame(10101);
    const me = active(s);
    const p = partnerOf(s, me.id)!;
    for (const traits of [['ambitious', 'curious'], ['kind', 'creative'], ['stubborn', 'anxious']] as Trait[][]) {
      withTraits(p, traits, { hobby: undefined });
      expect(decisionById('drop_interest').eligible(ctx(s, p))).toBe(false); // no hobby to drop
      expect(decisionById('create_distance').eligible(ctx(s, p))).toBe(false); // no remembered harm
      expect(decisionById('distant_job').eligible(ctx(s, p))).toBe(false); // not the player's child
    }
    const kid = kidsAtHome(s, me)[0];
    kid.birthYear = s.year - 30;
    kid.jobId = 'enlisted';
    expect(decisionById('distant_job').eligible(ctx(s, kid))).toBe(false); // military postings aren't job offers
    kid.jobId = 'developer';
    kid.flags.invited_home = s.year;
    expect(decisionById('distant_job').eligible(ctx(s, kid))).toBe(false); // invited home: stays
  });

  it('remembered harm is needed before someone pulls away; two harms, not one', () => {
    const s = newGame(10102);
    const me = active(s);
    const p = partnerOf(s, me.id)!;
    s.bonds[[me.id, p.id].sort().join('|')] = { affinity: 10, trust: 0 };
    remember(p, 'missed', me.id, s.year - 1);
    expect(decisionById('create_distance').eligible(ctx(s, p))).toBe(false);
    remember(p, 'pressure', me.id, s.year - 1);
    expect(decisionById('create_distance').eligible(ctx(s, p))).toBe(true);
  });

  it('support only comes when the player is actually struggling', () => {
    const s = newGame(10103);
    const me = active(s);
    const p = partnerOf(s, me.id)!;
    s.bonds[[me.id, p.id].sort().join('|')] = { affinity: 60, trust: 50 };
    for (const x of parentsOf(s, me)) if (x.deathYear) x.deathYear = s.year - 5; // no recent loss
    me.stats.stress = 30;
    me.stats.health = 80;
    expect(decisionById('offer_support').eligible(ctx(s, p))).toBe(false);
    me.stats.stress = 75;
    expect(decisionById('offer_support').eligible(ctx(s, p))).toBe(true);
  });
});

describe('personality changes odds, not outcomes', () => {
  it('every factor is bounded, and chances stay inside each decision’s range', () => {
    const s = newGame(10201);
    for (const p of closePeople(s)) {
      for (const def of DECISIONS) {
        if (!def.eligible(ctx(s, p))) continue;
        const { chance, factors } = evaluate(def, ctx(s, p));
        expect(chance).toBeGreaterThanOrEqual(def.base * FLOOR);
        expect(chance).toBeLessThanOrEqual(def.max);
        for (const f of factors) expect(Math.abs(f.delta)).toBeLessThanOrEqual(FACTOR_CAP);
      }
    }
  });

  it('different profiles behave differently, and exceptions stay possible', () => {
    const s = newGame(10202);
    const p = partnerOf(s, active(s).id)!;
    p.hobby = 'music';
    p.skills.music = 40;
    const driven = chanceOf('deepen_interest', s, withTraits(p, ['creative', 'stubborn'], { aspiration: 'mastery' }));
    const relaxed = chanceOf('deepen_interest', s, withTraits(p, ['easygoing', 'kind'], { aspiration: 'connection' }));
    expect(driven).toBeGreaterThan(relaxed * 2);
    expect(relaxed).toBeGreaterThan(0); // an easygoing person can still surprise you

    const me = active(s);
    s.bonds[[me.id, p.id].sort().join('|')] = { affinity: 0, trust: 0 };
    remember(p, 'missed', me.id, s.year - 1);
    remember(p, 'pressure', me.id, s.year - 1);
    const stubborn = chanceOf('create_distance', s, withTraits(p, ['stubborn', 'curious']));
    const kind = chanceOf('create_distance', s, withTraits(p, ['kind', 'curious']));
    expect(stubborn).toBeGreaterThan(kind);
    expect(kind).toBeGreaterThan(0);
  });

  it('the stable roll realizes those odds across many people and years', () => {
    const s = newGame(10203);
    const p = partnerOf(s, active(s).id)!;
    p.hobby = 'music';
    p.skills.music = 40;
    const rate = (traits: Trait[], aspiration: Person['aspiration']) => {
      withTraits(p, traits, { aspiration });
      const chance = chanceOf('deepen_interest', s, p);
      let hits = 0;
      for (let i = 0; i < 4000; i++) if (decisionRoll({ ...s, year: s.year + (i % 200), seed: s.seed + Math.floor(i / 200) }, p, 'deepen_interest') < chance) hits++;
      return hits / 4000;
    };
    const driven = rate(['creative', 'stubborn'], 'mastery');
    const relaxed = rate(['easygoing', 'kind'], 'connection');
    expect(driven).toBeGreaterThan(relaxed * 1.8);
    expect(relaxed).toBeGreaterThan(0.003);
  });
});

describe('the yearly pass', () => {
  it('is deterministic for a fixed seed, and never touches household money', { timeout: 60_000 }, () => {
    let last: GameState | undefined;
    playLife('family', 10301, 50, (s) => { last = s; });
    const a = structuredClone(last!);
    const b = structuredClone(last!);
    const wallets = JSON.stringify(Object.values(a.households).map((h) => [h.wallet, h.investments]));
    npcIntentions(a);
    npcIntentions(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(Object.values(a.households).map((h) => [h.wallet, h.investments]))).toBe(wallets);
  });

  it('explains private decisions in the recap', () => {
    for (let seed = 10400; seed < 10500; seed++) {
      const s = newGame(seed);
      const p = partnerOf(s, active(s).id)!;
      Object.assign(p, { traits: ['creative', 'stubborn'], aspiration: 'mastery', hobby: 'music' });
      p.skills.music = 50;
      p.flags.note_year = undefined;
      const before = s.journal.length;
      npcIntentions(s);
      const line = s.journal.slice(before).find((j) => j.text.includes(p.firstName) && /seriously/.test(j.text));
      if (!line) continue;
      expect(line.text).toMatch(/After years of enjoying music|take music seriously/);
      expect(p.flags.serious_interest).toBe(s.year);
      return;
    }
    throw new Error('no seed produced the decision');
  });
});

describe('independent people', () => {
  it('sometimes decline an invitation despite a good bond, and say why', () => {
    let declined = false;
    for (let seed = 10600; seed < 10700 && !declined; seed++) {
      const s = newGame(seed);
      s.households[active(s).householdId].wallet = 50_000;
      const f = makeFriend(s, makeRng(seed), active(s), 'from work', otherCity(makeRng(seed), cityOf(s, active(s))))!;
      Object.assign(f, { traits: ['stubborn', 'anxious'] }); // needs space
      s.bonds[[active(s).id, f.id].sort().join('|')] = { affinity: 50, trust: 40 };
      const t = performActivity(s, 'visit_friend', [f.id]);
      if (/needs more time alone/.test(t.lastActivity?.text ?? '')) {
        declined = true;
        expect(getBond(t, active(t).id, f.id).affinity).toBe(50); // no hard feelings
      }
    }
    expect(declined).toBe(true);
  });
});

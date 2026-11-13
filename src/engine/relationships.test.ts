/** Stages 2–3 gate: preferences, memories, repairs, and close people's own initiatives. */
import { describe, expect, it } from 'vitest';
import { playLife } from '../balance/simulate';
import { checkGame } from '../persistence/exportImport';
import { ACTIVITIES, activityBlocker, performActivity } from './activities';
import { activitySituation } from './activitySituations';
import { npcIntentions } from './agency';
import { EVENT_BY_ID } from './events';
import { newGame } from './generate';
import { CONNECTIONS, connectionOf, formOf, harmFrom, receiverFactor, remember } from './relationships';
import { makeRng } from './rng';
import type { GameState } from './types';
import { active, getBond, kidsAtHome, partnerOf } from './util';

const rich = (seed: number) => {
  const s = newGame(seed);
  s.households[active(s).householdId].wallet = 100_000;
  active(s).stats.stress = 30;
  return s;
};

describe('connection preferences', () => {
  it('are stable, and a preferred form of care helps more without other forms becoming useless', () => {
    const s = newGame(7101);
    const p = partnerOf(s, active(s).id)!;
    expect(connectionOf(p)).toBe(connectionOf(structuredClone(p)));
    const pref = connectionOf(p);
    for (const form of CONNECTIONS) {
      const f = receiverFactor(p, form);
      expect(f).toBeGreaterThanOrEqual(0.8);
      if (form === pref) expect(f).toBeGreaterThan(1);
      else expect(f).toBeGreaterThanOrEqual(1);
    }
  });

  it('no form of care needs money: every form has a free activity', () => {
    for (const form of CONNECTIONS) {
      const free = ACTIVITIES.filter((a) => formOf(activitySituation(a.id)) === form && a.cost(newGame(1), []) === 0);
      expect(free.length, form).toBeGreaterThan(0);
    }
  });
});

describe('repairing a bond', () => {
  /** A partner hurt by a missed year, with a strained bond. */
  const hurt = (seed: number) => {
    const s = rich(seed);
    const me = active(s);
    const p = partnerOf(s, me.id)!;
    remember(p, 'missed', me.id, s.year - 1);
    s.bonds[[me.id, p.id].sort().join('|')] = { affinity: 5, trust: 5 };
    return { s, me, p };
  };

  it('works several ways: an apology, talking it through, or making amends', () => {
    { // apology (only once: nothing left to apologize for afterwards)
      const { s, me, p } = hurt(7201);
      const t = performActivity(s, 'apologize', [p.id]);
      expect(harmFrom(t.people[p.id], me.id)).toBeUndefined();
      expect(getBond(t, me.id, p.id).trust).toBeGreaterThan(5);
      expect(activityBlocker(t, 'apologize', [p.id])).not.toBeNull();
    }
    for (const ch of ['talk', 'amends']) {
      const { s, me, p } = hurt(7202);
      const c = { s, rng: makeRng(1), me };
      expect(EVENT_BY_ID.still_hurt.candidates!(c).map((x) => x.subject?.id)).toContain(p.id);
      EVENT_BY_ID.still_hurt.resolve(c, ch, p);
      expect(harmFrom(p, me.id), ch).toBeUndefined();
      expect(getBond(s, me.id, p.id).affinity, ch).toBeGreaterThan(5);
    }
  });

  it('an apology needs a real harm, and check-ins cannot farm trust', () => {
    const s = rich(7203);
    const p = partnerOf(s, active(s).id)!;
    expect(activityBlocker(s, 'apologize', [p.id])).not.toBeNull();
    let t = performActivity(s, 'check_in', [p.id]);
    const once = getBond(t, active(t).id, p.id).trust;
    t = performActivity(t, 'check_in', [p.id]);
    expect(getBond(t, active(t).id, p.id).trust).toBe(once);
  });

  it('asking what they need reveals their preference for the Family tab', () => {
    const s = rich(7204);
    const kid = kidsAtHome(s, active(s))[0];
    const t = performActivity(s, 'ask_need', [kid.id]);
    expect(t.people[kid.id].flags.pref_known).toBe(1);
  });
});

describe('close people act on their own', () => {
  it('never spend household money or change the player without a decision', { timeout: 60_000 }, () => {
    let decisions = 0;
    let notes = 0;
    for (let seed = 7300; seed < 7330; seed++) {
      let last: GameState | undefined;
      playLife('family', seed, 60, (s) => { last = s; });
      const s = structuredClone(last!);
      const wallets = JSON.stringify(Object.values(s.households).map((h) => [h.wallet, h.investments]));
      const before = s.scheduled.length;
      const journal = s.journal.length;
      npcIntentions(s);
      expect(JSON.stringify(Object.values(s.households).map((h) => [h.wallet, h.investments]))).toBe(wallets);
      expect(s.scheduled.length - before).toBeLessThanOrEqual(1); // at most one decision a year
      decisions += s.scheduled.length - before;
      notes += s.journal.length - journal;
    }
    expect(notes).toBeLessThanOrEqual(30 * 2);
    expect(decisions).toBeLessThan(30); // special, not every year
  });
});

describe('saves', () => {
  it('a save from before preferences and memories loads, and new fields validate', () => {
    const s = newGame(7400);
    const old = JSON.parse(JSON.stringify({ ...s, schemaVersion: 20 }));
    expect(checkGame(old, 'old').ok).toBe(true);
    const p = partnerOf(s, active(s).id)!;
    remember(p, 'missed', active(s).id, s.year);
    p.connection = 'space';
    const res = checkGame(JSON.parse(JSON.stringify(s)), 'new');
    expect(res.ok, res.ok ? '' : res.error).toBe(true);
  });
});

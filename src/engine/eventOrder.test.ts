/** Events must never appear out of logical order within a year. */
import { describe, expect, it } from 'vitest';
import { EVENT_BY_ID, refreshPending, settledInJob, stillRelevant } from './events';
import { newGame } from './generate';
import { makeRng } from './rng';
import { applyPlan } from './systems';
import { choose, updatePlan, autoplayYear } from './phases';
import { strategyPlan } from './strategies';
import type { GameState, PendingEvent } from './types';
import { active, partnerOf } from './util';
import { openingsFor } from './jobMarket';

/** Put chance-picked events in front of the player, as generateEvents would. */
function queue(s: GameState, ids: string[]): GameState {
  const t: GameState = structuredClone(s);
  t.phase = 'DECISIONS';
  t.snapshot = { stats: { ...active(t).stats }, wallet: t.households[active(t).householdId].wallet, householdId: active(t).householdId };
  t.pending = ids.map((id, i): PendingEvent => {
    const built = EVENT_BY_ID[id].build({ s: t, rng: makeRng(1), me: active(t) });
    return { uid: `${t.year}-${id}-${i}`, eventId: id, major: EVENT_BY_ID[id].major, recheck: true, ...built };
  });
  return t;
}

const JOB_EVENTS = ['workplace_credit', 'coworker_lunch', 'promotion_offer', 'layoff', 'retirement'];

describe('event order', () => {
  it('after a layoff, office events queued for later that year are dropped', () => {
    const s = newGame(1701);
    const me = active(s);
    expect(me.jobId).toBeTruthy();
    let t = queue(s, ['layoff', 'workplace_credit', 'coworker_lunch']);
    t = choose(t, t.pending[0].uid, 'take');
    expect(active(t).jobId).toBeUndefined();
    expect(t.pending.map((p) => p.eventId)).not.toContain('workplace_credit');
    expect(t.pending.map((p) => p.eventId)).not.toContain('coworker_lunch');
  });

  it('a new hire gets no workplace events until next year', () => {
    const s = newGame(1702);
    const me = active(s);
    me.jobId = undefined;
    const job = openingsFor(s, 'full').find((c) => !c.requires && !c.skill && !c.startup)!;
    for (let i = 0; i < 20 && !me.jobId; i++) {
      s.plan.jobIntents = [{ kind: 'apply', careerId: job.id }];
      applyPlan(s, makeRng(i));
    }
    expect(me.jobId).toBe(job.id);
    expect(settledInJob({ s, me })).toBe(false);
    for (const id of ['workplace_credit', 'coworker_lunch', 'layoff']) expect(EVENT_BY_ID[id].candidates!({ s, rng: makeRng(1), me })).toHaveLength(0);
    s.year++;
    expect(settledInJob({ s, me })).toBe(true);
  });

  it('waiting events are refreshed: an option you can no longer afford becomes unavailable', () => {
    const s = newGame(1703);
    const me = active(s);
    const partner = partnerOf(s, me.id)!;
    s.households[me.householdId].wallet = 50000;
    const built = EVENT_BY_ID.honeymoon.build({ s, rng: makeRng(1), me }, partner);
    const pe: PendingEvent = { uid: 'x', eventId: 'honeymoon', subjectId: partner.id, major: false, ...built };
    expect(pe.choices.find((c) => c.id === 'europe')!.disabled).toBeFalsy();
    s.households[me.householdId].wallet = 0; // an earlier decision spent everything
    const after = refreshPending(s, pe);
    expect(after.uid).toBe('x');
    expect(after.choices.find((c) => c.id === 'europe')!.disabled).toBe(true);
    expect(after.choices.find((c) => c.id === 'skip')!.disabled).toBeFalsy();
  });

  it('in long random play, every waiting chance event still makes sense when its turn comes', () => {
    for (let seed = 1; seed <= 12; seed++) {
      let s = newGame(1800 + seed);
      const rng = makeRng(seed);
      for (let y = 0; y < 40 && s.phase !== 'SUCCESSION' && s.phase !== 'GAME_OVER'; y++) {
        s = updatePlan(s, strategyPlan(s, 'balanced'));
        const hiredBefore = active(s).flags.hired_year;
        s = autoplayYear(s, (pe, st) => {
          // When an event comes up, it must still be relevant given everything decided so far.
          expect(stillRelevant(st, pe), `${pe.eventId} in ${st.year}`).toBe(true);
          if (JOB_EVENTS.includes(pe.eventId) && pe.eventId !== 'retirement') {
            expect(settledInJob({ s: st, me: active(st) }), `${pe.eventId} before settling into a job`).toBe(true);
          }
          return rng.pick(pe.choices.filter((c) => !c.disabled)).id;
        });
        void hiredBefore;
      }
    }
  });
});

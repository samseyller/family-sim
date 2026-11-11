import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_BY_ID } from '../content/achievements';
import { CAREERS, titleOf, CAREER_BY_ID } from '../content/careers';
import { estimateYear } from './budget';
import { EVENT_BY_ID } from './events';
import { startPath } from './family';
import { newGame, pickCareer } from './generate';
import { listings } from './jobMarket';
import { DISABILITY_PAY, RISK, TOUR_YEARS, enlist, enlistBlocker, isActiveDuty, leaveService, militaryYear, retireFromService } from './military';
import { choose, resolveYear } from './phases';
import { makeRng } from './rng';
import { tuitionFor } from './school';
import type { GameState, Person } from './types';
import { active, kidsAtHome } from './util';

const got = (s: GameState, id: string) => ACHIEVEMENT_BY_ID[id].test(s);
const line = (s: GameState, label: string, side: 'income' | 'expenses' = 'expenses') => estimateYear(s)[side].find((l) => l.label === label)?.amount ?? 0;

/** A grown child of the player who serves (so risks can be measured without ending the game). */
function soldierKid(seed: number): { s: GameState; kid: Person } {
  const s = newGame(seed);
  const kid = kidsAtHome(s, active(s))[0];
  kid.birthYear = s.year - 20;
  kid.flags.came_of_age = 1;
  enlist(s, kid, false);
  return { s, kid };
}

describe('joining', () => {
  it('enlisting at 18 starts a 4-year tour as a Private', () => {
    const s = newGame(2001, 'child');
    const me = active(s);
    me.birthYear = s.year - 18;
    startPath(s, me, 'military', makeRng(1));
    expect(me.jobId).toBe('enlisted');
    expect(titleOf(CAREER_BY_ID.enlisted, me.jobLevel)).toBe('Private');
    expect(me.flags.tour_end).toBe(s.year + TOUR_YEARS);
    expect(EVENT_BY_ID.own_coming_of_age.build({ s, rng: makeRng(1), me }).choices.map((c) => c.id)).toEqual(expect.arrayContaining(['military', 'rotc']));
  });

  it('the military recruits directly: never in job listings or random careers', () => {
    for (let y = 2026; y < 2040; y++) for (const slot of ['full', 'part'] as const) expect(listings(3, 'san_antonio', y, slot).some((c) => c.military)).toBe(false);
    const p = active(newGame(2002));
    p.flags.degree = 1;
    p.stats.smarts = 90;
    for (let i = 0; i < 50; i++) expect(pickCareer(makeRng(i), p)?.military).toBeUndefined();
    expect(CAREERS.filter((c) => c.military).map((c) => c.id).sort()).toEqual(['enlisted', 'officer', 'reserve']);
  });

  it('a recruiter takes ages 18–34; officers need a degree', () => {
    const s = newGame(2003);
    const me = active(s);
    me.birthYear = s.year - 30;
    delete me.flags.degree;
    expect(enlistBlocker(s, true)).toMatch(/degree/);
    expect(enlistBlocker(s, false)).toBeNull();
    me.birthYear = s.year - 40;
    expect(enlistBlocker(s, false)).toMatch(/18–34/);
  });

  it('ROTC pays for state university, then commissions you as an officer', () => {
    const s = newGame(2004, 'child');
    const me = active(s);
    me.birthYear = s.year - 18;
    me.grades = { 14: 3.6, 15: 3.6, 16: 3.6, 17: 3.6 };
    me.stats.smarts = 70;
    let note = '';
    for (let i = 0; i < 20 && !me.flags.rotc; i++) note = startPath(s, me, 'rotc', makeRng(i));
    expect(note).toMatch(/ROTC/);
    expect(tuitionFor(me)).toBe(0);
    let t: GameState = s;
    for (let y = 0; y < 5 && !isActiveDuty(active(t)); y++) {
      t = resolveYear(t);
      while (t.phase === 'DECISIONS') t = choose(t, t.pending[0].uid, t.pending[0].choices.find((c) => !c.disabled)!.id);
      if (t.phase === 'RECAP') t = { ...t, phase: 'PLANNING', year: t.year + 1 };
    }
    expect(active(t).jobId).toBe('officer');
    expect(got(t, 'commissioned')).toBe(true);
  });
});

describe('serving', () => {
  it('health care is covered while serving', () => {
    const s = newGame(2010);
    const me = active(s);
    const before = line(s, 'Health insurance');
    enlist(s, me, false);
    expect(line(s, 'Health insurance')).toBeLessThan(before);
  });

  it('deployments are common; injuries uncommon; deaths rare (and written respectfully)', () => {
    let deployed = 0;
    let wounded = 0;
    let fallen = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const { s, kid } = soldierKid(2011);
      kid.flags.tour_end = s.year + 10; // keep them serving
      militaryYear(s, makeRng(i));
      if (kid.flags.deployed_year === s.year) deployed++;
      if (kid.flags.wounded) wounded++;
      if (kid.deathYear !== undefined) {
        fallen++;
        const text = s.journal.map((j) => j.text).join(' ');
        expect(text).toMatch(/line of duty/);
        expect(text).toMatch(/flag-folding ceremony/);
        expect(text).not.toMatch(/blood|gore|explod|killed in action by/i);
      }
    }
    expect(deployed / N).toBeGreaterThan(RISK.deploy - 0.05);
    expect(deployed / N).toBeLessThan(RISK.deploy + 0.05);
    expect(wounded / N).toBeGreaterThan(0.003);
    expect(wounded / N).toBeLessThan(0.03);
    expect(fallen / N).toBeLessThan(0.004);
  });

  it('the guided first life is never wounded or killed in service', () => {
    for (let i = 0; i < 300; i++) {
      const s = newGame(1, 'guided');
      const me = active(s);
      enlist(s, me, false);
      militaryYear(s, makeRng(i));
      expect(me.deathYear).toBeUndefined();
      expect(me.flags.wounded).toBeUndefined();
    }
  });

  it('a tour ends with a decision: re-enlisting promotes and pays a bonus', () => {
    const s = newGame(2012);
    const me = active(s);
    enlist(s, me, false);
    me.flags.tour_end = s.year;
    militaryYear(s, makeRng(5));
    expect(s.scheduled.some((x) => x.eventId === 'tour_end')).toBe(true);
    let t = resolveYear({ ...s });
    const pe = t.pending.find((p) => p.eventId === 'tour_end')!;
    expect(pe.choices.map((c) => c.id)).toEqual(expect.arrayContaining(['reenlist', 'officer', 'reserve', 'leave']));
    const w = t.households[active(t).householdId].wallet;
    t = choose(t, pe.uid, 'reenlist');
    expect(active(t).jobLevel).toBe(2);
    expect(t.households[active(t).householdId].wallet).toBeGreaterThanOrEqual(w + 10000);
  });

  it('veterans get the GI Bill; the reserve is part-time; 20 years earns a pension', () => {
    const s = newGame(2013);
    const me = active(s);
    enlist(s, me, false);
    leaveService(s, me, 'reserve');
    expect(me.partJobId).toBe('reserve');
    expect(me.flags.gi_bill).toBe(1);
    me.studyingUntil = s.year + 2;
    me.studyKind = 'university';
    expect(tuitionFor(me)).toBe(0);
    const t = newGame(2014);
    const vet = active(t);
    enlist(t, vet, false);
    vet.jobLevel = 3;
    vet.flags.service_years = 20;
    retireFromService(t, vet);
    expect(vet.flags.mil_pension).toBe(36000);
    expect(line(t, 'Veterans benefits', 'income')).toBe(36000);
    expect(got(t, 'career_soldier')).toBe(true);
    vet.flags.disability = 1;
    expect(line(t, 'Veterans benefits', 'income')).toBe(36000 + DISABILITY_PAY);
  });
});

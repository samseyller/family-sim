import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_BY_ID } from '../content/achievements';
import { CAREERS, CAREER_BY_ID, titleOf } from '../content/careers';
import { PRO_SKILL, SCHOLARSHIP_SKILL, SPORTS, SPORT_IDS } from '../content/sports';
import { performActivity } from './activities';
import { estimateYear } from './budget';
import { EVENT_BY_ID } from './events';
import { preferredPath, startPath } from './family';
import { newGame, pickCareer } from './generate';
import { listings } from './jobMarket';
import { makeRng } from './rng';
import { tuitionFor } from './school';
import { chooseSport, goPro, isPro, sportBoost, sportSkill, sportsAction, sportsYear } from './sports';
import type { GameState } from './types';
import { active, kidsAtHome } from './util';
import { financeAction } from './finance';
import { hobbyCareerYear, practiceCostPerBlock } from './hobbies';

const got = (s: GameState, id: string) => ACHIEVEMENT_BY_ID[id].test(s);
const fresh = (s: GameState) => ({ ...s, energy: { year: s.year, max: 100, used: 0 }, activityLog: [] });
const rich = (seed: number) => { const s = newGame(seed); s.households[active(s).householdId].wallet = 2_000_000; return s; };

describe('sports', () => {
  it('ten sports, each with a pro career kept out of job listings', () => {
    expect(SPORT_IDS).toHaveLength(10);
    for (const id of SPORT_IDS) expect(CAREER_BY_ID[`pro_${id}`]?.pro).toBe(id);
    for (let y = 2026; y < 2040; y++) expect(listings(9, 'los_angeles', y, 'full').some((c) => c.pro)).toBe(false);
    const p = active(newGame(2101));
    p.hobby = 'sports';
    p.skills.sports = 99;
    for (let i = 0; i < 30; i++) expect(pickCareer(makeRng(i), p)?.pro).toBeUndefined();
    expect(CAREERS.filter((c) => c.pro)).toHaveLength(10);
  });

  it('skill is kept per sport, with some carryover when switching', () => {
    const p = active(newGame(2102));
    chooseSport(p, 'soccer');
    p.skills.sports = 60;
    chooseSport(p, 'tennis');
    expect(p.skills.sports).toBe(18); // 30% carries over
    p.skills.sports = 40;
    chooseSport(p, 'soccer');
    expect(p.skills.sports).toBe(60);
    expect(sportSkill(p, 'tennis')).toBe(40);
    const s = newGame(2102);
    const me = active(s);
    me.sportSkills = { soccer: 60, tennis: 55 };
    chooseSport(me, 'running');
    me.skills.sports = 50;
    expect(got(s, 'multi_sport')).toBe(true);
  });

  it('kids can start young; adults any time', () => {
    const kid = newGame(2103, 'child');
    expect(sportsAction(kid, { kind: 'take', sport: 'soccer' }).people[active(kid).id].sport).toBe('soccer');
    expect(sportsAction(kid, { kind: 'take', sport: 'football' })).toBe(kid); // football from 8
    const adult = newGame(2104);
    const t = sportsAction(adult, { kind: 'take', sport: 'golf' });
    expect(active(t).hobby).toBe('sports');
    expect(active(t).sport).toBe('golf');
  });

  it('gear, a club and a home setup speed up practice; clubs cost a yearly fee', () => {
    let s = sportsAction(rich(2105), { kind: 'take', sport: 'tennis' });
    expect(sportBoost(s, active(s))).toBe(1);
    s = sportsAction(s, { kind: 'gear' });
    s = sportsAction(s, { kind: 'club', join: true });
    expect(estimateYear(s).expenses.find((l) => l.label === 'Club memberships')?.amount).toBe(SPORTS.tennis.club!.fee);
    s = financeAction(s, { kind: 'buyHome', tier: 'family', downPct: 0.2 });
    s = financeAction(s, { kind: 'upgradeHome', upgrade: 'sport_court' });
    expect(sportBoost(s, active(s))).toBe(2); // 1.2 × 1.4 × 1.3 = 2.18, capped at 2
    expect(practiceCostPerBlock(s, active(s))).toBe(SPORTS.tennis.cost);
  });
});

describe('the road to the pros', () => {
  it('a strong high-school athlete gets an athletic scholarship (tuition paid)', () => {
    const s = newGame(2110, 'child');
    const me = active(s);
    me.birthYear = s.year - 18;
    chooseSport(me, 'basketball');
    me.skills.sports = SCHOLARSHIP_SKILL + 5;
    expect(preferredPath(me)).toBe('athletic');
    expect(EVENT_BY_ID.own_coming_of_age.build({ s, rng: makeRng(1), me }).choices.map((c) => c.id)).toContain('athletic');
    startPath(s, me, 'athletic', makeRng(1));
    expect(me.studyingUntil).toBeTruthy();
    expect(tuitionFor(me)).toBe(0);
    expect(got(s, 'full_ride')).toBe(true);
  });

  it('at pro-level skill the draft comes; pros earn big and climb with skill', () => {
    const s = newGame(2111);
    const me = active(s);
    me.birthYear = s.year - 21;
    chooseSport(me, 'baseball');
    me.skills.sports = PRO_SKILL;
    expect(EVENT_BY_ID.pro_draft.candidates!({ s, rng: makeRng(1), me })).toHaveLength(1);
    goPro(s, me);
    expect(titleOf(CAREER_BY_ID[me.jobId!], me.jobLevel)).toBe('Rookie');
    expect(got(s, 'went_pro')).toBe(true);
    me.skills.sports = 95;
    for (let i = 0; i < 40 && me.jobLevel < 3; i++) { s.year++; me.birthYear = s.year - 25; sportsYear(s, makeRng(i)); }
    expect(me.jobLevel).toBe(3);
    expect(got(s, 'all_star')).toBe(true);
  });

  it('pros retire young; then pro coaching is open to them', () => {
    const s = newGame(2112);
    const kid = kidsAtHome(s, active(s))[0];
    kid.birthYear = s.year - 22;
    chooseSport(kid, 'football');
    kid.skills.sports = 85;
    goPro(s, kid);
    kid.birthYear = s.year - SPORTS.football.retireAge - 1;
    sportsYear(s, makeRng(1));
    expect(isPro(kid)).toBe(false);
    expect(kid.flags.former_pro).toBe(1);
    expect(CAREER_BY_ID.pro_coach.formerPro).toBe(true);
  });

  it('family members can get drafted on their own', () => {
    let drafted = 0;
    for (let i = 0; i < 60; i++) {
      const s = newGame(2113);
      const kid = kidsAtHome(s, active(s))[0];
      kid.birthYear = s.year - 19;
      chooseSport(kid, 'soccer');
      kid.skills.sports = 85;
      sportsYear(s, makeRng(i));
      if (isPro(kid)) drafted++;
    }
    expect(drafted).toBeGreaterThan(5);
    expect(drafted).toBeLessThan(55);
  });

  it('pro contracts and business swings never break', () => {
    const s = newGame(2114);
    const me = active(s);
    chooseSport(me, 'golf');
    me.skills.sports = 90;
    goPro(s, me);
    expect(() => hobbyCareerYear(s, s.households[me.householdId], makeRng(1))).not.toThrow();
  });
});

describe('sports activities', () => {
  it('coaching your kid bonds you and passes on your sport', () => {
    let s = sportsAction(rich(2120), { kind: 'take', sport: 'baseball' });
    active(s).skills.sports = 40;
    const kid = kidsAtHome(s, active(s))[0];
    for (let i = 0; i < 5; i++) s = performActivity(fresh(s), 'coach_kids', [kid.id]);
    expect(s.people[kid.id].sport).toBe('baseball');
    expect(s.people[kid.id].skills.sports).toBeGreaterThanOrEqual(20);
    expect(got(s, 'coach')).toBe(true);
  });

  it('a marathon counts toward 26.2', () => {
    let s = sportsAction(rich(2121), { kind: 'take', sport: 'running' });
    s = performActivity(fresh(s), 'sport_event', []);
    expect(got(s, 'marathoner')).toBe(true);
  });
});

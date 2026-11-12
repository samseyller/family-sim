/**
 * Sports: the "sports" hobby has ten sports, each with its own skill. Kids can start young and
 * climb from travel teams and varsity to a scholarship and the pro draft; adults can pick up a
 * sport any time for fitness, friends, leagues and races. Pros earn big, get hurt, and retire
 * young; former pros can coach.
 */
import { CAREER_BY_ID } from '../content/careers';
import { CLUB_BOOST, GEAR_BOOST, PRO_LADDER, PRO_SKILL, SPORTS, SPORT_CARRYOVER, SPORT_IDS, TALENT, TRAVEL_TEAM_COST, type SportId } from '../content/sports';
import { hash } from './jobMarket';
import { makeRng } from './rng';
import { assignJob } from './generate';
import { isCloseKin } from './family';
import type { Rng } from './rng';
import type { GameState, Person } from './types';
import { active, ageOf, alive, clamp, flag, journal, money, stat } from './util';

export const proSport = (p: Person): SportId | undefined => (p.jobId ? CAREER_BY_ID[p.jobId]?.pro : undefined);
export const isPro = (p: Person) => !!proSport(p);
export const sportSkill = (p: Person, id: SportId) => (p.sport === id ? p.skills.sports ?? 0 : p.sportSkills?.[id] ?? 0);
export const hasGear = (p: Person, id: SportId) => !!p.flags[`gear_${id}`];

/**
 * How good this person can ever get at a sport: their natural athletic ceiling (rolled once,
 * from the game seed and their id) plus a small per-sport offset. Hidden from the player.
 */
export function talentOf(s: GameState, p: Person, sport: SportId | undefined = p.sport, store = true): number {
  let base = p.athleticCeiling;
  if (base === undefined) {
    const u = makeRng(hash(`${s.seed}:${p.id}:talent`)).next();
    base = Math.round(TALENT.base + TALENT.range * u ** TALENT.skew + (p.traits.includes('athletic') ? TALENT.athleticBonus : 0));
    if (store) p.athleticCeiling = base;
  }
  const offset = sport ? (hash(`${p.id}:${sport}`) % (TALENT.sportSpread * 2 + 1)) - TALENT.sportSpread : 0;
  return clamp(base + offset, 30, 100);
}

/** Skill after a gain: progress slows near the ceiling and stops at it (setbacks apply in full). */
export function sportGain(s: GameState, p: Person, from: number, gain: number): number {
  if (gain <= 0) return clamp(from + gain, 0, 100);
  const cap = talentOf(s, p);
  if (from >= cap) return from;
  const fade = clamp((cap - from) / TALENT.fadeZone, TALENT.minFade, 1);
  // Round fractions up by chance (seeded), so small gains near the ceiling slow progress rather than stop it.
  const raw = gain * fade;
  const whole = Math.floor(raw);
  const roll = makeRng(hash(`${s.seed}:${p.id}:${s.year}:${from}:${gain}`)).next();
  return Math.min(cap, from + whole + (roll < raw - whole ? 1 : 0));
}

/** Train in your current sport (activities, camps, coaching, teams). */
export function trainSport(s: GameState, p: Person, gain: number) {
  p.skills.sports = sportGain(s, p, p.skills.sports ?? 0, gain);
}

/** Within a couple of points of their ceiling: progress has leveled off. */
export const nearPeak = (s: GameState, p: Person) => !!p.sport && (p.skills.sports ?? 0) >= talentOf(s, p, p.sport, false) - 2; // read-only: safe in the UI

/** Switch to (or take up) a sport. Skill in each sport is kept; some athleticism carries over. */
export function chooseSport(p: Person, id: SportId) {
  if (p.sport === id && p.hobby === 'sports') return;
  const current = p.skills.sports ?? 0;
  if (p.sport) p.sportSkills = { ...(p.sportSkills ?? {}), [p.sport]: current };
  const best = Math.max(current, ...Object.values(p.sportSkills ?? {}));
  p.sport = id;
  p.hobby = 'sports';
  p.skills.sports = Math.max(p.sportSkills?.[id] ?? 0, Math.round(best * SPORT_CARRYOVER));
}

/** Pick a sport for a kid who just took up sports (athletic kids lean to team sports). */
export function randomSport(rng: Rng, p: Person, age: number): SportId {
  const ok = SPORT_IDS.filter((id) => SPORTS[id].minAge <= Math.max(age, 6));
  const team = ok.filter((id) => SPORTS[id].team);
  return p.traits.includes('athletic') && rng.chance(0.6) ? rng.pick(team) : rng.pick(ok);
}

export function sportBlocker(s: GameState, id: SportId): string | null {
  const me = active(s);
  if (s.phase !== 'PLANNING') return 'Decided while planning.';
  if (me.hobby === 'sports' && me.sport === id) return 'Already your sport.';
  return ageOf(me, s.year) < SPORTS[id].minAge ? `From age ${SPORTS[id].minAge}.` : null;
}

/** How much faster you improve: pro gear, a club, and a home setup multiply (up to 2×). */
export function sportBoost(s: GameState, p: Person): number {
  if (!p.sport) return 1;
  const sp = SPORTS[p.sport];
  let b = 1;
  if (hasGear(p, p.sport)) b *= GEAR_BOOST;
  if (p.club === p.sport) b *= CLUB_BOOST;
  const home = s.households[p.householdId].assets.find((a) => a.kind === 'house');
  if (sp.home && home?.upgrades?.includes(sp.home)) b *= 1.3;
  return Math.min(2, Math.round(b * 100) / 100);
}

// ── Purchases ────────────────────────────────────────────────────────

export type SportsAction = { kind: 'take'; sport: SportId } | { kind: 'gear' } | { kind: 'club'; join: boolean };

export function sportsBlocker(s: GameState, a: SportsAction): string | null {
  const me = active(s);
  if (a.kind === 'take') return sportBlocker(s, a.sport);
  if (s.phase !== 'PLANNING') return 'Decided while planning.';
  if (me.hobby !== 'sports' || !me.sport) return 'Pick a sport first.';
  const sp = SPORTS[me.sport];
  const wallet = s.households[me.householdId].wallet;
  if (a.kind === 'gear') {
    if (hasGear(me, me.sport)) return 'You already have it.';
    return wallet < sp.gear.price ? `Costs ${money(sp.gear.price)}.` : null;
  }
  if (!a.join) return me.club ? null : 'You are not a member.';
  if (!sp.club) return `${sp.label} has no clubs to join.`;
  if (me.club === me.sport) return 'Already a member.';
  return ageOf(me, s.year) < 18 ? 'Your parents would need to sign up.' : wallet < sp.club.fee ? `Costs ${money(sp.club.fee)} a year.` : null;
}

export function sportsAction(state: GameState, a: SportsAction): GameState {
  if (sportsBlocker(state, a)) return state;
  const s: GameState = structuredClone(state);
  const me = active(s);
  if (a.kind === 'take') {
    chooseSport(me, a.sport);
    journal(s, `You took up ${SPORTS[a.sport].label.toLowerCase()}.`, 'info');
    return s;
  }
  const sp = SPORTS[me.sport!];
  const hh = s.households[me.householdId];
  if (a.kind === 'gear') {
    hh.wallet -= sp.gear.price;
    me.flags[`gear_${me.sport}`] = 1;
    journal(s, `You bought ${sp.gear.label.toLowerCase()}.`, 'info');
  } else if (a.join) {
    me.club = me.sport;
    journal(s, `You joined the ${sp.club!.label.toLowerCase()}.`, 'good');
  } else {
    journal(s, `You left the ${SPORTS[me.club!].club?.label.toLowerCase() ?? 'club'}.`, 'info');
    me.club = undefined;
  }
  return s;
}

/** Yearly sports costs for a household: club memberships and kids' travel teams. */
export function sportsCosts(s: GameState, members: Person[]) {
  let clubs = 0;
  let travel = 0;
  for (const p of members) {
    if (p.club && SPORTS[p.club].club) clubs += SPORTS[p.club].club!.fee;
    if (p.flags.travel_team && ageOf(p, s.year) < 18) travel += TRAVEL_TEAM_COST;
  }
  return { clubs, travel };
}

// ── Each year ────────────────────────────────────────────────────────

/** Sign a pro contract in your sport. */
export function goPro(s: GameState, p: Person) {
  const id = p.sport!;
  assignJob(p, CAREER_BY_ID[`pro_${id}`]);
  p.flags.hired_year = s.year;
  p.flags.went_pro = 1;
  if (p.studyingUntil) { p.studyingUntil = undefined; p.studyKind = undefined; }
}

/** End a pro career: you become a former pro (and can coach). */
export function retireFromPro(s: GameState, p: Person) {
  p.jobId = undefined;
  p.jobYears = 0;
  p.flags.former_pro = 1;
  if (isCloseKin(s, p)) journal(s, `${p.id === active(s).id ? 'You' : p.firstName} retired from professional ${p.sport ? SPORTS[p.sport].label.toLowerCase() : 'sports'}.`, 'major');
}

/**
 * Injuries for serious athletes, the slow fade of age, pro promotions and retirements, and
 * family members getting drafted. Player decisions are scheduled as events.
 */
export function sportsYear(s: GameState, rng: Rng) {
  const me = active(s);
  const due = (eventId: string) => {
    if (!s.scheduled.some((x) => x.eventId === eventId && x.dueYear <= s.year)) s.scheduled.push({ dueYear: s.year, eventId });
  };
  for (const p of Object.values(s.people)) {
    if (!alive(p) || p.hobby !== 'sports') continue;
    if (!p.sport) chooseSport(p, randomSport(rng, p, ageOf(p, s.year)));
    const sp = SPORTS[p.sport!];
    const age = ageOf(p, s.year);
    const mine = p.id === me.id;
    const pro = isPro(p);
    const serious = pro || !!p.flags.travel_team || !!p.flags.varsity;
    // Youth travel teams build skill; pros keep improving until their late 20s.
    if (p.flags.travel_team && age < 18) trainSport(s, p, 3);
    if (pro && age < 29) trainSport(s, p, 1);
    if (age >= 35) p.skills.sports = clamp((p.skills.sports ?? 0) - (age >= 50 ? 2 : 1), 0, 100);
    if (age >= 18) delete p.flags.travel_team;
    // College athletes keep training; good high-school players make varsity.
    if (p.flags.athletic_scholarship && p.studyingUntil) trainSport(s, p, 3);
    if (!mine && age >= 14 && age < 18 && !p.flags.varsity && (p.skills.sports ?? 0) >= 45) {
      p.flags.varsity = 1;
      if (isCloseKin(s, p)) journal(s, `${p.firstName} made varsity ${sp.label.toLowerCase()}!`, 'good');
    }
    if (serious && rng.chance(sp.injury * (pro ? 1 : 0.5))) {
      if (mine) due('sports_injury');
      else {
        p.skills.sports = clamp((p.skills.sports ?? 0) - 6, 0, 100);
        stat(p, 'health', -6);
        if (pro && isCloseKin(s, p)) journal(s, `${p.firstName} was hurt and missed most of the season.`, 'bad');
      }
    }
    if (pro) {
      const skill = p.skills.sports ?? 0;
      if (p.jobLevel === 1 && skill >= PRO_LADDER.starter && rng.chance(0.35)) {
        p.jobLevel = 2;
        if (isCloseKin(s, p)) journal(s, `${mine ? 'You' : p.firstName} earned a starting spot!`, 'good');
      } else if (p.jobLevel === 2 && skill >= PRO_LADDER.allStar && rng.chance(0.2)) {
        p.jobLevel = 3;
        flag(p, 'all_star');
        if (isCloseKin(s, p)) journal(s, `${mine ? 'You were' : `${p.firstName} was`} named an All-Star!`, 'major');
      }
      if (age >= sp.retireAge + (p.jobLevel === 3 ? 2 : 0) || (age >= sp.retireAge - 4 && skill < 70)) {
        if (mine) due('pro_retirement');
        else retireFromPro(s, p);
      }
    } else if (!mine && age >= 18 && age <= 23 && (p.skills.sports ?? 0) >= PRO_SKILL && isCloseKin(s, p) && !p.flags.went_pro && rng.chance(0.25)) {
      goPro(s, p);
      journal(s, `${p.firstName} was drafted by a pro ${sp.label.toLowerCase()} team!`, 'major');
    }
  }
}

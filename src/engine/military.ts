/**
 * Military service: an alternative to college at 18 (enlisting, or an ROTC scholarship that pays
 * for university in exchange for serving as an officer), or a recruiter visit later.
 *
 * Service comes in 4-year tours. Each year on active duty there's a chance of deployment: months
 * away from family, more stress, and a small risk of being wounded, or (rarely) killed in the
 * line of duty. At the end of each tour you choose: re-enlist (and promote), officer school,
 * the part-time reserve, civilian life with the GI Bill (college paid), or after 20 years, a
 * military pension. Health care is covered while serving.
 */
import { CAREER_BY_ID } from '../content/careers';
import { die } from './family';
import { assignJob } from './generate';
import type { Rng } from './rng';
import { guidedPerson } from './tutorial';
import type { GameState, Person } from './types';
import { active, adjustBond, ageOf, alive, childrenOf, journal, membersOf, money, partnerOf, stat } from './util';

export const TOUR_YEARS = 4;
export const ENLIST_AGE: [number, number] = [18, 34];
/** Yearly odds on active duty. Officers are a little less exposed. */
export const RISK = { deploy: 0.35, injury: 0.03, death: 0.0025, officer: 0.6 };
/** Veterans' disability pay after a service injury and medical discharge. */
export const DISABILITY_PAY = 18000;
/** Re-enlistment bonus. */
export const REENLIST_BONUS = 10000;
/** Years of service for a military pension (half of final pay). */
export const PENSION_YEARS = 20;

export const isActiveDuty = (p: Person) => p.jobId === 'enlisted' || p.jobId === 'officer';
export const inReserve = (p: Person) => p.partJobId === 'reserve';
export const serviceYears = (p: Person) => p.flags.service_years ?? 0;
const isMine = (s: GameState, p: Person) => {
  const me = active(s);
  return p.id === me.id || partnerOf(s, me.id)?.id === p.id || p.biologicalParents.includes(me.id) || p.adoptiveParents.includes(me.id)
    || me.biologicalParents.includes(p.id) || me.adoptiveParents.includes(p.id);
};
/** The guided first life is protected from the worst outcomes. */
const shielded = (s: GameState, p: Person) => guidedPerson(s)?.id === p.id;

/** Start a tour (enlisted, or as an officer). Replaces any full-time job. */
export function enlist(s: GameState, p: Person, asOfficer: boolean) {
  assignJob(p, CAREER_BY_ID[asOfficer ? 'officer' : 'enlisted']);
  p.retired = false;
  p.flags.tour_end = s.year + TOUR_YEARS;
  p.flags.tours = (p.flags.tours ?? 0) + 1;
  p.flags.hired_year = s.year;
  if (p.partJobId === 'reserve') p.partJobId = undefined;
  if (isMine(s, p)) {
    const who = p.id === active(s).id ? 'You' : p.firstName;
    journal(s, `${who} ${asOfficer ? 'was commissioned as an officer' : 'enlisted in the military'} for a ${TOUR_YEARS}-year tour.`, 'major');
  }
}

/** Leave active duty: to civilian life or the part-time reserve. Veterans get the GI Bill. */
export function leaveService(_s: GameState, p: Person, to: 'civilian' | 'reserve') {
  p.jobId = undefined;
  p.jobYears = 0;
  p.flags.veteran = 1;
  p.flags.gi_bill = 1;
  delete p.flags.tour_end;
  if (to === 'reserve') p.partJobId = 'reserve';
}

/** Promote one rank (to the top rank at most). */
export const promote = (p: Person) => { p.jobLevel = Math.min(3, p.jobLevel + 1); };

export function enlistBlocker(s: GameState, asOfficer: boolean): string | null {
  const me = active(s);
  const age = ageOf(me, s.year);
  if (s.phase !== 'PLANNING') return 'Decided while planning.';
  if (age < ENLIST_AGE[0] || age > ENLIST_AGE[1]) return `Recruiters take ages ${ENLIST_AGE[0]}–${ENLIST_AGE[1]}.`;
  if (isActiveDuty(me)) return 'You are already serving.';
  if (me.studyingUntil) return 'Finish school first.';
  if (me.flags.disability) return 'A medical discharge rules out another tour.';
  if (asOfficer && !me.flags.degree) return 'Officers need a degree.';
  return null;
}

/** Visit a recruiter and start a tour now. */
export function enlistNow(state: GameState, asOfficer: boolean): GameState {
  if (enlistBlocker(state, asOfficer)) return state;
  const s: GameState = structuredClone(state);
  enlist(s, active(s), asOfficer);
  return s;
}

/**
 * One year of service for everyone on active duty or in the reserve: deployments and their
 * risks, tours ending. For the player, decisions are scheduled (deployment, an injury, the end
 * of a tour, a reserve call-up); other family members decide on their own.
 */
export function militaryYear(s: GameState, rng: Rng) {
  const me = active(s);
  const due = (eventId: string) => {
    if (!s.scheduled.some((x) => x.eventId === eventId && x.dueYear <= s.year)) s.scheduled.push({ dueYear: s.year, eventId });
  };
  for (const p of Object.values(s.people)) {
    if (!alive(p)) continue;
    const mine = p.id === me.id;
    if (inReserve(p) && !isActiveDuty(p) && rng.chance(0.08)) {
      if (mine) due('reserve_callup');
      else if (isMine(s, p)) journal(s, `${p.firstName}'s reserve unit was called up for a year.`, 'info');
    }
    if (!isActiveDuty(p)) continue;
    p.flags.service_years = serviceYears(p) + 1;
    const officer = p.jobId === 'officer' ? RISK.officer : 1;
    if (rng.chance(RISK.deploy)) {
      p.flags.deployed_year = s.year;
      stat(p, 'stress', 6);
      for (const o of membersOf(s, p.householdId)) if (o.id !== p.id) adjustBond(s, p.id, o.id, -3, 0);
      if (mine) due('deployment');
      else if (isMine(s, p)) journal(s, `${p.firstName} deployed overseas for nine months.`, 'info');
      if (!shielded(s, p)) {
        if (rng.chance(RISK.death * officer)) {
          lineOfDutyDeath(s, p);
          continue;
        }
        if (rng.chance(RISK.injury * officer)) {
          stat(p, 'health', -25);
          p.flags.wounded = (p.flags.wounded ?? 0) + 1;
          if (mine) due('line_of_duty_injury');
          else {
            if (isMine(s, p)) journal(s, `${p.firstName} was seriously injured in the line of duty and is recovering in a military hospital.`, 'bad');
            if (rng.chance(0.5)) { leaveService(s, p, 'civilian'); p.flags.disability = 1; }
          }
        }
      }
    }
    if (isActiveDuty(p) && s.year >= (p.flags.tour_end ?? Infinity)) {
      if (mine) due('tour_end');
      else {
        // Family members decide for themselves at the end of a tour.
        const r = rng.next();
        if (serviceYears(p) >= PENSION_YEARS) retireFromService(s, p);
        else if (r < 0.45) { promote(p); p.flags.tour_end = s.year + TOUR_YEARS; p.flags.tours = (p.flags.tours ?? 0) + 1; }
        else leaveService(s, p, r < 0.65 ? 'reserve' : 'civilian');
      }
    }
  }
}

/** A death in the line of duty: honored by the family and the nation. */
export function lineOfDutyDeath(s: GameState, p: Person) {
  die(s, p, 'killed in the line of duty');
  p.flags.fallen = 1;
  const me = active(s);
  if (isMine(s, p)) {
    journal(s, `${p.firstName} was honored with a flag-folding ceremony. A nation and a family are grateful.`, 'major');
    if (p.id !== me.id && alive(me)) stat(me, 'happiness', -15);
  }
  for (const k of childrenOf(s, p.id)) if (alive(k)) stat(k, 'happiness', -10);
}

/** Military retirement after 20 years: half of final pay for life. */
export function retireFromService(s: GameState, p: Person) {
  const pay = CAREER_BY_ID[p.jobId!]?.levelPay?.[p.jobLevel - 1] ?? 50000;
  p.flags.mil_pension = Math.round(pay / 2);
  leaveService(s, p, 'civilian');
  if (isMine(s, p)) journal(s, `${p.id === active(s).id ? 'You' : p.firstName} retired from the military after ${serviceYears(p)} years, with a pension of ${money(p.flags.mil_pension)} a year.`, 'major');
}

/** Yearly income for veterans: disability pay and military pensions. */
export const veteranIncome = (p: Person) => (p.flags.disability ? DISABILITY_PAY : 0) + (p.flags.mil_pension ?? 0);

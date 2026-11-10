/**
 * Retirement: employer pensions (years of service × best salary, vested after 10 years,
 * reduced if taken before 65), a state pension from 65, and personal retirement savings
 * that are drawn down evenly in retirement. `readiness` projects whether a household
 * could afford to retire at a given age.
 */
import { COSTS } from '../content/actions';
import { CAREER_BY_ID, salaryOf } from '../content/careers';
import { incomeTax, medicalCost } from '../content/economy';
import { cityOfHousehold, rentIn } from './location';
import {
  DRAWDOWN_TO_AGE, EARLY_REDUCTION_PER_YEAR, EARLY_RETIREMENT_AGE, FULL_RETIREMENT_AGE, MATCH_CAP, MATCH_RATE,
  PENSION_ACCRUAL, PENSION_VESTING_YEARS, SAVINGS_RETURN, STATE_PENSION, STATE_PENSION_MIN_YEARS,
} from '../content/retirement';
import type { GameState, Person } from './types';
import { ageOf, partnerOf } from './util';

/** Employer pension a person would get if they retired at `age`. */
export function pensionFor(p: Pick<Person, 'pensionYears' | 'pensionSalary'>, age: number) {
  const years = p.pensionYears ?? 0;
  if (years < PENSION_VESTING_YEARS || age < EARLY_RETIREMENT_AGE) return 0;
  const full = years * PENSION_ACCRUAL * (p.pensionSalary ?? 0);
  const reduction = Math.max(0, FULL_RETIREMENT_AGE - age) * EARLY_REDUCTION_PER_YEAR;
  return Math.round(full * (1 - reduction));
}

export const statePension = (p: Pick<Person, 'careerYears'>, age: number) =>
  age >= FULL_RETIREMENT_AGE && (p.careerYears ?? 0) >= STATE_PENSION_MIN_YEARS ? STATE_PENSION : 0;

/** Yearly withdrawal so savings last to about 92. */
export const drawdown = (savings: number, age: number) => (savings > 0 ? Math.round(savings / Math.max(5, DRAWDOWN_TO_AGE - age)) : 0);

/** Employee contribution and employer match on this year's pay (match only on jobs without a pension). */
export function contributionFor(p: Person, pay: number, rate: number) {
  const employee = Math.round(pay * rate);
  const hasPension = !!(p.jobId && CAREER_BY_ID[p.jobId]?.pension);
  const match = hasPension || !p.jobId ? 0 : Math.round(pay * Math.min(rate, MATCH_CAP) * MATCH_RATE);
  return { employee, match };
}

/** One more working year: counts toward the state pension and, in pension jobs, the employer pension. */
export function accrueWorkingYear(p: Person) {
  if (!p.jobId || p.retired || p.studyingUntil) return;
  const c = CAREER_BY_ID[p.jobId];
  p.careerYears = (p.careerYears ?? 0) + 1;
  if (c.pension) {
    p.pensionYears = (p.pensionYears ?? 0) + 1;
    p.pensionSalary = Math.max(p.pensionSalary ?? 0, salaryOf(c, p.jobLevel));
  }
}

/** Stop working: the employer pension is fixed now (reduced if early). */
export function retirePerson(p: Person, year: number) {
  p.pension = Math.max(p.pension, pensionFor(p, ageOf(p, year)));
  p.jobId = undefined;
  p.partJobId = undefined;
  p.retired = true;
}

export interface Readiness {
  age: number;
  income: number;
  need: number;
  ratio: number;
  status: 'ready' | 'tight' | 'not_yet';
  pension: number;
  state: number;
  savingsIncome: number;
  savings: number;
}

/** Project one person's retirement income at `atAge` if they keep their current job and saving rate. */
function projectPerson(s: GameState, p: Person, years: number, rate: number) {
  const age = ageOf(p, s.year) + years;
  const working = p.jobId && !p.retired && !p.studyingUntil ? CAREER_BY_ID[p.jobId] : undefined;
  const salary = working ? salaryOf(working, p.jobLevel) : 0;
  const pensionYears = (p.pensionYears ?? 0) + (working?.pension ? years : 0);
  const pensionSalary = Math.max(p.pensionSalary ?? 0, working?.pension ? salary : 0);
  const careerYears = (p.careerYears ?? 0) + (working ? years : 0);
  const { employee, match } = contributionFor(p, salary, rate);
  const g = 1 + SAVINGS_RETURN;
  const savings = (p.retirementSavings ?? 0) * Math.pow(g, years) + (employee + match) * ((Math.pow(g, years) - 1) / SAVINGS_RETURN);
  const pension = p.retired ? p.pension : pensionFor({ pensionYears, pensionSalary }, age);
  const state = statePension({ careerYears }, age);
  return { age, pension, state, savings: Math.round(savings), savingsIncome: drawdown(savings, age) };
}

/** Could the household retire when the player is `atAge`? Compares projected income with a lean budget. */
export function readiness(s: GameState, me: Person, atAge: number): Readiness {
  const years = Math.max(0, atAge - ageOf(me, s.year));
  const mine = projectPerson(s, me, years, s.plan.retireContribution ?? 0);
  const partner = partnerOf(s, me.id);
  const theirs = partner && partner.householdId === me.householdId ? projectPerson(s, partner, years, 0) : undefined;
  const hh = s.households[me.householdId];

  // Lean retirement budget: living costs for the couple, housing, medical, and taxes.
  const adults = theirs ? 2 : 1;
  const home = hh.assets.find((a) => a.kind === 'house');
  const mortgageLeft = home && home.mortgage > 0 && (home.payment ?? 18000) * years < home.mortgage;
  const housing = home ? home.upkeep + (mortgageLeft ? home.payment ?? 18000 : 0) : rentIn(hh.rentTier ?? 'apartment', cityOfHousehold(hh));
  const medical = medicalCost(atAge) + (theirs ? medicalCost(theirs.age) : 0);
  const people = [mine, ...(theirs ? [theirs] : [])];
  const income = people.reduce((sum, x) => sum + x.pension + x.state + x.savingsIncome, 0);
  const taxes = people.reduce((sum, x) => sum + incomeTax(x.pension + x.state), 0);
  const need = COSTS.adult * adults + housing + medical + taxes;
  const ratio = need > 0 ? income / need : 1;
  return {
    age: atAge,
    income: Math.round(income),
    need: Math.round(need),
    ratio,
    status: ratio >= 1 ? 'ready' : ratio >= 0.75 ? 'tight' : 'not_yet',
    pension: people.reduce((a, x) => a + x.pension, 0),
    state: people.reduce((a, x) => a + x.state, 0),
    savingsIncome: people.reduce((a, x) => a + x.savingsIncome, 0),
    savings: people.reduce((a, x) => a + x.savings, 0),
  };
}

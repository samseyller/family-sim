/**
 * Household money math, shared by the year resolution (systems.runEconomy) and
 * the End Year preview, so the estimate and the real result can't drift apart.
 */
import { COSTS } from '../content/actions';
import { CAREER_BY_ID, PART_TIME_MAX, requiredBlocks, salaryOf, type Career } from '../content/careers';
import { canWorkFullTime } from './generate';
import type { GameState } from './types';
import { active, ageOf, kidsAtHome, membersOf } from './util';

export const fullTimePay = (c: Career, level: number, work: number) => {
  const req = requiredBlocks(c, level);
  const sal = salaryOf(c, level);
  return (Math.min(work, req) / req) * sal + Math.max(0, work - req) * (sal / req) * 1.25;
};

export const partTimePay = (c: Career, work: number) => (Math.min(work, PART_TIME_MAX) / c.blocks) * c.salary;

export const mortgagePayment = (mortgage: number) => Math.min(18000, mortgage * 1.04);

export interface BudgetLine {
  label: string;
  amount: number;
}

export interface Budget {
  income: BudgetLine[];
  expenses: BudgetLine[];
  totalIncome: number;
  totalExpenses: number;
  net: number;
}

/** Pure: this year's income and expenses for a household, before interest. */
export function householdBudget(s: GameState, householdId: string, activePay: number): Budget {
  const me = active(s);
  const hh = s.households[householdId];
  const mem = membersOf(s, householdId);
  const inc = new Map<string, number>();
  const exp = new Map<string, number>();
  const add = (m: Map<string, number>, label: string, n: number) => n && m.set(label, (m.get(label) ?? 0) + n);

  for (const p of mem) {
    if (ageOf(p, s.year) < 18) {
      add(exp, 'Children', COSTS.child);
      continue;
    }
    const isMe = p.id === me.id;
    const label = isMe ? 'Your pay' : 'Family pay';
    const npcPart = !isMe && p.partJobId ? CAREER_BY_ID[p.partJobId].salary : 0;
    if (p.studyingUntil) {
      add(exp, 'Living costs', COSTS.studentLiving);
      add(exp, 'Tuition', p.studyKind === 'university' ? COSTS.tuition : COSTS.tuition / 2);
      // Students without a real part-time job pick up odd jobs.
      add(inc, label, isMe ? activePay || (p.partJobId ? 0 : COSTS.studentWage) : npcPart || COSTS.studentWage);
      continue;
    }
    add(exp, 'Living costs', COSTS.adult);
    if (isMe) add(inc, label, activePay);
    else {
      if (p.jobId) add(inc, label, salaryOf(CAREER_BY_ID[p.jobId], p.jobLevel));
      add(inc, label, npcPart);
    }
    if (p.retired) add(inc, 'Pensions', p.pension);
  }

  if (!hh.assets.some((a) => a.kind === 'house')) add(exp, 'Rent', COSTS.rentBase + COSTS.rentPerExtra * Math.max(0, mem.length - 2));
  for (const a of hh.assets) {
    add(exp, 'Home upkeep', a.upkeep);
    if (a.mortgage > 0) add(exp, 'Mortgage', mortgagePayment(a.mortgage));
  }

  if (householdId === me.householdId) {
    add(exp, 'Family outings', (s.plan.alloc.family_outing ?? 0) * 1500);
    for (const kid of kidsAtHome(s, me)) {
      const cp = s.plan.children[kid.id];
      if (cp?.tutoring) add(exp, "Kids' tutoring & lessons", COSTS.tutoring);
      if (cp?.lessons && kid.hobby) add(exp, "Kids' tutoring & lessons", COSTS.lessons);
      if (kid.flags.advanced) add(exp, "Kids' tutoring & lessons", COSTS.advancedLessons);
      add(exp, 'College funds', cp?.fundContribution ?? 0);
    }
  }

  const lines = (m: Map<string, number>) => [...m].map(([label, amount]) => ({ label, amount: Math.round(amount) }));
  const income = lines(inc);
  const expenses = lines(exp);
  const totalIncome = income.reduce((a, b) => a + b.amount, 0);
  const totalExpenses = expenses.reduce((a, b) => a + b.amount, 0);
  return { income, expenses, totalIncome, totalExpenses, net: totalIncome - totalExpenses };
}

export interface YearEstimate extends Budget {
  /** Job applications in the plan; their pay isn't counted since hiring is uncertain. */
  pendingApplications: number;
}

/** Preview of the active household's year if the plan goes as expected. */
export function estimateYear(s: GameState): YearEstimate {
  const me = active(s);
  const plan = s.plan;
  const quitting = (slot: 'full' | 'part') => plan.jobIntents.some((i) => i.kind === 'quit' && i.slot === slot);
  let pay = 0;
  if (canWorkFullTime(me) && !quitting('full')) pay += fullTimePay(CAREER_BY_ID[me.jobId!], me.jobLevel, plan.alloc.work ?? 0);
  if (me.partJobId && !quitting('part')) pay += partTimePay(CAREER_BY_ID[me.partJobId], plan.alloc.parttime ?? 0);
  return {
    ...householdBudget(s, me.householdId, Math.round(pay)),
    pendingApplications: plan.jobIntents.filter((i) => i.kind === 'apply').length,
  };
}

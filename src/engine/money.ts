/**
 * Household money. Every change to a household's cash or investments goes through these helpers, so the rules
 * (what can go into debt, what may sell investments, how households combine) live in one place.
 *
 * Money belongs to households, never to people. Cash (`wallet`) may go negative (debt at DEBT_RATE);
 * investments never do.
 *
 * Deliberate exceptions, which change balances by rule rather than by a payment, stay in `systems.runEconomy`:
 * interest on cash, the NPC debt floor, and investment returns. Also `tutorial.applyCushion` (the guided life's
 * floor), and the opening investments of a household split off from another (`family.separate`,
 * `household.splitOff`), which are taken from the old household with `takeInvestments`.
 */
import { DEBT_PAYDOWN } from '../content/economy';
import type { Household } from './types';
import { money } from './util';

// ── Checks ───────────────────────────────────────────────────────────

/** Can cash alone pay for this? (Everyday purchases and most event choices are cash-only.) */
export const hasCash = (hh: Household, cost: number) => hh.wallet >= cost;

/** How much of a cost would have to come from investments (0 when cash covers it). */
export const fromInvestments = (hh: Household, cost: number) => Math.max(0, cost - Math.max(0, hh.wallet));

/** Can cash plus investments cover this cost? (Emergencies only.) */
export const canCover = (hh: Household, cost: number) => cost <= 0 || Math.max(0, hh.wallet) + (hh.investments ?? 0) >= cost;

/** A hint that says when an emergency choice will sell investments. */
export const coverHint = (hh: Household, cost: number, hint?: string) => {
  const sell = Math.min(fromInvestments(hh, cost), hh.investments ?? 0);
  const note = sell > 0 ? `Sells ${money(sell)} of investments` : undefined;
  return [hint, note].filter(Boolean).join('; ') || undefined;
};

// ── Payments ─────────────────────────────────────────────────────────

/** Pay from cash. Cash can go negative: a bill that must be paid becomes debt. */
export function charge(hh: Household, amount: number) {
  hh.wallet -= amount;
}

/** Receive cash (pay, prizes, sales, refunds). A negative amount is a loss. */
export function credit(hh: Household, amount: number) {
  hh.wallet += amount;
}

/** Move cash from one household to another (gifts, loans, settlements). */
export function transfer(from: Household, to: Household, amount: number) {
  from.wallet -= amount;
  to.wallet += amount;
}

/** Pay an emergency cost: cash first, then investments; anything left becomes debt. Returns what was sold. */
export function payEmergency(hh: Household, cost: number) {
  const sell = Math.min(fromInvestments(hh, cost), hh.investments ?? 0);
  if (sell > 0) {
    hh.investments = (hh.investments ?? 0) - sell;
    hh.wallet += sell;
  }
  hh.wallet -= cost;
  return sell;
}

// ── Investments ──────────────────────────────────────────────────────

/** Move cash into investments. */
export function invest(hh: Household, amount: number) {
  hh.wallet -= amount;
  hh.investments = (hh.investments ?? 0) + amount;
}

/** Sell investments for cash. */
export function withdraw(hh: Household, amount: number) {
  hh.investments = (hh.investments ?? 0) - amount;
  hh.wallet += amount;
}

/** Take investments out of a household (to settle an estate or split a home), never below zero. */
export function takeInvestments(hh: Household, amount: number) {
  hh.investments = Math.max(0, (hh.investments ?? 0) - amount);
}

/** A yearly payment toward cash debt, drawn from investments (DEBT_PAYDOWN of the debt). Returns what was paid. */
export function payDownDebt(hh: Household) {
  if (hh.wallet >= 0 || !(hh.investments ?? 0)) return 0;
  const pay = Math.min(hh.investments!, Math.ceil(-hh.wallet * DEBT_PAYDOWN));
  hh.investments! -= pay;
  hh.wallet += pay;
  return pay;
}

// ── Combining and splitting households ──────────────────────────────

/** Everything one household has (cash and investments) joins another; the first is left empty. */
export function mergeMoney(from: Household, into: Household) {
  into.wallet += from.wallet;
  from.wallet = 0;
  into.investments = (into.investments ?? 0) + (from.investments ?? 0);
  from.investments = 0;
}

/** A settled estate: the household's money has all been passed on. */
export function clearMoney(hh: Household) {
  hh.wallet = 0;
  hh.investments = 0;
}

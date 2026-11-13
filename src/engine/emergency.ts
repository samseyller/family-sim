/**
 * Paying for emergencies (a flood, a hospital bill, a sick pet): when cash runs short, the
 * household can sell investments to cover the rest instead of being locked out of the fix.
 * Everyday spending stays cash-only; this is just for the bills nobody chooses.
 */
import { DEBT_PAYDOWN } from '../content/economy';
import type { Household } from './types';
import { money } from './util';

/** How much of a cost would have to come from investments (0 when cash covers it). */
export const fromInvestments = (hh: Household, cost: number) => Math.max(0, cost - Math.max(0, hh.wallet));

/** Can cash plus investments cover this cost? */
export const canCover = (hh: Household, cost: number) => cost <= 0 || Math.max(0, hh.wallet) + (hh.investments ?? 0) >= cost;

/** A hint that says when a choice will sell investments. */
export const coverHint = (hh: Household, cost: number, hint?: string) => {
  const sell = Math.min(fromInvestments(hh, cost), hh.investments ?? 0);
  const note = sell > 0 ? `Sells ${money(sell)} of investments` : undefined;
  return [hint, note].filter(Boolean).join('; ') || undefined;
};

/** Pay an emergency cost: cash first, then investments; anything left becomes debt. */
export function payEmergency(hh: Household, cost: number) {
  const sell = Math.min(fromInvestments(hh, cost), hh.investments ?? 0);
  if (sell > 0) {
    hh.investments = (hh.investments ?? 0) - sell;
    hh.wallet += sell;
  }
  hh.wallet -= cost;
  return sell;
}

/** A yearly payment toward cash debt, drawn from investments. Returns what was paid. */
export function payDownDebt(hh: Household) {
  if (hh.wallet >= 0 || !(hh.investments ?? 0)) return 0;
  const pay = Math.min(hh.investments!, Math.ceil(-hh.wallet * DEBT_PAYDOWN));
  hh.investments! -= pay;
  hh.wallet += pay;
  return pay;
}

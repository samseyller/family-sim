/** Economy rules (Stage 6 balance): taxes, lifestyle spending, medical costs, estate tax. */

/** Progressive income tax, per earner: [threshold, marginal rate]. */
export const TAX_BRACKETS: [number, number][] = [
  [0, 0],
  [15000, 0.12],
  [45000, 0.22],
  [90000, 0.32],
];

export function incomeTax(income: number): number {
  let tax = 0;
  for (let i = 0; i < TAX_BRACKETS.length; i++) {
    const [from, rate] = TAX_BRACKETS[i];
    const to = TAX_BRACKETS[i + 1]?.[0] ?? Infinity;
    if (income > from) tax += (Math.min(income, to) - from) * rate;
  }
  return Math.round(tax);
}

export type Lifestyle = 'frugal' | 'comfortable' | 'lavish';

/**
 * Share of a household's discretionary money (after taxes and essentials) spent on
 * lifestyle, and how it feels. Frugal saves but wears on everyone; lavish is fun but costly.
 */
export const LIFESTYLES: Record<Lifestyle, { label: string; icon: string; share: number; happiness: number; stress: number; desc: string }> = {
  frugal: { label: 'Frugal', icon: '🪙', share: 0.2, happiness: -3, stress: 2, desc: 'Save hard; everyone at home feels the squeeze' },
  comfortable: { label: 'Comfortable', icon: '🛋️', share: 0.5, happiness: 0, stress: 0, desc: 'Enjoy some, save some' },
  lavish: { label: 'Lavish', icon: '🥂', share: 0.85, happiness: 4, stress: -2, desc: 'Treat yourselves; little left to save' },
};

/** Yearly out-of-pocket medical costs from 65 on. */
export const medicalCost = (age: number) => (age >= 65 ? 2000 + (age - 65) * 350 : 0);

/** Estates above the exemption pay this rate on the excess. */
export const ESTATE_EXEMPTION = 1_000_000;
export const ESTATE_TAX_RATE = 0.3;

export const SAVINGS_RATE = 0.015;
export const DEBT_RATE = 0.08;

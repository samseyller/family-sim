/** Homes, rentals, cars, loans, and investments. */

export type RentTier = 'small' | 'apartment' | 'house';
export const RENTALS: Record<RentTier, { label: string; icon: string; rent: number; capacity: number }> = {
  small: { label: 'Small apartment', icon: '🏢', rent: 14000, capacity: 2 },
  apartment: { label: 'Apartment', icon: '🏬', rent: 19000, capacity: 4 },
  house: { label: 'Rented house', icon: '🏘️', rent: 27000, capacity: 6 },
};
/** One-off cost of moving between rentals (movers, deposits). */
export const MOVING_COST = 2000;

export type HomeTier = 'starter' | 'family' | 'large';
export const HOMES: Record<HomeTier, { label: string; icon: string; price: number; upkeep: number; capacity: number }> = {
  starter: { label: 'Starter home', icon: '🏠', price: 220000, upkeep: 3000, capacity: 3 },
  family: { label: 'Family home', icon: '🏡', price: 340000, upkeep: 4500, capacity: 5 },
  large: { label: 'Large home', icon: '🏘️', price: 520000, upkeep: 7000, capacity: 7 },
};
export const MORTGAGE_RATE = 0.045;
export const MORTGAGE_YEARS = 25;
/** Buying costs (closing) and selling costs (agent fees) as a share of the price. */
export const BUY_COSTS = 0.03;
export const SELL_COSTS = 0.06;
export const HOME_APPRECIATION = 0.03;
export const RENOVATION = { cost: 30000, valueGain: 40000, happiness: 6 };

export type CarKind = 'used' | 'new';
export const CARS: Record<CarKind, { label: string; icon: string; price: number; upkeep: number; depreciation: number }> = {
  used: { label: 'Used car', icon: '🚗', price: 9000, upkeep: 1800, depreciation: 0.15 },
  new: { label: 'New car', icon: '🚙', price: 32000, upkeep: 900, depreciation: 0.18 },
};
export const CAR_LOAN_RATE = 0.07;
export const CAR_LOAN_YEARS = 5;
/** Yearly bus/train costs for a household with workers but no car. */
export const TRANSIT_COST = 1500;

/** Investment account: average return with year-to-year swings. */
export const INVEST_RETURN = 0.055;
export const INVEST_VOLATILITY = 0.14;

/** Fixed yearly payment that pays off `principal` over `years` at `rate`. */
export function annuityPayment(principal: number, rate: number, years: number) {
  if (principal <= 0) return 0;
  return Math.round((principal * rate) / (1 - Math.pow(1 + rate, -years)));
}

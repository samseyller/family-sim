/** Homes, rentals, cars, loans, and investments. */

export type RentTier = 'small' | 'apartment' | 'house';
export const RENTALS: Record<RentTier, { label: string; icon: string; rent: number; capacity: number }> = {
  small: { label: 'Small apartment', icon: '🏢', rent: 14000, capacity: 2 },
  apartment: { label: 'Apartment', icon: '🏬', rent: 19000, capacity: 4 },
  house: { label: 'Rented house', icon: '🏘️', rent: 27000, capacity: 6 },
};
/** One-off cost of moving between rentals (movers, deposits). */
export const MOVING_COST = 2000;

export type HomeTier = 'condo' | 'starter' | 'townhouse' | 'family' | 'large' | 'estate' | 'mansion';
export interface HomeDef { label: string; icon: string; price: number; upkeep: number; capacity: number; /** Garage spaces. */ garage: number }
export const HOMES: Record<HomeTier, HomeDef> = {
  condo: { label: 'Condo', icon: '🏢', price: 180000, upkeep: 2500, capacity: 2, garage: 0 },
  starter: { label: 'Starter home', icon: '🏠', price: 220000, upkeep: 3000, capacity: 3, garage: 0 },
  townhouse: { label: 'Townhouse', icon: '🏘️', price: 275000, upkeep: 3500, capacity: 4, garage: 1 },
  family: { label: 'Family home', icon: '🏡', price: 340000, upkeep: 4500, capacity: 5, garage: 2 },
  large: { label: 'Large home', icon: '🏛️', price: 520000, upkeep: 7000, capacity: 7, garage: 2 },
  estate: { label: 'Country estate', icon: '🏰', price: 950000, upkeep: 14000, capacity: 9, garage: 4 },
  // 2 outdoor spots + 22 garage spaces = room for 24 cars.
  mansion: { label: 'Mansion', icon: '🏯', price: 15000000, upkeep: 150000, capacity: 18, garage: 22 },
};
/** Every home and rental has room for this many cars outside; garages add to it. */
export const BASE_PARKING = 2;
/** Adding a garage space to a home you own. */
export const GARAGE_BUILD = { cost: 25000, valueGain: 18000, max: 4 };
/** Yearly cost for each car beyond your parking spots (permits, tickets). */
export const STREET_PARKING_COST = 900;
export const MORTGAGE_RATE = 0.045;
export const MORTGAGE_YEARS = 25;
/** Buying costs (closing) and selling costs (agent fees) as a share of the price. */
export const BUY_COSTS = 0.03;
export const SELL_COSTS = 0.06;
export const HOME_APPRECIATION = 0.03;
export const RENOVATION = { cost: 30000, valueGain: 40000, happiness: 6 };

/**
 * Car models. `age` is how old the car is when you buy it (0 = brand new). Cars age every
 * year: they lose value, cost more to keep up, break down more often, and around the end
 * of their `lifespan` they die for good. `reliability` above 1 means fewer breakdowns.
 * ('used' and 'new' keep their old ids so older saves and tests still make sense.)
 */
export type CarKind = 'beater' | 'used' | 'used_suv' | 'compact' | 'new' | 'minivan' | 'pickup' | 'electric' | 'luxury' | 'sports';
export interface CarDef {
  label: string;
  icon: string;
  price: number;
  /** Years old when bought. */
  age: number;
  /** Yearly upkeep when new; rises as the car ages. */
  upkeep: number;
  depreciation: number;
  reliability: number;
  /** Typical years before it dies for good (counted from new). */
  lifespan: number;
  /** Repair bills scale with this. */
  repairMult: number;
  /** Happiness when you buy it. */
  joy: number;
  seats: number;
}
export const CARS: Record<CarKind, CarDef> = {
  beater: { label: 'Old beater', icon: '🚗', price: 3500, age: 13, upkeep: 1200, depreciation: 0.2, reliability: 0.7, lifespan: 18, repairMult: 0.8, joy: 0, seats: 5 },
  used: { label: 'Used compact', icon: '🚗', price: 9000, age: 6, upkeep: 1000, depreciation: 0.15, reliability: 0.9, lifespan: 18, repairMult: 0.9, joy: 2, seats: 5 },
  used_suv: { label: 'Used SUV', icon: '🚙', price: 16000, age: 5, upkeep: 1300, depreciation: 0.15, reliability: 0.85, lifespan: 18, repairMult: 1.1, joy: 2, seats: 7 },
  compact: { label: 'Compact', icon: '🚗', price: 22000, age: 0, upkeep: 700, depreciation: 0.15, reliability: 1.1, lifespan: 19, repairMult: 0.9, joy: 4, seats: 5 },
  new: { label: 'Sedan', icon: '🚘', price: 32000, age: 0, upkeep: 900, depreciation: 0.16, reliability: 1.1, lifespan: 20, repairMult: 1, joy: 5, seats: 5 },
  minivan: { label: 'Minivan', icon: '🚐', price: 40000, age: 0, upkeep: 1200, depreciation: 0.16, reliability: 1, lifespan: 18, repairMult: 1.1, joy: 4, seats: 8 },
  pickup: { label: 'Pickup truck', icon: '🛻', price: 45000, age: 0, upkeep: 1400, depreciation: 0.13, reliability: 1.15, lifespan: 22, repairMult: 1.2, joy: 5, seats: 5 },
  electric: { label: 'Electric car', icon: '🔌', price: 48000, age: 0, upkeep: 400, depreciation: 0.18, reliability: 1.2, lifespan: 16, repairMult: 1.3, joy: 6, seats: 5 },
  luxury: { label: 'Luxury sedan', icon: '🚘', price: 75000, age: 0, upkeep: 2500, depreciation: 0.2, reliability: 1, lifespan: 18, repairMult: 2, joy: 9, seats: 5 },
  sports: { label: 'Sports car', icon: '🏎️', price: 90000, age: 0, upkeep: 3000, depreciation: 0.17, reliability: 0.85, lifespan: 16, repairMult: 2.2, joy: 12, seats: 2 },
};
/** What a dead car fetches from the scrapyard. */
export const SCRAP_VALUE = 300;
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

/** College funds top out here (deposits, yearly contributions and growth all stop at the cap). */
export const COLLEGE_FUND_CAP = 500_000;

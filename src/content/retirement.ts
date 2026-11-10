/** Retirement rules. */

export const EARLY_RETIREMENT_AGE = 55;
export const FULL_RETIREMENT_AGE = 65;

/** Employer pension: % of best salary per year of service, after vesting; reduced if taken early. */
export const PENSION_ACCRUAL = 0.015;
export const PENSION_VESTING_YEARS = 10;
export const EARLY_REDUCTION_PER_YEAR = 0.05;

/** State pension from 65 for anyone with enough working years. */
export const STATE_PENSION = 14000;
export const STATE_PENSION_MIN_YEARS = 10;

/** Retirement savings: contribution choices (share of pay), employer match on non-pension jobs. */
export const CONTRIBUTION_OPTIONS = [0, 0.05, 0.1, 0.15];
export const MATCH_RATE = 0.5;
export const MATCH_CAP = 0.06;
export const SAVINGS_RETURN = 0.045;
export const SAVINGS_VOLATILITY = 0.08;
/** Savings are drawn down evenly so they last to about this age. */
export const DRAWDOWN_TO_AGE = 92;

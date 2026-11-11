/**
 * Sports under the "sports" hobby. Each has its own skill (kept per sport), costs, injury
 * risk, the age it can start, and a pro career with its own pay and length.
 */
import type { UpgradeId } from './finance';

export type SportId = 'soccer' | 'basketball' | 'baseball' | 'football' | 'hockey' | 'volleyball' | 'tennis' | 'golf' | 'swimming' | 'running';

export interface SportDef {
  label: string;
  icon: string;
  team: boolean;
  minAge: number;
  /** Cost per practice block (field fees, ice time, green fees). */
  cost: number;
  /** Chance of a serious injury in a year of hard practice or play. */
  injury: number;
  /** Pro pay at Rookie, Starter, All-Star. */
  proPay: [number, number, number];
  /** Typical age pros retire. */
  retireAge: number;
  /** Pro-level gear: price and practice boost. */
  gear: { label: string; price: number };
  /** A club membership (yearly), if the sport has clubs. */
  club?: { label: string; fee: number };
  /** A home setup that speeds up practice. */
  home?: UpgradeId;
  /** The race or tournament version of the sport. */
  event: string;
}

export const SPORTS: Record<SportId, SportDef> = {
  soccer: { label: 'Soccer', icon: '⚽', team: true, minAge: 5, cost: 20, injury: 0.04, proPay: [90000, 600000, 3000000], retireAge: 34, gear: { label: 'Pro cleats and training kit', price: 600 }, event: 'tournament' },
  basketball: { label: 'Basketball', icon: '🏀', team: true, minAge: 6, cost: 15, injury: 0.04, proPay: [900000, 4000000, 15000000], retireAge: 34, gear: { label: 'Pro shoes and smart ball', price: 500 }, home: 'sport_court', event: 'tournament' },
  baseball: { label: 'Baseball', icon: '⚾', team: true, minAge: 6, cost: 25, injury: 0.03, proPay: [500000, 3000000, 12000000], retireAge: 36, gear: { label: 'Custom bat and glove', price: 900 }, home: 'batting_cage', event: 'tournament' },
  football: { label: 'Football', icon: '🏈', team: true, minAge: 8, cost: 30, injury: 0.09, proPay: [750000, 3500000, 12000000], retireAge: 31, gear: { label: 'Pro helmet and pads', price: 1200 }, event: 'playoff game' },
  hockey: { label: 'Hockey', icon: '🏒', team: true, minAge: 6, cost: 80, injury: 0.07, proPay: [750000, 3000000, 9000000], retireAge: 33, gear: { label: 'Pro skates and stick', price: 1500 }, event: 'tournament' },
  volleyball: { label: 'Volleyball', icon: '🏐', team: true, minAge: 8, cost: 15, injury: 0.03, proPay: [60000, 180000, 600000], retireAge: 34, gear: { label: 'Pro shoes and knee pads', price: 400 }, home: 'sport_court', event: 'tournament' },
  tennis: { label: 'Tennis', icon: '🎾', team: false, minAge: 6, cost: 40, injury: 0.03, proPay: [120000, 900000, 6000000], retireAge: 33, gear: { label: 'Tournament racquets', price: 800 }, club: { label: 'Tennis club', fee: 2500 }, home: 'sport_court', event: 'tournament' },
  golf: { label: 'Golf', icon: '⛳', team: false, minAge: 8, cost: 60, injury: 0.01, proPay: [200000, 1500000, 8000000], retireAge: 45, gear: { label: 'Custom-fit clubs', price: 2500 }, club: { label: 'Country club', fee: 6000 }, home: 'putting_green', event: 'tournament' },
  swimming: { label: 'Swimming', icon: '🏊', team: false, minAge: 5, cost: 25, injury: 0.01, proPay: [50000, 250000, 1500000], retireAge: 30, gear: { label: 'Racing suits and goggles', price: 400 }, club: { label: 'Swim club', fee: 1200 }, home: 'pool', event: 'swim meet' },
  running: { label: 'Running', icon: '🏃', team: false, minAge: 6, cost: 5, injury: 0.03, proPay: [40000, 200000, 1200000], retireAge: 35, gear: { label: 'Carbon racing shoes and watch', price: 600 }, event: 'marathon' },
};

export const SPORT_IDS = Object.keys(SPORTS) as SportId[];

/** Skill needed to be drafted or signed as a pro. */
export const PRO_SKILL = 80;
/** Skill (with good grades) for an athletic scholarship. */
export const SCHOLARSHIP_SKILL = 62;
/** Pro gear speeds practice by this much. */
export const GEAR_BOOST = 1.2;
/** A club membership speeds practice by this much (and you meet people). */
export const CLUB_BOOST = 1.4;
/** Share of skill that carries over when you switch sports. */
export const SPORT_CARRYOVER = 0.3;
/** Travel team: yearly cost while a kid plays on one. */
export const TRAVEL_TEAM_COST = 3000;

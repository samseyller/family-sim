/**
 * Fifteen well-known US cities. Indexes are relative to a typical US city (1.0):
 *  - housing: home prices and rent
 *  - living: everyday costs (groceries, kids, student living)
 *  - pay: salaries for every job
 *  - transit: how well you get around without a car
 * Figures are rough game-balance approximations, not real statistics.
 */
export type CityId =
  | 'new_york' | 'los_angeles' | 'chicago' | 'houston' | 'phoenix' | 'philadelphia' | 'san_antonio' | 'san_diego'
  | 'dallas' | 'austin' | 'seattle' | 'denver' | 'boston' | 'miami' | 'atlanta';

import type { Sector } from './careers';

export type Transit = 'great' | 'good' | 'poor';

export interface CityDef {
  name: string;
  state: string;
  icon: string;
  housing: number;
  living: number;
  pay: number;
  transit: Transit;
  /** Chance per year of a serious flood reaching homes. */
  flood: number;
  /** Industries that hire more here (1 = typical; missing = typical). */
  industries: Partial<Record<Sector, number>>;
  blurb: string;
}

export const CITIES: Record<CityId, CityDef> = {
  new_york: { name: 'New York', state: 'NY', icon: '🗽', housing: 2.2, living: 1.3, pay: 1.25, transit: 'great', flood: 0.012, blurb: 'Top pay, top prices; nobody needs a car', industries: { finance: 3, legal: 2.5, business: 2, creative: 2, entertainment: 1.5, hospitality: 1.5 } },
  los_angeles: { name: 'Los Angeles', state: 'CA', icon: '🌴', housing: 2.0, living: 1.2, pay: 1.15, transit: 'poor', flood: 0.002, blurb: 'Sunshine, traffic, and pricey homes', industries: { entertainment: 3.5, creative: 2.5, transport: 1.5, tech: 1.3 } },
  chicago: { name: 'Chicago', state: 'IL', icon: '🌭', housing: 1.1, living: 1.05, pay: 1.05, transit: 'great', flood: 0.004, blurb: 'Big-city jobs at Midwest prices', industries: { finance: 2, transport: 2, business: 1.8, trades: 1.3 } },
  houston: { name: 'Houston', state: 'TX', icon: '🚀', housing: 0.85, living: 0.95, pay: 1.0, transit: 'poor', flood: 0.035, blurb: 'Affordable and sprawling; the energy capital', industries: { energy: 3.5, health: 2, science: 1.3, transport: 1.5, trades: 1.5 } },
  phoenix: { name: 'Phoenix', state: 'AZ', icon: '🌵', housing: 1.0, living: 0.98, pay: 0.95, transit: 'poor', flood: 0.003, blurb: 'Hot summers, mild winters', industries: { trades: 2, health: 1.4, retail: 1.4, service: 1.3 } },
  philadelphia: { name: 'Philadelphia', state: 'PA', icon: '🔔', housing: 1.0, living: 1.02, pay: 1.0, transit: 'good', flood: 0.008, blurb: 'History, neighborhoods, and cheesesteaks', industries: { health: 2.2, education: 2, science: 1.4, government: 1.3 } },
  san_antonio: { name: 'San Antonio', state: 'TX', icon: '🌮', housing: 0.8, living: 0.92, pay: 0.9, transit: 'poor', flood: 0.01, blurb: 'The most affordable of the big cities', industries: { government: 2.5, health: 1.7, hospitality: 1.5 } },
  san_diego: { name: 'San Diego', state: 'CA', icon: '🏄', housing: 2.0, living: 1.15, pay: 1.1, transit: 'poor', flood: 0.002, blurb: 'Perfect weather, priced like it', industries: { science: 2.5, government: 2, hospitality: 1.5, tech: 1.4 } },
  dallas: { name: 'Dallas', state: 'TX', icon: '🤠', housing: 1.0, living: 0.97, pay: 1.02, transit: 'poor', flood: 0.006, blurb: 'Booming jobs, room to grow', industries: { finance: 2, transport: 2, business: 1.8, energy: 1.4 } },
  austin: { name: 'Austin', state: 'TX', icon: '🎸', housing: 1.3, living: 1.02, pay: 1.08, transit: 'poor', flood: 0.006, blurb: 'Tech jobs and live music', industries: { tech: 2.8, creative: 1.8, entertainment: 1.5, government: 1.4 } },
  seattle: { name: 'Seattle', state: 'WA', icon: '☕', housing: 1.8, living: 1.15, pay: 1.2, transit: 'good', flood: 0.004, blurb: 'Coffee, rain, and high salaries', industries: { tech: 3.5, science: 1.8, transport: 1.4, health: 1.2 } },
  denver: { name: 'Denver', state: 'CO', icon: '🏔️', housing: 1.5, living: 1.05, pay: 1.05, transit: 'good', flood: 0.002, blurb: 'Mountains on the weekends', industries: { energy: 1.6, tech: 1.6, hospitality: 1.4, trades: 1.4, science: 1.3 } },
  boston: { name: 'Boston', state: 'MA', icon: '🦞', housing: 1.9, living: 1.2, pay: 1.2, transit: 'great', flood: 0.006, blurb: 'Colleges, hospitals, and old brick', industries: { health: 2.8, education: 2.5, science: 2.5, finance: 1.4, tech: 1.4 } },
  miami: { name: 'Miami', state: 'FL', icon: '🏖️', housing: 1.6, living: 1.1, pay: 0.98, transit: 'poor', flood: 0.03, blurb: 'Beaches and a popular place to retire', industries: { hospitality: 3, retail: 1.5, transport: 1.5, finance: 1.4, entertainment: 1.4 } },
  atlanta: { name: 'Atlanta', state: 'GA', icon: '🍑', housing: 1.1, living: 0.98, pay: 1.02, transit: 'poor', flood: 0.005, blurb: 'Southern hub with good-value homes', industries: { transport: 2.5, entertainment: 1.8, business: 1.6, health: 1.3 } },
};

export const CITY_IDS = Object.keys(CITIES) as CityId[];

/** Cities a few hours' drive apart. Any other pair of different cities is a flight away. */
export const DRIVE_REGIONS: CityId[][] = [
  ['new_york', 'philadelphia', 'boston'],
  ['houston', 'san_antonio', 'dallas', 'austin'],
  ['los_angeles', 'san_diego'],
];

/** Yearly cost of getting to work without a car, by how good transit is. */
export const TRANSIT_BY_CITY: Record<Transit, number> = { great: 1400, good: 1800, poor: 3200 };
/** Relocating to another city: base cost plus a share per person. */
export const RELOCATION = { base: 3000, perPerson: 1000 };

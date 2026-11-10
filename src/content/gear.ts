/**
 * Big hobby gear: things you buy, store, keep up, and can pass down to your children.
 * Home-based gear (workshop, studio, chef's kitchen, greenhouse, garage lift) are home
 * upgrades instead (see HOME_UPGRADES).
 */
import type { Hobby } from '../engine/types';

export type GearId = 'plane' | 'small_boat' | 'bass_boat' | 'offshore_boat' | 'project_car';

export interface GearDef {
  label: string;
  icon: string;
  hobby: Hobby;
  price: number;
  /** Yearly upkeep including storage (hangar fees, marina slip, insurance). */
  upkeep: number;
  /** Share of value lost each year. */
  depreciation: number;
  /** Practice gains for the hobby are multiplied by this while you own it. */
  boost: number;
  /** Takes a parking spot (trailered boats and project cars). */
  parks?: boolean;
  /** Can only be bought (and kept at a marina) in a coastal city. */
  coastal?: boolean;
  desc: string;
}

export const GEAR: Record<GearId, GearDef> = {
  plane: { label: 'Single-engine plane', icon: '🛩️', hobby: 'flying', price: 90000, upkeep: 13000, depreciation: 0.04, boost: 1.3, desc: 'Fly whenever you like; flying hours cost much less. Hangar included in upkeep.' },
  small_boat: { label: 'Small fishing boat', icon: '🚤', hobby: 'fishing', price: 25000, upkeep: 1500, depreciation: 0.08, boost: 1.3, parks: true, desc: 'Trailered; takes a parking spot' },
  bass_boat: { label: 'Bass boat', icon: '🛥️', hobby: 'fishing', price: 60000, upkeep: 3500, depreciation: 0.07, boost: 1.5, parks: true, desc: 'Fast and well equipped; takes a parking spot' },
  offshore_boat: { label: 'Offshore boat', icon: '⛵', hobby: 'fishing', price: 250000, upkeep: 18000, depreciation: 0.06, boost: 1.8, coastal: true, desc: 'Deep-sea fishing and charters. Marina slip included; coastal cities only.' },
  project_car: { label: 'Project car (rusty classic)', icon: '🚙', hobby: 'mechanics', price: 8000, upkeep: 600, depreciation: 0, boost: 1.2, parks: true, desc: 'Restore it over the years; a finished classic is worth $45,000+' },
};

/** Coastal cities: offshore boats, marinas, charter fishing. */
export const COASTAL = ['new_york', 'los_angeles', 'san_diego', 'seattle', 'boston', 'miami', 'houston'] as const;

/** A fully restored classic is worth about this much. */
export const RESTORED_VALUE = 45000;

import type { Looks } from '../engine/types';

/**
 * The player profile lives outside any single game: settings, achievements,
 * lifetime stats, and the Family Archive. It is stored and versioned separately
 * from saves, and full backups merge it instead of overwriting it.
 */

export type ThemeSetting = 'system' | 'light' | 'dark';
export type MotionSetting = 'system' | 'reduced' | 'full';
export type TextSize = 'normal' | 'large';

export interface Settings {
  theme: ThemeSetting;
  motion: MotionSetting;
  textSize: TextSize;
  showKeyHints: boolean;
  /** Years between backup reminders in the recap; 0 turns reminders off. */
  backupReminderYears: number;
}

export interface UnlockedAchievement {
  /** ISO timestamp of the first unlock. */
  at: string;
  /** In-game year and family it was earned in, for flavor. */
  year: number;
  family: string;
}

/** Lifetime totals and records. Every field merges by taking the larger value. */
export interface LifetimeStats {
  yearsPlayed: number;
  familiesStarted: number;
  familiesEnded: number;
  successions: number;
  birthsInFamily: number;
  mostGenerations: number;
  longestLife: number;
  richestHousehold: number;
}

/** One played character, frozen for the memorial (enough to redraw their portrait). */
export interface ArchivedMember {
  id: string;
  name: string;
  sex: 'F' | 'M';
  looks: Looks;
  birthYear: number;
  deathYear?: number;
  title: string;
  knownFor: string;
  /** What they sought in life (optional; families archived before aspirations have none). */
  aim?: string;
  /** Generated at the end of the story; the player can rewrite it. */
  epitaph: string;
  /** A few true lines about the life they lived (optional; older archives have none). */
  story?: string[];
  children: number;
  highlights: string[];
}

export interface LegacyBreakdown {
  wealth: number;
  bonds: number;
  achievement: number;
  wellbeing: number;
}

/** A finished family, kept in the profile's Family Archive. */
export interface ArchivedFamily {
  id: string;
  familyName: string;
  startYear: number;
  endYear: number;
  generations: number;
  members: ArchivedMember[];
  legacy: number;
  breakdown: LegacyBreakdown;
  endedAt: string;
}

export interface Profile {
  schemaVersion: number;
  settings: Settings;
  achievements: Record<string, UnlockedAchievement>;
  stats: LifetimeStats;
  archive: ArchivedFamily[];
}

export const PROFILE_SCHEMA_VERSION = 2;
/** Longest epitaph the player can write. */
export const EPITAPH_MAX = 160;

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  motion: 'system',
  textSize: 'normal',
  showKeyHints: true,
  backupReminderYears: 10,
};

export const EMPTY_STATS: LifetimeStats = {
  yearsPlayed: 0,
  familiesStarted: 0,
  familiesEnded: 0,
  successions: 0,
  birthsInFamily: 0,
  mostGenerations: 0,
  longestLife: 0,
  richestHousehold: 0,
};

export function newProfile(): Profile {
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    achievements: {},
    stats: { ...EMPTY_STATS },
    archive: [],
  };
}

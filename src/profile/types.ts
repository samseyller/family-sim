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

/** Summary of a finished family. The full memorial view arrives in a later stage. */
export interface ArchivedFamily {
  id: string;
  familyName: string;
  startYear: number;
  endYear: number;
  generations: number;
  members: { name: string; lifespan: string; knownFor: string }[];
  legacy: number;
  endedAt: string;
}

export interface Profile {
  schemaVersion: number;
  settings: Settings;
  achievements: Record<string, UnlockedAchievement>;
  stats: LifetimeStats;
  archive: ArchivedFamily[];
}

export const PROFILE_SCHEMA_VERSION = 1;

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

import { z } from 'zod';
import { DEFAULT_SETTINGS, EMPTY_STATS, EPITAPH_MAX, PROFILE_SCHEMA_VERSION, type Profile } from './types';
import { fillLooks } from '../engine/genome';

const nonneg = z.number().finite().nonnegative();

export const SettingsSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']).catch(DEFAULT_SETTINGS.theme),
  motion: z.enum(['system', 'reduced', 'full']).catch(DEFAULT_SETTINGS.motion),
  textSize: z.enum(['normal', 'large']).catch(DEFAULT_SETTINGS.textSize),
  showKeyHints: z.boolean().catch(DEFAULT_SETTINGS.showKeyHints),
  backupReminderYears: z.number().int().min(0).max(100).catch(DEFAULT_SETTINGS.backupReminderYears),
});

const Stats = z.object({
  yearsPlayed: nonneg,
  familiesStarted: nonneg,
  familiesEnded: nonneg,
  successions: nonneg,
  birthsInFamily: nonneg,
  mostGenerations: nonneg,
  longestLife: nonneg,
  richestHousehold: z.number().finite(),
});

export const ProfileSchema = z.object({
  schemaVersion: z.literal(PROFILE_SCHEMA_VERSION),
  // Settings are forgiving: a bad value falls back to its default rather than rejecting the profile.
  settings: SettingsSchema.catch({ ...DEFAULT_SETTINGS }),
  achievements: z.record(z.string(), z.object({ at: z.string(), year: z.number().int(), family: z.string() })),
  // Stats added in later versions default to zero.
  stats: Stats.partial().transform((s) => ({ ...EMPTY_STATS, ...s })),
  archive: z.array(
    z.object({
      id: z.string().min(1),
      familyName: z.string(),
      startYear: z.number().int(),
      endYear: z.number().int(),
      generations: z.number().int(),
      members: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          sex: z.enum(['F', 'M']),
          looks: z.object({
            skin: z.number().int(), hairColor: z.number().int(), hairStyle: z.number().int(), eyes: z.number().int(),
            face: z.number().int(), nose: z.number().int(), facialHair: z.number().int(), glasses: z.number().int(), freckles: z.number().int(),
          }),
          birthYear: z.number().int(),
          deathYear: z.number().int().optional(),
          title: z.string(),
          knownFor: z.string(),
          aim: z.string().optional(),
          epitaph: z.string().max(EPITAPH_MAX),
          children: z.number().int().nonnegative(),
          highlights: z.array(z.string()),
        }),
      ),
      legacy: z.number().finite(),
      breakdown: z.object({ wealth: z.number().finite(), bonds: z.number().finite(), achievement: z.number().finite(), wellbeing: z.number().finite() }),
      endedAt: z.string(),
    }),
  ),
});

type Parsed = z.infer<typeof ProfileSchema>;
const assertAssignable = (p: Parsed): Profile => p;
void assertAssignable;

/** Upgrade steps for profiles: PROFILE_STEPS[n] turns version n into n + 1. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PROFILE_STEPS: Record<number, (p: any) => any> = {
  // v1 → v2: archive members became full records (portrait genome, years, epitaph).
  1: (p) => {
    for (const fam of Array.isArray(p.archive) ? p.archive : []) {
      if (!fam || typeof fam !== 'object') continue; // malformed entries are left for validation to reject
      fam.breakdown ??= { wealth: 0, bonds: 0, achievement: 0, wellbeing: 0 };
      fam.members = (Array.isArray(fam.members) ? fam.members : []).map((raw: unknown, i: number) => {
        const m = (raw && typeof raw === 'object' ? raw : {}) as { name?: string; lifespan?: string; knownFor?: string };
        const years = /(\d{4})\s*[–-]\s*(\d{4})?/.exec(m.lifespan ?? '');
        const id = `${fam.id}-m${i}`;
        return {
          id,
          name: m.name ?? 'Unknown',
          sex: 'F',
          looks: fillLooks(undefined, id),
          birthYear: years ? Number(years[1]) : fam.startYear,
          deathYear: years?.[2] ? Number(years[2]) : undefined,
          title: '',
          knownFor: m.knownFor ?? 'a life well lived',
          epitaph: `Remembered for ${m.knownFor ?? 'a life well lived'}.`,
          children: 0,
          highlights: [],
        };
      });
    }
    return p;
  },
};

export function migrateProfile(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let p: any = structuredClone(raw);
  while (typeof p.schemaVersion === 'number' && p.schemaVersion < PROFILE_SCHEMA_VERSION && PROFILE_STEPS[p.schemaVersion]) {
    p = PROFILE_STEPS[p.schemaVersion](p);
    p.schemaVersion++;
  }
  return p;
}

export function parseProfile(raw: unknown): { ok: true; profile: Profile } | { ok: false; error: string } {
  const version = (raw as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (typeof version === 'number' && version > PROFILE_SCHEMA_VERSION) {
    return { ok: false, error: `This profile is from a newer version of the game (format ${version}).` };
  }
  let migrated: unknown;
  try {
    migrated = migrateProfile(raw);
  } catch (e) {
    return { ok: false, error: `The profile could not be upgraded (${(e as Error)?.message ?? 'unknown error'}).` };
  }
  const res = ProfileSchema.safeParse(migrated);
  if (!res.success) return { ok: false, error: z.prettifyError(res.error).split('\n').slice(0, 6).join('\n') };
  return { ok: true, profile: res.data as Profile };
}

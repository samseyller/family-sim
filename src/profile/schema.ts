import { z } from 'zod';
import { DEFAULT_SETTINGS, EMPTY_STATS, PROFILE_SCHEMA_VERSION, type Profile } from './types';

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
      members: z.array(z.object({ name: z.string(), lifespan: z.string(), knownFor: z.string() })),
      legacy: z.number().finite(),
      endedAt: z.string(),
    }),
  ),
});

type Parsed = z.infer<typeof ProfileSchema>;
const assertAssignable = (p: Parsed): Profile => p;
void assertAssignable;

/** Upgrade steps for profiles: PROFILE_STEPS[n] turns version n into n + 1. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PROFILE_STEPS: Record<number, (p: any) => any> = {};

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
  const res = ProfileSchema.safeParse(migrateProfile(raw));
  if (!res.success) return { ok: false, error: z.prettifyError(res.error).split('\n').slice(0, 6).join('\n') };
  return { ok: true, profile: res.data as Profile };
}

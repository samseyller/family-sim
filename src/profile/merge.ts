import type { LifetimeStats, Profile } from './types';

export interface MergeOptions {
  /** Take settings from the incoming profile instead of keeping local ones. */
  useIncomingSettings?: boolean;
}

export interface MergeSummary {
  newAchievements: number;
  newArchived: number;
  statsRaised: number;
}

/**
 * Combine a backup with the local profile without losing progress on either side:
 * achievements are unioned (earliest unlock wins), stats take the larger value,
 * archive entries are unioned by id, settings stay local unless asked.
 */
export function mergeProfiles(local: Profile, incoming: Profile, opts: MergeOptions = {}): { profile: Profile; summary: MergeSummary } {
  const out: Profile = structuredClone(local);
  const summary: MergeSummary = { newAchievements: 0, newArchived: 0, statsRaised: 0 };

  for (const [id, a] of Object.entries(incoming.achievements)) {
    const mine = out.achievements[id];
    if (!mine) {
      out.achievements[id] = a;
      summary.newAchievements++;
    } else if (a.at < mine.at) {
      out.achievements[id] = a;
    }
  }

  for (const k of Object.keys(out.stats) as (keyof LifetimeStats)[]) {
    if (incoming.stats[k] > out.stats[k]) {
      out.stats[k] = incoming.stats[k];
      summary.statsRaised++;
    }
  }

  const have = new Set(out.archive.map((a) => a.id));
  for (const entry of incoming.archive) {
    if (!have.has(entry.id)) {
      out.archive.push(entry);
      summary.newArchived++;
    }
  }
  out.archive.sort((a, b) => a.endedAt.localeCompare(b.endedAt));

  if (opts.useIncomingSettings) out.settings = { ...incoming.settings };
  return { profile: out, summary };
}

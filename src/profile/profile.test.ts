import { describe, expect, it } from 'vitest';
import { newGame } from '../engine/generate';
import { autoplayYear, chooseHeir, devKill, eligibleHeirs } from '../engine/phases';
import type { GameState } from '../engine/types';
import { parseSaveFile, serializeFullBackup, serializeGame } from '../persistence/exportImport';
import { mergeProfiles } from './merge';
import { parseProfile } from './schema';
import { familyId, track, trackNewFamily } from './tracker';
import { newProfile, type Profile } from './types';

const firstChoice = (pe: GameState['pending'][number]) => pe.choices.find((c) => !c.disabled)!.id;
const NOW = '2026-11-09T00:00:00.000Z';

/** Play `years` through the tracker the way the store does. */
function playTracked(seed: number, years: number, profile = trackNewFamily(newProfile())) {
  let s = newGame(seed);
  let p = track(profile, null, s, NOW).profile;
  for (let i = 0; i < years && s.phase === 'PLANNING'; i++) {
    const next = autoplayYear(s, firstChoice);
    p = track(p, s, next, NOW).profile;
    s = next;
  }
  return { s, p };
}

describe('tracker', () => {
  it('counts years once per year and starts', () => {
    const { s, p } = playTracked(71, 12);
    expect(p.stats.familiesStarted).toBe(1);
    expect(p.stats.yearsPlayed).toBe(s.year - newGame(71).year);
    expect(p.achievements.first_year).toBeDefined();
  });

  it('is idempotent: re-tracking the same transition changes nothing', () => {
    const { s, p } = playTracked(72, 5);
    const again = track(p, s, s, NOW);
    expect(again.changed).toBe(false);
    expect(again.unlocked).toEqual([]);
    expect(again.profile).toBe(p);
  });

  it('does not diff across different families', () => {
    const a = newGame(73);
    const b = newGame(74);
    b.year = a.year + 50;
    const res = track(newProfile(), a, b, NOW);
    expect(res.profile.stats.yearsPlayed).toBe(0);
  });

  it('records successions and archives a finished family exactly once', () => {
    let { s, p } = playTracked(75, 3);
    let next = devKill(s);
    p = track(p, s, next, NOW).profile;
    s = next;
    const heir = eligibleHeirs(s)[0];
    next = chooseHeir(s, heir.id);
    p = track(p, s, next, NOW).profile;
    expect(p.stats.successions).toBe(1);
    s = next;
    next = chooseHeir(devKill(s), null);
    const ended = track(p, devKill(s), next, NOW);
    expect(ended.profile.archive).toHaveLength(1);
    expect(ended.profile.archive[0].id).toBe(familyId(next));
    expect(ended.profile.stats.familiesEnded).toBe(1);
    expect(ended.unlocked.map((a) => a.id)).toContain('legacy');
    const twice = track(ended.profile, devKill(s), next, NOW);
    expect(twice.profile.archive).toHaveLength(1);
  });
});

describe('merge', () => {
  const base = (): Profile => newProfile();

  it('unions achievements keeping the earliest unlock', () => {
    const a = base();
    const b = base();
    a.achievements.x = { at: '2026-05-01', year: 2030, family: 'A' };
    b.achievements.x = { at: '2026-01-01', year: 2040, family: 'B' };
    b.achievements.y = { at: '2026-02-01', year: 2041, family: 'B' };
    const { profile, summary } = mergeProfiles(a, b);
    expect(profile.achievements.x.family).toBe('B');
    expect(profile.achievements.y).toBeDefined();
    expect(summary.newAchievements).toBe(1);
  });

  it('takes the max of each stat and unions the archive', () => {
    const a = base();
    const b = base();
    a.stats.yearsPlayed = 100;
    b.stats.yearsPlayed = 40;
    b.stats.longestLife = 92;
    const entry = { id: 'f1', familyName: 'X', startYear: 1, endYear: 2, generations: 1, members: [], legacy: 5, breakdown: { wealth: 0, bonds: 0, achievement: 0, wellbeing: 0 }, endedAt: NOW };
    a.archive.push(entry);
    b.archive.push(entry, { ...entry, id: 'f2' });
    const { profile, summary } = mergeProfiles(a, b);
    expect(profile.stats.yearsPlayed).toBe(100);
    expect(profile.stats.longestLife).toBe(92);
    expect(profile.archive.map((x) => x.id).sort()).toEqual(['f1', 'f2']);
    expect(summary).toEqual({ newAchievements: 0, newArchived: 1, statsRaised: 1 });
  });

  it('keeps local settings unless asked', () => {
    const a = base();
    const b = base();
    b.settings.theme = 'dark';
    expect(mergeProfiles(a, b).profile.settings.theme).toBe('system');
    expect(mergeProfiles(a, b, { useIncomingSettings: true }).profile.settings.theme).toBe('dark');
  });

  it('merging a profile with itself is a no-op', () => {
    const { p } = playTracked(76, 8);
    const { profile, summary } = mergeProfiles(p, p);
    expect(profile).toEqual(p);
    expect(summary).toEqual({ newAchievements: 0, newArchived: 0, statsRaised: 0 });
  });
});

describe('profile schema', () => {
  it('repairs bad settings and fills new stats instead of rejecting', () => {
    const raw: any = newProfile();
    raw.settings.theme = 'neon';
    delete raw.stats.richestHousehold;
    const res = parseProfile(raw);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.profile.settings.theme).toBe('system');
      expect(res.profile.stats.richestHousehold).toBe(0);
    }
  });

  it('rejects damaged achievements and newer formats', () => {
    const raw: any = newProfile();
    raw.achievements.x = { at: 5 };
    expect(parseProfile(raw).ok).toBe(false);
    expect(parseProfile({ ...newProfile(), schemaVersion: 99 }).ok).toBe(false);
  });
});

describe('export format v2', () => {
  it('full backup round-trips profile and games', () => {
    const { s, p } = playTracked(77, 10);
    const res = parseSaveFile(serializeFullBackup(p, { current: s }));
    expect(res.ok && res.kind).toBe('full');
    if (res.ok && res.kind === 'full') {
      expect(res.profile).toEqual(p);
      expect(res.current).toEqual(s);
      expect(res.previous).toBeUndefined();
    }
  });

  it('full backup with no game is valid', () => {
    const res = parseSaveFile(serializeFullBackup(newProfile(), {}));
    expect(res.ok && res.kind).toBe('full');
  });

  it('a damaged previous autosave is skipped with a warning, not fatal', () => {
    const { s, p } = playTracked(78, 2);
    const bad: any = structuredClone(s);
    bad.activeId = 'ghost';
    const res = parseSaveFile(serializeFullBackup(p, { current: s, previous: bad }));
    expect(res.ok).toBe(true);
    if (res.ok && res.kind === 'full') {
      expect(res.previous).toBeUndefined();
      expect(res.warnings.join(' ')).toMatch(/previous autosave/);
    }
  });

  it('still reads Stage 2 single-game files', () => {
    const s = newGame(79);
    const legacy = JSON.stringify({ app: 'family-tree', exportedAt: NOW, schemaVersion: 2, rulesVersion: s.rulesVersion, state: s });
    const res = parseSaveFile(legacy);
    expect(res.ok && res.kind).toBe('game');
    expect(parseSaveFile(serializeGame(s)).ok).toBe(true);
  });

  it('refuses files from a newer export format', () => {
    const res = parseSaveFile(JSON.stringify({ app: 'family-tree', format: 9, kind: 'full' }));
    expect(res.ok).toBe(false);
  });
});

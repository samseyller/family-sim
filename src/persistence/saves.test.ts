import { describe, expect, it } from 'vitest';
import { newGame, RULES_VERSION } from '../engine/generate';
import { autoplayYear, resolveYear } from '../engine/phases';
import type { GameState } from '../engine/types';
import { parseSaveFile, serializeSave, yearsSinceBackup } from './exportImport';
import { GameStateSchema, integrityProblems } from './schema';

const firstChoice = (pe: GameState['pending'][number]) => pe.choices.find((c) => !c.disabled)!.id;

function played(seed: number, years: number) {
  let s = newGame(seed);
  for (let i = 0; i < years && s.phase === 'PLANNING'; i++) s = autoplayYear(s, firstChoice);
  return s;
}

describe('schema', () => {
  it('accepts real game states in every phase', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = played(seed, 40);
      expect(GameStateSchema.safeParse(s).success).toBe(true);
      expect(integrityProblems(s)).toEqual([]);
      const d = resolveYear(s);
      expect(GameStateSchema.safeParse(d).success).toBe(true);
      expect(integrityProblems(d)).toEqual([]);
    }
  });
});

describe('export / import', () => {
  it('round-trips exactly', () => {
    const s = played(9, 20);
    const res = parseSaveFile(serializeSave(s));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state).toEqual(s);
      expect(res.warnings).toEqual([]);
    }
  });

  it('accepts a bare state without the envelope', () => {
    const s = newGame(10);
    expect(parseSaveFile(JSON.stringify(s)).ok).toBe(true);
  });

  it('round-trips mid-decision and continues identically', () => {
    let s = newGame(11);
    for (let i = 0; i < 40; i++) {
      s = resolveYear(s);
      if (s.phase === 'DECISIONS') break;
      s = autoplayYear(s, firstChoice);
    }
    const res = parseSaveFile(serializeSave(s));
    if (!res.ok) throw new Error(res.error);
    expect(autoplayYear(res.state, firstChoice)).toEqual(autoplayYear(s, firstChoice));
  });

  it('rejects garbage, other apps, damaged and inconsistent saves', () => {
    expect(parseSaveFile('not json').ok).toBe(false);
    expect(parseSaveFile(JSON.stringify({ app: 'other', state: {} })).ok).toBe(false);

    const damaged: any = structuredClone(newGame(12));
    damaged.people[damaged.activeId].stats.health = 'lots';
    const r1 = parseSaveFile(JSON.stringify(damaged));
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error).toMatch(/damaged/);

    const broken = structuredClone(newGame(13));
    broken.activeId = 'nobody';
    const r2 = parseSaveFile(JSON.stringify(broken));
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toMatch(/inconsistent/);
  });

  it('refuses saves from a newer format', () => {
    const s: any = structuredClone(newGame(14));
    s.schemaVersion = 999;
    const r = parseSaveFile(JSON.stringify(s));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/newer version/);
  });

  it('warns about other rules versions and upgrades old formats', () => {
    const s: any = structuredClone(newGame(15));
    s.rulesVersion = '0.0.1';
    s.schemaVersion = 1;
    s.plan.jobIntent = undefined;
    delete s.plan.jobIntents;
    const r = parseSaveFile(JSON.stringify(s));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.warnings.some((w) => w.includes('0.0.1') && w.includes(RULES_VERSION))).toBe(true);
      expect(r.warnings.some((w) => w.includes('older save format'))).toBe(true);
    }
  });
});

describe('backup reminders', () => {
  it('counts years since the last export', () => {
    const s = played(16, 12);
    expect(yearsSinceBackup(s)).toBe(12);
    expect(yearsSinceBackup({ ...s, lastBackupYear: s.year - 3 })).toBe(3);
  });
});

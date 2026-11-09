/**
 * Release-blocker regressions: failed writes are visible and recoverable, the previous
 * autosave stays in sync, imports validate references, full backups keep both copies,
 * malformed legacy files never throw, and dev tools are off by default.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, flushSaves, loadSaves, saveGame } from './db';
import { parseSaveFile, serializeFullBackup, serializeGame } from './exportImport';
import { newGame, RULES_VERSION } from '../engine/generate';
import { autoplayYear, choose, resolveYear } from '../engine/phases';
import type { GameState } from '../engine/types';
import { active } from '../engine/util';
import { useGame } from '../store/gameStore';
import { newProfile } from '../profile/types';
import { DEV_TOOLS } from '../devtools';

const quota = () => Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
const settle = async () => {
  await flushSaves();
  await new Promise((r) => setTimeout(r, 0));
};
const firstChoice = (pe: GameState['pending'][number]) => pe.choices.find((c) => !c.disabled)!.id;
const stored = async () => (await db.saves.get('auto')) ?? null;

beforeEach(async () => {
  await db.saves.clear();
  await db.profile.clear();
  useGame.setState({ game: null, saved: null, previous: null, gameSaveError: null, profileSaveError: null, profile: newProfile(), panel: null });
});
afterEach(() => vi.restoreAllMocks());

// ── 1. Failed saves ──────────────────────────────────────────────────

describe('failed writes are observable and recoverable', () => {
  it('a failed write rejects for its caller but does not poison later writes; order is kept', async () => {
    const a = newGame(1);
    const b = newGame(2);
    const c = newGame(3);
    vi.spyOn(db.saves, 'put').mockRejectedValueOnce(quota());
    const first = saveGame(a, false);
    const second = saveGame(b, false);
    const third = saveGame(c, false);
    await expect(first).rejects.toThrow('quota');
    await expect(second).resolves.toBeTruthy();
    await expect(third).resolves.toBeTruthy();
    expect((await stored())!.current.seed).toBe(3); // last write wins, in order
    expect(await flushSaves()).toBe(true);
  });

  it('flushSaves reports a failure until a later write succeeds', async () => {
    vi.spyOn(db.saves, 'put').mockRejectedValueOnce(quota());
    await saveGame(newGame(4), false).catch(() => undefined);
    expect(await flushSaves()).toBe(false);
    await saveGame(newGame(5), false);
    expect(await flushSaves()).toBe(true);
  });

  it('the store shows a persistent error, keeps the last durable save, and retry recovers', async () => {
    useGame.getState().startNew('adult');
    await settle();
    const durable = useGame.getState().saved;
    expect(durable).not.toBeNull();

    vi.spyOn(db.saves, 'put').mockRejectedValue(quota());
    useGame.getState().endYear();
    await settle();
    expect(useGame.getState().gameSaveError).toMatch(/out of storage/);
    expect(useGame.getState().saved).toBe(durable); // not claimed as saved
    expect(useGame.getState().game).not.toBe(durable); // play continues in memory
    expect(await useGame.getState().retrySave()).toBe(false);

    vi.restoreAllMocks();
    expect(await useGame.getState().retrySave()).toBe(true);
    expect(useGame.getState().gameSaveError).toBeNull();
    expect((await stored())!.current).toEqual(useGame.getState().game);
  });

  it('a failed rotation is retried exactly once', async () => {
    useGame.getState().startNew('adult');
    await settle();
    const beforeRecap = useGame.getState().game!;
    // Resolve the year to RECAP (a rotating write) while storage fails.
    vi.spyOn(db.saves, 'put').mockRejectedValue(quota());
    let g = resolveYear(beforeRecap);
    while (g.phase === 'DECISIONS') g = choose(g, g.pending[0].uid, firstChoice(g.pending[0]));
    useGame.setState({ game: beforeRecap });
    useGame.getState().endYear();
    for (let i = 0; i < 10 && useGame.getState().game!.phase === 'DECISIONS'; i++) {
      const pe = useGame.getState().game!.pending[0];
      useGame.getState().choose(pe.uid, firstChoice(pe));
    }
    await settle();
    expect(useGame.getState().gameSaveError).not.toBeNull();
    vi.restoreAllMocks();
    // Two more writes once storage recovers: only the first may rotate.
    await useGame.getState().retrySave();
    await useGame.getState().retrySave();
    const row = (await stored())!;
    expect(row.previous?.year).toBe(beforeRecap.year);
    expect(row.previous?.phase).toBe('PLANNING');
  });

  it('a failed import is not claimed as done and leaves the game untouched', async () => {
    useGame.getState().startNew('adult');
    await settle();
    const before = useGame.getState().saved;
    vi.spyOn(db.saves, 'put').mockRejectedValue(quota());
    await expect(useGame.getState().importSave(newGame(77))).rejects.toThrow(/Nothing was changed/);
    expect(useGame.getState().saved).toBe(before);
    expect((await stored())!.current.seed).toBe(before!.seed);
  });

  it('a failed full-backup restore rejects and keeps the profile', async () => {
    const profile = { ...newProfile(), achievements: { first_year: { at: 'x', year: 2030, family: 'A' } } };
    vi.spyOn(db.profile, 'put').mockRejectedValue(quota());
    await expect(useGame.getState().importFullBackup({ profile, useIncomingSettings: false, loadGame: false })).rejects.toThrow(/Nothing was changed/);
    expect(useGame.getState().profile.achievements.first_year).toBeUndefined();
  });

  it('the update path refuses to proceed when saving fails', async () => {
    useGame.getState().startNew('adult');
    await settle();
    vi.spyOn(db.saves, 'put').mockRejectedValue(quota());
    expect(await useGame.getState().retrySave()).toBe(false); // UpdatePrompt reloads only on true
    vi.restoreAllMocks();
    expect(await useGame.getState().retrySave()).toBe(true);
  });
});

// ── 2. Previous autosave stays in sync ───────────────────────────────

describe('previous autosave', () => {
  it('matches the database after several rotations without reloading, and restore uses it', async () => {
    const s = useGame.getState;
    s().startNew('adult');
    await settle();
    for (let year = 0; year < 3; year++) {
      s().endYear();
      for (let i = 0; i < 12 && s().game!.phase === 'DECISIONS'; i++) s().choose(s().game!.pending[0].uid, firstChoice(s().game!.pending[0]));
      await settle();
      const row = (await stored())!;
      expect(s().previous).toEqual(row.previous ?? null);
      s().nextYear();
      await settle();
    }
    const row = (await stored())!;
    const wasCurrent = row.current;
    const wasPrevious = row.previous!;
    await s().restorePrevious();
    const after = (await stored())!;
    expect(after.current).toEqual(wasPrevious);
    expect(after.previous).toEqual(wasCurrent); // restoring can be undone
    expect(s().saved).toEqual(wasPrevious);
    expect(s().previous).toEqual(wasCurrent);
  });

  it('a new family keeps the replaced game as previous, visible immediately', async () => {
    const s = useGame.getState;
    s().startNew('adult');
    await settle();
    const first = s().saved!;
    s().toTitle();
    s().startNew('child');
    await settle();
    expect(s().previous).toEqual(first);
    expect((await stored())!.previous).toEqual(first);
  });
});

// ── 3. Event and other references ────────────────────────────────────

describe('imports validate references', () => {
  function decisionsWith(eventId: string, rules = RULES_VERSION) {
    let s = newGame(901);
    for (let i = 0; i < 30 && s.phase !== 'DECISIONS'; i++) {
      s = resolveYear(s);
      if (s.phase !== 'DECISIONS') s = autoplayYear(s, firstChoice);
    }
    const bad: GameState = structuredClone(s);
    bad.rulesVersion = rules;
    bad.pending = [{ ...bad.pending[0], uid: 'x1', eventId, choices: [{ id: 'a', label: 'A' }] }];
    return bad;
  }

  it('rejects a current-rules save with a pending unknown event (repro 1)', () => {
    const res = parseSaveFile(serializeGame(decisionsWith('missing_event')));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/missing_event/);
  });

  it('rejects a current-rules save with a due scheduled unknown event (repro 2)', () => {
    const s = newGame(902);
    s.scheduled = [{ dueYear: s.year, eventId: 'missing_event' }];
    const res = parseSaveFile(serializeGame(s));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/missing_event/);
  });

  it('rejects unknown careers and fake choices on real events', () => {
    const s = newGame(903);
    active(s).jobId = 'astronaut';
    expect(parseSaveFile(serializeGame(s)).ok).toBe(false);
    const real = decisionsWith('car_trouble');
    real.pending[0].choices = [{ id: 'free_money', label: 'Free money' }];
    expect(parseSaveFile(serializeGame(real)).ok).toBe(false);
  });

  it('repairs older-rules saves so they stay playable', () => {
    const oldPending = decisionsWith('missing_event', '0.0.1');
    const r1 = parseSaveFile(serializeGame(oldPending));
    expect(r1.ok && r1.kind === 'game').toBe(true);
    if (r1.ok && r1.kind === 'game') {
      expect(r1.warnings.join(' ')).toMatch(/skipped/);
      expect(r1.state.pending.some((p) => p.eventId === 'missing_event')).toBe(false);
      expect(() => autoplayYear(r1.state, firstChoice)).not.toThrow();
    }
    const oldScheduled = newGame(904);
    oldScheduled.rulesVersion = '0.0.1';
    oldScheduled.scheduled = [{ dueYear: oldScheduled.year, eventId: 'missing_event' }];
    active(oldScheduled).jobId = 'astronaut';
    const r2 = parseSaveFile(serializeGame(oldScheduled));
    expect(r2.ok && r2.kind === 'game').toBe(true);
    if (r2.ok && r2.kind === 'game') {
      expect(active(r2.state).jobId).toBeUndefined();
      expect(() => resolveYear(r2.state)).not.toThrow();
    }
  });

  it('normal saves still import, and stored autosaves with bad references fall back safely', async () => {
    expect(parseSaveFile(serializeGame(newGame(905))).ok).toBe(true);
    const good = newGame(906);
    const bad = decisionsWith('missing_event');
    await db.saves.put({ slot: 'auto', current: bad, previous: good, updatedAt: 0 });
    const loaded = await loadSaves();
    expect(loaded.recovered).toBe(true);
    expect(loaded.current?.seed).toBe(906);
  });

  it('the engine itself never crashes on an unknown event', () => {
    const s = decisionsWith('missing_event');
    expect(() => choose(s, 'x1', 'a')).not.toThrow();
    const t = newGame(907);
    t.scheduled = [{ dueYear: t.year, eventId: 'missing_event' }];
    expect(() => resolveYear(t)).not.toThrow();
  });
});

// ── 4. Full backups keep both copies ─────────────────────────────────

describe('full backup restore', () => {
  it('on an empty browser restores both the game and its previous autosave', async () => {
    const current = newGame(911);
    const previous = newGame(912);
    const res = parseSaveFile(serializeFullBackup(newProfile(), { current, previous }));
    if (!res.ok || res.kind !== 'full') throw new Error('bad backup');
    const out = await useGame.getState().importFullBackup({ profile: res.profile, current: res.current, previous: res.previous, useIncomingSettings: false, loadGame: true });
    expect(out.previousFrom).toBe('backup');
    const row = (await stored())!;
    expect(row.current.seed).toBe(911);
    expect(row.previous?.seed).toBe(912);
    expect(useGame.getState().previous?.seed).toBe(912);
  });

  it('replacing an existing game keeps that game as the previous autosave', async () => {
    await saveGame(newGame(913), false);
    const res = parseSaveFile(serializeFullBackup(newProfile(), { current: newGame(914), previous: newGame(915) }));
    if (!res.ok || res.kind !== 'full') throw new Error('bad backup');
    const out = await useGame.getState().importFullBackup({ profile: res.profile, current: res.current, previous: res.previous, useIncomingSettings: false, loadGame: true });
    expect(out.previousFrom).toBe('your-game');
    const row = (await stored())!;
    expect(row.current.seed).toBe(914);
    expect(row.previous?.seed).toBe(913);
  });
});

// ── 5. Malformed legacy files ────────────────────────────────────────

describe('malformed legacy files produce errors, never exceptions', () => {
  it('a version-1 save with plan: null (repro)', () => {
    const s: any = structuredClone(newGame(921));
    s.schemaVersion = 1;
    s.plan = null;
    let res!: ReturnType<typeof parseSaveFile>;
    expect(() => { res = parseSaveFile(JSON.stringify(s)); }).not.toThrow();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/plan/);
  });

  it('other broken old saves and profiles', () => {
    const cases: unknown[] = [
      { schemaVersion: 1, people: null, plan: {} },
      { schemaVersion: 3, people: { p1: null } },
      { schemaVersion: 1, people: 'nope', plan: null },
      { app: 'family-tree', format: 2, kind: 'full', profile: { schemaVersion: 1, archive: [null, { members: 'x' }] }, saves: {} },
      { app: 'family-tree', format: 2, kind: 'full', profile: null, saves: { current: { schemaVersion: 1, plan: null } } },
    ];
    for (const c of cases) {
      let res!: ReturnType<typeof parseSaveFile>;
      expect(() => { res = parseSaveFile(JSON.stringify(c)); }).not.toThrow();
      expect(res.ok).toBe(false);
    }
  });
});

// ── 6. Developer tools are off by default ────────────────────────────

describe('developer tools', () => {
  it('are disabled without the build flag, and their actions do nothing', async () => {
    expect(DEV_TOOLS).toBe(false);
    useGame.getState().startNew('adult');
    await settle();
    const before = useGame.getState().game;
    useGame.getState().toggleDev();
    expect(useGame.getState().showDev).toBe(false);
    useGame.getState().dev('kill');
    useGame.getState().dev('skip10');
    expect(useGame.getState().game).toBe(before);
  });
});

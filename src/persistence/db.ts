import Dexie, { type Table } from 'dexie';
import type { GameState } from '../engine/types';
import { newProfile, type Profile } from '../profile/types';
import { parseProfile } from '../profile/schema';
import { checkGame } from './exportImport';

export interface SaveRow {
  slot: string;
  current: GameState;
  /** The previous successful autosave, kept for recovery. */
  previous?: GameState;
  updatedAt: number;
}

export interface ProfileRow {
  key: string;
  current: Profile;
  previous?: Profile;
  updatedAt: number;
}

class SaveDb extends Dexie {
  saves!: Table<SaveRow, string>;
  profile!: Table<ProfileRow, string>;
  constructor() {
    super('family-sim');
    this.version(1).stores({ saves: 'slot' });
    // v2: the player profile (settings, achievements, stats, archive), separate from games.
    this.version(2).stores({ saves: 'slot', profile: 'key' });
  }
}

export const db = new SaveDb();
export const AUTO_SLOT = 'auto';
const PROFILE_KEY = 'main';

// ── Write queue ──────────────────────────────────────────────────────
// Writes run strictly in order so an older state can never overwrite a newer one.
// Each write's own promise rejects if that write fails (callers must know), but the
// queue itself always continues, so one failure never blocks later writes.

let queue: Promise<void> = Promise.resolve();
/** True while the most recent write (game or profile) failed and nothing has succeeded since. */
let lastWriteFailed = false;

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  queue = run.then(
    () => { lastWriteFailed = false; },
    () => { lastWriteFailed = true; },
  );
  return run;
}

/**
 * Write `state` as the current save. With `rotate`, the old current becomes `previous`.
 * Resolves with the row as stored; rejects if the browser refused the write.
 */
export function saveGame(state: GameState, rotate: boolean | (() => boolean), slot = AUTO_SLOT): Promise<SaveRow & { rotated: boolean }> {
  return enqueue(async () => {
    // Decided when the write runs (not when queued), so a retried rotation never happens twice.
    const rotated = typeof rotate === 'function' ? rotate() : rotate;
    const row = await db.saves.get(slot);
    const next: SaveRow = { slot, current: state, previous: rotated ? row?.current : row?.previous, updatedAt: Date.now() };
    await db.saves.put(next);
    return { ...next, rotated };
  });
}

/** Write both copies explicitly (used when restoring a full backup). */
export function writeSaves(current: GameState, previous: GameState | undefined, slot = AUTO_SLOT): Promise<SaveRow> {
  return enqueue(async () => {
    const next: SaveRow = { slot, current, previous, updatedAt: Date.now() };
    await db.saves.put(next);
    return next;
  });
}

/** Persist the profile, keeping the prior version for recovery. Rejects if the write fails. */
export function saveProfile(profile: Profile): Promise<void> {
  return enqueue(async () => {
    const row = await db.profile.get(PROFILE_KEY);
    await db.profile.put({ key: PROFILE_KEY, current: profile, previous: row?.current, updatedAt: Date.now() });
  });
}

/**
 * Wait for every queued write. Resolves `true` only if the last write succeeded
 * (used before reloading for an app update, which must not lose unsaved progress).
 */
export async function flushSaves(): Promise<boolean> {
  await queue;
  return !lastWriteFailed;
}

// ── Reads ────────────────────────────────────────────────────────────

/** Migrate + validate (+ repair older-rules saves) a stored state; undefined if it can't be trusted. */
function usable(raw: unknown): GameState | undefined {
  if (!raw) return undefined;
  const res = checkGame(raw, 'The stored save');
  if (!res.ok) {
    console.warn(res.error);
    return undefined;
  }
  return res.state;
}

export interface LoadedSaves {
  current?: GameState;
  previous?: GameState;
  /** True when the current save was unusable and we fell back to the previous one. */
  recovered: boolean;
}

export async function loadSaves(slot = AUTO_SLOT): Promise<LoadedSaves> {
  await queue;
  const row = await db.saves.get(slot);
  if (!row) return { recovered: false };
  const current = usable(row.current);
  const previous = usable(row.previous);
  return { current: current ?? previous, previous: current ? previous : undefined, recovered: !current && !!previous };
}

export async function loadGame(slot = AUTO_SLOT): Promise<GameState | undefined> {
  return (await loadSaves(slot)).current;
}

/** Load the profile; falls back to the previous copy, then to a fresh profile. */
export async function loadProfile(): Promise<Profile> {
  await queue;
  const row = await db.profile.get(PROFILE_KEY);
  for (const candidate of [row?.current, row?.previous]) {
    if (!candidate) continue;
    const res = parseProfile(candidate);
    if (res.ok) return res.profile;
    console.warn('Stored profile failed validation', res.error);
  }
  return newProfile();
}

export function deleteSave(slot = AUTO_SLOT) {
  return enqueue(() => db.saves.delete(slot));
}

/** Ask the browser to keep our data. This is only a request and may be denied. */
export async function requestPersistence() {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export async function isPersisted() {
  try {
    return (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    return false;
  }
}

/** A short, player-facing explanation of a storage error. */
export function describeSaveError(e: unknown): string {
  const name = (e as { name?: string } | null)?.name ?? '';
  const inner = (e as { inner?: { name?: string } } | null)?.inner?.name ?? '';
  if (name === 'QuotaExceededError' || inner === 'QuotaExceededError') return 'Your device is out of storage space for this site.';
  if (name === 'InvalidStateError' || name === 'DatabaseClosedError' || name === 'OpenFailedError') return 'The browser blocked saving (private browsing or site data settings).';
  return 'The browser refused to save.';
}

import Dexie, { type Table } from 'dexie';
import type { GameState } from '../engine/types';
import { migrate } from '../engine/migrations';
import { GameStateSchema, integrityProblems } from './schema';

export interface SaveRow {
  slot: string;
  current: GameState;
  /** The previous successful autosave, kept for recovery. */
  previous?: GameState;
  updatedAt: number;
}

class SaveDb extends Dexie {
  saves!: Table<SaveRow, string>;
  constructor() {
    super('family-sim');
    this.version(1).stores({ saves: 'slot' });
  }
}

export const db = new SaveDb();
export const AUTO_SLOT = 'auto';

// Serialize writes so an older state can never overwrite a newer one.
let queue: Promise<unknown> = Promise.resolve();

/** Write `state` as current. With `rotate`, the old current becomes `previous`. */
export function saveGame(state: GameState, rotate: boolean, slot = AUTO_SLOT) {
  queue = queue
    .then(async () => {
      const row = await db.saves.get(slot);
      await db.saves.put({
        slot,
        current: state,
        previous: rotate ? row?.current : row?.previous,
        updatedAt: Date.now(),
      });
    })
    .catch((e) => console.error('Save failed', e));
  return queue;
}

/** Migrate + validate a stored state; undefined if it can't be trusted. */
function usable(raw: unknown): GameState | undefined {
  const s = migrate(raw);
  if (!s) return undefined;
  const parsed = GameStateSchema.safeParse(s);
  if (!parsed.success) {
    console.warn('Stored save failed validation', parsed.error.issues.slice(0, 3));
    return undefined;
  }
  return integrityProblems(parsed.data as GameState).length ? undefined : (parsed.data as GameState);
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

export async function deleteSave(slot = AUTO_SLOT) {
  await queue;
  await db.saves.delete(slot);
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

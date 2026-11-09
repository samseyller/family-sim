import Dexie, { type Table } from 'dexie';
import type { GameState } from '../engine/types';
import { migrate } from '../engine/migrations';

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

export async function loadGame(slot = AUTO_SLOT): Promise<GameState | undefined> {
  const row = await db.saves.get(slot);
  if (!row) return undefined;
  return migrate(row.current) ?? migrate(row.previous);
}

export async function deleteSave(slot = AUTO_SLOT) {
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

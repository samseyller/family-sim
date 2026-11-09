import { RULES_VERSION, SCHEMA_VERSION } from '../engine/generate';
import { migrate } from '../engine/migrations';
import type { GameState } from '../engine/types';
import { GameStateSchema, integrityProblems } from './schema';
import { z } from 'zod';

const APP_ID = 'family-tree';

export interface SaveFile {
  app: typeof APP_ID;
  exportedAt: string;
  schemaVersion: number;
  rulesVersion: string;
  state: GameState;
}

export type ImportResult =
  | { ok: true; state: GameState; warnings: string[] }
  | { ok: false; error: string };

/** How many years since the last backup before we nudge the player. */
export const BACKUP_REMINDER_YEARS = 10;

export function yearsSinceBackup(s: GameState) {
  const first = s.journal[0]?.year ?? s.year;
  return s.year - (s.lastBackupYear ?? first);
}

export function serializeSave(state: GameState): string {
  const file: SaveFile = {
    app: APP_ID,
    exportedAt: new Date().toISOString(),
    schemaVersion: state.schemaVersion,
    rulesVersion: state.rulesVersion,
    state,
  };
  return JSON.stringify(file);
}

export function saveFileName(state: GameState) {
  const me = state.people[state.activeId];
  const name = (me?.lastName ?? 'family').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `family-tree-${name}-${state.year}.json`;
}

/** Triggers a browser download of the save. */
export function downloadSave(state: GameState) {
  const blob = new Blob([serializeSave(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = saveFileName(state);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Parse → migrate → validate. Nothing is written anywhere; the caller decides
 * whether to replace the current save after showing the result.
 */
export function parseSaveFile(text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file isn't valid JSON." };
  }
  // Accept both the export envelope and a bare GameState.
  const env = raw as Partial<SaveFile> | null;
  const candidate = env && typeof env === 'object' && 'state' in env ? env.state : raw;
  if (env && typeof env === 'object' && 'app' in env && env.app !== APP_ID) {
    return { ok: false, error: "This file isn't a Family Tree save." };
  }
  const version = (candidate as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (typeof version === 'number' && version > SCHEMA_VERSION) {
    return { ok: false, error: `This save is from a newer version of the game (format ${version}). Update the game to load it.` };
  }
  const migrated = migrate(candidate);
  if (!migrated) return { ok: false, error: "This save's format isn't recognized." };
  const parsed = GameStateSchema.safeParse(migrated);
  if (!parsed.success) {
    return { ok: false, error: `The save is damaged:\n${z.prettifyError(parsed.error).split('\n').slice(0, 6).join('\n')}` };
  }
  const state = parsed.data as GameState;
  const problems = integrityProblems(state);
  if (problems.length) return { ok: false, error: `The save is inconsistent:\n${problems.slice(0, 5).join('\n')}` };
  const warnings: string[] = [];
  if (version !== SCHEMA_VERSION) warnings.push(`Upgraded from an older save format (${String(version)} → ${SCHEMA_VERSION}).`);
  if (state.rulesVersion !== RULES_VERSION) {
    warnings.push(`Made with game rules ${state.rulesVersion}; this version uses ${RULES_VERSION}. Some events may play out differently.`);
  }
  return { ok: true, state, warnings };
}

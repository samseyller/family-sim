/**
 * Backup files.
 *
 *   format 2, kind "game":  { app, format, kind, exportedAt, rulesVersion, state }
 *   format 2, kind "full":  { app, format, kind, exportedAt, profile, saves: { current?, previous? } }
 *   legacy (Stage 2):       { app, exportedAt, schemaVersion, rulesVersion, state }  or a bare GameState
 *
 * Parsing never writes anything: callers show the result and let the player confirm.
 */
import { z } from 'zod';
import { RULES_VERSION, SCHEMA_VERSION } from '../engine/generate';
import { migrateChecked } from '../engine/migrations';
import { referenceProblems, repairOlderRules } from './references';
import type { GameState } from '../engine/types';
import type { Profile } from '../profile/types';
import { parseProfile } from '../profile/schema';
import { GameStateSchema, integrityProblems } from './schema';

const APP_ID = 'family-tree';
export const EXPORT_FORMAT = 2;

export interface GameFile {
  app: typeof APP_ID;
  format: typeof EXPORT_FORMAT;
  kind: 'game';
  exportedAt: string;
  rulesVersion: string;
  state: GameState;
}

export interface FullBackupFile {
  app: typeof APP_ID;
  format: typeof EXPORT_FORMAT;
  kind: 'full';
  exportedAt: string;
  profile: Profile;
  saves: { current?: GameState; previous?: GameState };
}

export type ImportResult =
  | { ok: true; kind: 'game'; state: GameState; warnings: string[] }
  | { ok: true; kind: 'full'; profile: Profile; current?: GameState; previous?: GameState; warnings: string[] }
  | { ok: false; error: string };

/** Default years between backup reminders (the player can change it in Settings). */
export const BACKUP_REMINDER_YEARS = 10;

export function yearsSinceBackup(s: GameState) {
  const first = s.journal[0]?.year ?? s.year;
  return s.year - (s.lastBackupYear ?? first);
}

export function serializeGame(state: GameState): string {
  const file: GameFile = { app: APP_ID, format: EXPORT_FORMAT, kind: 'game', exportedAt: new Date().toISOString(), rulesVersion: state.rulesVersion, state };
  return JSON.stringify(file);
}

export function serializeFullBackup(profile: Profile, saves: { current?: GameState; previous?: GameState }): string {
  const file: FullBackupFile = { app: APP_ID, format: EXPORT_FORMAT, kind: 'full', exportedAt: new Date().toISOString(), profile, saves };
  return JSON.stringify(file);
}

/** @deprecated name kept for older call sites/tests. */
export const serializeSave = serializeGame;

export function saveFileName(state: GameState) {
  const me = state.people[state.activeId];
  const name = (me?.lastName ?? 'family').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `family-tree-${name}-${state.year}.json`;
}

export function fullBackupFileName(date = new Date()) {
  return `family-tree-full-backup-${date.toISOString().slice(0, 10)}.json`;
}

/** Triggers a browser download. */
export function downloadJson(text: string, fileName: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadSave(state: GameState) {
  downloadJson(serializeGame(state), saveFileName(state));
}

type GameCheck = { ok: true; state: GameState; warnings: string[] } | { ok: false; error: string };

/** Migrate + validate one game state. */
export function checkGame(candidate: unknown, label = 'The save'): GameCheck {
  const version = (candidate as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (typeof version === 'number' && version > SCHEMA_VERSION) {
    return { ok: false, error: `${label} is from a newer version of the game (format ${version}). Update the game to load it.` };
  }
  const migrated = migrateChecked(candidate);
  if (!migrated.ok) return { ok: false, error: `${label} can't be loaded: ${migrated.error}.` };
  const parsed = GameStateSchema.safeParse(migrated.state);
  if (!parsed.success) {
    return { ok: false, error: `${label} is damaged:\n${z.prettifyError(parsed.error).split('\n').slice(0, 6).join('\n')}` };
  }
  let state = parsed.data as GameState;
  const problems = integrityProblems(state);
  if (problems.length) return { ok: false, error: `${label} is inconsistent:\n${problems.slice(0, 5).join('\n')}` };
  const warnings: string[] = [];
  if (version !== SCHEMA_VERSION) warnings.push(`Upgraded from an older save format (${String(version)} → ${SCHEMA_VERSION}).`);
  if (state.rulesVersion !== RULES_VERSION) {
    warnings.push(`Made with game rules ${state.rulesVersion}; this version uses ${RULES_VERSION}. Some events may play out differently.`);
  }
  // References to events, careers and people must exist in this version of the game.
  const refs = referenceProblems(state);
  if (refs.length) {
    if (state.rulesVersion === RULES_VERSION) {
      return { ok: false, error: `${label} refers to things this game doesn't have:\n${refs.slice(0, 5).join('\n')}` };
    }
    // Older rules: drop content that no longer exists, then re-check everything.
    const repaired = repairOlderRules(state);
    state = repaired.state;
    const still = [...integrityProblems(state), ...referenceProblems(state)];
    if (still.length) return { ok: false, error: `${label} could not be repaired:\n${still.slice(0, 5).join('\n')}` };
    warnings.push(...repaired.notes);
  }
  return { ok: true, state, warnings };
}

/** Parse an imported file. Never throws: anything unexpected becomes an error result. */
export function parseSaveFile(text: string): ImportResult {
  try {
    return parseSaveFileUnsafe(text);
  } catch (e) {
    console.error("Import failed", e);
    return { ok: false, error: "This file could not be read as a Family Tree save." };
  }
}

function parseSaveFileUnsafe(text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file isn't valid JSON." };
  }
  if (!raw || typeof raw !== 'object') return { ok: false, error: "This file isn't a Family Tree save." };
  const env = raw as Record<string, unknown>;
  if ('app' in env && env.app !== APP_ID) return { ok: false, error: "This file isn't a Family Tree save." };
  if (typeof env.format === 'number' && env.format > EXPORT_FORMAT) {
    return { ok: false, error: `This backup is from a newer version of the game (file format ${env.format}). Update the game to load it.` };
  }

  if (env.kind === 'full') {
    const prof = parseProfile(env.profile);
    if (!prof.ok) return { ok: false, error: `The profile in this backup is damaged:\n${prof.error}` };
    const saves = (env.saves ?? {}) as { current?: unknown; previous?: unknown };
    const warnings: string[] = [];
    let current: GameState | undefined;
    let previous: GameState | undefined;
    if (saves.current) {
      const c = checkGame(saves.current, 'The game in this backup');
      if (!c.ok) return c;
      current = c.state;
      warnings.push(...c.warnings);
    }
    if (saves.previous) {
      // A damaged previous autosave shouldn't block restoring everything else.
      const p = checkGame(saves.previous, 'The previous autosave in this backup');
      if (p.ok) previous = p.state;
      else warnings.push('The previous autosave in this backup was damaged and will be skipped.');
    }
    return { ok: true, kind: 'full', profile: prof.profile, current, previous, warnings };
  }

  // "game" files (format 2), legacy envelopes, and bare states.
  const candidate = 'state' in env ? env.state : raw;
  const res = checkGame(candidate);
  return res.ok ? { ...res, kind: 'game' } : res;
}

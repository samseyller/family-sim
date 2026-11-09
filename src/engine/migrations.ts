import { SCHEMA_VERSION } from './generate';
import { fillLooks } from './genome';
import type { GameState } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Step = (s: any) => any;

const isObj = (x: unknown): x is Record<string, any> => !!x && typeof x === 'object' && !Array.isArray(x);
/** People as an iterable list, tolerating malformed input (validation reports it afterwards). */
const peopleOf = (s: any): any[] => (isObj(s.people) ? Object.values(s.people).filter(isObj) : []);

/**
 * STEPS[n] upgrades a save from schemaVersion n to n + 1. Steps run on untrusted JSON:
 * they must tolerate missing or malformed fields (leaving them for schema validation
 * to report) and never throw on purpose.
 */
const STEPS: Record<number, Step> = {
  // v1 → v2: part-time jobs; plan.jobIntent became plan.jobIntents (one per slot).
  1: (s) => {
    if (isObj(s.plan)) {
      const old = s.plan.jobIntent;
      s.plan.jobIntents = isObj(old) ? [old.kind === 'quit' ? { kind: 'quit', slot: 'full' } : old] : [];
      delete s.plan.jobIntent;
    }
    for (const p of peopleOf(s)) {
      p.partPerf ??= 50;
      p.partYears ??= 0;
    }
    return s;
  },
  // v2 → v3: night school (Person.education, Plan.eduIntent) — both optional, so
  // old saves are already valid; the step exists so the version chain stays explicit.
  2: (s) => s,
  // v3 → v4: richer appearance genome. Missing genes are filled deterministically per person.
  3: (s) => {
    for (const p of peopleOf(s)) p.looks = fillLooks(isObj(p.looks) ? p.looks : undefined, String(p.id ?? ''));
    return s;
  },
  // v4 → v5: optional Plan.lifestyle (defaults to comfortable); nothing to rewrite.
  4: (s) => s,
  // v5 → v6: Money tab — optional investments/rentTier on households and payment/rate/
  // capacity on assets. Older homes keep the legacy flat payment; nothing to rewrite.
  5: (s) => s,
  // v6 → v7: Activities — optional energy, activityLog, lastActivity. Nothing to rewrite.
  6: (s) => s,
  // v7 → v8: retirement — optional career/pension/savings fields on people and a plan
  // contribution rate. Existing retirees keep their recorded pension.
  7: (s) => s,
  // v8 → v9: optional guided-playthrough state. Nothing to rewrite.
  8: (s) => s,
  // v9 → v10: optional household head and per-person savings stakes. Missing stakes are
  // seeded as equal shares the first time the economy runs, so nothing to rewrite.
  9: (s) => s,
  // v10 → v11: car models that age, and garages. Older cars get a model and a plausible age
  // ("New car" ≈ 3 years, "Used car" ≈ 8); homes get the garage of the matching home type.
  10: (s) => {
    const garages: Record<string, number> = { 'Starter home': 0, 'Family home': 2, 'Large home': 2 };
    for (const hh of isObj(s.households) ? Object.values(s.households).filter(isObj) : []) {
      for (const a of Array.isArray(hh.assets) ? hh.assets.filter(isObj) : []) {
        if (a.kind === 'car' && a.age === undefined) {
          const isNew = a.name === 'New car';
          a.model ??= isNew ? 'new' : 'used';
          a.age = isNew ? 3 : 8;
        }
        if (a.kind === 'house' && a.garage === undefined) a.garage = garages[String(a.name)] ?? 0;
      }
    }
    return s;
  },
};

export type MigrateResult = { ok: true; state: GameState } | { ok: false; error: string };

/** Upgrade a loaded save to the current schema, with a readable reason when it can't be. */
export function migrateChecked(raw: unknown): MigrateResult {
  if (!isObj(raw)) return { ok: false, error: "it isn't a saved game" };
  let s: any;
  try {
    s = structuredClone(raw);
  } catch {
    return { ok: false, error: 'it contains data that cannot be copied' };
  }
  if (typeof s.schemaVersion !== 'number') return { ok: false, error: 'it has no format version' };
  const from = s.schemaVersion;
  while (s.schemaVersion < SCHEMA_VERSION) {
    const step = STEPS[s.schemaVersion];
    if (!step) return { ok: false, error: `format ${from} is too old to upgrade` };
    try {
      s = step(s);
    } catch (e) {
      return { ok: false, error: `it could not be upgraded from format ${from} (${(e as Error)?.message ?? 'unknown error'})` };
    }
    if (!isObj(s)) return { ok: false, error: `it could not be upgraded from format ${from}` };
    s.schemaVersion++;
  }
  return s.schemaVersion === SCHEMA_VERSION ? { ok: true, state: s as GameState } : { ok: false, error: `format ${from} isn't recognized` };
}

/** Upgrade a loaded save to the current schema, or return undefined if it can't be. */
export function migrate(raw: unknown): GameState | undefined {
  const res = migrateChecked(raw);
  return res.ok ? res.state : undefined;
}

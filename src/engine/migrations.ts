import { SCHEMA_VERSION } from './generate';
import { fillLooks } from './genome';
import { CITY_IDS } from '../content/cities';
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
  // v11 → v12: optional pet dogs on households. Nothing to rewrite.
  11: (s) => s,
  // v12 → v13: cities and friends. Every household gets a city: the player's from the seed,
  // and others either the same city or another one, matching the old "near/far" split.
  12: (s) => {
    const hash = (k: string) => [...k].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
    const households = isObj(s.households) ? (Object.values(s.households).filter(isObj) as Record<string, any>[]) : [];
    const me = isObj(s.people) && isObj(s.people[s.activeId]) ? s.people[s.activeId] : undefined;
    const home = CITY_IDS[hash(String(s.seed ?? 0)) % CITY_IDS.length];
    for (const hh of households) {
      if (hh.city !== undefined) continue;
      const id = String(hh.id ?? '');
      const near = id === me?.householdId || hash(id) % 10 < 7;
      const others = CITY_IDS.filter((c) => c !== home);
      hh.city = near ? home : others[hash(id) % others.length];
    }
    // Who runs the player's home, if not recorded: the player when they live with their
    // partner or their own children (an established household), otherwise left to the
    // default (the oldest adult, e.g. the parents of a grown child still at home).
    const myHome = me && isObj(s.households) ? s.households[me.householdId] : undefined;
    if (me && isObj(myHome) && myHome.headId === undefined) {
      const mates = peopleOf(s).filter((p) => p.householdId === me.householdId && p.deathYear === undefined && p.id !== me.id);
      const isMine = (p: any) => (Array.isArray(p.biologicalParents) && p.biologicalParents.includes(me.id)) || (Array.isArray(p.adoptiveParents) && p.adoptiveParents.includes(me.id));
      const partnered = Array.isArray(s.partnerships) && s.partnerships.some((x: any) => isObj(x) && (x.a === me.id || x.b === me.id) && x.status === 'married'
        && mates.some((m) => m.id === (x.a === me.id ? x.b : x.a)));
      if (partnered || mates.some(isMine)) myHome.headId = me.id;
    }
    return s;
  },
  // v13 → v14: school grades and top universities (all optional; kids without a record are
  // judged by smarts until they build one). Nothing to rewrite.
  13: (s) => s,
  // v14 → v15: home upgrades and flood insurance (optional). Nothing to rewrite.
  14: (s) => s,
  // v15 → v16: new hobbies, credentials, gear and career ladders (all optional). Nothing to rewrite.
  15: (s) => s,
  // v16 → v17: sports (a sport per athlete, per-sport skills, club memberships). Optional; nothing to rewrite.
  16: (s) => s,
  // v17 → v18: a hidden athletic ceiling per person (rolled when first needed). Optional; nothing to rewrite.
  17: (s) => s,
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

import { SCHEMA_VERSION } from './generate';
import { fillLooks } from './genome';
import type { GameState } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Step = (s: any) => any;

/** STEPS[n] upgrades a save from schemaVersion n to n + 1. */
const STEPS: Record<number, Step> = {
  // v1 → v2: part-time jobs; plan.jobIntent became plan.jobIntents (one per slot).
  1: (s) => {
    const old = s.plan?.jobIntent;
    s.plan.jobIntents = old ? [old.kind === 'quit' ? { kind: 'quit', slot: 'full' } : old] : [];
    delete s.plan.jobIntent;
    for (const p of Object.values<any>(s.people)) {
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
    for (const p of Object.values<any>(s.people)) p.looks = fillLooks(p.looks, p.id);
    return s;
  },
  // v4 → v5: optional Plan.lifestyle (defaults to comfortable); nothing to rewrite.
  4: (s) => s,
  // v5 → v6: Money tab — optional investments/rentTier on households and payment/rate/
  // capacity on assets. Older homes keep the legacy flat payment; nothing to rewrite.
  5: (s) => s,
};

/** Upgrade a loaded save to the current schema, or return undefined if it can't be. */
export function migrate(raw: unknown): GameState | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  let s: any = structuredClone(raw);
  while (typeof s.schemaVersion === 'number' && s.schemaVersion < SCHEMA_VERSION) {
    const step = STEPS[s.schemaVersion];
    if (!step) return undefined;
    s = step(s);
    s.schemaVersion++;
  }
  return s.schemaVersion === SCHEMA_VERSION ? (s as GameState) : undefined;
}

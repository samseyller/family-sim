/**
 * Story report: what close people decide, by the decider's traits, across simulated lives
 * (npx tsx scripts/stories.ts [livesPerStyle] [firstSeed]).
 *
 * The decision table is wrapped (not changed) so every decision that actually happens is counted, using the engine's
 * own chance and roll. Prints decisions per 100 played years, the share of each that came from a person with each
 * trait (versus that trait's share of all deciders evaluated), and the share of decisions that pull people apart.
 */
import { playLife, seedRange, STRATEGIES } from '../src/balance/simulate';
import { DECISIONS, decisionRoll, evaluate, type DecisionCtx } from '../src/engine/agency';
import type { Trait } from '../src/engine/types';

const LIVES = Number(process.argv[2] ?? 30);
const FIRST = Number(process.argv[3] ?? 3000);
const TRAITS: Trait[] = ['ambitious', 'kind', 'stubborn', 'curious', 'anxious', 'easygoing', 'creative', 'athletic'];
/** Decisions that put distance between people (the rest bring them closer or are personal growth). */
const APART = new Set(['create_distance', 'boundary', 'drop_interest', 'distant_job']);

const fired: Record<string, number> = {};
/** Last year each (life, person, decision) fired, to count repeats within 10 years. */
const lastFired = new Map<string, number>();
let repeats = 0;
let life = 0;
const firedBy: Record<string, Record<string, number>> = {};
const seenBy: Record<string, Record<string, number>> = {};
for (const def of DECISIONS) {
  const original = def.factors;
  const wrapped = { ...def, factors: original };
  def.factors = (c: DecisionCtx) => {
    const f = original(c);
    const { chance } = evaluate(wrapped, c);
    for (const t of c.p.traits) ((seenBy[def.id] ??= {})[t] = (seenBy[def.id][t] ?? 0) + 1);
    if (decisionRoll(c.s, c.p, def.id) < chance) {
      fired[def.id] = (fired[def.id] ?? 0) + 1;
      const key = `${life}:${c.p.id}:${def.id}`;
      if (c.s.year - (lastFired.get(key) ?? -99) < 10) repeats++;
      lastFired.set(key, c.s.year);
      for (const t of c.p.traits) ((firedBy[def.id] ??= {})[t] = (firedBy[def.id][t] ?? 0) + 1);
    }
    return f;
  };
}

let years = 0;
for (const style of STRATEGIES) for (const seed of seedRange(FIRST, LIVES)) { life++; years += playLife(style, seed, 120).years; }

const total = Object.values(fired).reduce((a, b) => a + b, 0);
const apart = Object.entries(fired).filter(([id]) => APART.has(id)).reduce((a, [, n]) => a + n, 0);
console.log(`${STRATEGIES.length * LIVES} lives, ${years} played years, ${total} NPC decisions (${(total / years * 100).toFixed(1)} per 100 years); ${(apart / total * 100).toFixed(0)}% pull apart; ${(repeats / total * 100).toFixed(1)}% repeat the same person’s same decision within 10 years\n`);
const pad = (x: string | number, n: number) => String(x).padStart(n);
console.log(`${'decision'.padEnd(22)}${pad('/100y', 7)}  ${TRAITS.map((t) => pad(t.slice(0, 6), 7)).join('')}   (fired share ÷ evaluated share; >1 = likelier)`);
for (const def of DECISIONS) {
  const n = fired[def.id] ?? 0;
  const seen = seenBy[def.id] ?? {};
  const seenAll = Object.values(seen).reduce((a, b) => a + b, 0);
  const firedAll = Object.values(firedBy[def.id] ?? {}).reduce((a, b) => a + b, 0);
  const lift = (t: string) => (n >= 15 && seen[t] >= 20 ? ((firedBy[def.id]?.[t] ?? 0) / firedAll / (seen[t] / seenAll)).toFixed(2) : '  ·');
  console.log(`${def.id.padEnd(22)}${pad((n / years * 100).toFixed(2), 7)}  ${TRAITS.map((t) => pad(lift(t), 7)).join('')}`);
}

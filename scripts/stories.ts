/**
 * Story report: what close people decide, by the decider's traits, across simulated lives
 * (npx tsx scripts/stories.ts [livesPerStyle] [firstSeed]; every play style).
 *
 * The decision table is wrapped (not changed) so every decision that actually happens is counted, using the engine's
 * own chance and roll. Prints decisions per 100 played years, the share of each that came from a person with each
 * trait (versus that trait's share of all deciders evaluated), and the share of decisions that pull people apart.
 *
 * Then story threads (engine/threads.ts): how many of each kind start, how they end, how often their follow-up events
 * come up, and the most threads any save held.
 */
import { PLAY_STYLES } from '../src/balance/playstyles';
import { playLife, seedRange } from '../src/balance/simulate';
import { DECISIONS, decisionRoll, evaluate, type DecisionCtx } from '../src/engine/agency';
import { STORY_IDS } from '../src/engine/storyEvents';
import type { GameState, Thread, Trait } from '../src/engine/types';

const LIVES = Number(process.argv[2] ?? 8);
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
const followUps: Record<string, number> = {};
const threads = new Map<string, Thread>();
let maxThreads = 0;
for (const style of PLAY_STYLES) for (const seed of seedRange(FIRST, LIVES)) {
  life++;
  const sample = playLife(style, seed, 120, (s: GameState) => {
    maxThreads = Math.max(maxThreads, s.threads?.length ?? 0);
    for (const th of s.threads ?? []) threads.set(`${life}:${th.kind}:${th.ownerId}:${th.subjectId}:${th.detail}:${th.since}`, structuredClone(th));
  });
  years += sample.years;
  for (const [id, n] of Object.entries(sample.events)) if (STORY_IDS.has(id) || id === 'work_family_crossroads' || id === 'retirement_purpose' || id === 'sibling_rivalry') followUps[id] = (followUps[id] ?? 0) + n;
}

const total = Object.values(fired).reduce((a, b) => a + b, 0);
const apart = Object.entries(fired).filter(([id]) => APART.has(id)).reduce((a, [, n]) => a + n, 0);
console.log(`${PLAY_STYLES.length * LIVES} lives (${PLAY_STYLES.length} play styles), ${years} played years, ${total} NPC decisions (${(total / years * 100).toFixed(1)} per 100 years); ${(apart / total * 100).toFixed(0)}% pull apart; ${(repeats / total * 100).toFixed(1)}% repeat the same person’s same decision within 10 years\n`);
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

console.log(`\nStory threads (most held by one save: ${maxThreads})`);
const kinds: Record<string, { n: number; out: Record<string, number> }> = {};
for (const th of threads.values()) {
  const k = (kinds[th.kind] ??= { n: 0, out: {} });
  k.n++;
  const o = th.outcome ?? 'open';
  k.out[o] = (k.out[o] ?? 0) + 1;
}
for (const [kind, k] of Object.entries(kinds).sort((a, b) => b[1].n - a[1].n)) {
  console.log(`${kind.padEnd(14)}${pad((k.n / years * 100).toFixed(2), 7)}/100y   ${Object.entries(k.out).sort((a, b) => b[1] - a[1]).map(([o, n]) => `${o} ${Math.round(n / k.n * 100)}%`).join(', ')}`);
}
console.log('\nFollow-up events per 100 played years');
for (const [id, n] of Object.entries(followUps).sort((a, b) => b[1] - a[1])) console.log(`${id.padEnd(26)}${pad((n / years * 100).toFixed(2), 7)}`);
const storyTotal = Object.entries(followUps).filter(([id]) => STORY_IDS.has(id)).reduce((a, [, n]) => a + n, 0);
console.log(`all story follow-ups: ${(storyTotal / years * 100).toFixed(1)} per 100 years`);

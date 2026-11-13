/**
 * Personality report: how lives go by the first character's traits, for the three core play styles.
 * Run before and after personality changes to compare (npx tsx scripts/personality.ts [livesPerStyle] [firstSeed]).
 *
 * For each trait: lives with it, median legacy, average adult happiness and stress, average bond with own children
 * at 60, median net worth at 65, plus the average save size at the end of the line.
 */
import { netWorth } from '../src/engine/finance';
import { playLife, seedRange, STRATEGIES } from '../src/balance/simulate';
import type { GameState, Trait } from '../src/engine/types';
import { active, ageOf, childrenOf, getBond } from '../src/engine/util';

const LIVES = Number(process.argv[2] ?? 40);
const TRAITS: Trait[] = ['ambitious', 'kind', 'stubborn', 'curious', 'anxious', 'easygoing', 'creative', 'athletic'];
interface Row { legacy: number; happy: number[]; stress: number[]; fulfil: number[]; bond60?: number; nw65?: number; kb: number }
const rows: Record<string, Row[]> = {};
const med = (xs: number[]) => { const a = xs.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); return a.length ? a[a.length >> 1] : NaN; };
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

for (const style of STRATEGIES) {
  for (const seed of seedRange(Number(process.argv[3] ?? 1000), LIVES)) {
    let first: Trait[] = [];
    const row: Row = { legacy: 0, happy: [], stress: [], fulfil: [], kb: 0 };
    let last: GameState | undefined;
    const sample = playLife(style, seed, 120, (s) => {
      last = s;
      const me = active(s);
      if (me.id !== s.lineage[0]) return;
      first = me.traits;
      const age = ageOf(me, s.year);
      if (age >= 18) { row.happy.push(me.stats.happiness); row.stress.push(me.stats.stress); }
      const f = (me as { fulfillment?: number }).fulfillment;
      if (age >= 18 && f !== undefined) row.fulfil.push(f);
      if (age === 60) { const kids = childrenOf(s, me.id); if (kids.length) row.bond60 = avg(kids.map((k) => getBond(s, me.id, k.id).affinity)); }
      if (age === 65) row.nw65 = netWorth(s, me.householdId);
    });
    row.legacy = sample.legacy.total;
    row.kb = last ? JSON.stringify(last).length / 1024 : 0;
    for (const t of first) (rows[t] ??= []).push(row);
    (rows.all ??= []).push(row);
  }
}

const fmt = (n: number, d = 0) => (Number.isFinite(n) ? n.toFixed(d) : '—');
console.log(`Personality report: ${LIVES} lives per core style (${STRATEGIES.join(', ')}), first character's traits\n`);
console.log('| Trait | Lives | Legacy | Happiness | Stress | Fulfillment | Bond with kids at 60 | Net worth at 65 |');
console.log('|---|---:|---:|---:|---:|---:|---:|---:|');
for (const t of [...TRAITS, 'all']) {
  const r = rows[t] ?? [];
  console.log(`| ${t} | ${r.length} | ${fmt(med(r.map((x) => x.legacy)))} | ${fmt(avg(r.flatMap((x) => x.happy)), 1)} | ${fmt(avg(r.flatMap((x) => x.stress)), 1)} | ${fmt(avg(r.flatMap((x) => x.fulfil)), 1)} | ${fmt(avg(r.flatMap((x) => (x.bond60 === undefined ? [] : [x.bond60]))), 1)} | ${fmt(med(r.flatMap((x) => (x.nw65 === undefined ? [] : [x.nw65]))) / 1000)}k |`);
}
const all = rows.all ?? [];
console.log(`\nAverage save at the end of the line: ${fmt(avg(all.map((x) => x.kb)))} KB`);
const legacies = TRAITS.map((t) => med((rows[t] ?? []).map((x) => x.legacy))).filter(Number.isFinite);
console.log(`Legacy spread across traits (lowest / highest median): ${fmt(Math.min(...legacies) / Math.max(...legacies), 2)}`);

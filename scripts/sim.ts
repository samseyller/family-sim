/**
 * Headless balance simulation: plays many multi-generation runs with scripted
 * strategies and reports how each strategy fares.  Run: npm run sim
 */
import { newGame } from '../src/engine/generate';
import { buildMemorial } from '../src/engine/memorial';
import { autoplayYear, chooseHeir, eligibleHeirs, updatePlan } from '../src/engine/phases';
import { makeRng } from '../src/engine/rng';
import { strategyPlan, type Strategy } from '../src/engine/strategies';
import { ageOf } from '../src/engine/util';

const RUNS = Number(process.argv[2] ?? 60);
const MAX_YEARS = 200;
const strategies: Strategy[] = ['career', 'family', 'balanced'];

for (const strat of strategies) {
  const stats = { years: 0, gens: 0, lifespan: 0, deaths: 0, wealth: 0, bonds: 0, legacy: 0, events: {} as Record<string, number> };
  for (let i = 0; i < RUNS; i++) {
    const r = makeRng(i * 31 + 7);
    let s = newGame(1000 + i);
    let y = 0;
    for (; y < MAX_YEARS; y++) {
      if (s.phase === 'SUCCESSION') {
        const dead = s.people[s.activeId];
        stats.lifespan += ageOf(dead, s.year);
        stats.deaths++;
        const heirs = eligibleHeirs(s).sort((a, b) => a.birthYear - b.birthYear);
        // Prefer an adult child, to continue the bloodline.
        const child = heirs.find((h) => h.generation > dead.generation);
        s = chooseHeir(s, (child ?? heirs[0])?.id ?? null);
      }
      if (s.phase === 'GAME_OVER') break;
      s = updatePlan(s, strategyPlan(s, strat));
      s = autoplayYear(s, (pe) => {
        stats.events[pe.eventId] = (stats.events[pe.eventId] ?? 0) + 1;
        return r.pick(pe.choices.filter((c) => !c.disabled)).id;
      });
    }
    const m = buildMemorial(s);
    stats.years += y;
    stats.gens += m.generations;
    stats.wealth += m.legacy.wealth;
    stats.bonds += m.legacy.bonds;
    stats.legacy += m.legacy.total;
  }
  const avg = (n: number) => Math.round(n / RUNS);
  console.log(`\n=== ${strat.toUpperCase()} (${RUNS} runs) ===`);
  console.log(`years played ${avg(stats.years)} | generations ${(stats.gens / RUNS).toFixed(1)} | avg lifespan ${Math.round(stats.lifespan / Math.max(1, stats.deaths))}`);
  console.log(`family wealth $${avg(stats.wealth).toLocaleString()} | parent-child affinity ${avg(stats.bonds)} | legacy score ${avg(stats.legacy)}`);
  const ev = Object.entries(stats.events).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / stats.years).toFixed(2)}`);
  console.log(`events per year: ${ev.join(', ')}`);
}

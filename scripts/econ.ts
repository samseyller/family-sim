/**
 * Economy report: plays many lives with each scripted strategy and measures money in depth
 * (net worth at key ages, savings rate, where the money goes, inheritances, time in debt,
 * how much the optional spending and misfortunes cost). Run: npm run econ [runs]
 */
import { newGame } from '../src/engine/generate';
import { estimateYear } from '../src/engine/budget';
import { netWorth } from '../src/engine/finance';
import { autoplayYear, chooseHeir, eligibleHeirs, updatePlan } from '../src/engine/phases';
import { makeRng } from '../src/engine/rng';
import { strategyPlan, type Strategy } from '../src/engine/strategies';
import { active, ageOf } from '../src/engine/util';

const RUNS = Number(process.argv[2] ?? 40);
const YEARS = 120;
const AGES = [25, 35, 45, 55, 65, 75];
const strategies: Strategy[] = ['career', 'family', 'balanced'];
const median = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : 0; };
const k = (n: number) => `$${Math.round(n / 1000).toLocaleString()}k`;

for (const strat of strategies) {
  const atAge: Record<number, number[]> = Object.fromEntries(AGES.map((a) => [a, []]));
  const lines: Record<string, number> = {};
  let income = 0;
  let expenses = 0;
  let years = 0;
  let debtYears = 0;
  const inherit: number[] = [];
  const parts = { cash: [] as number[], invest: [] as number[], retire: [] as number[], home: [] as number[] };
  const byGen: Record<number, number[]> = {};
  const inheritByGen: Record<number, number[]> = {};
  const events: Record<string, { n: number; spent: number }> = {};
  for (let i = 0; i < RUNS; i++) {
    const r = makeRng(i * 31 + 7);
    let s = newGame(5000 + i);
    for (let y = 0; y < YEARS; y++) {
      if (s.phase === 'SUCCESSION') {
        const dead = s.people[s.activeId];
        const heirs = eligibleHeirs(s).sort((a, b) => a.birthYear - b.birthYear);
        s = chooseHeir(s, (heirs.find((h) => h.generation > dead.generation) ?? heirs[0])?.id ?? null);
      }
      if (s.phase === 'GAME_OVER') break;
      s = updatePlan(s, strategyPlan(s, strat));
      const me = active(s);
      const age = ageOf(me, s.year);
      const hh = s.households[me.householdId];
      if (AGES.includes(age)) atAge[age].push(netWorth(s, hh.id));
      if (age === 65) (byGen[Math.min(4, me.generation)] ??= []).push(netWorth(s, hh.id));
      if (age === 65) {
        parts.cash.push(hh.wallet);
        parts.invest.push(hh.investments ?? 0);
        parts.retire.push(Object.values(s.people).filter((p) => p.householdId === hh.id).reduce((n, p) => n + (p.retirementSavings ?? 0), 0));
        parts.home.push(hh.assets.filter((a) => a.kind === 'house').reduce((n, a) => n + a.value - a.mortgage, 0));
      }
      if (age >= 18) {
        const est = estimateYear(s);
        income += est.totalIncome;
        expenses += est.totalExpenses;
        for (const l of est.expenses) lines[l.label] = (lines[l.label] ?? 0) + l.amount;
        years++;
        if (hh.wallet < 0) debtYears++;
      }
      const before = hh.wallet;
      const journalLen = s.journal.length;
      s = autoplayYear(s, (pe, st) => {
        const w0 = st.households[active(st).householdId].wallet;
        const pick = r.pick(pe.choices.filter((c) => !c.disabled)).id;
        void w0;
        events[pe.eventId] ??= { n: 0, spent: 0 };
        events[pe.eventId].n++;
        return pick;
      });
      for (const j of s.journal.slice(journalLen)) {
        const m = /inherited \$([\d,]+)/.exec(j.text);
        if (m && j.text.startsWith('You')) {
          inherit.push(Number(m[1].replace(/,/g, '')));
          (inheritByGen[Math.min(4, active(s).generation)] ??= []).push(Number(m[1].replace(/,/g, '')));
        }
      }
      void before;
    }
  }
  console.log(`\n=== ${strat.toUpperCase()} (${RUNS} lives × up to ${YEARS} years) ===`);
  console.log('median net worth at age: ' + AGES.map((a) => `${a}: ${k(median(atAge[a]))}`).join(' · '));
  console.log(`avg yearly income ${k(income / years)} · expenses ${k(expenses / years)} · savings rate ${Math.round((1 - expenses / income) * 100)}% · years in debt ${Math.round((debtYears / years) * 100)}%`);
  console.log(`at 65 (median): cash ${k(median(parts.cash))} · investments ${k(median(parts.invest))} · retirement savings ${k(median(parts.retire))} · home equity ${k(median(parts.home))}`);
  console.log('net worth at 65 by generation: ' + Object.keys(byGen).map((g2) => `gen ${g2}${g2 === '4' ? '+' : ''}: ${k(median(byGen[+g2]))} (${byGen[+g2].length})`).join(' · '));
  console.log('inheritance by generation: ' + Object.keys(inheritByGen).map((g2) => `gen ${g2}${g2 === '4' ? '+' : ''}: ${k(median(inheritByGen[+g2]))} (${inheritByGen[+g2].length})`).join(' · '));
  console.log(`inheritances: ${inherit.length} · median ${k(median(inherit))}`);
  const top = Object.entries(lines).sort((a, b) => b[1] - a[1]).slice(0, 14);
  console.log('where the money goes: ' + top.map(([l, v]) => `${l} ${Math.round((v / expenses) * 100)}%`).join(', '));
  const ev = Object.entries(events).sort((a, b) => b[1].n - a[1].n).slice(0, 18);
  console.log('events per life-year: ' + ev.map(([id, e]) => `${id} ${(e.n / years).toFixed(3)}`).join(', '));
}

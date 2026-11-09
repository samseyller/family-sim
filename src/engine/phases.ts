/**
 * Turn phases. Every exported function is pure: (state) -> new state.
 *
 *   PLANNING ──resolveYear──▶ DECISIONS ──choose…──▶ RECAP ──nextYear──▶ PLANNING (year+1)
 *                    └──(no events)───────────────────▲          └─(active died)─▶ SUCCESSION ──chooseHeir──▶ PLANNING / GAME_OVER
 *
 * Saves happen only at these boundaries (and after each decision), so a reload
 * never repeats salary, aging, or event effects.
 */
import { makeRng, type Rng } from './rng';
import type { GameState, Person, Plan, StatKey } from './types';
import { defaultPlan, sanitizePlan } from './generate';
import { applyPlan, driftBonds, runEconomy, runHealth, runPeople } from './systems';
import { generateEvents, resolveEvent } from './events';
import { strategyPlan } from './strategies';
import { applyCushion } from './tutorial';
import { autoComeOfAge, die, settleEstates } from './family';
import { active, ageOf, alive, childrenOf, fullName, journal, partnerOf } from './util';

function begin(state: GameState): { s: GameState; rng: Rng } {
  const s = structuredClone(state);
  return { s, rng: makeRng(s.rngState) };
}

function end(s: GameState, rng: Rng) {
  s.rngState = rng.state();
  return s;
}

export function updatePlan(state: GameState, plan: Plan): GameState {
  if (state.phase !== 'PLANNING') return state;
  const s = structuredClone(state);
  s.plan = sanitizePlan(s, plan);
  return s;
}

const STATS: StatKey[] = ['health', 'happiness', 'smarts', 'fitness', 'stress'];

export function finalizeRecap(s: GameState) {
  const me = active(s);
  const snap = s.snapshot!;
  const statDeltas: Partial<Record<StatKey, number>> = {};
  for (const k of STATS) statDeltas[k] = me.stats[k] - snap.stats[k];
  s.recap = {
    year: s.year,
    statDeltas,
    walletDelta: s.households[snap.householdId].wallet - snap.wallet,
    entries: s.journal.filter((j) => j.year === s.year),
    activeDied: !alive(me),
  };
  s.phase = 'RECAP';
}

export function resolveYear(state: GameState): GameState {
  if (state.phase !== 'PLANNING') return state;
  const { s, rng } = begin(state);
  const me = active(s);
  s.snapshot = { stats: { ...me.stats }, wallet: s.households[me.householdId].wallet, householdId: me.householdId };
  s.recap = undefined;
  s.lastOutcome = undefined;

  const pay = applyPlan(s, rng); // 1. planned actions + job intents
  runEconomy(s, pay, rng); //       2. income, expenses, wallets, investments
  applyCushion(s); //                  (guided playthrough: no ruin before 24)
  runPeople(s, rng); //             3. births, kids, NPC decisions
  driftBonds(s); //                 4. relationship drift
  runHealth(s, rng); //             6. aging effects, deaths at year end
  settleEstates(s);
  if (alive(active(s))) generateEvents(s, rng); // 5 + 7. due consequences and events

  if (s.pending.length) s.phase = 'DECISIONS';
  else finalizeRecap(s);
  return end(s, rng);
}

export function choose(state: GameState, uid: string, choiceId: string, text?: string): GameState {
  if (state.phase !== 'DECISIONS' || state.resolvedEventUids.includes(uid)) return state;
  const pe = state.pending.find((p) => p.uid === uid);
  const choice = pe?.choices.find((c) => c.id === choiceId);
  if (!pe || !choice || choice.disabled) return state;

  const { s, rng } = begin(state);
  s.pending = s.pending.filter((p) => p.uid !== uid);
  const outcome = resolveEvent(s, rng, pe, choiceId, text);
  s.resolvedEventUids = [...s.resolvedEventUids, uid].slice(-200);
  s.lastOutcome = { title: pe.title, text: outcome };
  settleEstates(s);
  if (!s.pending.length) finalizeRecap(s);
  return end(s, rng);
}

export function dismissOutcome(state: GameState): GameState {
  if (!state.lastOutcome) return state;
  return { ...state, lastOutcome: undefined };
}

export function nextYear(state: GameState): GameState {
  if (state.phase !== 'RECAP') return state;
  const s = structuredClone(state);
  s.lastOutcome = undefined;
  if (!alive(active(s))) {
    s.phase = 'SUCCESSION';
    return s;
  }
  s.year++;
  s.phase = 'PLANNING';
  s.recap = undefined;
  s.snapshot = undefined;
  s.plan = sanitizePlan(s, s.plan, false);
  return s;
}

export type HeirRelation = 'spouse' | 'child' | 'grandchild';

/**
 * Living spouse, adult children, and adult grandchildren of the deceased main
 * character. Grandchildren let a long life hand off to a younger generation.
 */
export function eligibleHeirs(s: GameState): (Person & { relation: HeirRelation })[] {
  const me = active(s);
  const heirs: (Person & { relation: HeirRelation })[] = [];
  const adult = (p: Person) => alive(p) && ageOf(p, s.year + 1) >= 18;
  const ps = [...s.partnerships].reverse().find((p) => (p.a === me.id || p.b === me.id) && p.status === 'widowed' && p.endYear === me.deathYear);
  const spouse = ps ? s.people[ps.a === me.id ? ps.b : ps.a] : partnerOf(s, me.id);
  if (spouse && alive(spouse)) heirs.push({ ...spouse, relation: 'spouse' });
  const kids = childrenOf(s, me.id);
  for (const c of kids) if (adult(c)) heirs.push({ ...c, relation: 'child' });
  for (const c of kids) for (const gc of childrenOf(s, c.id)) if (adult(gc)) heirs.push({ ...gc, relation: 'grandchild' });
  return heirs;
}

export function chooseHeir(state: GameState, heirId: string | null): GameState {
  if (state.phase !== 'SUCCESSION') return state;
  const { s, rng } = begin(state);
  if (!heirId || !eligibleHeirs(s).some((h) => h.id === heirId)) {
    s.phase = 'GAME_OVER';
    return end(s, rng);
  }
  const prev = active(s);
  s.activeId = heirId;
  s.lineage.push(heirId);
  s.year++;
  const heir = active(s);
  // An heir who never had a coming-of-age moment gets one now (stays home).
  if (!heir.flags.came_of_age) autoComeOfAge(s, rng, heir, false);
  // Money rules: the household continues if anyone survives; emptied households
  // were already settled exactly once in settleEstates. Nothing transfers here.
  settleEstates(s);
  journal(s, `After ${prev.firstName}'s passing, the story continues with ${fullName(heir)}.`, 'major');
  s.pending = [];
  s.recap = undefined;
  s.snapshot = undefined;
  s.lastOutcome = undefined;
  s.phase = 'PLANNING';
  s.plan = defaultPlan(s);
  return end(s, rng);
}

// ── Dev tools ────────────────────────────────────────────────────────

export function devKill(state: GameState): GameState {
  if (state.phase === 'SUCCESSION' || state.phase === 'GAME_OVER') return state;
  const { s, rng } = begin(state);
  die(s, active(s), 'dev tools');
  settleEstates(s);
  s.pending = [];
  s.phase = 'SUCCESSION';
  return end(s, rng);
}

/** Play `years` turns automatically with the current plan and first available choices. */
export function devSkip(state: GameState, years: number): GameState {
  let s = state;
  for (let i = 0; i < years && s.phase !== 'SUCCESSION' && s.phase !== 'GAME_OVER'; i++) {
    // Plan like a sensible player (jobs, second jobs when money is tight), then take first choices.
    if (s.phase === 'PLANNING') s = updatePlan(s, strategyPlan(s, 'balanced'));
    s = autoplayYear(s, (pe) => pe.choices.find((c) => !c.disabled)!.id);
  }
  return s;
}

export function autoplayYear(
  state: GameState,
  pick: (pe: GameState['pending'][number], s: GameState) => string,
): GameState {
  let s = state;
  if (s.phase === 'PLANNING') s = resolveYear(s);
  while (s.phase === 'DECISIONS') {
    const pe = s.pending[0];
    s = choose(s, pe.uid, pick(pe, s));
  }
  if (s.phase === 'RECAP') s = nextYear(s);
  return s;
}

